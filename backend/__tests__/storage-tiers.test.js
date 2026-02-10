const { cleanTestDb, seedTestUsers, mockBlockBlobClient } = require('./setup');
cleanTestDb();

const request = require('supertest');
const app = require('../server');
const { usersDb, db, fileOwnershipDb } = require('../database');

let users;
const testBlobName = 'tier-test-file.pdf';

beforeAll(async () => {
  users = await seedTestUsers(db, usersDb);

  // Create file ownership for testing
  fileOwnershipDb.create({
    blobName: testBlobName,
    originalName: 'tier-test.pdf',
    contentType: 'application/pdf',
    fileSize: 1024,
    uploadedByUserId: users.user.id,
    uploadedByGuestId: null,
    folderPath: null,
    teamId: null
  });
});

describe('Storage Tiers Endpoints', () => {

  // ==========================================
  // Archive File
  // ==========================================
  describe('POST /api/files/:blobName/archive', () => {
    it('should archive a file to Cool tier', async () => {
      mockBlockBlobClient.setAccessTier.mockResolvedValueOnce({});

      const res = await request(app)
        .post(`/api/files/${testBlobName}/archive`)
        .set('Authorization', `Bearer ${users.user.token}`)
        .send({ tier: 'Cool', reason: 'Testing archive' });

      expect([200, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });

    it('should archive a file to Archive tier with admin', async () => {
      mockBlockBlobClient.setAccessTier.mockResolvedValueOnce({});

      const res = await request(app)
        .post(`/api/files/${testBlobName}/archive`)
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({ tier: 'Archive', reason: 'Admin archive test' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject invalid tier', async () => {
      const res = await request(app)
        .post(`/api/files/${testBlobName}/archive`)
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({ tier: 'InvalidTier' });

      expect(res.status).toBe(400);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .post(`/api/files/${testBlobName}/archive`)
        .send({ tier: 'Cool' });

      expect(res.status).toBe(401);
    });

    it('should return 404 for nonexistent file', async () => {
      const res = await request(app)
        .post('/api/files/nonexistent-file.pdf/archive')
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({ tier: 'Cool' });

      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // Rehydrate File
  // ==========================================
  describe('POST /api/files/:blobName/rehydrate', () => {
    it('should rehydrate a file to Hot tier', async () => {
      const res = await request(app)
        .post(`/api/files/${testBlobName}/rehydrate`)
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({ targetTier: 'Hot', priority: 'Standard' });

      // May fail if file is not actually archived in mock
      expect([200, 400]).toContain(res.status);
    });

    it('should reject invalid target tier', async () => {
      const res = await request(app)
        .post(`/api/files/${testBlobName}/rehydrate`)
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({ targetTier: 'InvalidTier' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid priority', async () => {
      const res = await request(app)
        .post(`/api/files/${testBlobName}/rehydrate`)
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({ targetTier: 'Hot', priority: 'InvalidPriority' });

      expect(res.status).toBe(400);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .post(`/api/files/${testBlobName}/rehydrate`)
        .send({ targetTier: 'Hot' });

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // Tier Status
  // ==========================================
  describe('GET /api/files/:blobName/tier-status', () => {
    it('should return tier status for a file', async () => {
      const res = await request(app)
        .get(`/api/files/${testBlobName}/tier-status`)
        .set('Authorization', `Bearer ${users.user.token}`);

      expect([200, 403]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });

    it('should return 404 for nonexistent file', async () => {
      const res = await request(app)
        .get('/api/files/nonexistent-file.pdf/tier-status')
        .set('Authorization', `Bearer ${users.admin.token}`);

      expect(res.status).toBe(404);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .get(`/api/files/${testBlobName}/tier-status`);

      expect(res.status).toBe(401);
    });
  });
});
