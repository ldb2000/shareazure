const path = require('path');
const fs = require('fs');
const os = require('os');
const { settingsDb } = require('../database');

let sharp;
let ffmpeg;

function getSharp() {
  if (!sharp) {
    sharp = require('sharp');
  }
  return sharp;
}

function getFfmpeg() {
  if (!ffmpeg) {
    ffmpeg = require('fluent-ffmpeg');
    if (process.env.FFMPEG_PATH) {
      ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
    }
  }
  return ffmpeg;
}

function getThumbnailDir() {
  const dir = path.join(__dirname, '..', 'thumbnails');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getTempDir() {
  const dir = path.join(os.tmpdir(), 'shareazure-ai');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function generateThumbnail(imageBuffer, blobName) {
  const sharpInstance = getSharp();
  const size = parseInt(settingsDb.get('thumbnailSize')) || 300;
  const quality = parseInt(settingsDb.get('thumbnailQuality')) || 80;

  const thumbnailName = `thumb_${blobName.replace(/[^a-zA-Z0-9.-]/g, '_')}.jpg`;
  const thumbnailPath = path.join(getThumbnailDir(), thumbnailName);

  await sharpInstance(imageBuffer)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .jpeg({ quality })
    .toFile(thumbnailPath);

  return thumbnailPath;
}

async function resizeForAnalysis(imageBuffer, maxDimension = 1024) {
  const sharpInstance = getSharp();

  const metadata = await sharpInstance(imageBuffer).metadata();

  if (metadata.width <= maxDimension && metadata.height <= maxDimension) {
    // Convert to JPEG if not already for consistent format
    return sharpInstance(imageBuffer).jpeg({ quality: 90 }).toBuffer();
  }

  return sharpInstance(imageBuffer)
    .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function getImageMetadata(imageBuffer) {
  const sharpInstance = getSharp();
  const metadata = await sharpInstance(imageBuffer).metadata();
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    space: metadata.space,
    channels: metadata.channels,
    hasAlpha: metadata.hasAlpha,
    orientation: metadata.orientation
  };
}

function extractFrames(videoPath, blobName) {
  return new Promise((resolve, reject) => {
    const ff = getFfmpeg();
    const interval = parseInt(settingsDb.get('videoFrameInterval')) || 5;
    const outputDir = path.join(getTempDir(), `frames_${blobName.replace(/[^a-zA-Z0-9]/g, '_')}`);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    ff(videoPath)
      .outputOptions([
        `-vf fps=1/${interval}`,
        '-q:v 2'
      ])
      .output(path.join(outputDir, 'frame_%04d.jpg'))
      .on('end', () => {
        const frames = fs.readdirSync(outputDir)
          .filter(f => f.endsWith('.jpg'))
          .sort()
          .map((f, i) => ({
            path: path.join(outputDir, f),
            timestamp: i * interval,
            filename: f
          }));
        resolve(frames);
      })
      .on('error', reject)
      .run();
  });
}

function extractAudio(videoPath, blobName) {
  return new Promise((resolve, reject) => {
    const ff = getFfmpeg();
    const outputPath = path.join(getTempDir(), `audio_${blobName.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`);

    ff(videoPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate(128)
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', reject)
      .run();
  });
}

function getVideoDuration(videoPath) {
  return new Promise((resolve, reject) => {
    const ff = getFfmpeg();
    ff.ffprobe(videoPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
}

function generateVideoThumbnail(videoPath, blobName, timestamp = 1) {
  return new Promise((resolve, reject) => {
    const ff = getFfmpeg();
    const thumbnailName = `thumb_${blobName.replace(/[^a-zA-Z0-9.-]/g, '_')}.jpg`;
    const thumbnailDir = getThumbnailDir();
    const thumbnailPath = path.join(thumbnailDir, thumbnailName);

    ff(videoPath)
      .screenshots({
        timestamps: [timestamp],
        filename: thumbnailName,
        folder: thumbnailDir,
        size: '300x?'
      })
      .on('end', () => resolve(thumbnailPath))
      .on('error', reject);
  });
}

function extractFrameAtTimestamp(videoPath, timestamp) {
  return new Promise((resolve, reject) => {
    const ff = getFfmpeg();
    const outputPath = path.join(getTempDir(), `frame_${Date.now()}.jpg`);

    ff(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .output(outputPath)
      .on('end', () => {
        const buffer = fs.readFileSync(outputPath);
        fs.unlinkSync(outputPath);
        resolve(buffer);
      })
      .on('error', reject)
      .run();
  });
}

function cleanupTempFiles(blobName) {
  const tempDir = getTempDir();
  const prefix = blobName.replace(/[^a-zA-Z0-9]/g, '_');

  try {
    // Clean up frame directories
    const frameDir = path.join(tempDir, `frames_${prefix}`);
    if (fs.existsSync(frameDir)) {
      fs.rmSync(frameDir, { recursive: true, force: true });
    }

    // Clean up audio files
    const audioFile = path.join(tempDir, `audio_${prefix}.mp3`);
    if (fs.existsSync(audioFile)) {
      fs.unlinkSync(audioFile);
    }
  } catch (e) {
    console.error(`Error cleaning up temp files for ${blobName}:`, e.message);
  }
}

// Supported media types
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/bmp', 'image/gif'];
const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm'];
const SUPPORTED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/aac', 'audio/ogg'];

function getMediaType(contentType) {
  if (!contentType) return null;
  if (SUPPORTED_IMAGE_TYPES.includes(contentType)) return 'image';
  if (SUPPORTED_VIDEO_TYPES.includes(contentType)) return 'video';
  if (SUPPORTED_AUDIO_TYPES.includes(contentType)) return 'audio';
  return null;
}

function isSupported(contentType) {
  return getMediaType(contentType) !== null;
}

module.exports = {
  generateThumbnail,
  resizeForAnalysis,
  getImageMetadata,
  extractFrames,
  extractAudio,
  getVideoDuration,
  generateVideoThumbnail,
  extractFrameAtTimestamp,
  cleanupTempFiles,
  getMediaType,
  isSupported,
  SUPPORTED_IMAGE_TYPES,
  SUPPORTED_VIDEO_TYPES,
  SUPPORTED_AUDIO_TYPES
};
