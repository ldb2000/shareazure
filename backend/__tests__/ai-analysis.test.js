/**
 * Tests for AI Analysis, Search, and Tags endpoints
 */
const { cleanTestDb, seedTestUsers } = require('./setup');
cleanTestDb();

// Mock AI services BEFORE requiring the server
jest.mock('../ai/analysisOrchestrator', () => ({
  analyzeFile: jest.fn().mockResolvedValue({ jobId: 'test-job-1', blobName: 'test.jpg', mediaType: 'image' }),
  analyzeBatch: jest.fn().mockImplementation(async (files) => {
    return files.map((f, i) => ({ jobId: `test-job-${i + 1}`, blobName: f.blobName, mediaType: 'image' }));
  }),
  updateSearchIndex: jest.fn()
}));

jest.mock('../ai/jobQueue', () => ({
  addJob: jest.fn().mockResolvedValue('test-job-1'),
  getJobStatus: jest.fn(),
  getMetrics: jest.fn().mockReturnValue({ queued: 0, processing: 0, completed: 0, failed: 0, total: 0 }),
  cleanup: jest.fn()
}));

jest.mock('../ai/mediaProcessor', () => ({
  isSupported: jest.fn().mockReturnValue(true),
  getMediaType: jest.fn().mockReturnValue('image'),
  extractFrameAtTimestamp: jest.fn(),
  generateThumbnail: jest.fn(),
  resizeForAnalysis: jest.fn(),
  getImageMetadata: jest.fn(),
  extractFrames: jest.fn(),
  extractAudio: jest.fn(),
  getVideoDuration: jest.fn(),
  generateVideoThumbnail: jest.fn(),
  cleanupTempFiles: jest.fn(),
  SUPPORTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  SUPPORTED_VIDEO_TYPES: ['video/mp4'],
  SUPPORTED_AUDIO_TYPES: ['audio/mpeg']
}));

const request = require('supertest');
const app = require('../server');
const { settingsDb, mediaAnalysisDb, fileOwnershipDb, usersDb, faceOccurrencesDb, transcriptionsDb, videoMarkersDb, searchIndexDb } = require('../database');
const analysisOrchestrator = require('../ai/analysisOrchestrator');
const jobQueue = require('../ai/jobQueue');
const mediaProcessor = require('../ai/mediaProcessor');

// Seed test data
let testUserId;

beforeAll(async () => {
  const seeded = await seedTestUsers(null, usersDb);
  testUserId = seeded.admin.id;

  // Seed file ownership for analyze endpoints
  fileOwnershipDb.create({
    blobName: 'test-image.jpg',
    originalName: 'test-image.jpg',
    contentType: 'image/jpeg',
    fileSize: 1024,
    uploadedByUserId: testUserId
  });

  fileOwnershipDb.create({
    blobName: 'test-unsupported.txt',
    originalName: 'test-unsupported.txt',
    contentType: 'text/plain',
    fileSize: 100,
    uploadedByUserId: testUserId
  });

  // Seed media analysis records
  mediaAnalysisDb.create({ blobName: 'analyzed-image.jpg', analysisType: 'image' });
  mediaAnalysisDb.update('analyzed-image.jpg', {
    status: 'completed',
    tags: JSON.stringify(['nature', 'sunset', 'landscape']),
    description: 'A beautiful sunset over mountains',
    openaiResult: JSON.stringify({ caption: 'sunset over mountains' }),
    azureResult: JSON.stringify({ objects: [{ name: 'mountain' }], ocrText: '' }),
    confidence: 0.95,
    analyzedAt: new Date().toISOString()
  });

  mediaAnalysisDb.create({ blobName: 'analyzed-video.mp4', analysisType: 'video' });
  mediaAnalysisDb.update('analyzed-video.mp4', {
    status: 'completed',
    tags: JSON.stringify(['nature', 'wildlife']),
    description: 'A video of wildlife in the forest',
    confidence: 0.88,
    analyzedAt: new Date().toISOString()
  });

  // Seed face occurrences
  faceOccurrencesDb.create({
    blobName: 'analyzed-image.jpg',
    faceProfileId: null,
    boundingBox: { x: 10, y: 20, width: 100, height: 100 },
    confidence: 0.92
  });

  // Seed transcription
  transcriptionsDb.create({ blobName: 'analyzed-video.mp4', language: 'en', model: 'whisper-1' });
  transcriptionsDb.update('analyzed-video.mp4', {
    status: 'completed',
    text: 'The quick brown fox jumps over the lazy dog',
    segments: JSON.stringify([
      { start: 0, end: 3, text: 'The quick brown fox' },
      { start: 3, end: 6, text: 'jumps over the lazy dog' }
    ]),
    duration: 6.0
  });

  // Seed video markers
  videoMarkersDb.create({
    blobName: 'analyzed-video.mp4',
    timestamp: 0,
    type: 'scene',
    label: 'Opening scene',
    data: { description: 'Forest establishing shot' }
  });

  // Seed search index
  searchIndexDb.upsert({
    blobName: 'analyzed-image.jpg',
    tags: 'nature sunset landscape',
    description: 'A beautiful sunset over mountains',
    transcription: '',
    ocrText: '',
    faces: ''
  });
});

// ============================================================================
// requireAiEnabled middleware
// ============================================================================
describe('requireAiEnabled middleware', () => {
  it('should return 503 when aiEnabled is false', async () => {
    settingsDb.update('aiEnabled', 'false');
    const res = await request(app).get('/api/ai/tags');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('disabled');
    settingsDb.update('aiEnabled', 'true'); // restore
  });

  it('should work when aiEnabled is true', async () => {
    settingsDb.update('aiEnabled', 'true');
    const res = await request(app).get('/api/ai/tags');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should work when aiEnabled is default (true)', async () => {
    // aiEnabled defaults to 'true' from DB seed
    const res = await request(app).get('/api/ai/tags');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ============================================================================
// POST /api/ai/analyze/:blobName
// ============================================================================
describe('POST /api/ai/analyze/:blobName', () => {
  it('should start analysis with contentType in body', async () => {
    const res = await request(app)
      .post('/api/ai/analyze/test-image.jpg')
      .send({ contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.jobId).toBeDefined();
    expect(res.body.blobName).toBeDefined();
    expect(res.body.mediaType).toBe('image');
  });

  it('should fall back to fileOwnership content_type', async () => {
    const res = await request(app)
      .post('/api/ai/analyze/test-image.jpg')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(analysisOrchestrator.analyzeFile).toHaveBeenCalled();
  });

  it('should return 400 for unsupported media type', async () => {
    mediaProcessor.isSupported.mockReturnValueOnce(false);
    const res = await request(app)
      .post('/api/ai/analyze/test-unsupported.txt')
      .send({ contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Unsupported');
  });

  it('should return 500 when orchestrator throws', async () => {
    analysisOrchestrator.analyzeFile.mockRejectedValueOnce(new Error('OpenAI API error'));
    const res = await request(app)
      .post('/api/ai/analyze/test-image.jpg')
      .send({ contentType: 'image/jpeg' });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('OpenAI API error');
  });
});

// ============================================================================
// POST /api/ai/analyze-batch
// ============================================================================
describe('POST /api/ai/analyze-batch', () => {
  it('should process batch of files', async () => {
    const res = await request(app)
      .post('/api/ai/analyze-batch')
      .send({
        files: [
          { blobName: 'img1.jpg', contentType: 'image/jpeg' },
          { blobName: 'img2.png', contentType: 'image/png' }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.jobs).toHaveLength(2);
  });

  it('should return 400 when files array missing', async () => {
    const res = await request(app)
      .post('/api/ai/analyze-batch')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('files array');
  });

  it('should return 400 when files array empty', async () => {
    const res = await request(app)
      .post('/api/ai/analyze-batch')
      .send({ files: [] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 when batch exceeds 20 files', async () => {
    const files = Array.from({ length: 21 }, (_, i) => ({
      blobName: `file${i}.jpg`,
      contentType: 'image/jpeg'
    }));
    const res = await request(app)
      .post('/api/ai/analyze-batch')
      .send({ files });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Maximum 20');
  });
});

// ============================================================================
// GET /api/ai/analysis/:blobName
// ============================================================================
describe('GET /api/ai/analysis/:blobName', () => {
  it('should return analysis result with parsed JSON fields', async () => {
    const res = await request(app).get('/api/ai/analysis/analyzed-image.jpg');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.analysis).toBeDefined();
    expect(res.body.analysis.tags).toEqual(['nature', 'sunset', 'landscape']);
    expect(res.body.analysis.description).toBe('A beautiful sunset over mountains');
    expect(res.body.analysis.openai_result).toEqual({ caption: 'sunset over mountains' });
    expect(res.body.analysis.azure_result).toEqual({ objects: [{ name: 'mountain' }], ocrText: '' });
  });

  it('should return 404 when no analysis exists', async () => {
    const res = await request(app).get('/api/ai/analysis/nonexistent-file.jpg');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('should include face occurrences in result', async () => {
    const res = await request(app).get('/api/ai/analysis/analyzed-image.jpg');

    expect(res.status).toBe(200);
    expect(res.body.analysis.faces).toBeDefined();
    expect(Array.isArray(res.body.analysis.faces)).toBe(true);
  });

  it('should include transcription if exists', async () => {
    const res = await request(app).get('/api/ai/analysis/analyzed-video.mp4');

    expect(res.status).toBe(200);
    expect(res.body.analysis.transcription).toBeDefined();
    expect(res.body.analysis.transcription.text).toBe('The quick brown fox jumps over the lazy dog');
    expect(res.body.analysis.transcription.segments).toHaveLength(2);
  });

  it('should include video markers for video analysis', async () => {
    const res = await request(app).get('/api/ai/analysis/analyzed-video.mp4');

    expect(res.status).toBe(200);
    expect(res.body.analysis.videoMarkers).toBeDefined();
    expect(Array.isArray(res.body.analysis.videoMarkers)).toBe(true);
    expect(res.body.analysis.videoMarkers.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// DELETE /api/ai/analysis/:blobName
// ============================================================================
describe('DELETE /api/ai/analysis/:blobName', () => {
  it('should successfully delete analysis data', async () => {
    // Create a temp analysis to delete
    mediaAnalysisDb.create({ blobName: 'to-delete.jpg', analysisType: 'image' });

    const res = await request(app).delete('/api/ai/analysis/to-delete.jpg');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('deleted');

    // Verify deletion
    const analysis = mediaAnalysisDb.getByBlobName('to-delete.jpg');
    expect(analysis).toBeUndefined();
  });

  it('should return 200 even if no data existed (idempotent)', async () => {
    const res = await request(app).delete('/api/ai/analysis/nonexistent-file.jpg');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ============================================================================
// GET /api/ai/job/:jobId
// ============================================================================
describe('GET /api/ai/job/:jobId', () => {
  it('should return job status when found', async () => {
    jobQueue.getJobStatus.mockReturnValueOnce({
      id: 'test-job-1',
      status: 'completed',
      metadata: { blobName: 'test.jpg' },
      createdAt: new Date().toISOString()
    });

    const res = await request(app).get('/api/ai/job/test-job-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.job).toBeDefined();
    expect(res.body.job.id).toBe('test-job-1');
    expect(res.body.job.status).toBe('completed');
  });

  it('should return 404 when job not found', async () => {
    jobQueue.getJobStatus.mockReturnValueOnce(null);

    const res = await request(app).get('/api/ai/job/nonexistent-job');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ============================================================================
// GET /api/ai/search
// ============================================================================
describe('GET /api/ai/search', () => {
  it('should return search results for query', async () => {
    const res = await request(app).get('/api/ai/search?q=sunset');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.results).toBeDefined();
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.count).toBeDefined();
  });

  it('should return 400 when query missing', async () => {
    const res = await request(app).get('/api/ai/search');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('required');
  });

  it('should return results with count', async () => {
    const res = await request(app).get('/api/ai/search?q=nature');

    expect(res.status).toBe(200);
    expect(typeof res.body.count).toBe('number');
    expect(res.body.count).toBe(res.body.results.length);
  });

  it('should handle type filter', async () => {
    const res = await request(app).get('/api/ai/search?q=nature&type=image');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ============================================================================
// GET /api/ai/search/suggestions
// ============================================================================
describe('GET /api/ai/search/suggestions', () => {
  it('should return suggestions for prefix', async () => {
    const res = await request(app).get('/api/ai/search/suggestions?q=na');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
  });

  it('should return empty array when no query', async () => {
    const res = await request(app).get('/api/ai/search/suggestions');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.suggestions).toEqual([]);
  });

  it('should return empty when prefix too short', async () => {
    const res = await request(app).get('/api/ai/search/suggestions?q=a');

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([]);
  });
});

// ============================================================================
// GET /api/ai/tags
// ============================================================================
describe('GET /api/ai/tags', () => {
  it('should return all tags with counts', async () => {
    const res = await request(app).get('/api/ai/tags');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.tags)).toBe(true);
    // We seeded two analyses with tags
    expect(res.body.tags.length).toBeGreaterThan(0);
    // Each tag should have tag and count
    const natureTag = res.body.tags.find(t => t.tag === 'nature');
    expect(natureTag).toBeDefined();
    expect(natureTag.count).toBeGreaterThanOrEqual(2); // 'nature' appears in both analyses
  });

  it('should return tags sorted by count descending', async () => {
    const res = await request(app).get('/api/ai/tags');

    expect(res.status).toBe(200);
    const tags = res.body.tags;
    for (let i = 1; i < tags.length; i++) {
      expect(tags[i - 1].count).toBeGreaterThanOrEqual(tags[i].count);
    }
  });
});

// ============================================================================
// GET /api/ai/tags/:tag/files
// ============================================================================
describe('GET /api/ai/tags/:tag/files', () => {
  it('should return files for a specific tag', async () => {
    const res = await request(app).get('/api/ai/tags/nature/files');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.files)).toBe(true);
    expect(res.body.count).toBeGreaterThan(0);
  });

  it('should return empty array for unknown tag', async () => {
    const res = await request(app).get('/api/ai/tags/zzz_nonexistent_tag/files');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.files).toEqual([]);
    expect(res.body.count).toBe(0);
  });
});
