const { cleanTestDb, seedTestUsers, mockBlockBlobClient } = require('./setup');
cleanTestDb();

const request = require('supertest');
const app = require('../server');
const { usersDb, db, shareLinksDb, allowedEmailDomainsDb } = require('../database');
const bcrypt = require('bcrypt');

let users;

beforeAll(async () => {
  users = await seedTestUsers(db, usersDb);
  // Add allowed email domain for tests
  try {
    allowedEmailDomainsDb.add('test.com');
    allowedEmailDomainsDb.add('shareazure.local');
    allowedEmailDomainsDb.add('april.fr');
  } catch (e) {
    // Ignore duplicates
  }
});

describe('Share Link Endpoints', () => {

  // ==========================================
  // Generate Share Link
  // ==========================================
  describe('POST /api/share/generate', () => {
    it('should generate a share link', async () => {
      // Mock blob exists and has properties
      mockBlockBlobClient.exists.mockResolvedValueOnce(true);
      mockBlockBlobClient.getProperties.mockResolvedValueOnce({
        contentType: 'application/pdf',
        contentLength: 1024,
        lastModified: new Date(),
        metadata: { originalName: 'test.pdf' }
      });

      const res = await request(app)
        .post('/api/share/generate')
        .send({
          blobName: 'test-uuid.pdf',
          expiresInMinutes: 60,
          recipientEmail: 'user@test.com'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.linkId).toBeDefined();
      expect(res.body.shareLink).toBeDefined();
      expect(res.body.qrCode).toBeDefined();
      expect(res.body.expiresAt).toBeDefined();
    });

    it('should generate a share link with password', async () => {
      mockBlockBlobClient.exists.mockResolvedValueOnce(true);
      mockBlockBlobClient.getProperties.mockResolvedValueOnce({
        contentType: 'application/pdf',
        contentLength: 1024,
        lastModified: new Date(),
        metadata: { originalName: 'test.pdf' }
      });

      const res = await request(app)
        .post('/api/share/generate')
        .send({
          blobName: 'test-uuid.pdf',
          expiresInMinutes: 30,
          password: 'mypassword',
          recipientEmail: 'user@test.com'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.hasPassword).toBe(true);
    });

    it('should reject without blobName', async () => {
      const res = await request(app)
        .post('/api/share/generate')
        .send({
          recipientEmail: 'user@test.com'
        });

      expect(res.status).toBe(400);
    });

    it('should reject without recipientEmail', async () => {
      const res = await request(app)
        .post('/api/share/generate')
        .send({
          blobName: 'test-uuid.pdf'
        });

      expect(res.status).toBe(400);
    });

    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/api/share/generate')
        .send({
          blobName: 'test-uuid.pdf',
          recipientEmail: 'not-an-email'
        });

      expect(res.status).toBe(400);
    });

    it('should reject unauthorized email domain', async () => {
      const res = await request(app)
        .post('/api/share/generate')
        .send({
          blobName: 'test-uuid.pdf',
          recipientEmail: 'user@unauthorized-domain.com'
        });

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // Download via Share Link
  // ==========================================
  describe('POST /api/share/download/:linkId', () => {
    let testLinkId;

    beforeAll(async () => {
      // Create a share link directly in DB for testing
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      const passwordHash = await bcrypt.hash('testpass', 10);
      testLinkId = 'test-link-download-' + Date.now();

      shareLinksDb.create({
        linkId: testLinkId,
        blobName: 'test-blob.pdf',
        originalName: 'test.pdf',
        contentType: 'application/pdf',
        fileSize: 1024,
        shareUrl: 'https://mock.url/test',
        passwordHash,
        recipientEmail: 'user@test.com',
        expiresAt: expiresAt.toISOString(),
        expiresInMinutes: 60,
        createdBy: 'admin'
      });
    });

    it('should reject without password when required', async () => {
      const res = await request(app)
        .post(`/api/share/download/${testLinkId}`)
        .send({ email: 'user@test.com' });

      expect(res.status).toBe(401);
      expect(res.body.requiresPassword).toBe(true);
    });

    it('should reject with wrong password', async () => {
      const res = await request(app)
        .post(`/api/share/download/${testLinkId}`)
        .send({ password: 'wrongpass', email: 'user@test.com' });

      expect(res.status).toBe(401);
    });

    it('should reject unauthorized email', async () => {
      const res = await request(app)
        .post(`/api/share/download/${testLinkId}`)
        .send({ password: 'testpass', email: 'wrong@test.com' });

      expect(res.status).toBe(403);
    });

    it('should return 404 for nonexistent link', async () => {
      const res = await request(app)
        .post('/api/share/download/nonexistent-link')
        .send({ password: 'test' });

      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // Share Info
  // ==========================================
  describe('GET /api/share/info/:blobName', () => {
    it('should return file info', async () => {
      mockBlockBlobClient.exists.mockResolvedValueOnce(true);
      mockBlockBlobClient.getProperties.mockResolvedValueOnce({
        contentType: 'application/pdf',
        contentLength: 1024,
        lastModified: new Date(),
        metadata: { originalName: 'test.pdf' }
      });

      const res = await request(app)
        .get('/api/share/info/test-blob.pdf');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.file).toBeDefined();
      expect(res.body.file.blobName).toBe('test-blob.pdf');
    });
  });

  // ==========================================
  // Share History
  // ==========================================
  describe('GET /api/share/history', () => {
    it('should return share history', async () => {
      const res = await request(app)
        .get('/api/share/history');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.links)).toBe(true);
      expect(res.body.count).toBeDefined();
    });

    it('should filter by blobName', async () => {
      const res = await request(app)
        .get('/api/share/history')
        .query({ blobName: 'test-blob.pdf' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================
  // Share Stats
  // ==========================================
  describe('GET /api/share/stats/:linkId', () => {
    let statsLinkId;

    beforeAll(() => {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);
      statsLinkId = 'test-link-stats-' + Date.now();

      shareLinksDb.create({
        linkId: statsLinkId,
        blobName: 'stats-blob.pdf',
        originalName: 'stats.pdf',
        contentType: 'application/pdf',
        fileSize: 2048,
        shareUrl: 'https://mock.url/stats',
        passwordHash: null,
        recipientEmail: 'user@test.com',
        expiresAt: expiresAt.toISOString(),
        expiresInMinutes: 60,
        createdBy: 'admin'
      });
    });

    it('should return stats for a valid link', async () => {
      const res = await request(app)
        .get(`/api/share/stats/${statsLinkId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.link).toBeDefined();
      expect(res.body.statistics).toBeDefined();
    });

    it('should return 404 for nonexistent link', async () => {
      const res = await request(app)
        .get('/api/share/stats/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // Revoke Share Link
  // ==========================================
  describe('DELETE /api/share/:linkId', () => {
    let revokeLinkId;

    beforeAll(() => {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);
      revokeLinkId = 'test-link-revoke-' + Date.now();

      shareLinksDb.create({
        linkId: revokeLinkId,
        blobName: 'revoke-blob.pdf',
        originalName: 'revoke.pdf',
        contentType: 'application/pdf',
        fileSize: 512,
        shareUrl: 'https://mock.url/revoke',
        passwordHash: null,
        recipientEmail: 'user@test.com',
        expiresAt: expiresAt.toISOString(),
        expiresInMinutes: 60,
        createdBy: 'admin'
      });
    });

    it('should revoke a share link', async () => {
      const res = await request(app)
        .delete(`/api/share/${revokeLinkId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 for nonexistent link', async () => {
      const res = await request(app)
        .delete('/api/share/nonexistent-link-id');

      expect(res.status).toBe(404);
    });
  });
});
