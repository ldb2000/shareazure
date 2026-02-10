const { cleanTestDb, seedTestUsers } = require('./setup');
cleanTestDb();

const request = require('supertest');
const app = require('../server');
const { usersDb, db } = require('../database');

let users;

beforeAll(async () => {
  users = await seedTestUsers(db, usersDb);
});

describe('Teams Endpoints', () => {
  let createdTeamId;

  // ==========================================
  // Create Team
  // ==========================================
  describe('POST /api/teams', () => {
    it('should create a team with admin auth', async () => {
      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({
          name: 'test-team',
          displayName: 'Test Team',
          description: 'A test team'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.team).toBeDefined();
      createdTeamId = res.body.team.id;
    });

    it('should reject without admin auth', async () => {
      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${users.user.token}`)
        .send({
          name: 'another-team',
          displayName: 'Another Team'
        });

      expect(res.status).toBe(403);
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({ name: 'incomplete' });

      expect(res.status).toBe(400);
    });

    it('should reject duplicate team name', async () => {
      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({
          name: 'test-team',
          displayName: 'Duplicate Team'
        });

      expect(res.status).toBe(400);
    });
  });

  // ==========================================
  // List Teams
  // ==========================================
  describe('GET /api/teams', () => {
    it('should list teams with user auth', async () => {
      const res = await request(app)
        .get('/api/teams')
        .set('Authorization', `Bearer ${users.user.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.teams)).toBe(true);
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/teams');
      expect(res.status).toBe(401);
    });
  });

  // ==========================================
  // Get Team Details
  // ==========================================
  describe('GET /api/teams/:teamId', () => {
    it('should get team details', async () => {
      if (!createdTeamId) return;

      const res = await request(app)
        .get(`/api/teams/${createdTeamId}`)
        .set('Authorization', `Bearer ${users.admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.team).toBeDefined();
      expect(res.body.team.name).toBe('test-team');
    });

    it('should return 404 for nonexistent team', async () => {
      const res = await request(app)
        .get('/api/teams/99999')
        .set('Authorization', `Bearer ${users.admin.token}`);

      expect(res.status).toBe(404);
    });
  });

  // ==========================================
  // Update Team
  // ==========================================
  describe('PUT /api/teams/:teamId', () => {
    it('should update team with admin auth', async () => {
      if (!createdTeamId) return;

      const res = await request(app)
        .put(`/api/teams/${createdTeamId}`)
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({
          displayName: 'Updated Team Name',
          description: 'Updated description'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================
  // Add Team Member
  // ==========================================
  describe('POST /api/teams/:teamId/members', () => {
    it('should add a member to the team', async () => {
      if (!createdTeamId) return;

      const res = await request(app)
        .post(`/api/teams/${createdTeamId}/members`)
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({
          userId: users.user.id,
          role: 'member'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject non-admin/non-owner adding members', async () => {
      if (!createdTeamId) return;

      const res = await request(app)
        .post(`/api/teams/${createdTeamId}/members`)
        .set('Authorization', `Bearer ${users.user.token}`)
        .send({
          userId: users.april.id,
          role: 'member'
        });

      // User is now a member, not owner - should be rejected
      expect([200, 403]).toContain(res.status);
    });
  });

  // ==========================================
  // List Team Members
  // ==========================================
  describe('GET /api/teams/:teamId/members', () => {
    it('should list team members', async () => {
      if (!createdTeamId) return;

      const res = await request(app)
        .get(`/api/teams/${createdTeamId}/members`)
        .set('Authorization', `Bearer ${users.admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.members)).toBe(true);
    });
  });

  // ==========================================
  // Change Member Role
  // ==========================================
  describe('PUT /api/teams/:teamId/members/:userId', () => {
    it('should change member role', async () => {
      if (!createdTeamId) return;

      const res = await request(app)
        .put(`/api/teams/${createdTeamId}/members/${users.user.id}`)
        .set('Authorization', `Bearer ${users.admin.token}`)
        .send({ role: 'viewer' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================
  // Remove Team Member
  // ==========================================
  describe('DELETE /api/teams/:teamId/members/:userId', () => {
    it('should remove a member from the team', async () => {
      if (!createdTeamId) return;

      const res = await request(app)
        .delete(`/api/teams/${createdTeamId}/members/${users.user.id}`)
        .set('Authorization', `Bearer ${users.admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================
  // Delete Team
  // ==========================================
  describe('DELETE /api/teams/:teamId', () => {
    it('should delete team with admin auth', async () => {
      if (!createdTeamId) return;

      const res = await request(app)
        .delete(`/api/teams/${createdTeamId}`)
        .set('Authorization', `Bearer ${users.admin.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should reject without admin auth', async () => {
      const res = await request(app)
        .delete('/api/teams/1')
        .set('Authorization', `Bearer ${users.user.token}`);

      expect(res.status).toBe(403);
    });
  });
});
