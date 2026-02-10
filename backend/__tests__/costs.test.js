const { cleanTestDb, seedTestUsers } = require('./setup');
cleanTestDb();

const request = require('supertest');
const app = require('../server');
const { usersDb, db, costTrackingDb } = require('../database');

let users;

beforeAll(async () => {
  users = await seedTestUsers(db, usersDb);

  // Seed some cost data
  const currentMonth = new Date().toISOString().slice(0, 7);
  costTrackingDb.getOrCreate('user', users.admin.id, currentMonth);
  costTrackingDb.getOrCreate('user', users.user.id, currentMonth);
});

describe('Costs Endpoints', () => {

  // ==========================================
  // User Costs
  // ==========================================
  describe('GET /api/costs/user/:userId', () => {
    it('should return own costs for authenticated user', async () => {
      const res = await request(app)
        .get(`/api/costs/user/${users.user.id}`)
        .set('Authorization', `Bearer ${users.user.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return any user costs for admin', async () => {
      const res = await request(app)
        .get(`/api/costs/user/${users.user.id}`)
        .set('Authorization', `Bearer ${users.admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject non-admin accessing other user costs', async () => {
      const res = await request(app)
        .get(`/api/costs/user/${users.admin.id}`)
        .set('Authorization', `Bearer ${users.user.token}`);

      expect(res.status).toBe(403);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .get(`/api/costs/user/${users.user.id}`);

      expect(res.status).toBe(401);
    });

    it('should support period query parameter', async () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const res = await request(app)
        .get(`/api/costs/user/${users.user.id}`)
        .query({ period: currentMonth })
        .set('Authorization', `Bearer ${users.user.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================
  // Team Costs
  // ==========================================
  describe('GET /api/costs/team/:teamId', () => {
    it('should return team costs for authenticated user', async () => {
      const res = await request(app)
        .get('/api/costs/team/1')
        .set('Authorization', `Bearer ${users.admin.token}`);

      // Team may not exist, but auth should pass
      expect([200, 404]).toContain(res.status);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .get('/api/costs/team/1');

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // Admin Global Costs
  // ==========================================
  describe('GET /api/admin/costs', () => {
    it('should return global costs for admin', async () => {
      const res = await request(app)
        .get('/api/admin/costs')
        .set('Authorization', `Bearer ${users.admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject non-admin', async () => {
      const res = await request(app)
        .get('/api/admin/costs')
        .set('Authorization', `Bearer ${users.user.token}`);

      expect(res.status).toBe(403);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .get('/api/admin/costs');

      expect(res.status).toBe(401);
    });
  });
});
