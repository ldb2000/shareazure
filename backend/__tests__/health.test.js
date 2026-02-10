const { cleanTestDb } = require('./setup');
cleanTestDb();

const request = require('supertest');
const app = require('../server');

describe('Health & Static Endpoints', () => {
  describe('GET /api/health', () => {
    it('should return status OK', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('OK');
      expect(res.body.service).toBe('shareazure-backend');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/logo-april.svg', () => {
    it('should return 404 or SVG depending on file presence', async () => {
      const res = await request(app).get('/api/logo-april.svg');
      // In test env, file may not exist
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('POST /api/container/init', () => {
    it('should initialize container successfully', async () => {
      const res = await request(app).post('/api/container/init');
      expect(res.status).toBe(200);
      expect(res.body.containerName).toBeDefined();
    });
  });
});
