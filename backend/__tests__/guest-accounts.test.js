const { cleanTestDb, seedTestUsers, generateGuestToken } = require('./setup');
cleanTestDb();

const request = require('supertest');
const app = require('../server');
const { usersDb, db, guestAccountsDb, settingsDb } = require('../database');

let users;

beforeAll(async () => {
  users = await seedTestUsers(db, usersDb);
  // Ensure guest accounts are enabled
  settingsDb.update('enableGuestAccounts', 'true');
});

describe('Guest Accounts Endpoints', () => {

  // ==========================================
  // Create Guest Account
  // ==========================================
  describe('POST /api/admin/guest-accounts', () => {
    it('should create a guest account with admin auth', async () => {
      const res = await request(app)
        .post('/api/admin/guest-accounts')
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({ email: 'guest1@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.guest).toBeDefined();
      expect(res.body.guest.email).toBe('guest1@test.com');
      expect(res.body.guest.guestId).toBeDefined();
    });

    it('should create a guest account with april_user auth', async () => {
      const res = await request(app)
        .post('/api/admin/guest-accounts')
        .set('Authorization', `Bearer ${users.april.token}`)
        .send({ email: 'guest2@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject with regular user auth', async () => {
      const res = await request(app)
        .post('/api/admin/guest-accounts')
        .set('Authorization', `Bearer ${users.user.token}`)
        .send({ email: 'guest3@test.com' });

      expect(res.status).toBe(403);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .post('/api/admin/guest-accounts')
        .send({ email: 'guest4@test.com' });

      expect(res.status).toBe(401);
    });

    it('should reject invalid email', async () => {
      const res = await request(app)
        .post('/api/admin/guest-accounts')
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({ email: 'not-valid' });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // List Guest Accounts
  // ==========================================
  describe('GET /api/admin/guest-accounts', () => {
    it('should list guest accounts with admin auth', async () => {
      const res = await request(app)
        .get('/api/admin/guest-accounts')
        .set('Authorization', `Bearer ${users.admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.guests)).toBe(true);
      expect(res.body.guests.length).toBeGreaterThan(0);
    });

    it('should list guest accounts with april_user auth', async () => {
      const res = await request(app)
        .get('/api/admin/guest-accounts')
        .set('Authorization', `Bearer ${users.april.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject with regular user auth', async () => {
      const res = await request(app)
        .get('/api/admin/guest-accounts')
        .set('Authorization', `Bearer ${users.user.token}`);

      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // Guest Login
  // ==========================================
  describe('POST /api/guest/login', () => {
    it('should reject with wrong code', async () => {
      const res = await request(app)
        .post('/api/guest/login')
        .send({ email: 'guest1@test.com', code: '000000' });

      expect(res.status).toBe(401);
    });

    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/guest/login')
        .send({ email: 'guest1@test.com' });

      expect(res.status).toBe(400);
    });

    it('should reject nonexistent email', async () => {
      const res = await request(app)
        .post('/api/guest/login')
        .send({ email: 'nonexistent@test.com', code: '123456' });

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // Disable Guest Account
  // ==========================================
  describe('PUT /api/admin/guest-accounts/:guestId/disable', () => {
    it('should disable a guest account', async () => {
      // Get the first guest
      const listRes = await request(app)
        .get('/api/admin/guest-accounts')
        .set('Authorization', `Bearer ${users.admin.token}`);

      const guest = listRes.body.guests[0];
      if (!guest) return;

      const res = await request(app)
        .put(`/api/admin/guest-accounts/${guest.guest_id}/disable`)
        .set('Authorization', `Bearer ${users.admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================
  // Delete Guest Account
  // ==========================================
  describe('DELETE /api/admin/guest-accounts/:guestId', () => {
    let guestToDelete;

    beforeAll(async () => {
      // Create a guest to delete
      const res = await request(app)
        .post('/api/admin/guest-accounts')
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({ email: 'to-delete@test.com' });

      guestToDelete = res.body.guest;
    });

    it('should delete a guest account with admin auth', async () => {
      if (!guestToDelete) return;

      const res = await request(app)
        .delete(`/api/admin/guest-accounts/${guestToDelete.guestId}`)
        .set('Authorization', `Bearer ${users.admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.stats).toBeDefined();
    });

    it('should return 404 for nonexistent guest', async () => {
      const res = await request(app)
        .delete('/api/admin/guest-accounts/nonexistent-guest-id')
        .set('Authorization', `Bearer ${users.admin.token}`);

      expect(res.status).toBe(404);
    });
  });
});
