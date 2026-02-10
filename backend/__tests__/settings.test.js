const { cleanTestDb } = require('./setup');
cleanTestDb();

const request = require('supertest');
const app = require('../server');

describe('Settings Endpoints', () => {

  // ==========================================
  // Get All Settings
  // ==========================================
  describe('GET /api/settings', () => {
    it('should return all settings', async () => {
      const res = await request(app).get('/api/settings');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.settings).toBeDefined();
      expect(typeof res.body.settings).toBe('object');
      // Default settings should exist
      expect(res.body.settings.maxFileSizeMB).toBeDefined();
      expect(res.body.settings.containerName).toBeDefined();
    });
  });

  // ==========================================
  // Get Specific Setting
  // ==========================================
  describe('GET /api/settings/:key', () => {
    it('should return a specific setting', async () => {
      const res = await request(app).get('/api/settings/maxFileSizeMB');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.key).toBe('maxFileSizeMB');
      expect(res.body.value).toBeDefined();
    });

    it('should return 404 for nonexistent setting', async () => {
      const res = await request(app).get('/api/settings/nonExistentKey');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================
  // Update Settings
  // ==========================================
  describe('PUT /api/settings', () => {
    it('should update settings', async () => {
      const res = await request(app)
        .put('/api/settings')
        .send({
          maxFileSizeMB: '200',
          rateLimit: '50'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify the update
      const verify = await request(app).get('/api/settings/maxFileSizeMB');
      expect(verify.body.value).toBe('200');
    });

    it('should handle non-object body gracefully', async () => {
      const res = await request(app)
        .put('/api/settings')
        .set('Content-Type', 'text/plain')
        .send('not-an-object');

      // Express may parse or reject depending on Content-Type
      expect([200, 400]).toContain(res.status);
    });
  });

  // ==========================================
  // Reset Settings
  // ==========================================
  describe('POST /api/settings/reset', () => {
    it('should reset settings to defaults', async () => {
      // First modify a setting
      await request(app)
        .put('/api/settings')
        .send({ maxFileSizeMB: '999' });

      // Reset
      const res = await request(app).post('/api/settings/reset');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify reset
      const verify = await request(app).get('/api/settings/maxFileSizeMB');
      expect(verify.body.value).toBe('100');
    });
  });
});
