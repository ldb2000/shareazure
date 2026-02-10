const { cleanTestDb } = require('./setup');
cleanTestDb();

const request = require('supertest');
const app = require('../server');

describe('Email Domains Endpoints', () => {

  // ==========================================
  // Get Email Domains
  // ==========================================
  describe('GET /api/admin/email-domains', () => {
    it('should return email domains list', async () => {
      const res = await request(app).get('/api/admin/email-domains');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.domains)).toBe(true);
    });
  });

  // ==========================================
  // Add Email Domain
  // ==========================================
  describe('POST /api/admin/email-domains', () => {
    it('should add a new email domain', async () => {
      const res = await request(app)
        .post('/api/admin/email-domains')
        .send({ domain: 'newdomain.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject duplicate domain', async () => {
      // Add once
      await request(app)
        .post('/api/admin/email-domains')
        .send({ domain: 'duplicate.com' });

      // Add again
      const res = await request(app)
        .post('/api/admin/email-domains')
        .send({ domain: 'duplicate.com' });

      expect([400, 409]).toContain(res.status);
    });

    it('should reject missing domain', async () => {
      const res = await request(app)
        .post('/api/admin/email-domains')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // Delete Email Domain
  // ==========================================
  describe('DELETE /api/admin/email-domains/:domain', () => {
    it('should delete an email domain', async () => {
      // First add
      await request(app)
        .post('/api/admin/email-domains')
        .send({ domain: 'todelete.com' });

      const res = await request(app)
        .delete('/api/admin/email-domains/todelete.com');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================
  // Activate Email Domain
  // ==========================================
  describe('PUT /api/admin/email-domains/:domain/activate', () => {
    it('should activate an email domain', async () => {
      // Add and deactivate first
      await request(app)
        .post('/api/admin/email-domains')
        .send({ domain: 'toactivate.com' });

      await request(app)
        .put('/api/admin/email-domains/toactivate.com/deactivate');

      const res = await request(app)
        .put('/api/admin/email-domains/toactivate.com/activate');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================
  // Deactivate Email Domain
  // ==========================================
  describe('PUT /api/admin/email-domains/:domain/deactivate', () => {
    it('should deactivate an email domain', async () => {
      await request(app)
        .post('/api/admin/email-domains')
        .send({ domain: 'todeactivate.com' });

      const res = await request(app)
        .put('/api/admin/email-domains/todeactivate.com/deactivate');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
