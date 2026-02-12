/**
 * Tests for AI Service Dispatch — validates the orchestrator calls the right services
 */
const { cleanTestDb } = require('./setup');
cleanTestDb();

// Mock individual AI services (NOT the orchestrator — we test the real one)
jest.mock('../ai/openaiService', () => ({
  analyzeImage: jest.fn().mockResolvedValue({
    tags: ['nature', 'landscape'],
    description: 'A nature scene',
    caption: 'landscape'
  }),
  isEnabled: jest.fn().mockReturnValue(true)
}));

jest.mock('../ai/azureVisionService', () => ({
  analyzeImage: jest.fn().mockResolvedValue({
    tags: [{ name: 'tree' }],
    caption: { text: 'a tree', confidence: 0.9 },
    people: []
  }),
  detectFaces: jest.fn().mockResolvedValue([]),
  isEnabled: jest.fn().mockReturnValue(true)
}));

jest.mock('../ai/transcriptionService', () => ({
  transcribe: jest.fn().mockResolvedValue({
    text: 'Hello world',
    segments: [{ text: 'Hello world', start: 0, end: 2 }],
    language: 'en'
  }),
  isEnabled: jest.fn().mockReturnValue(true)
}));

jest.mock('../ai/geolocationService', () => ({
  extractGeolocation: jest.fn().mockResolvedValue({
    blobName: 'test.jpg',
    latitude: 48.8566,
    longitude: 2.3522
  }),
  isEnabled: jest.fn().mockReturnValue(true),
  isReverseGeocodingEnabled: jest.fn().mockReturnValue(false),
  getByBlobName: jest.fn(),
  getAllGeotagged: jest.fn().mockReturnValue([]),
  getNearby: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({ total: 0, countries: 0, cities: 0 }),
  deleteByBlobName: jest.fn()
}));

jest.mock('../ai/mediaProcessor', () => ({
  isSupported: jest.fn().mockReturnValue(true),
  getMediaType: jest.fn().mockImplementation((ct) => {
    if (ct.startsWith('image/')) return 'image';
    if (ct.startsWith('video/')) return 'video';
    if (ct.startsWith('audio/')) return 'audio';
    return null;
  }),
  generateThumbnail: jest.fn().mockResolvedValue('/tmp/thumb.jpg'),
  resizeForAnalysis: jest.fn().mockResolvedValue(Buffer.from('resized')),
  extractFrames: jest.fn().mockResolvedValue([
    { path: '/tmp/frame0.jpg', timestamp: 0 }
  ]),
  extractAudio: jest.fn().mockResolvedValue('/tmp/audio.mp3'),
  getVideoDuration: jest.fn().mockResolvedValue(10),
  generateVideoThumbnail: jest.fn().mockResolvedValue('/tmp/vthumb.jpg'),
  cleanupTempFiles: jest.fn(),
  extractFrameAtTimestamp: jest.fn(),
  SUPPORTED_IMAGE_TYPES: ['image/jpeg', 'image/png'],
  SUPPORTED_VIDEO_TYPES: ['video/mp4'],
  SUPPORTED_AUDIO_TYPES: ['audio/mpeg']
}));

jest.mock('../ai/faceService', () => ({
  isEnabled: jest.fn().mockReturnValue(true),
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

// Mock jobQueue to execute jobs immediately
jest.mock('../ai/jobQueue', () => ({
  addJob: jest.fn().mockImplementation(async (fn, meta) => {
    await fn();
    return 'job-immediate';
  }),
  getJobStatus: jest.fn(),
  getMetrics: jest.fn().mockReturnValue({ queued: 0, processing: 0, completed: 0, failed: 0, total: 0 }),
  cleanup: jest.fn()
}));

// Mock fs for video temp file operations
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn().mockReturnValue(Buffer.from('frame data')),
    unlinkSync: jest.fn()
  };
});

const { settingsDb, mediaAnalysisDb } = require('../database');
const openaiService = require('../ai/openaiService');
const azureVisionService = require('../ai/azureVisionService');
const transcriptionService = require('../ai/transcriptionService');
const geolocationService = require('../ai/geolocationService');
const analysisOrchestrator = require('../ai/analysisOrchestrator');

const mockBuffer = Buffer.from('test image data');
const getBufferFn = jest.fn().mockResolvedValue(mockBuffer);

beforeEach(() => {
  jest.clearAllMocks();
  getBufferFn.mockResolvedValue(mockBuffer);
});

describe('AI Service Dispatch — Orchestrator', () => {

  describe('Image analysis', () => {
    test('Image calls OpenAI analyzeImage + Azure Vision analyzeImage', async () => {
      await analysisOrchestrator.analyzeFile('test.jpg', 'image/jpeg', getBufferFn);

      expect(openaiService.analyzeImage).toHaveBeenCalled();
      expect(azureVisionService.analyzeImage).toHaveBeenCalled();
    });

    test('Image with Azure disabled calls OpenAI only', async () => {
      azureVisionService.isEnabled.mockReturnValueOnce(false);

      await analysisOrchestrator.analyzeFile('test2.jpg', 'image/jpeg', getBufferFn);

      expect(openaiService.analyzeImage).toHaveBeenCalled();
      expect(azureVisionService.analyzeImage).not.toHaveBeenCalled();
    });

    test('Image with geolocation enabled calls extractGeolocation', async () => {
      geolocationService.isEnabled.mockReturnValue(true);

      await analysisOrchestrator.analyzeFile('test3.jpg', 'image/jpeg', getBufferFn);

      expect(geolocationService.extractGeolocation).toHaveBeenCalledWith(mockBuffer, 'test3.jpg');
    });

    test('Image with geolocation disabled does not call extractGeolocation', async () => {
      geolocationService.isEnabled.mockReturnValue(false);

      await analysisOrchestrator.analyzeFile('test4.jpg', 'image/jpeg', getBufferFn);

      expect(geolocationService.extractGeolocation).not.toHaveBeenCalled();
    });
  });

  describe('Audio analysis', () => {
    test('Audio calls Whisper transcribe', async () => {
      const { getMediaType } = require('../ai/mediaProcessor');
      getMediaType.mockReturnValueOnce('audio');

      await analysisOrchestrator.analyzeFile('test.mp3', 'audio/mpeg', getBufferFn);

      expect(transcriptionService.transcribe).toHaveBeenCalled();
      expect(openaiService.analyzeImage).not.toHaveBeenCalled();
      expect(azureVisionService.analyzeImage).not.toHaveBeenCalled();
    });
  });

  describe('Video analysis', () => {
    test('Video calls OpenAI (frames) + Azure (faces) + Whisper (audio)', async () => {
      const { getMediaType } = require('../ai/mediaProcessor');
      getMediaType.mockReturnValueOnce('video');

      await analysisOrchestrator.analyzeFile('test.mp4', 'video/mp4', getBufferFn);

      expect(openaiService.analyzeImage).toHaveBeenCalled();
      expect(azureVisionService.detectFaces).toHaveBeenCalled();
      expect(transcriptionService.transcribe).toHaveBeenCalled();
    });

    test('Video with geolocation enabled calls extractGeolocation', async () => {
      const { getMediaType } = require('../ai/mediaProcessor');
      getMediaType.mockReturnValueOnce('video');
      geolocationService.isEnabled.mockReturnValue(true);

      await analysisOrchestrator.analyzeFile('geo-video.mp4', 'video/mp4', getBufferFn);

      expect(geolocationService.extractGeolocation).toHaveBeenCalled();
    });
  });
});
