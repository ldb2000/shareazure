/**
 * Tests for AI Scan Schedules endpoints
 */
const { cleanTestDb, seedTestUsers } = require('./setup');
cleanTestDb();

// Mock AI services
jest.mock('../ai/analysisOrchestrator', () => ({
  analyzeFile: jest.fn().mockResolvedValue({ jobId: 'test-job-1', blobName: 'test.jpg', mediaType: 'image' }),
  analyzeBatch: jest.fn(),
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
  SUPPORTED_IMAGE_TYPES: ['image/jpeg', 'image/png'],
  SUPPORTED_VIDEO_TYPES: ['video/mp4'],
  SUPPORTED_AUDIO_TYPES: ['audio/mpeg']
}));

jest.mock('../ai/openaiService', () => ({
  analyzeImage: jest.fn().mockResolvedValue({ tags: [], description: '' }),
  isEnabled: jest.fn().mockReturnValue(false)
}));

jest.mock('../ai/azureVisionService', () => ({
  analyzeImage: jest.fn().mockResolvedValue({ tags: [] }),
  detectFaces: jest.fn().mockResolvedValue([]),
  isEnabled: jest.fn().mockReturnValue(false)
}));

jest.mock('../ai/transcriptionService', () => ({
  transcribe: jest.fn(),
  isEnabled: jest.fn().mockReturnValue(false)
}));

jest.mock('../ai/faceService', () => ({
  isEnabled: jest.fn().mockReturnValue(false),
  getMinConfidence: jest.fn().mockReturnValue(0.7),
  addOccurrence: jest.fn(),
  getAllProfiles: jest.fn().mockReturnValue([]),
  getProfile: jest.fn(),
  getOccurrencesByBlobName: jest.fn().mockReturnValue([]),
  createProfile: jest.fn(),
  updateProfile: jest.fn(),
  deleteProfile: jest.fn(),
  mergeProfiles: jest.fn(),
  getFilesByProfile: jest.fn().mockReturnValue([]),
  assignFaceToProfile: jest.fn()
}));

jest.mock('../ai/searchService', () => ({
  updateIndex: jest.fn(),
  removeFromIndex: jest.fn(),
  rebuildIndex: jest.fn(),
  search: jest.fn().mockReturnValue([]),
  getSuggestions: jest.fn().mockReturnValue([]),
  getAllTags: jest.fn().mockReturnValue([]),
  getFilesByTag: jest.fn().mockReturnValue([]),
  isEnabled: jest.fn().mockReturnValue(true)
}));

jest.mock('../ai/geolocationService', () => ({
  extractGeolocation: jest.fn(),
  isEnabled: jest.fn().mockReturnValue(true),
  isReverseGeocodingEnabled: jest.fn().mockReturnValue(false),
  getByBlobName: jest.fn(),
  getAllGeotagged: jest.fn().mockReturnValue([]),
  getNearby: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({ total: 0, countries: 0, cities: 0 }),
  deleteByBlobName: jest.fn()
}));

jest.mock('../ai/scanService', () => ({
  runScan: jest.fn().mockResolvedValue({ scanType: 'face_recognition', filesProcessed: 3, error: null }),
  shouldRunNow: jest.fn().mockReturnValue(false),
  checkScheduledScans: jest.fn()
}));

const request = require('supertest');
const app = require('../server');
const { settingsDb, scanSchedulesDb, usersDb } = require('../database');
const scanService = require('../ai/scanService');

let adminToken;

beforeAll(async () => {
  const seeded = await seedTestUsers(null, usersDb);
  adminToken = seeded.admin.token;

  // Ensure AI is enabled
  settingsDb.update('aiEnabled', 'true');
});

describe('AI Scan Schedules Endpoints', () => {

  describe('GET /api/admin/ai/scans', () => {
    test('returns all 4 default scan schedules', async () => {
      const res = await request(app)
        .get('/api/admin/ai/scans')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.scans)).toBe(true);
      expect(res.body.scans.length).toBe(4);

      const types = res.body.scans.map(s => s.scan_type);
      expect(types).toContain('face_recognition');
      expect(types).toContain('auto_tagging');
      expect(types).toContain('geolocation_extraction');
      expect(types).toContain('full_analysis');
    });

    test('all scans default to manual schedule', async () => {
      const res = await request(app)
        .get('/api/admin/ai/scans')
        .set('Authorization', `Bearer ${adminToken}`);

      for (const scan of res.body.scans) {
        expect(scan.schedule).toBe('manual');
        expect(scan.is_enabled).toBe(1);
      }
    });
  });

  describe('PUT /api/admin/ai/scans/:id', () => {
    test('updates schedule to daily', async () => {
      const scans = scanSchedulesDb.getAll();
      const scanId = scans[0].id;

      const res = await request(app)
        .put(`/api/admin/ai/scans/${scanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ schedule: 'daily' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.scan.schedule).toBe('daily');
    });

    test('updates enabled to false', async () => {
      const scans = scanSchedulesDb.getAll();
      const scanId = scans[1].id;

      const res = await request(app)
        .put(`/api/admin/ai/scans/${scanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isEnabled: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.scan.is_enabled).toBe(0);
    });

    test('rejects invalid schedule value', async () => {
      const scans = scanSchedulesDb.getAll();
      const scanId = scans[0].id;

      const res = await request(app)
        .put(`/api/admin/ai/scans/${scanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ schedule: 'every_5_minutes' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('returns 404 for non-existent scan', async () => {
      const res = await request(app)
        .put('/api/admin/ai/scans/9999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ schedule: 'hourly' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/admin/ai/scans/:id/run', () => {
    test('runs a scan manually', async () => {
      const scans = scanSchedulesDb.getAll();
      const scanId = scans[0].id;

      const res = await request(app)
        .post(`/api/admin/ai/scans/${scanId}/run`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.result).toBeDefined();
      expect(res.body.result.filesProcessed).toBeDefined();
      expect(scanService.runScan).toHaveBeenCalled();
    });

    test('returns 404 for non-existent scan', async () => {
      const res = await request(app)
        .post('/api/admin/ai/scans/9999/run')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});

describe('AI Settings — Geolocation keys', () => {
  test('PUT /api/admin/ai/settings accepts geolocationEnabled', async () => {
    const res = await request(app)
      .put('/api/admin/ai/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ geolocationEnabled: 'false' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.updated.geolocationEnabled).toBe('false');

    // Verify it was saved
    const val = settingsDb.get('geolocationEnabled');
    expect(val).toBe('false');
  });

  test('PUT /api/admin/ai/settings accepts reverseGeocodingEnabled', async () => {
    const res = await request(app)
      .put('/api/admin/ai/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reverseGeocodingEnabled: 'true' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.updated.reverseGeocodingEnabled).toBe('true');
  });
});
