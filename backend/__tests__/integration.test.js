const { cleanTestDb, seedTestUsers, mockBlockBlobClient } = require('./setup');
cleanTestDb();

const request = require('supertest');
const app = require('../server');
const { usersDb, db, allowedEmailDomainsDb, settingsDb } = require('../database');
const bcrypt = require('bcrypt');

let users;

beforeAll(async () => {
  users = await seedTestUsers(db, usersDb);
  // Add allowed domain
  try {
    allowedEmailDomainsDb.add('integration.com');
  } catch (e) {
    // ignore duplicate
  }
  settingsDb.update('enableGuestAccounts', 'true');
});

describe('Integration Tests - End-to-End Workflows', () => {

  // ==========================================
  // User Workflow: Login -> Upload -> Share -> Download
  // ==========================================
  describe('User Workflow: Login -> Upload -> Share', () => {
    let userToken;
    let uploadedBlobName;
    let shareLinkId;

    it('Step 1: User should login', async () => {
      const res = await request(app)
        .post('/api/user/login')
        .send({ username: 'user', password: 'user123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      userToken = res.body.token;
    });

    it('Step 2: User should upload a file', async () => {
      const res = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', Buffer.from('integration test content'), {
          filename: 'integration-test.txt',
          contentType: 'text/plain'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      uploadedBlobName = res.body.file.blobName;
    });

    it('Step 3: User should generate a share link', async () => {
      mockBlockBlobClient.exists.mockResolvedValueOnce(true);
      mockBlockBlobClient.getProperties.mockResolvedValueOnce({
        contentType: 'text/plain',
        contentLength: 25,
        lastModified: new Date(),
        metadata: { originalName: 'integration-test.txt' }
      });

      const res = await request(app)
        .post('/api/share/generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          blobName: uploadedBlobName || 'test-blob',
          expiresInMinutes: 60,
          recipientEmail: 'recipient@integration.com'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      shareLinkId = res.body.linkId;
    });

    it('Step 4: Share link should appear in history', async () => {
      const res = await request(app)
        .get('/api/share/history');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.links)).toBe(true);
      // Links should contain the one we just created (if step 3 succeeded)
      if (shareLinkId) {
        expect(res.body.links.length).toBeGreaterThan(0);
      }
    });

    it('Step 5: Share link should have stats', async () => {
      if (!shareLinkId) return;

      const res = await request(app)
        .get(`/api/share/stats/${shareLinkId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.statistics.totalDownloads).toBe(0);
    });
  });

  // ==========================================
  // Admin Workflow: Login -> Manage Settings -> Manage Users
  // ==========================================
  describe('Admin Workflow: Login -> Settings -> Users', () => {
    let adminToken;

    it('Step 1: Admin should login', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ username: 'admin', password: 'admin123' });

      expect(res.status).toBe(200);
      adminToken = res.body.token;
    });

    it('Step 2: Admin should verify token', async () => {
      const res = await request(app)
        .post('/api/admin/verify')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('admin');
    });

    it('Step 3: Admin should view settings', async () => {
      const res = await request(app).get('/api/settings');

      expect(res.status).toBe(200);
      expect(res.body.settings).toBeDefined();
    });

    it('Step 4: Admin should update a setting', async () => {
      const res = await request(app)
        .put('/api/settings')
        .send({ maxFileSizeMB: '250' });

      expect(res.status).toBe(200);

      const verify = await request(app).get('/api/settings/maxFileSizeMB');
      expect(verify.body.value).toBe('250');
    });

    it('Step 5: Admin should manage email domains', async () => {
      const addRes = await request(app)
        .post('/api/admin/email-domains')
        .send({ domain: 'admin-test.com' });

      expect(addRes.status).toBe(200);

      const listRes = await request(app)
        .get('/api/admin/email-domains');

      expect(listRes.status).toBe(200);
      const domains = listRes.body.domains.map(d => d.domain);
      expect(domains).toContain('admin-test.com');
    });

    it('Step 6: Admin should view global costs', async () => {
      const res = await request(app)
        .get('/api/admin/costs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================
  // Guest Workflow: Create -> Login attempt
  // ==========================================
  describe('Guest Workflow: Create -> Login attempt', () => {
    let guestEmail = 'integration-guest@test.com';

    it('Step 1: Admin creates guest account', async () => {
      const res = await request(app)
        .post('/api/admin/guest-accounts')
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({ email: guestEmail });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.guest.email).toBe(guestEmail);
    });

    it('Step 2: Guest appears in list', async () => {
      const res = await request(app)
        .get('/api/admin/guest-accounts')
        .set('Authorization', `Bearer ${users.admin.token}`);

      expect(res.status).toBe(200);
      const emails = res.body.guests.map(g => g.email);
      expect(emails).toContain(guestEmail);
    });

    it('Step 3: Guest login with wrong code fails', async () => {
      const res = await request(app)
        .post('/api/guest/login')
        .send({ email: guestEmail, code: '000000' });

      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // Team Workflow: Create -> Add Members -> Manage
  // ==========================================
  describe('Team Workflow: Create -> Add Members -> Manage', () => {
    let teamId;

    it('Step 1: Admin creates team', async () => {
      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({
          name: 'integration-team',
          displayName: 'Integration Team',
          description: 'Team for integration tests'
        });

      expect(res.status).toBe(200);
      teamId = res.body.team.id;
    });

    it('Step 2: Admin adds member', async () => {
      if (!teamId) return;

      const res = await request(app)
        .post(`/api/teams/${teamId}/members`)
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({ userId: users.user.id, role: 'member' });

      expect(res.status).toBe(200);
    });

    it('Step 3: Members are listed', async () => {
      if (!teamId) return;

      const res = await request(app)
        .get(`/api/teams/${teamId}/members`)
        .set('Authorization', `Bearer ${users.admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.members.length).toBeGreaterThan(0);
    });

    it('Step 4: Admin updates team', async () => {
      if (!teamId) return;

      const res = await request(app)
        .put(`/api/teams/${teamId}`)
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({
          displayName: 'Updated Integration Team',
          description: 'Updated description'
        });

      expect(res.status).toBe(200);
    });

    it('Step 5: Admin removes member', async () => {
      if (!teamId) return;

      const res = await request(app)
        .delete(`/api/teams/${teamId}/members/${users.user.id}`)
        .set('Authorization', `Bearer ${users.admin.token}`);

      expect(res.status).toBe(200);
    });

    it('Step 6: Admin deletes team', async () => {
      if (!teamId) return;

      const res = await request(app)
        .delete(`/api/teams/${teamId}`)
        .set('Authorization', `Bearer ${users.admin.token}`);

      expect(res.status).toBe(200);
    });
  });
});
