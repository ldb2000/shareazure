# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShareAzure is a web application for uploading, managing, and sharing files via Azure Blob Storage. It features a modern drag-and-drop interface, temporary share links with SAS tokens, password protection, QR codes, and an admin dashboard.

**Tech Stack:**
- Backend: Node.js/Express with Azure Blob Storage SDK
- AI/Multimedia: OpenAI GPT-4 Vision (semantic analysis), Azure AI Vision via `@azure/cognitiveservices-computervision` (structural detection), Whisper (transcription)
- Geolocation: exifr (EXIF/GPS extraction), Nominatim OSM (reverse geocoding)
- Media Processing: sharp (thumbnails/images), fluent-ffmpeg (video frames/audio extraction)
- Frontend: Vanilla JavaScript (ES6+), HTML5, CSS3
- Maps: Leaflet.js + MarkerCluster (OpenStreetMap tiles, no API key)
- Database: SQLite (better-sqlite3) with FTS5 for full-text search
- Storage: Azure Blob Storage
- Infrastructure: Terraform (Storage Account, Application Insights, Cognitive Services)
- Security: Helmet.js, CORS, rate limiting, bcrypt for passwords
- Testing: Jest + Supertest (18 suites, 257 tests)

## Architecture

```
shareazure/
├── backend/           # Express API server
│   ├── server.js      # Main server with all API endpoints
│   ├── database.js    # SQLite database schema and helpers
│   ├── test-connection.js  # Azure connection test utility
│   └── ai/            # AI/Multimedia analysis module (12 files)
│       ├── index.js              # Express router (37 endpoints, mounted on /api/ai and /api/admin/ai)
│       ├── openaiService.js      # OpenAI GPT-4 Vision: analyzeImage, generateTags, describeScene
│       ├── azureVisionService.js # Azure AI Vision: detectFaces, detectObjects, ocr
│       ├── mediaProcessor.js     # sharp (thumbnails), ffmpeg (video frames, audio extraction)
│       ├── analysisOrchestrator.js # Orchestrates full file analysis (dispatch by type + geoloc)
│       ├── geolocationService.js # EXIF GPS extraction (exifr) + Nominatim reverse geocoding
│       ├── scanService.js        # Scheduled scans (face, tagging, geoloc, full analysis)
│       ├── searchService.js      # FTS5 search + filters
│       ├── faceService.js        # Face gallery, grouping, naming
│       ├── albumService.js       # Smart albums (auto rules + manual)
│       ├── transcriptionService.js # Whisper API for audio/video
│       └── jobQueue.js           # p-queue wrapper with metrics
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
- The backend is a monolithic Express server in `backend/server.js` (~4900 lines)
- Core API endpoints are in server.js (56 endpoints); AI endpoints are in `backend/ai/index.js` (37 endpoints)
- SQLite database with 15 tables: `share_links`, `download_logs`, `settings`, `allowed_email_domains`, `users`, `guest_accounts`, `media_analysis`, `face_profiles`, `face_occurrences`, `smart_albums`, `smart_album_items`, `transcriptions`, `video_markers`, `ai_cost_tracking`, `geolocation`, `scan_schedules` + FTS5 virtual table `search_index`
- Frontend uses vanilla JavaScript with Fetch API - no frameworks
- Files are uploaded to Azure Blob Storage with UUID-based naming
- Share links use Azure SAS tokens for temporary access
- Admin interface is separate HTML/JS/CSS in the `admin/` directory
- AI module (`backend/ai/`) with 12 service files, mounted on `/api/ai` and `/api/admin/ai`
- Scheduled scans run via `setInterval` (60s) in server.js, checking `scan_schedules` table
- `getBlobBufferHelper()` in server.js passes blob download capability to AI module

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
cp terraform.tfvars.example terraform.tfvars  # Edit with your values
terraform init
terraform plan
terraform apply

# Get connection string
terraform output -raw storage_account_primary_connection_string

# Get Cognitive Services (AI) credentials
terraform output -raw cognitive_services_endpoint   # -> AZURE_VISION_ENDPOINT
terraform output -raw cognitive_services_key         # -> AZURE_VISION_KEY

# Get App Insights connection string
terraform output -raw application_insights_connection_string
```

Terraform provisions: Storage Account + Container, Application Insights (optional), Cognitive Services / Computer Vision (optional).

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

**AI/Multimedia (optional):**
- `OPENAI_API_KEY` - OpenAI API key for GPT-4 Vision and Whisper
- `OPENAI_MODEL` - OpenAI model (default: `gpt-4o`)
- `OPENAI_WHISPER_MODEL` - Whisper model (default: `whisper-1`)
- `AZURE_VISION_ENDPOINT` - Azure AI Vision endpoint URL
- `AZURE_VISION_KEY` - Azure AI Vision API key
- `FFMPEG_PATH` - Custom ffmpeg path (optional)
- `AI_MAX_CONCURRENT_JOBS` - Max concurrent AI jobs (default: 3)
- `AI_AUTO_ANALYZE_ON_UPLOAD` - Auto-analyze on upload (default: false)

### Settings Database

Many settings are now stored in the SQLite `settings` table rather than environment variables:
- `maxFileSizeMB` - Maximum file size
- `containerName` - Azure container name
- `defaultShareLinkExpiration` - Default expiration for share links
- `requireEmailForSharing` - Whether email is required for sharing
- `validateEmailDomains` - Whether to validate email domains

**AI Settings (category `ai`):**
- `aiEnabled`, `openaiEnabled`, `azureVisionEnabled` - Feature toggles
- `autoAnalyzeOnUpload` - Auto-analyze uploaded media files
- `maxConcurrentAnalysis` - Max concurrent AI jobs
- `openaiModel`, `whisperModel`, `whisperLanguage` - Model configuration
- `faceRecognitionEnabled`, `faceMinConfidence` - Face detection settings
- `videoTimelineEnabled`, `videoFrameInterval` - Video analysis settings
- `transcriptionEnabled` - Audio/video transcription toggle
- `smartAlbumsEnabled`, `searchEnabled` - Feature toggles
- `aiMonthlyBudget`, `aiCostAlertThreshold` - Cost management
- `thumbnailSize`, `thumbnailQuality` - Thumbnail generation settings
- `geolocationEnabled` - EXIF GPS extraction toggle
- `reverseGeocodingEnabled` - Nominatim reverse geocoding toggle

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

**AI/Multimedia Endpoints (`/api/ai/`):**

*Analysis:*
- `POST /api/ai/analyze/:blobName` - Launch AI analysis (async, returns jobId)
- `POST /api/ai/analyze-batch` - Batch analysis of multiple files
- `GET /api/ai/analysis/:blobName` - Get analysis results
- `DELETE /api/ai/analysis/:blobName` - Delete analysis data
- `GET /api/ai/job/:jobId` - Get job status

*Search:*
- `GET /api/ai/search?q=...` - Semantic search (query, filters: type, date, tags, faces)
- `GET /api/ai/search/suggestions?q=...` - Auto-complete suggestions
- `GET /api/ai/tags` - List all tags with counts
- `GET /api/ai/tags/:tag/files` - Files associated with a tag

*Faces:*
- `GET /api/ai/faces` - Gallery of face profiles
- `POST /api/ai/faces` - Create a face profile
- `PUT /api/ai/faces/:profileId` - Rename a profile
- `DELETE /api/ai/faces/:profileId` - Delete a profile
- `POST /api/ai/faces/:profileId/merge` - Merge two profiles
- `GET /api/ai/faces/:profileId/files` - Files where person appears

*Smart Albums:*
- `GET /api/ai/albums` - List albums
- `POST /api/ai/albums` - Create album (manual or with auto rules)
- `PUT /api/ai/albums/:albumId` - Update album
- `DELETE /api/ai/albums/:albumId` - Delete album
- `POST /api/ai/albums/:albumId/items` - Add items
- `DELETE /api/ai/albums/:albumId/items/:blobName` - Remove item
- `GET /api/ai/albums/:albumId/items` - List album items

*Video:*
- `GET /api/ai/video/:blobName/timeline` - Timeline with markers
- `GET /api/ai/video/:blobName/thumbnail/:timestamp` - Thumbnail at timestamp

*Transcription:*
- `POST /api/ai/transcribe/:blobName` - Launch transcription (async)
- `GET /api/ai/transcription/:blobName` - Get transcription
- `GET /api/ai/transcription/:blobName/search?q=...` - Search within transcription

*Geolocation:*
- `GET /api/ai/geolocation/:blobName` - Get geolocation data for a file
- `GET /api/ai/map` - All geotagged files (lat, lng, blobName, address, city, country)
- `POST /api/ai/geolocation/:blobName` - Manual EXIF GPS extraction

*Admin AI (`/api/admin/ai/`):*
- `GET /api/admin/ai/dashboard` - AI stats (analyses, costs, top tags, queue)
- `GET /api/admin/ai/costs` - Detailed costs by service/model/period
- `PUT /api/admin/ai/settings` - Configure AI settings
- `POST /api/admin/ai/reindex` - Rebuild FTS5 search index
- `GET /api/admin/ai/scans` - List all scan schedules
- `PUT /api/admin/ai/scans/:id` - Update scan schedule/enabled
- `POST /api/admin/ai/scans/:id/run` - Run a scan manually

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

// AI - Media Analysis
mediaAnalysisDb.create(data)
mediaAnalysisDb.getByBlobName(blobName)
mediaAnalysisDb.update(blobName, data)
mediaAnalysisDb.delete(blobName)
mediaAnalysisDb.getAll(limit)
mediaAnalysisDb.getByStatus(status)
mediaAnalysisDb.getStats()

// AI - Face Profiles
faceProfilesDb.create(data)
faceProfilesDb.getById(id)
faceProfilesDb.getAll()
faceProfilesDb.update(id, data)
faceProfilesDb.delete(id)
faceProfilesDb.merge(targetId, sourceId)

// AI - Face Occurrences
faceOccurrencesDb.create(data)
faceOccurrencesDb.getByBlobName(blobName)
faceOccurrencesDb.getByProfile(profileId)

// AI - Smart Albums
smartAlbumsDb.create(data)
smartAlbumsDb.getById(id)
smartAlbumsDb.getAll()
smartAlbumsDb.update(id, data)
smartAlbumsDb.delete(id)
smartAlbumsDb.addItem(albumId, blobName, addedBy)
smartAlbumsDb.removeItem(albumId, blobName)
smartAlbumsDb.getItems(albumId)

// AI - Transcriptions
transcriptionsDb.create(data)
transcriptionsDb.getByBlobName(blobName)
transcriptionsDb.update(blobName, data)
transcriptionsDb.delete(blobName)
transcriptionsDb.search(blobName, query)

// AI - Video Markers
videoMarkersDb.create(data)
videoMarkersDb.getByBlobName(blobName)
videoMarkersDb.deleteByBlobName(blobName)

// AI - Cost Tracking
aiCostTrackingDb.log(data)
aiCostTrackingDb.getCostSummary(startDate, endDate)
aiCostTrackingDb.getMonthlyTotal()

// AI - Search Index (FTS5)
searchIndexDb.upsert(data)
searchIndexDb.search(query, limit)
searchIndexDb.delete(blobName)
searchIndexDb.rebuild()

// AI - Geolocation
geolocationDb.create(data)
geolocationDb.getByBlobName(blobName)
geolocationDb.getAll(limit)
geolocationDb.delete(blobName)
geolocationDb.getNearby(lat, lng, radiusKm)
geolocationDb.getStats()

// AI - Scan Schedules
scanSchedulesDb.getAll()
scanSchedulesDb.getByType(scanType)
scanSchedulesDb.getById(id)
scanSchedulesDb.update(id, data)
scanSchedulesDb.updateLastRun(id, data)
scanSchedulesDb.getEnabled()
```

### Frontend Structure

**User Interface (frontend/):**
- `index.html` + `app.js` - Main upload interface with drag-and-drop
- `user.html` + `js/user.js` + `css/user.css` - User dashboard for file management, sharing, and **Discover section**:
  - Discover > Par Tags: AI tag cloud with sized tags, click to browse files
  - Discover > Recherche IA: semantic search with autocomplete suggestions, type filter
  - Discover > Carte: Leaflet.js map with MarkerCluster for geotagged files
  - Uses CDN: Leaflet 1.9.4 + MarkerCluster 1.5.3
  - APIs used: `/api/ai/tags`, `/api/ai/search`, `/api/ai/map`
- `login.html` + `js/login.js` - Login page (if authentication is enabled)

**Admin Interface (admin/):**
- `index.html` + `js/admin.js` + `css/admin.css` - Full admin dashboard with tabs:
  - Dashboard: Statistics and charts (Chart.js)
  - Files: Advanced file management with search/filters
  - Shares: Share link history with export
  - Logs: System logs with filters
  - Settings: Configurable parameters
  - Email Domains: Manage allowed domains
  - **IA**: AI management with 5 sub-tabs:
    - Dashboard: stat cards (analyses, cost, budget, queue) + top tags + cost by service
    - Services: toggle switches for each AI service (OpenAI, Azure Vision, Whisper, faces, geo, search, albums, video, auto-analyze, reverse geocoding)
    - Parametres: model config, thresholds, budget, concurrent jobs
    - Scans: 4 scan types (face_recognition, auto_tagging, geolocation_extraction, full_analysis) with schedule dropdown, enable toggle, manual run
    - Carte: Leaflet.js map with geotagged files (MarkerCluster)

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

### Jest Unit Tests

```bash
# Run all tests
cd backend && npx jest --forceExit

# Run a specific test file
npx jest --forceExit __tests__/ai-geolocation.test.js

# Run tests with coverage
npx jest --forceExit --coverage
```

- **18 test suites, 257 tests** covering all 93+ API endpoints (56 core + 37 AI)
- Jest + Supertest with Azure SDK mocks in `backend/__tests__/setup.js`
- `cleanTestDb()` must be called at top of each test file before requiring server
- server.js IIFE wrapped in `if (require.main === module)` for testable import
- `--forceExit` needed due to `setInterval` cleanup tasks in database.js
- Mock gotchas: `blockBlobClient.exists()` defaults to false (mock with `mockResolvedValueOnce(true)`), stream mock needs real `Readable` for `.pipe()`, `BlobSASPermissions` must be constructable with `new`

### Manual Testing

- Use `test-connection.js` to verify Azure Storage connectivity before running the app
- The `scripts/` directory contains test scripts for various features
- `scripts/test-all-endpoints.sh` — master bash test script (requires running server)
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
- **docs/installation/INSTALL.md** - Complete installation guide (Terraform + .env + AI)
- **docs/installation/setup.sh** - Automated installation script
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
- **docs/AI_FEATURES.md** - AI/Multimedia features and Discover section documentation
- **infrastructure/README.md** - Terraform deployment guide



## Skills available in this repo
- skills/azure-enterprise-ctocoach.skills.md
- skills/azure-architecture-optimized.skills.md
- skills/azure-finops-advanced.skills.md
- skills/azure-landingzone-finops-governance.skills.md

## Default behaviour
If the user asks for enterprise-level architecture + cost governance:
- activate azure-enterprise-ctocoach

