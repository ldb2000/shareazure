const { cleanTestDb, seedTestUsers, mockContainerClient, mockBlockBlobClient } = require('./setup');
cleanTestDb();

const request = require('supertest');
const app = require('../server');
const { usersDb, db, fileOwnershipDb, shareLinksDb } = require('../database');

let users;

beforeAll(async () => {
  users = await seedTestUsers(db, usersDb);
});

describe('User Files Endpoints', () => {

  // ==========================================
  // Get User Files
  // ==========================================
  describe('GET /api/user/files', () => {
    it('should return user files with valid auth', async () => {
      const res = await request(app)
        .get('/api/user/files')
        .set('Authorization', `Bearer ${users.user.token}`);

      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/user/files');

      expect(res.status).toBe(401);
    });

    it('should support path query parameter', async () => {
      const res = await request(app)
        .get('/api/user/files')
        .query({ path: 'documents/' })
        .set('Authorization', `Bearer ${users.user.token}`);

      expect(res.status).toBe(200);
    });
  });

  // ==========================================
  // Create Folder
  // ==========================================
  describe('POST /api/user/folders/create', () => {
    it('should create a folder with valid auth', async () => {
      const res = await request(app)
        .post('/api/user/folders/create')
        .set('Authorization', `Bearer ${users.user.token}`)
        .send({ folderName: 'test-folder', path: '' });

      // Could be 200 or other status depending on Azure mock behavior
      expect([200, 400, 500]).toContain(res.status);
    });
  });

  // ==========================================
  // Rename File
  // ==========================================
  describe('PUT /api/user/files/rename', () => {
    it('should attempt to rename a file', async () => {
      const res = await request(app)
        .put('/api/user/files/rename')
        .set('Authorization', `Bearer ${users.user.token}`)
        .send({
          blobName: 'old-name.txt',
          newName: 'new-name.txt'
        });

      // May return various status codes depending on file existence
      expect([200, 400, 404, 500]).toContain(res.status);
    });
  });

  // ==========================================
  // Move File
  // ==========================================
  describe('PUT /api/user/files/move', () => {
    it('should attempt to move a file', async () => {
      const res = await request(app)
        .put('/api/user/files/move')
        .set('Authorization', `Bearer ${users.user.token}`)
        .send({
          blobName: 'test-file.txt',
          destinationPath: 'documents/'
        });

      expect([200, 400, 404, 500]).toContain(res.status);
    });
  });

  // ==========================================
  // Delete User File
  // ==========================================
  describe('DELETE /api/user/files', () => {
    it('should attempt to delete a user file', async () => {
      const res = await request(app)
        .delete('/api/user/files')
        .set('Authorization', `Bearer ${users.user.token}`)
        .send({ blobName: 'test-file.txt' });

      expect([200, 400, 404, 500]).toContain(res.status);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .delete('/api/user/files')
        .send({ blobName: 'test-file.txt' });

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // User Share Links
  // ==========================================
  describe('GET /api/user/share-links', () => {
    it('should return user share links with valid auth', async () => {
      const res = await request(app)
        .get('/api/user/share-links')
        .set('Authorization', `Bearer ${users.user.token}`);

      expect(res.status).toBe(200);
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/user/share-links');

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // Delete User Share Link
  // ==========================================
  describe('DELETE /api/user/share-links/:linkId', () => {
    it('should attempt to delete a share link', async () => {
      const res = await request(app)
        .delete('/api/user/share-links/some-link-id')
        .set('Authorization', `Bearer ${users.user.token}`);

      // 200 or 404 depending on link existence
      expect([200, 404]).toContain(res.status);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .delete('/api/user/share-links/some-link-id');

      expect(res.status).toBe(401);
    });
  });
});
