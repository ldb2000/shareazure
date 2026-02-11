const fs = require('fs');
const path = require('path');
const { mediaAnalysisDb, faceOccurrencesDb, videoMarkersDb, settingsDb, transcriptionsDb } = require('../database');
const openaiService = require('./openaiService');
const azureVisionService = require('./azureVisionService');
const mediaProcessor = require('./mediaProcessor');
const transcriptionService = require('./transcriptionService');
const faceService = require('./faceService');
const searchService = require('./searchService');
const jobQueue = require('./jobQueue');

async function analyzeFile(blobName, contentType, getBufferFn) {
  const mediaType = mediaProcessor.getMediaType(contentType);
  if (!mediaType) {
    throw new Error(`Unsupported media type: ${contentType}`);
  }

  // Create analysis record
  let existing = mediaAnalysisDb.getByBlobName(blobName);
  if (!existing) {
    mediaAnalysisDb.create({ blobName, analysisType: mediaType });
  } else {
    mediaAnalysisDb.update(blobName, { status: 'pending', analysisType: mediaType, errorMessage: null });
  }

  // Queue the job
  const jobId = await jobQueue.addJob(async () => {
    return await performAnalysis(blobName, contentType, mediaType, getBufferFn);
  }, { blobName, mediaType });

  return { jobId, blobName, mediaType };
}

async function performAnalysis(blobName, contentType, mediaType, getBufferFn) {
  mediaAnalysisDb.update(blobName, { status: 'processing' });

  try {
    let result;

    switch (mediaType) {
      case 'image':
        result = await analyzeImage(blobName, getBufferFn);
        break;
      case 'video':
        result = await analyzeVideo(blobName, getBufferFn);
        break;
      case 'audio':
        result = await analyzeAudio(blobName, getBufferFn);
        break;
      default:
        throw new Error(`Unknown media type: ${mediaType}`);
    }

    mediaAnalysisDb.update(blobName, {
      status: 'completed',
      openaiResult: result.openai || null,
      azureResult: result.azure || null,
      tags: result.tags || null,
      description: result.description || null,
      confidence: result.confidence || null,
      thumbnailPath: result.thumbnailPath || null,
      analyzedAt: new Date().toISOString()
    });

    // Update search index
    updateSearchIndex(blobName, result);

    return result;
  } catch (error) {
    mediaAnalysisDb.update(blobName, {
      status: 'failed',
      errorMessage: error.message
    });
    throw error;
  }
}

async function analyzeImage(blobName, getBufferFn) {
  const buffer = await getBufferFn();
  const result = { tags: [], description: '', openai: null, azure: null, thumbnailPath: null, confidence: null };

  // Generate thumbnail
  try {
    result.thumbnailPath = await mediaProcessor.generateThumbnail(buffer, blobName);
  } catch (e) {
    console.error(`Thumbnail generation failed for ${blobName}:`, e.message);
  }

  // Resize for analysis
  const analysisBuffer = await mediaProcessor.resizeForAnalysis(buffer);

  // OpenAI analysis (semantic)
  if (openaiService.isEnabled()) {
    try {
      const openaiResult = await openaiService.analyzeImage(analysisBuffer, blobName);
      result.openai = openaiResult;
      result.tags = openaiResult.tags || [];
      result.description = openaiResult.description || '';
      result.confidence = 0.9;
    } catch (e) {
      console.error(`OpenAI analysis failed for ${blobName}:`, e.message);
    }
  }

  // Azure Vision analysis (structural)
  if (azureVisionService.isEnabled()) {
    try {
      const azureResult = await azureVisionService.analyzeImage(buffer, blobName);
      result.azure = azureResult;

      // Merge Azure tags with OpenAI tags
      if (azureResult.tags) {
        const existingTags = new Set(result.tags.map(t => typeof t === 'string' ? t : t.name));
        for (const tag of azureResult.tags) {
          if (!existingTags.has(tag.name)) {
            result.tags.push(tag.name);
          }
        }
      }

      // Use Azure caption if no OpenAI description
      if (!result.description && azureResult.caption) {
        result.description = azureResult.caption.text;
        result.confidence = azureResult.caption.confidence;
      }

      // Store face occurrences
      if (azureResult.people && faceService.isEnabled()) {
        const minConfidence = faceService.getMinConfidence();
        for (const face of azureResult.people) {
          if ((face.confidence || 1) >= minConfidence) {
            faceService.addOccurrence({
              blobName,
              boundingBox: face.boundingBox,
              confidence: face.confidence
            });
          }
        }
      }
    } catch (e) {
      console.error(`Azure Vision analysis failed for ${blobName}:`, e.message);
    }
  }

  return result;
}

async function analyzeVideo(blobName, getBufferFn) {
  const buffer = await getBufferFn();
  const result = { tags: [], description: '', openai: null, azure: null, thumbnailPath: null, confidence: null };

  // Write buffer to temp file for ffmpeg
  const tempDir = path.join(require('os').tmpdir(), 'shareazure-ai');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `video_${blobName.replace(/[^a-zA-Z0-9]/g, '_')}`);
  fs.writeFileSync(tempPath, buffer);

  try {
    // Generate video thumbnail
    try {
      result.thumbnailPath = await mediaProcessor.generateVideoThumbnail(tempPath, blobName);
    } catch (e) {
      console.error(`Video thumbnail failed for ${blobName}:`, e.message);
    }

    // Get duration
    let duration = 0;
    try {
      duration = await mediaProcessor.getVideoDuration(tempPath);
    } catch (e) {
      console.error(`Duration detection failed for ${blobName}:`, e.message);
    }

    // Extract frames for analysis
    let frames = [];
    try {
      frames = await mediaProcessor.extractFrames(tempPath, blobName);
    } catch (e) {
      console.error(`Frame extraction failed for ${blobName}:`, e.message);
    }

    // Analyze key frames with OpenAI
    if (frames.length > 0 && openaiService.isEnabled()) {
      const maxFrames = Math.min(frames.length, 5);
      const allTags = new Set();

      for (let i = 0; i < maxFrames; i++) {
        const frameIdx = Math.floor(i * frames.length / maxFrames);
        const frame = frames[frameIdx];
        try {
          const frameBuffer = fs.readFileSync(frame.path);
          const openaiResult = await openaiService.analyzeImage(frameBuffer, blobName);

          if (openaiResult.tags) {
            for (const tag of openaiResult.tags) {
              allTags.add(typeof tag === 'string' ? tag : tag.name || tag);
            }
          }

          // Create scene marker
          videoMarkersDb.create({
            blobName,
            timestamp: frame.timestamp,
            type: 'scene',
            label: openaiResult.description || `Scene at ${frame.timestamp}s`,
            thumbnailPath: frame.path,
            data: { tags: openaiResult.tags }
          });

          // Use first frame description
          if (i === 0) {
            result.description = openaiResult.description || '';
            result.openai = openaiResult;
          }
        } catch (e) {
          console.error(`Frame analysis failed for ${blobName} frame ${i}:`, e.message);
        }
      }

      result.tags = Array.from(allTags);
    }

    // Analyze frames with Azure Vision for face detection
    if (frames.length > 0 && azureVisionService.isEnabled()) {
      const maxFrames = Math.min(frames.length, 3);

      for (let i = 0; i < maxFrames; i++) {
        const frameIdx = Math.floor(i * frames.length / maxFrames);
        const frame = frames[frameIdx];
        try {
          const frameBuffer = fs.readFileSync(frame.path);
          const faces = await azureVisionService.detectFaces(frameBuffer, blobName);

          if (faces.length > 0 && faceService.isEnabled()) {
            for (const face of faces) {
              faceService.addOccurrence({
                blobName,
                boundingBox: face.boundingBox,
                confidence: face.confidence,
                timestamp: frame.timestamp
              });

              videoMarkersDb.create({
                blobName,
                timestamp: frame.timestamp,
                type: 'face',
                label: `Face detected`,
                data: { boundingBox: face.boundingBox }
              });
            }
          }
        } catch (e) {
          console.error(`Azure frame analysis failed for ${blobName}:`, e.message);
        }
      }
    }

    // Transcribe audio track
    if (transcriptionService.isEnabled()) {
      try {
        const audioPath = await mediaProcessor.extractAudio(tempPath, blobName);
        const transcription = await transcriptionService.transcribe(audioPath, blobName);

        // Create keyword markers from transcription segments
        if (transcription.segments) {
          for (const segment of transcription.segments) {
            if (segment.text && segment.text.trim().length > 10) {
              videoMarkersDb.create({
                blobName,
                timestamp: segment.start,
                type: 'keyword',
                label: segment.text.trim().substring(0, 100)
              });
            }
          }
        }
      } catch (e) {
        console.error(`Video transcription failed for ${blobName}:`, e.message);
      }
    }

    result.confidence = 0.8;
  } finally {
    // Clean up temp files
    try { fs.unlinkSync(tempPath); } catch (e) { /* ignore */ }
    mediaProcessor.cleanupTempFiles(blobName);
  }

  return result;
}

async function analyzeAudio(blobName, getBufferFn) {
  const buffer = await getBufferFn();
  const result = { tags: ['audio'], description: '', openai: null, azure: null, thumbnailPath: null, confidence: null };

  if (!transcriptionService.isEnabled()) {
    result.description = 'Audio file (transcription disabled)';
    return result;
  }

  // Write buffer to temp file
  const tempDir = path.join(require('os').tmpdir(), 'shareazure-ai');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `audio_${blobName.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`);
  fs.writeFileSync(tempPath, buffer);

  try {
    const transcription = await transcriptionService.transcribe(tempPath, blobName);
    result.description = transcription.text ? transcription.text.substring(0, 200) : 'Audio file';
    result.tags.push('transcribed');
    result.confidence = 0.85;
  } catch (e) {
    console.error(`Audio transcription failed for ${blobName}:`, e.message);
    result.description = 'Audio file (transcription failed)';
  } finally {
    try { fs.unlinkSync(tempPath); } catch (e) { /* ignore */ }
  }

  return result;
}

function updateSearchIndex(blobName, result) {
  try {
    const transcription = transcriptionsDb.getByBlobName(blobName);
    const faces = faceOccurrencesDb.getByBlobName(blobName);
    const faceNames = faces
      .filter(f => f.face_name)
      .map(f => f.face_name);

    let ocrText = '';
    if (result.azure && result.azure.ocrText) {
      ocrText = result.azure.ocrText;
    }

    searchService.updateIndex(blobName, {
      tags: Array.isArray(result.tags) ? result.tags.join(', ') : (result.tags || ''),
      description: result.description || '',
      transcription: transcription ? transcription.text : '',
      ocrText,
      faces: faceNames.join(', ')
    });
  } catch (e) {
    console.error(`Search index update failed for ${blobName}:`, e.message);
  }
}

async function analyzeBatch(files, getBufferFnFactory) {
  const jobs = [];
  for (const file of files) {
    try {
      const job = await analyzeFile(file.blobName, file.contentType, getBufferFnFactory(file.blobName));
      jobs.push(job);
    } catch (e) {
      jobs.push({ blobName: file.blobName, error: e.message });
    }
  }
  return jobs;
}

module.exports = {
  analyzeFile,
  analyzeBatch,
  updateSearchIndex
};
