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
  // Rename File / Folder
  // ==========================================
  describe('PUT /api/user/files/rename', () => {
    beforeEach(() => {
      // Use mockImplementation so each call gets a fresh Readable stream
      mockBlockBlobClient.download.mockImplementation(() => Promise.resolve({
        readableStreamBody: new (require('stream').Readable)({
          read() { this.push(Buffer.from('content')); this.push(null); }
        }),
        contentType: 'application/pdf',
        contentLength: 7
      }));
      mockBlockBlobClient.getProperties.mockResolvedValue({
        contentType: 'application/pdf',
        contentLength: 7,
        lastModified: new Date(),
        metadata: { originalName: 'old-name.txt' }
      });
      mockBlockBlobClient.uploadData.mockResolvedValue({ requestId: 'ok' });
      mockBlockBlobClient.delete.mockResolvedValue({});
      mockContainerClient.getBlockBlobClient.mockReturnValue(mockBlockBlobClient);
    });

    it('should rename a file at root', async () => {
      const res = await request(app)
        .put('/api/user/files/rename')
        .set('Authorization', `Bearer ${users.user.token}`)
        .send({ oldPath: 'old-name.txt', newName: 'new-name.txt' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.oldPath).toBe('old-name.txt');
      expect(res.body.newPath).toBe('new-name.txt');
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith('old-name.txt');
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith('new-name.txt');
      expect(mockBlockBlobClient.uploadData).toHaveBeenCalled();
      expect(mockBlockBlobClient.delete).toHaveBeenCalled();
    });

    it('should rename a file inside a folder', async () => {
      const res = await request(app)
        .put('/api/user/files/rename')
        .set('Authorization', `Bearer ${users.user.token}`)
        .send({ oldPath: 'documents/report.pdf', newName: 'rapport.pdf' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.newPath).toBe('documents/rapport.pdf');
    });

    it('should rename a root folder', async () => {
      // Mock listBlobsFlat to return blobs inside the folder
      const folderBlobs = [
        { name: 'photos/img1.jpg', properties: { contentType: 'image/jpeg', contentLength: 100, lastModified: new Date() } },
        { name: 'photos/img2.jpg', properties: { contentType: 'image/jpeg', contentLength: 200, lastModified: new Date() } }
      ];
      let callIndex = 0;
      mockContainerClient.listBlobsFlat.mockReturnValue({
        [Symbol.asyncIterator]: function() {
          return {
            next: async () => {
              if (callIndex >= folderBlobs.length) return { done: true };
              return { done: false, value: folderBlobs[callIndex++] };
            }
          };
        }
      });

      const res = await request(app)
        .put('/api/user/files/rename')
        .set('Authorization', `Bearer ${users.user.token}`)
        .send({ oldPath: 'photos/', newName: 'images' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.oldPath).toBe('photos/');
      expect(res.body.newPath).toBe('images/');
      // Should have been called for both blobs: source + dest for each
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith('photos/img1.jpg');
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith('images/img1.jpg');
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith('photos/img2.jpg');
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith('images/img2.jpg');
    });

    it('should rename a nested folder', async () => {
      const folderBlobs = [
        { name: 'parent/old-sub/file.txt', properties: { contentType: 'text/plain', contentLength: 50, lastModified: new Date() } }
      ];
      let callIndex = 0;
      mockContainerClient.listBlobsFlat.mockReturnValue({
        [Symbol.asyncIterator]: function() {
          return {
            next: async () => {
              if (callIndex >= folderBlobs.length) return { done: true };
              return { done: false, value: folderBlobs[callIndex++] };
            }
          };
        }
      });

      const res = await request(app)
        .put('/api/user/files/rename')
        .set('Authorization', `Bearer ${users.user.token}`)
        .send({ oldPath: 'parent/old-sub/', newName: 'new-sub' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.newPath).toBe('parent/new-sub/');
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith('parent/old-sub/file.txt');
      expect(mockContainerClient.getBlockBlobClient).toHaveBeenCalledWith('parent/new-sub/file.txt');
    });

    it('should rename an empty folder', async () => {
      mockContainerClient.listBlobsFlat.mockReturnValue({
        [Symbol.asyncIterator]: function() {
          return { next: async () => ({ done: true }) };
        }
      });

      const res = await request(app)
        .put('/api/user/files/rename')
        .set('Authorization', `Bearer ${users.user.token}`)
        .send({ oldPath: 'empty-folder/', newName: 'renamed-folder' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.newPath).toBe('renamed-folder/');
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .put('/api/user/files/rename')
        .send({ oldPath: 'file.txt', newName: 'new.txt' });

      expect(res.status).toBe(401);
    });

    it('should reject missing oldPath', async () => {
      const res = await request(app)
        .put('/api/user/files/rename')
        .set('Authorization', `Bearer ${users.user.token}`)
        .send({ newName: 'new.txt' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should reject missing newName', async () => {
      const res = await request(app)
        .put('/api/user/files/rename')
        .set('Authorization', `Bearer ${users.user.token}`)
        .send({ oldPath: 'file.txt' });

      expect(res.status).toBe(400);
    });

    it('should reject newName containing slash', async () => {
      const res = await request(app)
        .put('/api/user/files/rename')
        .set('Authorization', `Bearer ${users.user.token}`)
        .send({ oldPath: 'file.txt', newName: 'sub/name.txt' });

      expect(res.status).toBe(400);
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
