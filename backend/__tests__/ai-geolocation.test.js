/**
 * Tests for AI Geolocation endpoints
 */
const { cleanTestDb, seedTestUsers, mockBlockBlobClient, mockBlobContent } = require('./setup');
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

jest.mock('../ai/scanService', () => ({
  runScan: jest.fn().mockResolvedValue({ scanType: 'test', filesProcessed: 0 }),
  shouldRunNow: jest.fn().mockReturnValue(false),
  checkScheduledScans: jest.fn()
}));

// Mock exifr
jest.mock('exifr', () => ({
  gps: jest.fn().mockResolvedValue({ latitude: 48.8566, longitude: 2.3522 }),
  parse: jest.fn().mockResolvedValue({ GPSAltitude: 35 })
}));

// Mock geolocationService to use a controlled version
jest.mock('../ai/geolocationService', () => {
  const { geolocationDb, settingsDb } = require('../database');
  return {
    extractGeolocation: jest.fn().mockImplementation(async (buffer, blobName) => {
      const geoData = {
        blobName,
        latitude: 48.8566,
        longitude: 2.3522,
        altitude: 35
      };
      geolocationDb.create(geoData);
      return geoData;
    }),
    reverseGeocode: jest.fn().mockResolvedValue({
      address: '1 Rue de Rivoli, Paris',
      city: 'Paris',
      country: 'France',
      countryCode: 'fr'
    }),
    isEnabled: jest.fn().mockReturnValue(true),
    isReverseGeocodingEnabled: jest.fn().mockReturnValue(false),
    getByBlobName: jest.fn().mockImplementation((blobName) => {
      return geolocationDb.getByBlobName(blobName);
    }),
    getAllGeotagged: jest.fn().mockImplementation((limit) => {
      return geolocationDb.getAll(limit);
    }),
    getNearby: jest.fn().mockReturnValue([]),
    getStats: jest.fn().mockReturnValue({ total: 0, countries: 0, cities: 0 }),
    deleteByBlobName: jest.fn()
  };
});

const request = require('supertest');
const app = require('../server');
const { settingsDb, geolocationDb, usersDb, fileOwnershipDb } = require('../database');
const geolocationService = require('../ai/geolocationService');

let adminToken;

beforeAll(async () => {
  const seeded = await seedTestUsers(null, usersDb);
  adminToken = seeded.admin.token;

  // Ensure AI is enabled
  settingsDb.update('aiEnabled', 'true');
  settingsDb.update('geolocationEnabled', 'true');

  // Seed file ownership
  fileOwnershipDb.create({
    blobName: 'geo-photo.jpg',
    originalName: 'geo-photo.jpg',
    contentType: 'image/jpeg',
    fileSize: 2048,
    uploadedByUserId: seeded.admin.id
  });

  // Make exists() return true for download
  mockBlockBlobClient.exists.mockResolvedValue(true);
});

describe('AI Geolocation Endpoints', () => {

  describe('GET /api/ai/geolocation/:blobName', () => {
    test('returns 404 when no geolocation data exists', async () => {
      const res = await request(app)
        .get('/api/ai/geolocation/nonexistent.jpg')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    test('returns 200 with geolocation data', async () => {
      // Seed geolocation data
      geolocationDb.create({
        blobName: 'paris-photo.jpg',
        latitude: 48.8566,
        longitude: 2.3522,
        altitude: 35,
        city: 'Paris',
        country: 'France'
      });

      const res = await request(app)
        .get('/api/ai/geolocation/paris-photo.jpg')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.geolocation).toBeDefined();
      expect(res.body.geolocation.latitude).toBe(48.8566);
      expect(res.body.geolocation.longitude).toBe(2.3522);
    });
  });

  describe('GET /api/ai/map', () => {
    test('returns list of geotagged files', async () => {
      const res = await request(app)
        .get('/api/ai/map')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.files)).toBe(true);
      expect(res.body.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('POST /api/ai/geolocation/:blobName', () => {
    test('extracts geolocation from file', async () => {
      const res = await request(app)
        .post('/api/ai/geolocation/geo-photo.jpg')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.geolocation).toBeDefined();
      expect(res.body.geolocation.latitude).toBe(48.8566);
    });

    test('returns 404 when no GPS data found', async () => {
      geolocationService.extractGeolocation.mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/ai/geolocation/no-gps.jpg')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
