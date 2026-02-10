# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShareAzure is a web application for uploading, managing, and sharing files via Azure Blob Storage. It features a modern drag-and-drop interface, temporary share links with SAS tokens, password protection, QR codes, and an admin dashboard.

**Tech Stack:**
- Backend: Node.js/Express with Azure Blob Storage SDK
- Frontend: Vanilla JavaScript (ES6+), HTML5, CSS3
- Database: SQLite (better-sqlite3) for share links, downloads, settings, and email domains
- Storage: Azure Blob Storage
- Security: Helmet.js, CORS, rate limiting, bcrypt for passwords

## Architecture

```
shareazure/
├── backend/           # Express API server
│   ├── server.js      # Main server with all API endpoints
│   ├── database.js    # SQLite database schema and helpers
│   └── test-connection.js  # Azure connection test utility
├── frontend/          # User interface
│   ├── index.html     # Main upload page
│   ├── app.js         # Upload/file management logic
│   ├── user.html      # User dashboard
│   └── js/user.js     # User dashboard logic
├── admin/             # Admin interface
│   ├── index.html     # Admin dashboard
│   └── js/admin.js    # Admin dashboard logic
└── infrastructure/    # Terraform configuration for Azure
```

**Key architectural points:**
- The backend is a monolithic Express server in `backend/server.js` (~2000 lines)
- All API endpoints are defined in the single server.js file (no route separation)
- SQLite database tables: `share_links`, `download_logs`, `settings`, `allowed_email_domains`
- Frontend uses vanilla JavaScript with Fetch API - no frameworks
- Files are uploaded to Azure Blob Storage with UUID-based naming
- Share links use Azure SAS tokens for temporary access
- Admin interface is separate HTML/JS/CSS in the `admin/` directory

## Common Commands

### Development

```bash
# Start backend (from backend/)
npm start                # Production mode
npm run dev              # Development with nodemon

# Start frontend (from frontend/)
python3 -m http.server 8080
# or
npx http-server -p 8080

# Quick start with script (from root)
./scripts/start-dev.sh   # Starts both backend and frontend

# Stop all
./scripts/stop-dev.sh
```

### Testing

```bash
# Test Azure connection
cd backend && node test-connection.js

# Test basic API
curl http://localhost:3000/api/health

# Test upload
curl -X POST http://localhost:3000/api/upload -F "file=@test.pdf"

# Run advanced features test
./scripts/test-advanced-features.sh

# Run share functionality test
./scripts/test-share.sh
```

### Admin Setup

```bash
# Check and setup admin access
./scripts/check-admin.sh

# Start admin interface
./scripts/start-admin.sh
```

### Infrastructure

```bash
# Deploy Azure infrastructure with Terraform
cd infrastructure
terraform init
terraform plan
terraform apply

# Get connection string
terraform output -raw storage_account_primary_connection_string
```

### Database

The SQLite database (`backend/shareazure.db`) is created automatically on first run. To inspect it:

```bash
cd backend
sqlite3 shareazure.db
# Then use SQL commands: .tables, SELECT * FROM share_links; etc.
```

## Important Configuration

### Environment Variables (backend/.env)

**Required:**
- `AZURE_STORAGE_CONNECTION_STRING` - Azure Storage connection string

**Optional with defaults:**
- `AZURE_CONTAINER_NAME` - Container name (default: "uploads")
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (default: "development")
- `ALLOWED_ORIGINS` - CORS origins (default: "*")
- `MAX_FILE_SIZE_MB` - Max file size, now stored in database settings (default: 100)
- `APPLICATIONINSIGHTS_CONNECTION_STRING` - Azure monitoring

### Settings Database

Many settings are now stored in the SQLite `settings` table rather than environment variables:
- `maxFileSizeMB` - Maximum file size
- `containerName` - Azure container name
- `defaultShareLinkExpiration` - Default expiration for share links
- `requireEmailForSharing` - Whether email is required for sharing
- `validateEmailDomains` - Whether to validate email domains

## Code Structure Notes

### Backend API Endpoints

All defined in `backend/server.js`:

**Health & Container:**
- `GET /api/health` - Health check
- `POST /api/container/init` - Initialize Azure container

**File Management:**
- `POST /api/upload` - Upload single file
- `POST /api/upload/multiple` - Upload multiple files (max 10)
- `GET /api/files` - List all files
- `GET /api/download/:blobName` - Download file
- `GET /api/preview/:blobName` - Preview file (inline)
- `DELETE /api/files/:blobName` - Delete file

**Share Links:**
- `POST /api/share/generate` - Generate share link with SAS token
- `GET /api/share/info/:blobName` - Get file info for sharing
- `GET /api/share/qrcode/:linkId` - Get QR code for share link
- `POST /api/share/verify-password` - Verify password for protected link
- `GET /api/share/history` - Get share link history
- `PUT /api/share/revoke/:linkId` - Revoke share link
- `POST /api/share/track-download/:linkId` - Track download

**Admin Endpoints:**
- `GET /api/admin/stats` - Dashboard statistics
- `GET /api/admin/files` - Advanced file management with filters
- `DELETE /api/admin/files/:blobName` - Admin delete file
- `GET /api/admin/shares` - Share history with filters
- `GET /api/admin/logs` - System logs
- `GET /api/admin/settings` - Get all settings
- `PUT /api/admin/settings/:key` - Update setting
- `GET /api/admin/email-domains` - Get allowed email domains
- `POST /api/admin/email-domains` - Add email domain
- `DELETE /api/admin/email-domains/:domain` - Remove email domain
- `PUT /api/admin/email-domains/:domain/activate` - Activate domain
- `PUT /api/admin/email-domains/:domain/deactivate` - Deactivate domain

### Database Helpers

Defined in `backend/database.js`:

```javascript
// Share links
shareLinksDb.create(data)
shareLinksDb.getAll()
shareLinksDb.getByLinkId(linkId)
shareLinksDb.update(linkId, data)
shareLinksDb.delete(linkId)
shareLinksDb.incrementDownloadCount(linkId)

// Download logs
downloadLogsDb.create(data)
downloadLogsDb.getByLinkId(linkId)
downloadLogsDb.getAll()

// Settings
settingsDb.get(key)
settingsDb.set(key, value)
settingsDb.getAll()
settingsDb.getAllByCategory(category)

// Email domains
allowedEmailDomainsDb.create(data)
allowedEmailDomainsDb.getAll()
allowedEmailDomainsDb.getActive()
allowedEmailDomainsDb.delete(domain)
allowedEmailDomainsDb.activate(domain)
allowedEmailDomainsDb.deactivate(domain)
```

### Frontend Structure

**User Interface (frontend/):**
- `index.html` + `app.js` - Main upload interface with drag-and-drop
- `user.html` + `js/user.js` - User dashboard for file management and sharing
- `login.html` + `js/login.js` - Login page (if authentication is enabled)

**Admin Interface (admin/):**
- `index.html` + `js/admin.js` - Full admin dashboard with tabs:
  - Dashboard: Statistics and charts (Chart.js)
  - Files: Advanced file management with search/filters
  - Shares: Share link history with export
  - Logs: System logs with filters
  - Settings: Configurable parameters
  - Email Domains: Manage allowed domains

## Development Patterns

### Adding a New API Endpoint

1. Add the route handler in `backend/server.js`:
```javascript
app.post('/api/your-endpoint', async (req, res) => {
  try {
    // Your logic here
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

2. Update frontend to call it:
```javascript
const response = await fetch(`${API_BASE_URL}/your-endpoint`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
```

### Working with Azure Blob Storage

The `blobServiceClient` is initialized at startup. To interact with blobs:

```javascript
const containerClient = blobServiceClient.getContainerClient(containerName);
const blockBlobClient = containerClient.getBlockBlobClient(blobName);

// Upload
await blockBlobClient.uploadData(buffer, { blobHTTPHeaders: { blobContentType: mimeType }});

// Download
const downloadResponse = await blockBlobClient.download();

// Delete
await blockBlobClient.delete();

// Generate SAS token
const sasQueryParameters = generateBlobSASQueryParameters({...}, credential);
```

### Working with the Database

All database operations use synchronous better-sqlite3 API:

```javascript
// Example: Add a new setting
const stmt = db.prepare('INSERT INTO settings (key, value, category) VALUES (?, ?, ?)');
stmt.run(key, value, category);

// Use the helper functions in database.js for common operations
settingsDb.set('myKey', 'myValue');
```

## Security Considerations

- **Rate Limiting:** 100 requests per 15 minutes per IP
- **File Validation:** Validate file size against configurable `maxFileSizeMB` setting
- **SAS Tokens:** Share links use Azure SAS tokens with expiration
- **Password Protection:** Passwords hashed with bcrypt (10 rounds)
- **Email Validation:** Configurable domain whitelist for sharing
- **CORS:** Configured via `ALLOWED_ORIGINS` environment variable
- **Helmet.js:** Security headers enabled
- **Private Container:** Azure container access level is private by default

**Never commit:**
- `backend/.env` file
- `backend/shareazure.db` file (contains sensitive data)
- Azure connection strings or credentials

## Testing Notes

- Use `test-connection.js` to verify Azure Storage connectivity before running the app
- The `scripts/` directory contains test scripts for various features
- For local development, ensure both backend (port 3000) and frontend (port 8080) are running
- Admin interface runs on the same port as frontend (typically 8080)

## Common Issues

**Port already in use:**
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

**Azure connection errors:**
- Verify `AZURE_STORAGE_CONNECTION_STRING` in `.env`
- Run `node backend/test-connection.js` to diagnose
- Check if container exists with `/api/container/init`

**CORS errors:**
- Add frontend origin to `ALLOWED_ORIGINS` in backend `.env`
- Example: `ALLOWED_ORIGINS=http://localhost:8080,http://localhost:3000`

**Database locked:**
- SQLite is single-writer; ensure only one backend instance is running
- Delete `shareazure.db-journal` if it exists and restart

## Deployment

### Docker

```bash
# Build and run with docker-compose (from root)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Azure (Manual)

1. Deploy infrastructure with Terraform (see `infrastructure/README.md`)
2. Configure App Service or Container Instance
3. Set environment variables in Azure
4. Deploy backend code
5. Serve frontend from Azure Static Web Apps or CDN

## Documentation References
L'ensemble des documents doivent etre sous le repertoire docs/
- **README.md** - Main documentation and feature overview
- **CHANGELOG.md** - Version history
- **docs/README.md** - Documentation index
- **docs/GETTING_STARTED.md** - Quick start guide
- **docs/PROJECT_SUMMARY.md** - Project summary and metrics
- **docs/ARCHITECTURE.md** - Architecture diagrams
- **docs/AZURE_SETUP.md** - Detailed Azure configuration
- **docs/SHARE_FEATURE.md** - Share functionality documentation
- **docs/PREVIEW_FEATURE.md** - File preview documentation
- **docs/ADVANCED_FEATURES.md** - Advanced features v2.0
- **docs/GUEST_ACCOUNTS.md** - Guest accounts system
- **docs/ADMIN_INTERFACE.md** - Admin interface guide
- **docs/API_EXAMPLES.md** - API curl examples
- **docs/CUSTOMIZATION.md** - Customization guide
- **infrastructure/README.md** - Terraform deployment guide
