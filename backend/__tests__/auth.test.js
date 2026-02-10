const { cleanTestDb, seedTestUsers, generateUserToken, generateInvalidToken } = require('./setup');
cleanTestDb();

const request = require('supertest');
const app = require('../server');
const { usersDb, db } = require('../database');

let users;

beforeAll(async () => {
  users = await seedTestUsers(db, usersDb);
});

describe('Authentication Endpoints', () => {

  // ==========================================
  // Admin Login
  // ==========================================
  describe('POST /api/admin/login', () => {
    it('should login admin with valid credentials', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ username: 'admin', password: 'admin123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.role).toBe('admin');
      expect(res.body.user.username).toBe('admin');
    });

    it('should reject invalid password', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ username: 'admin', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject non-admin user', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ username: 'user', password: 'user123' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject missing credentials', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject nonexistent user', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ username: 'nonexistent', password: 'test' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================
  // Admin Verify
  // ==========================================
  describe('POST /api/admin/verify', () => {
    it('should verify valid admin token', async () => {
      const res = await request(app)
        .post('/api/admin/verify')
        .set('Authorization', `Bearer ${users.admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toBe('admin');
    });

    it('should reject non-admin token', async () => {
      const res = await request(app)
        .post('/api/admin/verify')
        .set('Authorization', `Bearer ${users.user.token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .post('/api/admin/verify')
        .set('Authorization', `Bearer ${generateInvalidToken()}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject missing token', async () => {
      const res = await request(app)
        .post('/api/admin/verify');

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // User Login
  // ==========================================
  describe('POST /api/user/login', () => {
    it('should login user with valid credentials', async () => {
      const res = await request(app)
        .post('/api/user/login')
        .send({ username: 'user', password: 'user123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.role).toBe('user');
    });

    it('should reject invalid credentials', async () => {
      const res = await request(app)
        .post('/api/user/login')
        .send({ username: 'user', password: 'wrong' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should login april_user', async () => {
      const res = await request(app)
        .post('/api/user/login')
        .send({ username: 'april', password: 'april123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toBe('april_user');
    });
  });

  // ==========================================
  // User Verify
  // ==========================================
  describe('POST /api/user/verify', () => {
    it('should verify valid user token', async () => {
      const res = await request(app)
        .post('/api/user/verify')
        .set('Authorization', `Bearer ${users.user.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.username).toBe('user');
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .post('/api/user/verify')
        .set('Authorization', `Bearer ${generateInvalidToken()}`);

      expect(res.status).toBe(401);
    });
  });
});
