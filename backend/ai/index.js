const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const { mediaAnalysisDb, transcriptionsDb, videoMarkersDb, aiCostTrackingDb, searchIndexDb, settingsDb, scanSchedulesDb } = require('../database');
const analysisOrchestrator = require('./analysisOrchestrator');
const searchService = require('./searchService');
const faceService = require('./faceService');
const albumService = require('./albumService');
const transcriptionService = require('./transcriptionService');
const mediaProcessor = require('./mediaProcessor');
const geolocationService = require('./geolocationService');
const scanService = require('./scanService');
const jobQueue = require('./jobQueue');

// Helper: get blob buffer from Azure (injected from server.js)
let getBlobBuffer = null;
let getContainerClient = null;

function configure(opts) {
  getBlobBuffer = opts.getBlobBuffer;
  getContainerClient = opts.getContainerClient;
}

// Middleware: check if AI is enabled
function requireAiEnabled(req, res, next) {
  const aiEnabled = settingsDb.get('aiEnabled');
  if (aiEnabled === 'false') {
    return res.status(503).json({ success: false, error: 'AI features are disabled' });
  }
  next();
}

router.use(requireAiEnabled);

// ============================================================================
// ANALYSIS ENDPOINTS
// ============================================================================

// POST /api/ai/analyze/:blobName — Launch AI analysis of a file (async, returns jobId)
router.post('/analyze/:blobName(*)', async (req, res) => {
  try {
    const { blobName } = req.params;
    const { contentType } = req.body;

    if (!getBlobBuffer) {
      return res.status(500).json({ success: false, error: 'AI service not configured' });
    }

    // Determine content type from file ownership or request
    const { fileOwnershipDb } = require('../database');
    const fileInfo = fileOwnershipDb.getByBlobName(blobName);
    const ct = contentType || (fileInfo && fileInfo.content_type) || 'application/octet-stream';

    if (!mediaProcessor.isSupported(ct)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported media type: ${ct}`,
        supportedTypes: {
          image: mediaProcessor.SUPPORTED_IMAGE_TYPES,
          video: mediaProcessor.SUPPORTED_VIDEO_TYPES,
          audio: mediaProcessor.SUPPORTED_AUDIO_TYPES
        }
      });
    }

    const result = await analysisOrchestrator.analyzeFile(
      blobName,
      ct,
      () => getBlobBuffer(blobName)
    );

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ai/analyze/batch — Batch analysis of multiple files
router.post('/analyze-batch', async (req, res) => {
  try {
    const { files } = req.body;

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, error: 'files array is required' });
    }

    if (files.length > 20) {
      return res.status(400).json({ success: false, error: 'Maximum 20 files per batch' });
    }

    const getBufferFnFactory = (blobName) => () => getBlobBuffer(blobName);
    const jobs = await analysisOrchestrator.analyzeBatch(files, getBufferFnFactory);

    res.json({ success: true, jobs });
  } catch (error) {
    console.error('Batch analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ai/analysis/:blobName — Get analysis results for a file
router.get('/analysis/:blobName(*)', (req, res) => {
  try {
    const { blobName } = req.params;
    const analysis = mediaAnalysisDb.getByBlobName(blobName);

    if (!analysis) {
      return res.status(404).json({ success: false, error: 'No analysis found for this file' });
    }

    // Parse JSON fields
    const result = {
      ...analysis,
      openai_result: analysis.openai_result ? JSON.parse(analysis.openai_result) : null,
      azure_result: analysis.azure_result ? JSON.parse(analysis.azure_result) : null,
      tags: analysis.tags ? JSON.parse(analysis.tags) : []
    };

    // Attach face occurrences
    result.faces = faceService.getOccurrencesByBlobName(blobName);

    // Attach transcription if exists
    const transcription = transcriptionsDb.getByBlobName(blobName);
    if (transcription) {
      result.transcription = {
        ...transcription,
        segments: transcription.segments ? JSON.parse(transcription.segments) : []
      };
    }

    // Attach video markers if video
    if (analysis.analysis_type === 'video') {
      result.videoMarkers = videoMarkersDb.getByBlobName(blobName);
    }

    res.json({ success: true, analysis: result });
  } catch (error) {
    console.error('Get analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/ai/analysis/:blobName — Delete analysis data for a file
router.delete('/analysis/:blobName(*)', (req, res) => {
  try {
    const { blobName } = req.params;

    mediaAnalysisDb.delete(blobName);
    transcriptionsDb.delete(blobName);
    videoMarkersDb.deleteByBlobName(blobName);
    searchService.removeFromIndex(blobName);
    const { faceOccurrencesDb } = require('../database');
    faceOccurrencesDb.deleteByBlobName(blobName);

    res.json({ success: true, message: 'Analysis data deleted' });
  } catch (error) {
    console.error('Delete analysis error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ai/job/:jobId — Get job status
router.get('/job/:jobId', (req, res) => {
  const status = jobQueue.getJobStatus(req.params.jobId);
  if (!status) {
    return res.status(404).json({ success: false, error: 'Job not found' });
  }
  res.json({ success: true, job: status });
});

// ============================================================================
// SEARCH ENDPOINTS
// ============================================================================

// GET /api/ai/search — Semantic search
router.get('/search', (req, res) => {
  try {
    const { q, type, dateFrom, dateTo, tags, faceProfileId, limit } = req.query;

    if (!q) {
      return res.status(400).json({ success: false, error: 'Query parameter q is required' });
    }

    const results = searchService.search(q, {
      type,
      dateFrom,
      dateTo,
      tags: tags ? tags.split(',') : undefined,
      faceProfileId: faceProfileId ? parseInt(faceProfileId) : undefined,
      limit: limit ? parseInt(limit) : 50
    });

    res.json({ success: true, results, count: results.length });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ai/search/suggestions — Auto-complete suggestions
router.get('/search/suggestions', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.json({ success: true, suggestions: [] });
    }

    const suggestions = searchService.getSuggestions(q);
    res.json({ success: true, suggestions });
  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ai/tags — List all tags with counts
router.get('/tags', (req, res) => {
  try {
    const tags = searchService.getAllTags();
    res.json({ success: true, tags });
  } catch (error) {
    console.error('Tags error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ai/tags/:tag/files — Files associated with a tag
router.get('/tags/:tag/files', (req, res) => {
  try {
    const files = searchService.getFilesByTag(req.params.tag);
    res.json({ success: true, files, count: files.length });
  } catch (error) {
    console.error('Tag files error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// FACE ENDPOINTS
// ============================================================================

// GET /api/ai/faces — Gallery of face profiles
router.get('/faces', (req, res) => {
  try {
    const profiles = faceService.getAllProfiles();
    res.json({ success: true, profiles });
  } catch (error) {
    console.error('Faces error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ai/faces — Create a face profile
router.post('/faces', (req, res) => {
  try {
    const { name, createdBy } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const profile = faceService.createProfile({ name, createdBy });
    res.status(201).json({ success: true, profile });
  } catch (error) {
    console.error('Create face profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/ai/faces/:profileId — Rename a profile
router.put('/faces/:profileId', (req, res) => {
  try {
    const { profileId } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const existing = faceService.getProfile(parseInt(profileId));
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const profile = faceService.updateProfile(parseInt(profileId), { name });
    res.json({ success: true, profile });
  } catch (error) {
    console.error('Update face profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/ai/faces/:profileId — Delete a profile
router.delete('/faces/:profileId', (req, res) => {
  try {
    const { profileId } = req.params;

    const existing = faceService.getProfile(parseInt(profileId));
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    faceService.deleteProfile(parseInt(profileId));
    res.json({ success: true, message: 'Profile deleted' });
  } catch (error) {
    console.error('Delete face profile error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ai/faces/:profileId/merge — Merge two profiles
router.post('/faces/:profileId/merge', (req, res) => {
  try {
    const targetId = parseInt(req.params.profileId);
    const { sourceProfileId } = req.body;

    if (!sourceProfileId) {
      return res.status(400).json({ success: false, error: 'sourceProfileId is required' });
    }

    const target = faceService.getProfile(targetId);
    const source = faceService.getProfile(parseInt(sourceProfileId));

    if (!target) return res.status(404).json({ success: false, error: 'Target profile not found' });
    if (!source) return res.status(404).json({ success: false, error: 'Source profile not found' });

    faceService.mergeProfiles(targetId, parseInt(sourceProfileId));
    const merged = faceService.getProfile(targetId);

    res.json({ success: true, profile: merged });
  } catch (error) {
    console.error('Merge profiles error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ai/faces/:profileId/files — Files where this person appears
router.get('/faces/:profileId/files', (req, res) => {
  try {
    const profileId = parseInt(req.params.profileId);

    const existing = faceService.getProfile(profileId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const files = faceService.getFilesByProfile(profileId);
    res.json({ success: true, files, count: files.length });
  } catch (error) {
    console.error('Face files error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// SMART ALBUM ENDPOINTS
// ============================================================================

// GET /api/ai/albums — List albums
router.get('/albums', (req, res) => {
  try {
    const albums = albumService.getAllAlbums();
    res.json({ success: true, albums });
  } catch (error) {
    console.error('Albums error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ai/albums — Create an album
router.post('/albums', (req, res) => {
  try {
    const { name, description, rules, type, coverBlobName, createdBy } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const album = albumService.createAlbum({
      name, description, rules, type: type || 'manual', coverBlobName, createdBy
    });

    // If auto album, populate it
    if (type === 'auto' && rules) {
      albumService.populateAutoAlbum(album.id);
    }

    res.status(201).json({ success: true, album: albumService.getAlbum(album.id) });
  } catch (error) {
    console.error('Create album error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/ai/albums/:albumId — Update an album
router.put('/albums/:albumId', (req, res) => {
  try {
    const albumId = parseInt(req.params.albumId);
    const { name, description, rules, coverBlobName } = req.body;

    const existing = albumService.getAlbum(albumId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Album not found' });
    }

    const album = albumService.updateAlbum(albumId, {
      name: name || existing.name,
      description: description !== undefined ? description : existing.description,
      rules: rules || (existing.rules ? JSON.parse(existing.rules) : null),
      coverBlobName: coverBlobName || existing.cover_blob_name
    });

    res.json({ success: true, album });
  } catch (error) {
    console.error('Update album error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/ai/albums/:albumId — Delete an album
router.delete('/albums/:albumId', (req, res) => {
  try {
    const albumId = parseInt(req.params.albumId);

    const existing = albumService.getAlbum(albumId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Album not found' });
    }

    albumService.deleteAlbum(albumId);
    res.json({ success: true, message: 'Album deleted' });
  } catch (error) {
    console.error('Delete album error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ai/albums/:albumId/items — Add items to an album
router.post('/albums/:albumId/items', (req, res) => {
  try {
    const albumId = parseInt(req.params.albumId);
    const { blobNames, addedBy } = req.body;

    const existing = albumService.getAlbum(albumId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Album not found' });
    }

    if (!blobNames || !Array.isArray(blobNames)) {
      return res.status(400).json({ success: false, error: 'blobNames array is required' });
    }

    let added = 0;
    for (const blobName of blobNames) {
      try {
        albumService.addItem(albumId, blobName, addedBy);
        added++;
      } catch (e) { /* ignore duplicates */ }
    }

    res.json({ success: true, added, album: albumService.getAlbum(albumId) });
  } catch (error) {
    console.error('Add album items error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/ai/albums/:albumId/items/:blobName — Remove an item from an album
router.delete('/albums/:albumId/items/:blobName(*)', (req, res) => {
  try {
    const albumId = parseInt(req.params.albumId);
    const { blobName } = req.params;

    albumService.removeItem(albumId, blobName);
    res.json({ success: true, message: 'Item removed', album: albumService.getAlbum(albumId) });
  } catch (error) {
    console.error('Remove album item error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ai/albums/:albumId/items — List items in an album
router.get('/albums/:albumId/items', (req, res) => {
  try {
    const albumId = parseInt(req.params.albumId);

    const existing = albumService.getAlbum(albumId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Album not found' });
    }

    const items = albumService.getItems(albumId);
    res.json({ success: true, items, count: items.length });
  } catch (error) {
    console.error('Album items error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// VIDEO ENDPOINTS
// ============================================================================

// GET /api/ai/video/:blobName/timeline — Timeline with markers
router.get('/video/:blobName(*)/timeline', (req, res) => {
  try {
    const { blobName } = req.params;
    const { type } = req.query;

    let markers;
    if (type) {
      markers = videoMarkersDb.getByBlobNameAndType(blobName, type);
    } else {
      markers = videoMarkersDb.getByBlobName(blobName);
    }

    // Parse JSON data field
    const parsedMarkers = markers.map(m => ({
      ...m,
      data: m.data ? JSON.parse(m.data) : null
    }));

    res.json({ success: true, markers: parsedMarkers, count: parsedMarkers.length });
  } catch (error) {
    console.error('Video timeline error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ai/video/:blobName/thumbnail/:timestamp — Thumbnail at a timestamp
router.get('/video/:blobName(*)/thumbnail/:timestamp', async (req, res) => {
  try {
    const { blobName, timestamp } = req.params;

    // Check if we have a cached marker thumbnail
    const markers = videoMarkersDb.getByBlobName(blobName);
    const closestMarker = markers.find(m =>
      m.thumbnail_path && Math.abs(m.timestamp - parseFloat(timestamp)) < 2
    );

    if (closestMarker && closestMarker.thumbnail_path && fs.existsSync(closestMarker.thumbnail_path)) {
      return res.sendFile(closestMarker.thumbnail_path);
    }

    // Otherwise, extract the frame dynamically
    if (!getBlobBuffer) {
      return res.status(500).json({ success: false, error: 'AI service not configured' });
    }

    const buffer = await getBlobBuffer(blobName);
    const tempPath = path.join(require('os').tmpdir(), 'shareazure-ai', `video_${Date.now()}`);
    fs.writeFileSync(tempPath, buffer);

    try {
      const frameBuffer = await mediaProcessor.extractFrameAtTimestamp(tempPath, parseFloat(timestamp));
      res.set('Content-Type', 'image/jpeg');
      res.send(frameBuffer);
    } finally {
      try { fs.unlinkSync(tempPath); } catch (e) { /* ignore */ }
    }
  } catch (error) {
    console.error('Video thumbnail error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// TRANSCRIPTION ENDPOINTS
// ============================================================================

// POST /api/ai/transcribe/:blobName — Launch transcription (async)
router.post('/transcribe/:blobName(*)', async (req, res) => {
  try {
    const { blobName } = req.params;
    const { language } = req.body;

    if (!getBlobBuffer) {
      return res.status(500).json({ success: false, error: 'AI service not configured' });
    }

    const { fileOwnershipDb } = require('../database');
    const fileInfo = fileOwnershipDb.getByBlobName(blobName);
    const contentType = fileInfo ? fileInfo.content_type : '';

    const mediaType = mediaProcessor.getMediaType(contentType);
    if (mediaType !== 'audio' && mediaType !== 'video') {
      return res.status(400).json({ success: false, error: 'File must be audio or video' });
    }

    // Queue transcription job
    const jobId = await jobQueue.addJob(async () => {
      const buffer = await getBlobBuffer(blobName);
      const tempDir = path.join(require('os').tmpdir(), 'shareazure-ai');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      let audioPath;
      if (mediaType === 'video') {
        const videoPath = path.join(tempDir, `video_${Date.now()}`);
        fs.writeFileSync(videoPath, buffer);
        audioPath = await mediaProcessor.extractAudio(videoPath, blobName);
        try { fs.unlinkSync(videoPath); } catch (e) { /* ignore */ }
      } else {
        audioPath = path.join(tempDir, `audio_${Date.now()}.mp3`);
        fs.writeFileSync(audioPath, buffer);
      }

      const result = await transcriptionService.transcribe(audioPath, blobName, { language });

      try { fs.unlinkSync(audioPath); } catch (e) { /* ignore */ }

      return result;
    }, { blobName, operation: 'transcribe' });

    res.json({ success: true, jobId, blobName });
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ai/transcription/:blobName/search — Search within transcription
// NOTE: Must be defined before the generic /transcription/:blobName(*) route
// because the (*) wildcard would greedily match the /search suffix
router.get('/transcription/:blobName(*)/search', (req, res) => {
  try {
    const { blobName } = req.params;
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ success: false, error: 'Query parameter q is required' });
    }

    const matches = transcriptionsDb.search(blobName, q);
    res.json({ success: true, matches, count: matches.length });
  } catch (error) {
    console.error('Transcription search error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ai/transcription/:blobName — Get transcription
router.get('/transcription/:blobName(*)', (req, res) => {
  try {
    const { blobName } = req.params;
    const transcription = transcriptionsDb.getByBlobName(blobName);

    if (!transcription) {
      return res.status(404).json({ success: false, error: 'No transcription found' });
    }

    res.json({
      success: true,
      transcription: {
        ...transcription,
        segments: transcription.segments ? JSON.parse(transcription.segments) : []
      }
    });
  } catch (error) {
    console.error('Get transcription error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GEOLOCATION ENDPOINTS
// ============================================================================

// GET /api/ai/geolocation/:blobName — Get geolocation data for a file
router.get('/geolocation/:blobName(*)', (req, res) => {
  try {
    const { blobName } = req.params;
    const geo = geolocationService.getByBlobName(blobName);

    if (!geo) {
      return res.status(404).json({ success: false, error: 'No geolocation data found for this file' });
    }

    res.json({
      success: true,
      geolocation: {
        ...geo,
        raw_exif: geo.raw_exif ? JSON.parse(geo.raw_exif) : null
      }
    });
  } catch (error) {
    console.error('Get geolocation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/ai/map — All geotagged files (for map display)
router.get('/map', (req, res) => {
  try {
    const { limit } = req.query;
    const files = geolocationService.getAllGeotagged(limit ? parseInt(limit) : 500);

    const mapData = files.map(f => ({
      blobName: f.blob_name,
      latitude: f.latitude,
      longitude: f.longitude,
      address: f.address,
      city: f.city,
      country: f.country
    }));

    res.json({ success: true, files: mapData, count: mapData.length });
  } catch (error) {
    console.error('Map data error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/ai/geolocation/:blobName — Manual geolocation extraction
router.post('/geolocation/:blobName(*)', async (req, res) => {
  try {
    const { blobName } = req.params;

    if (!getBlobBuffer) {
      return res.status(500).json({ success: false, error: 'AI service not configured' });
    }

    const buffer = await getBlobBuffer(blobName);
    const geoData = await geolocationService.extractGeolocation(buffer, blobName);

    if (!geoData) {
      return res.status(404).json({ success: false, error: 'No GPS data found in file EXIF metadata' });
    }

    res.json({ success: true, geolocation: geoData });
  } catch (error) {
    console.error('Extract geolocation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ADMIN AI ENDPOINTS (mounted at /api/admin/ai/)
// ============================================================================

const adminRouter = express.Router();

// GET /api/admin/ai/dashboard — AI stats
adminRouter.get('/dashboard', (req, res) => {
  try {
    const analysisStats = mediaAnalysisDb.getStats();
    const costTotal = aiCostTrackingDb.getMonthlyTotal();
    const topOperations = aiCostTrackingDb.getTopOperations(5);
    const tags = searchService.getAllTags().slice(0, 20);
    const faceProfiles = faceService.getAllProfiles();
    const queueMetrics = jobQueue.getMetrics();
    const budget = parseFloat(settingsDb.get('aiMonthlyBudget')) || 50;
    const budgetUsedPercent = costTotal.total_cost > 0
      ? Math.round((costTotal.total_cost / budget) * 100)
      : 0;

    res.json({
      success: true,
      dashboard: {
        analysis: analysisStats,
        costs: {
          monthlyTotal: costTotal.total_cost,
          budget,
          budgetUsedPercent,
          topOperations
        },
        tags: tags,
        faces: {
          profileCount: faceProfiles.length
        },
        queue: queueMetrics
      }
    });
  } catch (error) {
    console.error('AI dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/ai/costs — Detailed costs by service/model/period
adminRouter.get('/costs', (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate || new Date(new Date().setDate(1)).toISOString();
    const end = endDate || new Date().toISOString();

    const summary = aiCostTrackingDb.getCostSummary(start, end);
    const details = aiCostTrackingDb.getByPeriod(start, end);

    res.json({
      success: true,
      costs: {
        summary,
        details: details.slice(0, 100),
        period: { start, end }
      }
    });
  } catch (error) {
    console.error('AI costs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/admin/ai/settings — Configure AI settings
adminRouter.put('/settings', (req, res) => {
  try {
    const settings = req.body;
    const aiSettingKeys = [
      'aiEnabled', 'openaiEnabled', 'azureVisionEnabled',
      'autoAnalyzeOnUpload', 'maxConcurrentAnalysis',
      'openaiModel', 'whisperModel', 'whisperLanguage',
      'faceRecognitionEnabled', 'faceMinConfidence',
      'videoTimelineEnabled', 'videoFrameInterval',
      'transcriptionEnabled',
      'smartAlbumsEnabled', 'searchEnabled',
      'aiMonthlyBudget', 'aiCostAlertThreshold',
      'thumbnailSize', 'thumbnailQuality',
      'geolocationEnabled', 'reverseGeocodingEnabled'
    ];

    const updated = {};
    for (const [key, value] of Object.entries(settings)) {
      if (aiSettingKeys.includes(key)) {
        settingsDb.update(key, String(value));
        updated[key] = value;
      }
    }

    res.json({ success: true, updated });
  } catch (error) {
    console.error('AI settings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/ai/reindex — Rebuild FTS5 search index
adminRouter.post('/reindex', (req, res) => {
  try {
    searchService.rebuildIndex();
    res.json({ success: true, message: 'Search index rebuilt successfully' });
  } catch (error) {
    console.error('Reindex error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/admin/ai/scans — List all scan schedules
adminRouter.get('/scans', (req, res) => {
  try {
    const scans = scanSchedulesDb.getAll();
    res.json({ success: true, scans });
  } catch (error) {
    console.error('Get scans error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/admin/ai/scans/:id — Update scan schedule/enabled
adminRouter.put('/scans/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { schedule, isEnabled } = req.body;

    const existing = scanSchedulesDb.getById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Scan not found' });
    }

    const updateData = {};
    if (schedule !== undefined) {
      const validSchedules = ['manual', 'hourly', 'daily', 'weekly'];
      if (!validSchedules.includes(schedule)) {
        return res.status(400).json({ success: false, error: `Invalid schedule. Must be one of: ${validSchedules.join(', ')}` });
      }
      updateData.schedule = schedule;
    }
    if (isEnabled !== undefined) {
      updateData.isEnabled = isEnabled ? 1 : 0;
    }

    scanSchedulesDb.update(id, updateData);
    const updated = scanSchedulesDb.getById(id);
    res.json({ success: true, scan: updated });
  } catch (error) {
    console.error('Update scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/admin/ai/scans/:id/run — Run a scan manually
adminRouter.post('/scans/:id/run', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = scanSchedulesDb.getById(id);

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Scan not found' });
    }

    if (!getBlobBuffer) {
      return res.status(500).json({ success: false, error: 'AI service not configured' });
    }

    // Run scan asynchronously
    const result = await scanService.runScan(existing.scan_type, getBlobBuffer);
    res.json({ success: true, result });
  } catch (error) {
    console.error('Run scan error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = { router, adminRouter, configure };
