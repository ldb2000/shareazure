/**
 * Tests for AI Faces and Smart Albums endpoints
 */
const { cleanTestDb } = require('./setup');
cleanTestDb();

// Mock AI services that use external deps
jest.mock('../ai/analysisOrchestrator', () => ({
  analyzeFile: jest.fn(),
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

const request = require('supertest');
const app = require('../server');
const { faceOccurrencesDb } = require('../database');

// ============================================================================
// FACE PROFILE ENDPOINTS
// ============================================================================

describe('Face Profile Endpoints', () => {
  // ==========================================
  // GET /api/ai/faces
  // ==========================================
  describe('GET /api/ai/faces', () => {
    it('should return empty array initially', async () => {
      const res = await request(app).get('/api/ai/faces');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.profiles).toEqual([]);
    });

    it('should return profiles after creation', async () => {
      // Create a profile first
      await request(app)
        .post('/api/ai/faces')
        .send({ name: 'Alice' });

      const res = await request(app).get('/api/ai/faces');

      expect(res.status).toBe(200);
      expect(res.body.profiles.length).toBeGreaterThan(0);
      expect(res.body.profiles[0].name).toBe('Alice');
    });
  });

  // ==========================================
  // POST /api/ai/faces
  // ==========================================
  describe('POST /api/ai/faces', () => {
    it('should create face profile with name', async () => {
      const res = await request(app)
        .post('/api/ai/faces')
        .send({ name: 'Bob', createdBy: 'admin' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.profile).toBeDefined();
      expect(res.body.profile.name).toBe('Bob');
      expect(res.body.profile.id).toBeDefined();
    });

    it('should return 400 when name missing', async () => {
      const res = await request(app)
        .post('/api/ai/faces')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('name');
    });

    it('should return 201 status code', async () => {
      const res = await request(app)
        .post('/api/ai/faces')
        .send({ name: 'Charlie' });

      expect(res.status).toBe(201);
    });
  });

  // ==========================================
  // PUT /api/ai/faces/:profileId
  // ==========================================
  describe('PUT /api/ai/faces/:profileId', () => {
    let profileId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/ai/faces')
        .send({ name: 'ToRename' });
      profileId = res.body.profile.id;
    });

    it('should rename a profile', async () => {
      const res = await request(app)
        .put(`/api/ai/faces/${profileId}`)
        .send({ name: 'Renamed' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.profile.name).toBe('Renamed');
    });

    it('should return 400 when name missing', async () => {
      const res = await request(app)
        .put(`/api/ai/faces/${profileId}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 for nonexistent profile', async () => {
      const res = await request(app)
        .put('/api/ai/faces/99999')
        .send({ name: 'Ghost' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================
  // DELETE /api/ai/faces/:profileId
  // ==========================================
  describe('DELETE /api/ai/faces/:profileId', () => {
    it('should delete a profile', async () => {
      // Create then delete
      const createRes = await request(app)
        .post('/api/ai/faces')
        .send({ name: 'ToDelete' });
      const id = createRes.body.profile.id;

      const res = await request(app).delete(`/api/ai/faces/${id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('deleted');

      // Verify deletion
      const getRes = await request(app).get('/api/ai/faces');
      const found = getRes.body.profiles.find(p => p.id === id);
      expect(found).toBeUndefined();
    });

    it('should return 404 for nonexistent profile', async () => {
      const res = await request(app).delete('/api/ai/faces/99999');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================
  // POST /api/ai/faces/:profileId/merge
  // ==========================================
  describe('POST /api/ai/faces/:profileId/merge', () => {
    let targetId, sourceId;

    beforeAll(async () => {
      const target = await request(app)
        .post('/api/ai/faces')
        .send({ name: 'Target Person' });
      targetId = target.body.profile.id;

      const source = await request(app)
        .post('/api/ai/faces')
        .send({ name: 'Source Person' });
      sourceId = source.body.profile.id;

      // Add occurrences to both profiles
      faceOccurrencesDb.create({ blobName: 'photo1.jpg', faceProfileId: targetId, confidence: 0.9 });
      faceOccurrencesDb.create({ blobName: 'photo2.jpg', faceProfileId: sourceId, confidence: 0.85 });
    });

    it('should merge source into target', async () => {
      const res = await request(app)
        .post(`/api/ai/faces/${targetId}/merge`)
        .send({ sourceProfileId: sourceId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.profile).toBeDefined();
      expect(res.body.profile.name).toBe('Target Person');

      // Source should be deleted
      const getRes = await request(app).get('/api/ai/faces');
      const sourceFound = getRes.body.profiles.find(p => p.id === sourceId);
      expect(sourceFound).toBeUndefined();
    });

    it('should return 400 when sourceProfileId missing', async () => {
      const res = await request(app)
        .post(`/api/ai/faces/${targetId}/merge`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('sourceProfileId');
    });

    it('should return 404 when target not found', async () => {
      const res = await request(app)
        .post('/api/ai/faces/99999/merge')
        .send({ sourceProfileId: targetId });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Target');
    });

    it('should return 404 when source not found', async () => {
      const res = await request(app)
        .post(`/api/ai/faces/${targetId}/merge`)
        .send({ sourceProfileId: 99999 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Source');
    });
  });

  // ==========================================
  // GET /api/ai/faces/:profileId/files
  // ==========================================
  describe('GET /api/ai/faces/:profileId/files', () => {
    let profileWithFiles;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/ai/faces')
        .send({ name: 'PersonWithFiles' });
      profileWithFiles = res.body.profile.id;

      faceOccurrencesDb.create({ blobName: 'fileA.jpg', faceProfileId: profileWithFiles, confidence: 0.95 });
      faceOccurrencesDb.create({ blobName: 'fileB.jpg', faceProfileId: profileWithFiles, confidence: 0.90 });
    });

    it('should return files for a profile with seeded occurrences', async () => {
      const res = await request(app).get(`/api/ai/faces/${profileWithFiles}/files`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.files)).toBe(true);
      expect(res.body.count).toBe(2);
    });

    it('should return 404 for nonexistent profile', async () => {
      const res = await request(app).get('/api/ai/faces/99999/files');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});

// ============================================================================
// SMART ALBUM ENDPOINTS
// ============================================================================

describe('Smart Album Endpoints', () => {
  // ==========================================
  // GET /api/ai/albums
  // ==========================================
  describe('GET /api/ai/albums', () => {
    it('should return empty array initially', async () => {
      const res = await request(app).get('/api/ai/albums');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.albums).toEqual([]);
    });

    it('should return albums after creation', async () => {
      await request(app)
        .post('/api/ai/albums')
        .send({ name: 'My Album' });

      const res = await request(app).get('/api/ai/albums');

      expect(res.status).toBe(200);
      expect(res.body.albums.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // POST /api/ai/albums
  // ==========================================
  describe('POST /api/ai/albums', () => {
    it('should create a manual album', async () => {
      const res = await request(app)
        .post('/api/ai/albums')
        .send({ name: 'Manual Album', description: 'A test album' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.album).toBeDefined();
      expect(res.body.album.name).toBe('Manual Album');
      expect(res.body.album.type).toBe('manual');
    });

    it('should create an auto album with rules', async () => {
      const res = await request(app)
        .post('/api/ai/albums')
        .send({
          name: 'Auto Nature Album',
          type: 'auto',
          rules: { tags: ['nature'] }
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.album.type).toBe('auto');
    });

    it('should return 400 when name missing', async () => {
      const res = await request(app)
        .post('/api/ai/albums')
        .send({ description: 'No name album' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('name');
    });

    it('should return 201 status code', async () => {
      const res = await request(app)
        .post('/api/ai/albums')
        .send({ name: 'Status Test Album' });

      expect(res.status).toBe(201);
    });
  });

  // ==========================================
  // PUT /api/ai/albums/:albumId
  // ==========================================
  describe('PUT /api/ai/albums/:albumId', () => {
    let albumId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/ai/albums')
        .send({ name: 'ToUpdate', description: 'Original desc' });
      albumId = res.body.album.id;
    });

    it('should update album name', async () => {
      const res = await request(app)
        .put(`/api/ai/albums/${albumId}`)
        .send({ name: 'Updated Album' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.album.name).toBe('Updated Album');
    });

    it('should return 404 for nonexistent album', async () => {
      const res = await request(app)
        .put('/api/ai/albums/99999')
        .send({ name: 'Ghost Album' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should preserve existing fields when partial update', async () => {
      const res = await request(app)
        .put(`/api/ai/albums/${albumId}`)
        .send({ description: 'Updated desc' });

      expect(res.status).toBe(200);
      expect(res.body.album.name).toBe('Updated Album'); // preserved from previous test
      expect(res.body.album.description).toBe('Updated desc');
    });
  });

  // ==========================================
  // DELETE /api/ai/albums/:albumId
  // ==========================================
  describe('DELETE /api/ai/albums/:albumId', () => {
    it('should delete an album', async () => {
      const createRes = await request(app)
        .post('/api/ai/albums')
        .send({ name: 'ToDelete Album' });
      const id = createRes.body.album.id;

      const res = await request(app).delete(`/api/ai/albums/${id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('deleted');
    });

    it('should return 404 for nonexistent album', async () => {
      const res = await request(app).delete('/api/ai/albums/99999');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================
  // POST /api/ai/albums/:albumId/items
  // ==========================================
  describe('POST /api/ai/albums/:albumId/items', () => {
    let albumId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/ai/albums')
        .send({ name: 'Items Album' });
      albumId = res.body.album.id;
    });

    it('should add items to album', async () => {
      const res = await request(app)
        .post(`/api/ai/albums/${albumId}/items`)
        .send({ blobNames: ['photo1.jpg', 'photo2.jpg'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.added).toBe(2);
    });

    it('should return 400 when blobNames missing', async () => {
      const res = await request(app)
        .post(`/api/ai/albums/${albumId}/items`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('blobNames');
    });

    it('should return 400 when blobNames not array', async () => {
      const res = await request(app)
        .post(`/api/ai/albums/${albumId}/items`)
        .send({ blobNames: 'not-an-array' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 for nonexistent album', async () => {
      const res = await request(app)
        .post('/api/ai/albums/99999/items')
        .send({ blobNames: ['photo1.jpg'] });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================
  // DELETE /api/ai/albums/:albumId/items/:blobName
  // ==========================================
  describe('DELETE /api/ai/albums/:albumId/items/:blobName', () => {
    let albumId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/ai/albums')
        .send({ name: 'Remove Items Album' });
      albumId = res.body.album.id;

      await request(app)
        .post(`/api/ai/albums/${albumId}/items`)
        .send({ blobNames: ['item-to-remove.jpg'] });
    });

    it('should remove item from album', async () => {
      const res = await request(app).delete(`/api/ai/albums/${albumId}/items/item-to-remove.jpg`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('removed');
    });

    it('should return 200 even if item did not exist', async () => {
      const res = await request(app).delete(`/api/ai/albums/${albumId}/items/nonexistent-item.jpg`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================
  // GET /api/ai/albums/:albumId/items
  // ==========================================
  describe('GET /api/ai/albums/:albumId/items', () => {
    let albumId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/ai/albums')
        .send({ name: 'List Items Album' });
      albumId = res.body.album.id;

      await request(app)
        .post(`/api/ai/albums/${albumId}/items`)
        .send({ blobNames: ['listitem1.jpg', 'listitem2.jpg', 'listitem3.jpg'] });
    });

    it('should return items for album', async () => {
      const res = await request(app).get(`/api/ai/albums/${albumId}/items`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.count).toBe(3);
    });

    it('should return 404 for nonexistent album', async () => {
      const res = await request(app).get('/api/ai/albums/99999/items');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return empty array for album with no items', async () => {
      const createRes = await request(app)
        .post('/api/ai/albums')
        .send({ name: 'Empty Album' });
      const emptyId = createRes.body.album.id;

      const res = await request(app).get(`/api/ai/albums/${emptyId}/items`);

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.count).toBe(0);
    });
  });
});
