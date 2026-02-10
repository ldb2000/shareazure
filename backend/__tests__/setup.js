/**
 * Test Setup - ShareAzure
 *
 * Provides:
 * - Azure SDK mocks (BlobServiceClient, SAS tokens, etc.)
 * - Nodemailer mock
 * - Test database (separate SQLite file)
 * - Token generation helpers
 * - Test user fixtures
 */

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

// ============================================
// 1. MOCK: @azure/storage-blob
// ============================================

const { Readable } = require('stream');
const mockBlobContent = Buffer.from('test file content');

/**
 * Create a real readable stream from mock content for pipe() compatibility
 */
function createMockReadableStream() {
  const stream = new Readable({
    read() {
      this.push(mockBlobContent);
      this.push(null);
    }
  });
  return stream;
}

const mockBlockBlobClient = {
  uploadData: jest.fn().mockResolvedValue({ requestId: 'mock-request-id' }),
  download: jest.fn().mockImplementation(async () => ({
    readableStreamBody: createMockReadableStream(),
    contentType: 'application/pdf',
    contentLength: mockBlobContent.length
  })),
  delete: jest.fn().mockResolvedValue({}),
  exists: jest.fn().mockResolvedValue(false), // Default: file doesn't exist (for upload dedup)
  getProperties: jest.fn().mockResolvedValue({
    contentType: 'application/pdf',
    contentLength: 1024,
    lastModified: new Date(),
    accessTier: 'Hot',
    archiveStatus: undefined,
    metadata: {}
  }),
  setAccessTier: jest.fn().mockResolvedValue({}),
  url: 'https://mockaccount.blob.core.windows.net/uploads/test-blob',
  beginCopyFromURL: jest.fn().mockResolvedValue({ pollUntilDone: jest.fn().mockResolvedValue({}) })
};

const mockIterator = {
  [Symbol.asyncIterator]: function() {
    let done = false;
    return {
      next: async () => {
        if (done) return { done: true };
        done = true;
        return {
          done: false,
          value: {
            name: 'test-uuid-file.pdf',
            properties: {
              contentType: 'application/pdf',
              contentLength: 1024,
              lastModified: new Date(),
              createdOn: new Date()
            }
          }
        };
      }
    };
  }
};

const mockContainerClient = {
  getBlockBlobClient: jest.fn().mockReturnValue(mockBlockBlobClient),
  createIfNotExists: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({}),
  listBlobsFlat: jest.fn().mockReturnValue(mockIterator),
  exists: jest.fn().mockResolvedValue(true)
};

const mockBlobServiceClient = {
  getContainerClient: jest.fn().mockReturnValue(mockContainerClient)
};

// BlobSASPermissions needs to be a constructor (used with `new`)
const MockBlobSASPermissions = jest.fn().mockImplementation(() => ({
  read: false,
  write: false,
  delete: false
}));
MockBlobSASPermissions.parse = jest.fn().mockReturnValue({});

jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn().mockReturnValue(mockBlobServiceClient)
  },
  BlobSASPermissions: MockBlobSASPermissions,
  generateBlobSASQueryParameters: jest.fn().mockReturnValue({
    toString: () => 'sv=2021-06-08&ss=b&srt=sco&sp=r&se=2099-01-01&sig=mocksig'
  }),
  StorageSharedKeyCredential: jest.fn().mockImplementation(() => ({}))
}));

// ============================================
// 2. MOCK: nodemailer
// ============================================

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-message-id' }),
    verify: jest.fn().mockResolvedValue(true)
  })
}));

// ============================================
// 3. MOCK: QR Code (avoid canvas dependency issues in tests)
// ============================================

jest.mock('qrcode', () => ({
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,mockqrcode'),
  toBuffer: jest.fn().mockResolvedValue(Buffer.from('mockqrcode'))
}));

// ============================================
// 4. Environment setup
// ============================================

// Set test environment variables before requiring app
process.env.NODE_ENV = 'test';
process.env.AZURE_STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=testaccount;AccountKey=dGVzdGtleQ==;EndpointSuffix=core.windows.net';
process.env.AZURE_CONTAINER_NAME = 'test-uploads';
process.env.PORT = '0'; // Random port for tests

// ============================================
// 5. Database helpers
// ============================================

const TEST_DB_PATH = path.join(__dirname, '..', 'shareazure-test.db');

/**
 * Ensure a clean test database exists before the app is loaded.
 * We delete the old file and let database.js recreate it.
 */
function cleanTestDb() {
  try {
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    // Also remove journal
    const journalPath = TEST_DB_PATH + '-journal';
    if (fs.existsSync(journalPath)) {
      fs.unlinkSync(journalPath);
    }
    const walPath = TEST_DB_PATH + '-wal';
    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
    }
    const shmPath = TEST_DB_PATH + '-shm';
    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
    }
  } catch (e) {
    // Ignore if doesn't exist
  }
}

// ============================================
// 6. Override database path BEFORE requiring modules
// ============================================

// We need to mock the database module to use a test DB path.
// Since database.js uses a hardcoded path, we mock it by
// manipulating the module before server.js loads.

// Set the DB path env variable for our custom database initialization
process.env.SHAREAZURE_DB_PATH = TEST_DB_PATH;

// ============================================
// 7. Token generation helpers
// ============================================

function generateUserToken(userId, username) {
  return Buffer.from(`user:${userId}:${username}:${Date.now()}`).toString('base64');
}

function generateGuestToken(guestId) {
  return Buffer.from(`guest:${guestId}:${Date.now()}`).toString('base64');
}

function generateInvalidToken() {
  return Buffer.from('invalid:token:data').toString('base64');
}

// ============================================
// 8. Test fixtures
// ============================================

const TEST_USERS = {
  admin: {
    username: 'admin',
    email: 'admin@shareazure.local',
    password: 'admin123',
    role: 'admin',
    fullName: 'Administrateur'
  },
  april: {
    username: 'april',
    email: 'april@april.fr',
    password: 'april123',
    role: 'april_user',
    fullName: 'Utilisateur APRIL'
  },
  user: {
    username: 'user',
    email: 'user@shareazure.local',
    password: 'user123',
    role: 'user',
    fullName: 'Utilisateur Standard'
  }
};

/**
 * Seed test users directly in the database.
 * Returns a map of username -> { ...userData, id, token }
 */
async function seedTestUsers(db, usersDb) {
  const seeded = {};

  for (const [key, userData] of Object.entries(TEST_USERS)) {
    const existing = usersDb.getByUsername(userData.username);
    if (existing) {
      seeded[key] = {
        ...userData,
        id: existing.id,
        token: generateUserToken(existing.id, existing.username)
      };
      continue;
    }

    const passwordHash = await bcrypt.hash(userData.password, 10);
    const result = usersDb.create({
      username: userData.username,
      email: userData.email,
      passwordHash,
      role: userData.role,
      fullName: userData.fullName
    });

    seeded[key] = {
      ...userData,
      id: result.lastInsertRowid,
      token: generateUserToken(result.lastInsertRowid, userData.username)
    };
  }

  return seeded;
}

// ============================================
// 9. Exports
// ============================================

module.exports = {
  // Mocks
  mockBlobServiceClient,
  mockContainerClient,
  mockBlockBlobClient,
  mockBlobContent,

  // DB helpers
  TEST_DB_PATH,
  cleanTestDb,

  // Token helpers
  generateUserToken,
  generateGuestToken,
  generateInvalidToken,

  // Fixtures
  TEST_USERS,
  seedTestUsers
};
