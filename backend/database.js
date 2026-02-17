const Database = require('better-sqlite3');
const path = require('path');

// Initialisation de la base de données
const dbPath = process.env.SHAREAZURE_DB_PATH || path.join(__dirname, 'shareazure.db');
const db = new Database(dbPath);

// Activer les foreign keys
db.pragma('foreign_keys = ON');

// Créer les tables
db.exec(`
  -- Table pour l'historique des liens de partage
  CREATE TABLE IF NOT EXISTS share_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id TEXT UNIQUE NOT NULL,
    blob_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    content_type TEXT,
    file_size INTEGER,
    share_url TEXT NOT NULL,
    password_hash TEXT,
    recipient_email TEXT,
    expires_at TEXT NOT NULL,
    expires_in_minutes INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT,
    download_count INTEGER DEFAULT 0,
    last_downloaded_at TEXT,
    is_active INTEGER DEFAULT 1
  );

  -- Index pour les recherches rapides
  CREATE INDEX IF NOT EXISTS idx_share_links_blob_name ON share_links(blob_name);
  CREATE INDEX IF NOT EXISTS idx_share_links_link_id ON share_links(link_id);
  CREATE INDEX IF NOT EXISTS idx_share_links_expires_at ON share_links(expires_at);
  CREATE INDEX IF NOT EXISTS idx_share_links_is_active ON share_links(is_active);

  -- Table pour les téléchargements
  CREATE TABLE IF NOT EXISTS download_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id TEXT NOT NULL,
    blob_name TEXT NOT NULL,
    downloaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    ip_address TEXT,
    user_agent TEXT,
    FOREIGN KEY (link_id) REFERENCES share_links(link_id) ON DELETE CASCADE
  );

  -- Index pour les logs de téléchargement
  CREATE INDEX IF NOT EXISTS idx_download_logs_link_id ON download_logs(link_id);
  CREATE INDEX IF NOT EXISTS idx_download_logs_downloaded_at ON download_logs(downloaded_at);

  -- Table pour les paramètres de configuration
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Table pour les domaines d'emails autorisés
  CREATE TABLE IF NOT EXISTS allowed_email_domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by TEXT,
    is_active INTEGER DEFAULT 1
  );

  -- Index pour les domaines autorisés
  CREATE INDEX IF NOT EXISTS idx_allowed_email_domains_domain ON allowed_email_domains(domain);
  CREATE INDEX IF NOT EXISTS idx_allowed_email_domains_is_active ON allowed_email_domains(is_active);

  -- Table pour les utilisateurs
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'april_user', 'user')),
    full_name TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  -- Index pour les utilisateurs
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

  -- Table pour les comptes invités
  CREATE TABLE IF NOT EXISTS guest_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guest_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    verification_code TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    code_expires_at TEXT NOT NULL,
    code_used INTEGER DEFAULT 0,
    account_expires_at TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_by_user_id INTEGER NOT NULL,
    disabled_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Index pour les comptes invités
  CREATE INDEX IF NOT EXISTS idx_guest_accounts_email ON guest_accounts(email);
  CREATE INDEX IF NOT EXISTS idx_guest_accounts_guest_id ON guest_accounts(guest_id);
  CREATE INDEX IF NOT EXISTS idx_guest_accounts_is_active ON guest_accounts(is_active);
  CREATE INDEX IF NOT EXISTS idx_guest_accounts_account_expires_at ON guest_accounts(account_expires_at);
  CREATE INDEX IF NOT EXISTS idx_guest_accounts_created_by ON guest_accounts(created_by_user_id);

  -- Table pour la propriété des fichiers
  CREATE TABLE IF NOT EXISTS file_ownership (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blob_name TEXT UNIQUE NOT NULL,
    original_name TEXT NOT NULL,
    content_type TEXT,
    file_size INTEGER,
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    uploaded_by_user_id INTEGER,
    uploaded_by_guest_id INTEGER,
    folder_path TEXT,
    FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by_guest_id) REFERENCES guest_accounts(id) ON DELETE CASCADE,
    CHECK ((uploaded_by_user_id IS NOT NULL AND uploaded_by_guest_id IS NULL) OR
           (uploaded_by_user_id IS NULL AND uploaded_by_guest_id IS NOT NULL))
  );

  -- Index pour la propriété des fichiers
  CREATE INDEX IF NOT EXISTS idx_file_ownership_blob_name ON file_ownership(blob_name);
  CREATE INDEX IF NOT EXISTS idx_file_ownership_user_id ON file_ownership(uploaded_by_user_id);
  CREATE INDEX IF NOT EXISTS idx_file_ownership_guest_id ON file_ownership(uploaded_by_guest_id);

  -- Table pour les équipes
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    storage_prefix TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by_user_id INTEGER NOT NULL,
    is_active INTEGER DEFAULT 1,
    deleted_at TEXT,

    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CHECK (storage_prefix LIKE 'teams/%/')
  );

  CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);
  CREATE INDEX IF NOT EXISTS idx_teams_storage_prefix ON teams(storage_prefix);
  CREATE INDEX IF NOT EXISTS idx_teams_is_active ON teams(is_active);
  CREATE INDEX IF NOT EXISTS idx_teams_created_by ON teams(created_by_user_id);

  -- Table pour les membres d'équipe
  CREATE TABLE IF NOT EXISTS team_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'member', 'viewer')),
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    added_by_user_id INTEGER,
    left_at TEXT,
    is_active INTEGER DEFAULT 1,

    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (added_by_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_unique ON team_members(team_id, user_id) WHERE is_active = 1;
  CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
  CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_team_members_composite ON team_members(team_id, user_id, is_active);

  -- Table pour les quotas d'équipe
  CREATE TABLE IF NOT EXISTS team_quotas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER UNIQUE,
    max_storage_gb REAL DEFAULT 5,
    max_files INTEGER DEFAULT 1000,
    max_shares_per_user INTEGER DEFAULT 50,
    max_file_size_mb REAL DEFAULT 100,
    max_share_duration_days INTEGER DEFAULT 30,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_by TEXT,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_team_quotas_team_id ON team_quotas(team_id);

  -- Table pour le suivi des coûts
  CREATE TABLE IF NOT EXISTS cost_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('user', 'guest', 'team')),
    entity_id INTEGER NOT NULL,
    period_month TEXT NOT NULL,

    storage_size_gb REAL DEFAULT 0,
    storage_cost REAL DEFAULT 0,

    operations_write INTEGER DEFAULT 0,
    operations_read INTEGER DEFAULT 0,
    operations_list INTEGER DEFAULT 0,
    operations_other INTEGER DEFAULT 0,
    operations_cost REAL DEFAULT 0,

    bandwidth_download_gb REAL DEFAULT 0,
    bandwidth_upload_gb REAL DEFAULT 0,
    bandwidth_cost REAL DEFAULT 0,

    storage_hot_gb REAL DEFAULT 0,
    storage_cool_gb REAL DEFAULT 0,
    storage_archive_gb REAL DEFAULT 0,

    total_cost REAL DEFAULT 0,

    calculated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_updated_at TEXT NOT NULL DEFAULT (datetime('now')),

    UNIQUE(entity_type, entity_id, period_month)
  );

  CREATE INDEX IF NOT EXISTS idx_cost_tracking_entity ON cost_tracking(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_cost_tracking_period ON cost_tracking(period_month);
  CREATE INDEX IF NOT EXISTS idx_cost_tracking_composite ON cost_tracking(entity_type, entity_id, period_month);

  -- Table pour les logs d'opérations
  CREATE TABLE IF NOT EXISTS operation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK(entity_type IN ('user', 'guest', 'team')),
    entity_id INTEGER NOT NULL,
    operation_type TEXT NOT NULL CHECK(operation_type IN ('write', 'read', 'list', 'delete', 'other')),
    blob_name TEXT,
    operation_count INTEGER DEFAULT 1,
    bytes_transferred INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    period_month TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_operation_logs_entity ON operation_logs(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_operation_logs_period ON operation_logs(period_month);
  CREATE INDEX IF NOT EXISTS idx_operation_logs_composite ON operation_logs(entity_type, entity_id, period_month);

  -- Table pour les logs d'activité (audit)
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    level TEXT NOT NULL DEFAULT 'info' CHECK(level IN ('info', 'warning', 'error', 'success')),
    category TEXT NOT NULL DEFAULT 'system',
    operation TEXT NOT NULL,
    message TEXT,
    username TEXT,
    details TEXT,
    ip_address TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp);
  CREATE INDEX IF NOT EXISTS idx_activity_logs_category ON activity_logs(category);
  CREATE INDEX IF NOT EXISTS idx_activity_logs_operation ON activity_logs(operation);

  -- Table pour les tiers de stockage
  CREATE TABLE IF NOT EXISTS file_tiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blob_name TEXT UNIQUE NOT NULL,
    current_tier TEXT NOT NULL CHECK(current_tier IN ('Hot', 'Cool', 'Archive')),
    previous_tier TEXT CHECK(previous_tier IN ('Hot', 'Cool', 'Archive')),
    tier_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    tier_changed_by_user_id INTEGER,

    archived_at TEXT,
    archived_by_user_id INTEGER,
    archive_reason TEXT,

    rehydration_status TEXT CHECK(rehydration_status IN ('pending', 'in-progress', 'completed', NULL)),
    rehydration_priority TEXT CHECK(rehydration_priority IN ('Standard', 'High', NULL)),
    rehydration_started_at TEXT,
    rehydration_completed_at TEXT,
    rehydration_requested_by_user_id INTEGER,

    FOREIGN KEY (tier_changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (rehydration_requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_file_tiers_blob_name ON file_tiers(blob_name);
  CREATE INDEX IF NOT EXISTS idx_file_tiers_current_tier ON file_tiers(current_tier);
  CREATE INDEX IF NOT EXISTS idx_file_tiers_rehydration_status ON file_tiers(rehydration_status);

  -- Table pour les résultats d'analyse IA par fichier
  CREATE TABLE IF NOT EXISTS media_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blob_name TEXT NOT NULL,
    analysis_type TEXT NOT NULL CHECK(analysis_type IN ('image', 'video', 'audio')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
    openai_result TEXT,
    azure_result TEXT,
    tags TEXT,
    description TEXT,
    confidence REAL,
    thumbnail_path TEXT,
    error_message TEXT,
    analyzed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_media_analysis_blob_name ON media_analysis(blob_name);
  CREATE INDEX IF NOT EXISTS idx_media_analysis_status ON media_analysis(status);
  CREATE INDEX IF NOT EXISTS idx_media_analysis_type ON media_analysis(analysis_type);

  -- Table pour les profils de visages (galerie)
  CREATE TABLE IF NOT EXISTS face_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sample_encoding TEXT,
    created_by TEXT,
    photo_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_face_profiles_name ON face_profiles(name);

  -- Table pour les occurrences de visages détectés
  CREATE TABLE IF NOT EXISTS face_occurrences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blob_name TEXT NOT NULL,
    face_profile_id INTEGER,
    bounding_box TEXT,
    confidence REAL,
    timestamp REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (face_profile_id) REFERENCES face_profiles(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_face_occurrences_blob_name ON face_occurrences(blob_name);
  CREATE INDEX IF NOT EXISTS idx_face_occurrences_profile ON face_occurrences(face_profile_id);

  -- Table pour les albums intelligents
  CREATE TABLE IF NOT EXISTS smart_albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    rules TEXT,
    type TEXT NOT NULL DEFAULT 'manual' CHECK(type IN ('auto', 'manual')),
    cover_blob_name TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_smart_albums_type ON smart_albums(type);

  -- Table pour les items dans un album
  CREATE TABLE IF NOT EXISTS smart_album_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id INTEGER NOT NULL,
    blob_name TEXT NOT NULL,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    added_by TEXT,
    FOREIGN KEY (album_id) REFERENCES smart_albums(id) ON DELETE CASCADE,
    UNIQUE(album_id, blob_name)
  );

  CREATE INDEX IF NOT EXISTS idx_smart_album_items_album ON smart_album_items(album_id);
  CREATE INDEX IF NOT EXISTS idx_smart_album_items_blob ON smart_album_items(blob_name);

  -- Table pour les transcriptions audio/vidéo
  CREATE TABLE IF NOT EXISTS transcriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blob_name TEXT NOT NULL,
    language TEXT,
    text TEXT,
    segments TEXT,
    duration REAL,
    model TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_transcriptions_blob_name ON transcriptions(blob_name);

  -- Table pour les marqueurs timeline vidéo
  CREATE TABLE IF NOT EXISTS video_markers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blob_name TEXT NOT NULL,
    timestamp REAL NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('scene', 'face', 'keyword', 'silence')),
    label TEXT,
    thumbnail_path TEXT,
    data TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_video_markers_blob_name ON video_markers(blob_name);
  CREATE INDEX IF NOT EXISTS idx_video_markers_type ON video_markers(type);

  -- Table pour le suivi des coûts IA
  CREATE TABLE IF NOT EXISTS ai_cost_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service TEXT NOT NULL CHECK(service IN ('openai', 'azure_vision', 'whisper')),
    model TEXT NOT NULL,
    operation TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost REAL DEFAULT 0,
    blob_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_ai_cost_tracking_service ON ai_cost_tracking(service);
  CREATE INDEX IF NOT EXISTS idx_ai_cost_tracking_created_at ON ai_cost_tracking(created_at);

  -- Table pour la géolocalisation des fichiers (EXIF/GPS)
  CREATE TABLE IF NOT EXISTS geolocation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blob_name TEXT UNIQUE NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    altitude REAL,
    address TEXT,
    city TEXT,
    country TEXT,
    country_code TEXT,
    raw_exif TEXT,
    extracted_at TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_geolocation_blob_name ON geolocation(blob_name);
  CREATE INDEX IF NOT EXISTS idx_geolocation_coords ON geolocation(latitude, longitude);

  -- Table pour les scans planifiés IA
  CREATE TABLE IF NOT EXISTS scan_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_type TEXT NOT NULL CHECK(scan_type IN ('face_recognition','auto_tagging','geolocation_extraction','full_analysis')),
    schedule TEXT NOT NULL DEFAULT 'manual' CHECK(schedule IN ('manual','hourly','daily','weekly')),
    is_enabled INTEGER DEFAULT 1,
    last_run_at TEXT,
    last_run_status TEXT,
    last_run_files_processed INTEGER DEFAULT 0,
    last_run_error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_scan_schedules_type ON scan_schedules(scan_type);
  CREATE INDEX IF NOT EXISTS idx_scan_schedules_enabled ON scan_schedules(is_enabled);

  -- Table pour la quarantaine antivirus
  CREATE TABLE IF NOT EXISTS virus_quarantine (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blob_name TEXT NOT NULL,
    original_name TEXT,
    virus_name TEXT NOT NULL,
    quarantine_path TEXT,
    uploaded_by TEXT,
    detected_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved INTEGER DEFAULT 0,
    resolved_by TEXT,
    resolved_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_virus_quarantine_detected ON virus_quarantine(detected_at);
  CREATE INDEX IF NOT EXISTS idx_virus_quarantine_resolved ON virus_quarantine(resolved);

  -- Insérer les valeurs par défaut si elles n'existent pas
  INSERT OR IGNORE INTO settings (key, value, category, description) VALUES
    ('maxFileSizeMB', '100', 'storage', 'Taille maximale des fichiers en MB'),
    ('containerName', 'uploads', 'storage', 'Nom du conteneur Azure'),
    ('storageQuota', '100', 'storage', 'Quota de stockage en GB'),
    ('maxShareDays', '30', 'sharing', 'Durée maximale de partage en jours'),
    ('defaultShareMinutes', '60', 'sharing', 'Durée par défaut de partage en minutes'),
    ('requirePassword', 'false', 'security', 'Exiger un mot de passe pour les partages'),
    ('rateLimit', '100', 'security', 'Limite de requêtes par IP (par 15 min)'),
    ('enableLogs', 'true', 'system', 'Activer les logs système'),
    ('enableAudit', 'true', 'system', 'Activer audit des opérations'),
    ('notifyUploads', 'false', 'notifications', 'Notifications pour les uploads'),
    ('notifyShares', 'false', 'notifications', 'Notifications pour les partages'),
    ('notifyQuota', 'true', 'notifications', 'Notifications pour le quota'),
    ('guestAccountExpirationDays', '3', 'guest', 'Durée d''expiration des comptes invités en jours'),
    ('guestCodeExpirationHours', '24', 'guest', 'Durée d''expiration des codes de vérification en heures'),
    ('guestCodeLength', '6', 'guest', 'Longueur du code de vérification'),
    ('enableGuestAccounts', 'true', 'guest', 'Activer le système de comptes invités'),
    ('aiEnabled', 'true', 'ai', 'Activer les fonctionnalités IA'),
    ('openaiEnabled', 'true', 'ai', 'Activer OpenAI GPT-4 Vision'),
    ('azureVisionEnabled', 'true', 'ai', 'Activer Azure AI Vision'),
    ('autoAnalyzeOnUpload', 'false', 'ai', 'Analyser automatiquement les fichiers à l''upload'),
    ('maxConcurrentAnalysis', '3', 'ai', 'Nombre max de jobs IA simultanés'),
    ('openaiModel', 'gpt-4o', 'ai', 'Modèle OpenAI pour l''analyse d''image'),
    ('whisperModel', 'whisper-1', 'ai', 'Modèle Whisper pour la transcription'),
    ('whisperLanguage', 'fr', 'ai', 'Langue par défaut pour la transcription'),
    ('faceRecognitionEnabled', 'true', 'ai', 'Activer la reconnaissance faciale'),
    ('faceMinConfidence', '0.7', 'ai', 'Confiance minimale pour la détection faciale'),
    ('videoTimelineEnabled', 'true', 'ai', 'Activer la timeline vidéo'),
    ('videoFrameInterval', '5', 'ai', 'Intervalle entre frames extraites (secondes)'),
    ('transcriptionEnabled', 'true', 'ai', 'Activer la transcription audio/vidéo'),
    ('smartAlbumsEnabled', 'true', 'ai', 'Activer les albums intelligents'),
    ('searchEnabled', 'true', 'ai', 'Activer la recherche sémantique'),
    ('aiMonthlyBudget', '50', 'ai', 'Budget mensuel IA en dollars'),
    ('aiCostAlertThreshold', '80', 'ai', 'Seuil d''alerte coûts IA (% du budget)'),
    ('thumbnailSize', '300', 'ai', 'Taille des thumbnails (pixels)'),
    ('thumbnailQuality', '80', 'ai', 'Qualité des thumbnails (0-100)'),
    ('geolocationEnabled', 'true', 'ai', 'Activer l''extraction de géolocalisation EXIF'),
    ('reverseGeocodingEnabled', 'false', 'ai', 'Activer le reverse geocoding (Nominatim OSM)'),
    ('defaultMaxStorageGb', '5', 'quotas', 'Quota stockage par défaut (Go)'),
    ('defaultMaxFiles', '1000', 'quotas', 'Nombre max de fichiers par défaut'),
    ('defaultMaxFileSizeMb', '100', 'quotas', 'Taille max par fichier par défaut (Mo)'),
    ('defaultMaxSharesPerUser', '50', 'quotas', 'Nombre max de partages par utilisateur par défaut'),
    ('defaultMaxShareDurationDays', '30', 'quotas', 'Durée max de partage par défaut (jours)'),
    ('virusScanEnabled', 'true', 'security', 'Activer le scan antivirus ClamAV'),
    ('virusScanOnUpload', 'true', 'security', 'Scanner automatiquement chaque upload'),
    ('virusQuarantineNotifyAdmin', 'true', 'security', 'Notifier l''admin en cas de menace détectée'),
    ('smtpHost', 'smtp.mail.yahoo.com', 'email', 'Serveur SMTP'),
    ('smtpPort', '465', 'email', 'Port SMTP'),
    ('smtpSecure', 'true', 'email', 'Connexion SSL/TLS'),
    ('smtpUser', '', 'email', 'Utilisateur SMTP'),
    ('smtpPassword', '', 'email', 'Mot de passe SMTP'),
    ('smtpFromEmail', '', 'email', 'Email expéditeur'),
    ('smtpFromName', 'ShareAzure', 'email', 'Nom expéditeur'),
    ('emailEnabled', 'false', 'email', 'Emails activés'),
    ('emailProvider', 'smtp', 'email', 'Fournisseur email (smtp, mailjet, ovh, gmail, yahoo, outlook)'),
    ('mailjetApiKey', '', 'email', 'Clé API Mailjet'),
    ('mailjetSecretKey', '', 'email', 'Clé secrète Mailjet');

  -- Seed des scans planifiés par défaut
  INSERT OR IGNORE INTO scan_schedules (scan_type, schedule, is_enabled) VALUES
    ('face_recognition', 'manual', 1),
    ('auto_tagging', 'manual', 1),
    ('geolocation_extraction', 'manual', 1),
    ('full_analysis', 'manual', 1);

  -- Table pour les politiques de tiering automatique
  CREATE TABLE IF NOT EXISTS tiering_policies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER DEFAULT NULL,
    hot_to_cool_days INTEGER DEFAULT 30,
    cool_to_archive_days INTEGER DEFAULT 90,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id)
  );

  -- Seed politique globale par défaut (team_id = NULL)
  INSERT OR IGNORE INTO tiering_policies (id, team_id, hot_to_cool_days, cool_to_archive_days, enabled)
    SELECT 1, NULL, 30, 90, 0 WHERE NOT EXISTS (SELECT 1 FROM tiering_policies WHERE team_id IS NULL);
`);

console.log('✅ Base de données initialisée:', dbPath);

// Migration : Ajouter les colonnes auth Entra aux utilisateurs
try {
  const usersInfo = db.prepare(`PRAGMA table_info(users)`).all();
  const hasAuthProvider = usersInfo.some(col => col.name === 'auth_provider');
  if (!hasAuthProvider) {
    console.log('🔄 Migration : Ajout des colonnes auth Entra à users...');
    db.exec(`
      ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local';
      ALTER TABLE users ADD COLUMN entra_oid TEXT;
      ALTER TABLE users ADD COLUMN entra_email TEXT;
    `);
    console.log('✅ Migration terminée : colonnes auth Entra ajoutées');
  }
} catch (error) {
  console.error('⚠️  Erreur lors de la migration auth Entra:', error);
}

// Migration : Ajouter les settings auth Entra
try {
  db.exec(`
    INSERT OR IGNORE INTO settings (key, value, category, description) VALUES
      ('authMode', 'local', 'auth', 'Mode d''authentification: local, entra, hybrid'),
      ('entraTenantId', '', 'auth', 'Azure Entra Tenant ID'),
      ('entraClientId', '', 'auth', 'Azure Entra Client ID'),
      ('entraClientSecret', '', 'auth', 'Azure Entra Client Secret'),
      ('entraRedirectUri', '', 'auth', 'Azure Entra Redirect URI');
  `);
} catch (error) {
  console.error('⚠️  Erreur lors de l\'ajout des settings auth:', error);
}

// Migration : Ajouter la colonne recipient_email si elle n'existe pas
try {
  const tableInfo = db.prepare(`PRAGMA table_info(share_links)`).all();
  const hasRecipientEmail = tableInfo.some(col => col.name === 'recipient_email');

  if (!hasRecipientEmail) {
    console.log('🔄 Migration : Ajout de la colonne recipient_email...');
    db.exec(`ALTER TABLE share_links ADD COLUMN recipient_email TEXT`);
    console.log('✅ Migration terminée : colonne recipient_email ajoutée');
  }
} catch (error) {
  console.error('⚠️  Erreur lors de la migration:', error);
}

// Migration : Ajouter la colonne team_id à file_ownership si elle n'existe pas
try {
  const fileOwnershipInfo = db.prepare(`PRAGMA table_info(file_ownership)`).all();
  const hasTeamId = fileOwnershipInfo.some(col => col.name === 'team_id');

  if (!hasTeamId) {
    console.log('🔄 Migration : Ajout de la colonne team_id à file_ownership...');
    db.exec(`
      ALTER TABLE file_ownership ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_file_ownership_team_id ON file_ownership(team_id);
    `);
    console.log('✅ Migration terminée : colonne team_id ajoutée');
  }
} catch (error) {
  console.error('⚠️  Erreur lors de la migration team_id:', error);
}

// Fonctions pour gérer l'historique des liens
const shareLinksDb = {
  // Créer un nouveau lien de partage
  create: (linkData) => {
    const stmt = db.prepare(`
      INSERT INTO share_links (
        link_id, blob_name, original_name, content_type, file_size,
        share_url, password_hash, recipient_email, expires_at, expires_in_minutes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      linkData.linkId,
      linkData.blobName,
      linkData.originalName,
      linkData.contentType,
      linkData.fileSize,
      linkData.shareUrl,
      linkData.passwordHash || null,
      linkData.recipientEmail || null,
      linkData.expiresAt,
      linkData.expiresInMinutes,
      linkData.createdBy || null
    );
  },

  // Obtenir un lien par son ID
  getByLinkId: (linkId) => {
    const stmt = db.prepare(`
      SELECT * FROM share_links 
      WHERE link_id = ? AND is_active = 1
    `);
    return stmt.get(linkId);
  },

  // Obtenir tous les liens d'un fichier
  getByBlobName: (blobName) => {
    const stmt = db.prepare(`
      SELECT * FROM share_links 
      WHERE blob_name = ?
      ORDER BY created_at DESC
    `);
    return stmt.all(blobName);
  },

  // Obtenir tous les liens actifs
  getAllActive: () => {
    const stmt = db.prepare(`
      SELECT * FROM share_links 
      WHERE is_active = 1 AND datetime(expires_at) > datetime('now')
      ORDER BY created_at DESC
    `);
    return stmt.all();
  },

  // Obtenir tous les liens (actifs et expirés)
  getAll: (limit = 100) => {
    const stmt = db.prepare(`
      SELECT * FROM share_links 
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  },

  // Incrémenter le compteur de téléchargements
  incrementDownloadCount: (linkId) => {
    const stmt = db.prepare(`
      UPDATE share_links 
      SET download_count = download_count + 1,
          last_downloaded_at = datetime('now')
      WHERE link_id = ?
    `);
    return stmt.run(linkId);
  },

  // Désactiver un lien
  deactivate: (linkId) => {
    const stmt = db.prepare(`
      UPDATE share_links 
      SET is_active = 0
      WHERE link_id = ?
    `);
    return stmt.run(linkId);
  },

  // Supprimer un lien
  delete: (linkId) => {
    const stmt = db.prepare(`
      DELETE FROM share_links 
      WHERE link_id = ?
    `);
    return stmt.run(linkId);
  },

  // Nettoyer les liens expirés (désactiver)
  cleanupExpired: () => {
    const stmt = db.prepare(`
      UPDATE share_links 
      SET is_active = 0
      WHERE datetime(expires_at) <= datetime('now') AND is_active = 1
    `);
    return stmt.run();
  },

  // Obtenir les statistiques d'un lien
  getStats: (linkId) => {
    const linkStmt = db.prepare(`
      SELECT * FROM share_links WHERE link_id = ?
    `);
    const downloadsStmt = db.prepare(`
      SELECT COUNT(*) as total, 
             MIN(downloaded_at) as first_download,
             MAX(downloaded_at) as last_download
      FROM download_logs 
      WHERE link_id = ?
    `);

    const link = linkStmt.get(linkId);
    const downloads = downloadsStmt.get(linkId);

    return {
      link,
      downloads
    };
  },

  // Obtenir tous les liens d'un utilisateur
  getAllByUser: (username, limit = 100) => {
    const stmt = db.prepare(`
      SELECT * FROM share_links 
      WHERE created_by = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(username, limit);
  }
};

// Fonctions pour gérer les logs de téléchargement
const downloadLogsDb = {
  // Enregistrer un téléchargement
  log: (logData) => {
    const stmt = db.prepare(`
      INSERT INTO download_logs (link_id, blob_name, ip_address, user_agent)
      VALUES (?, ?, ?, ?)
    `);

    return stmt.run(
      logData.linkId,
      logData.blobName,
      logData.ipAddress || null,
      logData.userAgent || null
    );
  },

  // Obtenir les logs d'un lien
  getByLinkId: (linkId) => {
    const stmt = db.prepare(`
      SELECT * FROM download_logs 
      WHERE link_id = ?
      ORDER BY downloaded_at DESC
    `);
    return stmt.all(linkId);
  },

  // Obtenir les logs récents
  getRecent: (limit = 50) => {
    const stmt = db.prepare(`
      SELECT dl.*, sl.original_name, sl.file_size
      FROM download_logs dl
      LEFT JOIN share_links sl ON dl.link_id = sl.link_id
      ORDER BY dl.downloaded_at DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }
};

// Tâche de nettoyage périodique (désactiver les liens expirés)
setInterval(() => {
  try {
    const result = shareLinksDb.cleanupExpired();
    if (result.changes > 0) {
      console.log(`🧹 ${result.changes} lien(s) expiré(s) désactivé(s)`);
    }
  } catch (error) {
    console.error('Erreur lors du nettoyage des liens expirés:', error);
  }
}, 60 * 1000); // Toutes les minutes

// Tâche de nettoyage périodique des comptes invités expirés
// Note: La suppression des fichiers Azure sera gérée dans server.js car elle nécessite le blobServiceClient
setInterval(() => {
  try {
    const expiredGuests = guestAccountsDb.cleanupExpired();
    if (expiredGuests.length > 0) {
      console.log(`🧹 ${expiredGuests.length} compte(s) invité(s) expiré(s) désactivé(s)`);

      // Marquer pour suppression des fichiers (sera traité par le serveur)
      expiredGuests.forEach(guest => {
        console.log(`  - Guest ${guest.email} (ID: ${guest.guest_id}) expiré`);
      });
    }
  } catch (error) {
    console.error('Erreur lors du nettoyage des comptes invités expirés:', error);
  }
}, 60 * 1000); // Toutes les minutes

// Fonctions pour gérer les paramètres
const settingsDb = {
  // Obtenir tous les paramètres
  getAll: () => {
    const stmt = db.prepare(`
      SELECT * FROM settings ORDER BY category, key
    `);
    const rows = stmt.all();
    
    // Convertir en objet pour faciliter l'utilisation
    const settings = {};
    rows.forEach(row => {
      settings[row.key] = {
        value: row.value,
        category: row.category,
        description: row.description,
        updatedAt: row.updated_at
      };
    });
    return settings;
  },

  // Obtenir un paramètre spécifique
  get: (key) => {
    const stmt = db.prepare(`
      SELECT value FROM settings WHERE key = ?
    `);
    const row = stmt.get(key);
    return row ? row.value : null;
  },

  // Mettre à jour un paramètre
  update: (key, value) => {
    const stmt = db.prepare(`
      UPDATE settings 
      SET value = ?, updated_at = datetime('now')
      WHERE key = ?
    `);
    return stmt.run(value, key);
  },

  // Mettre à jour plusieurs paramètres
  updateMany: (settings) => {
    const stmt = db.prepare(`
      UPDATE settings 
      SET value = ?, updated_at = datetime('now')
      WHERE key = ?
    `);

    const transaction = db.transaction((settingsObj) => {
      for (const [key, value] of Object.entries(settingsObj)) {
        stmt.run(String(value), key);
      }
    });

    return transaction(settings);
  },

  // Réinitialiser aux valeurs par défaut
  reset: () => {
    const defaults = {
      maxFileSizeMB: '100',
      containerName: 'uploads',
      storageQuota: '100',
      maxShareDays: '30',
      defaultShareMinutes: '60',
      requirePassword: 'false',
      rateLimit: '100',
      enableLogs: 'true',
      enableAudit: 'true',
      notifyUploads: 'false',
      notifyShares: 'false',
      notifyQuota: 'true'
    };

    return settingsDb.updateMany(defaults);
  }
};

// Migration : Ajouter les colonnes creation_date et has_dmarc aux domaines d'emails
try {
  const domainsInfo = db.prepare(`PRAGMA table_info(allowed_email_domains)`).all();
  const hasCreationDate = domainsInfo.some(col => col.name === 'creation_date');
  if (!hasCreationDate) {
    console.log('🔄 Migration : Ajout des colonnes creation_date, has_dmarc, bimi_logo à allowed_email_domains...');
    db.exec(`
      ALTER TABLE allowed_email_domains ADD COLUMN creation_date TEXT;
      ALTER TABLE allowed_email_domains ADD COLUMN has_dmarc INTEGER DEFAULT NULL;
      ALTER TABLE allowed_email_domains ADD COLUMN bimi_logo TEXT;
    `);
    console.log('✅ Migration terminée : colonnes creation_date, has_dmarc, bimi_logo ajoutées');
  }
} catch (error) {
  console.error('⚠️  Erreur lors de la migration creation_date/has_dmarc:', error);
}

// Migration : Ajouter bimi_logo si manquant
try {
  const domainsInfo2 = db.prepare(`PRAGMA table_info(allowed_email_domains)`).all();
  if (!domainsInfo2.some(col => col.name === 'bimi_logo')) {
    db.exec(`ALTER TABLE allowed_email_domains ADD COLUMN bimi_logo TEXT`);
    console.log('✅ Migration : colonne bimi_logo ajoutée');
  }
} catch (error) {
  console.error('⚠️  Erreur migration bimi_logo:', error);
}

// Fonctions pour gérer les domaines d'emails autorisés
const allowedEmailDomainsDb = {
  // Ajouter un domaine autorisé
  add: (domain, createdBy = null, creationDate = null, hasDmarc = null) => {
    const stmt = db.prepare(`
      INSERT INTO allowed_email_domains (domain, created_by, creation_date, has_dmarc)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(domain.toLowerCase(), createdBy, creationDate, hasDmarc);
  },

  // Mettre à jour creation_date, has_dmarc et bimi_logo
  updateChecks: (domain, creationDate, hasDmarc, bimiLogo = null) => {
    const stmt = db.prepare(`
      UPDATE allowed_email_domains 
      SET creation_date = ?, has_dmarc = ?, bimi_logo = ?
      WHERE domain = ?
    `);
    return stmt.run(creationDate, hasDmarc, bimiLogo, domain.toLowerCase());
  },

  // Obtenir un domaine par son nom
  getByDomain: (domain) => {
    const stmt = db.prepare(`
      SELECT * FROM allowed_email_domains WHERE domain = ?
    `);
    return stmt.get(domain.toLowerCase());
  },

  // Obtenir un domaine par son ID
  getById: (id) => {
    const stmt = db.prepare(`
      SELECT * FROM allowed_email_domains WHERE id = ?
    `);
    return stmt.get(id);
  },

  // Obtenir tous les domaines actifs
  getAllActive: () => {
    const stmt = db.prepare(`
      SELECT * FROM allowed_email_domains 
      WHERE is_active = 1
      ORDER BY domain
    `);
    return stmt.all();
  },

  // Obtenir tous les domaines
  getAll: () => {
    const stmt = db.prepare(`
      SELECT * FROM allowed_email_domains 
      ORDER BY domain
    `);
    return stmt.all();
  },

  // Vérifier si un domaine est autorisé
  isAllowed: (email) => {
    if (!email) return false;
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;
    
    const stmt = db.prepare(`
      SELECT COUNT(*) as count FROM allowed_email_domains 
      WHERE domain = ? AND is_active = 1
    `);
    const result = stmt.get(domain);
    return result && result.count > 0;
  },

  // Désactiver un domaine
  deactivate: (domain) => {
    const stmt = db.prepare(`
      UPDATE allowed_email_domains 
      SET is_active = 0
      WHERE domain = ?
    `);
    return stmt.run(domain.toLowerCase());
  },

  // Activer un domaine
  activate: (domain) => {
    const stmt = db.prepare(`
      UPDATE allowed_email_domains 
      SET is_active = 1
      WHERE domain = ?
    `);
    return stmt.run(domain.toLowerCase());
  },

  // Supprimer un domaine
  delete: (domain) => {
    const stmt = db.prepare(`
      DELETE FROM allowed_email_domains 
      WHERE domain = ?
    `);
    return stmt.run(domain.toLowerCase());
  }
};

// Fonctions pour gérer les utilisateurs
const usersDb = {
  // Créer un nouvel utilisateur
  create: (userData) => {
    const stmt = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(
      userData.username,
      userData.email,
      userData.passwordHash,
      userData.role,
      userData.fullName || null
    );
  },

  // Obtenir un utilisateur par son ID
  getById: (id) => {
    const stmt = db.prepare(`
      SELECT * FROM users WHERE id = ? AND is_active = 1
    `);
    return stmt.get(id);
  },

  // Obtenir un utilisateur par son username
  getByUsername: (username) => {
    const stmt = db.prepare(`
      SELECT * FROM users WHERE username = ? AND is_active = 1
    `);
    return stmt.get(username);
  },

  // Obtenir un utilisateur par son email
  getByEmail: (email) => {
    const stmt = db.prepare(`
      SELECT * FROM users WHERE email = ? AND is_active = 1
    `);
    return stmt.get(email);
  },

  // Mettre à jour la dernière connexion
  updateLastLogin: (userId) => {
    const stmt = db.prepare(`
      UPDATE users
      SET last_login_at = datetime('now')
      WHERE id = ?
    `);
    return stmt.run(userId);
  },

  // Désactiver un utilisateur
  deactivate: (userId) => {
    const stmt = db.prepare(`
      UPDATE users
      SET is_active = 0
      WHERE id = ?
    `);
    return stmt.run(userId);
  },

  // Supprimer définitivement un utilisateur
  delete: (userId) => {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    return stmt.run(userId);
  },

  // Réactiver un utilisateur
  activate: (userId) => {
    const stmt = db.prepare(`
      UPDATE users
      SET is_active = 1
      WHERE id = ?
    `);
    return stmt.run(userId);
  },

  // Changer le rôle d'un utilisateur
  updateRole: (userId, role) => {
    const stmt = db.prepare(`
      UPDATE users
      SET role = ?
      WHERE id = ?
    `);
    return stmt.run(role, userId);
  },

  // Changer le nom complet
  updateFullName: (userId, fullName) => {
    const stmt = db.prepare(`
      UPDATE users
      SET full_name = ?
      WHERE id = ?
    `);
    return stmt.run(fullName || null, userId);
  },

  // Réinitialiser le mot de passe
  updatePassword: (userId, passwordHash) => {
    const stmt = db.prepare(`
      UPDATE users
      SET password_hash = ?
      WHERE id = ?
    `);
    return stmt.run(passwordHash, userId);
  },

  // Créer un utilisateur Entra
  createEntra: (userData) => {
    const stmt = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, full_name, auth_provider, entra_oid, entra_email)
      VALUES (?, ?, ?, ?, ?, 'entra', ?, ?)
    `);
    return stmt.run(
      userData.username,
      userData.email,
      userData.passwordHash || '',
      userData.role || 'user',
      userData.fullName || null,
      userData.entraOid || null,
      userData.entraEmail || null
    );
  },

  // Obtenir un utilisateur par son Entra OID
  getByEntraOid: (oid) => {
    const stmt = db.prepare(`
      SELECT * FROM users WHERE entra_oid = ? AND is_active = 1
    `);
    return stmt.get(oid);
  },

  // Obtenir tous les utilisateurs
  getAll: () => {
    const stmt = db.prepare(`
      SELECT id, username, email, role, full_name, is_active, created_at, last_login_at
      FROM users
      ORDER BY created_at DESC
    `);
    return stmt.all();
  }
};

// Fonctions pour gérer les comptes invités
const guestAccountsDb = {
  // Créer un nouveau compte invité
  create: (guestData) => {
    const stmt = db.prepare(`
      INSERT INTO guest_accounts (
        guest_id, email, verification_code, code_hash,
        code_expires_at, account_expires_at, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      guestData.guestId,
      guestData.email,
      guestData.verificationCode,
      guestData.codeHash,
      guestData.codeExpiresAt,
      guestData.accountExpiresAt,
      guestData.createdByUserId
    );
  },

  // Obtenir un invité par son email
  getByEmail: (email) => {
    const stmt = db.prepare(`
      SELECT * FROM guest_accounts
      WHERE email = ? AND is_active = 1
      ORDER BY created_at DESC
      LIMIT 1
    `);
    return stmt.get(email);
  },

  // Obtenir un invité par son guest_id (uniquement actifs)
  getByGuestId: (guestId) => {
    const stmt = db.prepare(`
      SELECT * FROM guest_accounts
      WHERE guest_id = ? AND is_active = 1
    `);
    return stmt.get(guestId);
  },

  // Obtenir un invité par son guest_id (incluant inactifs, pour suppression)
  getByGuestIdIncludingInactive: (guestId) => {
    const stmt = db.prepare(`
      SELECT * FROM guest_accounts
      WHERE guest_id = ?
    `);
    return stmt.get(guestId);
  },

  // Obtenir tous les invités créés par un utilisateur
  getByCreator: (userId) => {
    const stmt = db.prepare(`
      SELECT ga.*,
             u.username as creator_username,
             (SELECT COUNT(*) FROM file_ownership WHERE uploaded_by_guest_id = ga.id) as file_count
      FROM guest_accounts ga
      LEFT JOIN users u ON ga.created_by_user_id = u.id
      WHERE ga.created_by_user_id = ?
      ORDER BY ga.created_at DESC
    `);
    return stmt.all(userId);
  },

  // Obtenir tous les invités (admin)
  getAll: () => {
    const stmt = db.prepare(`
      SELECT ga.*,
             u.username as creator_username,
             (SELECT COUNT(*) FROM file_ownership WHERE uploaded_by_guest_id = ga.id) as file_count
      FROM guest_accounts ga
      LEFT JOIN users u ON ga.created_by_user_id = u.id
      ORDER BY ga.created_at DESC
    `);
    return stmt.all();
  },

  // Marquer le code comme utilisé
  markCodeUsed: (guestId) => {
    const stmt = db.prepare(`
      UPDATE guest_accounts
      SET code_used = 1
      WHERE guest_id = ?
    `);
    return stmt.run(guestId);
  },

  // Désactiver un compte invité
  disable: (guestId, userId = null) => {
    const stmt = db.prepare(`
      UPDATE guest_accounts
      SET is_active = 0, disabled_at = datetime('now')
      WHERE guest_id = ?
    `);
    return stmt.run(guestId);
  },

  // Supprimer un compte invité
  delete: (guestId) => {
    const stmt = db.prepare(`
      DELETE FROM guest_accounts
      WHERE guest_id = ?
    `);
    return stmt.run(guestId);
  },

  // Nettoyer les comptes expirés et retourner la liste
  cleanupExpired: () => {
    // Obtenir les comptes expirés avant de les désactiver
    const selectStmt = db.prepare(`
      SELECT * FROM guest_accounts
      WHERE datetime(account_expires_at) <= datetime('now')
      AND is_active = 1
    `);
    const expiredGuests = selectStmt.all();

    // Désactiver les comptes expirés
    if (expiredGuests.length > 0) {
      const updateStmt = db.prepare(`
        UPDATE guest_accounts
        SET is_active = 0, disabled_at = datetime('now')
        WHERE datetime(account_expires_at) <= datetime('now')
        AND is_active = 1
      `);
      updateStmt.run();
    }

    return expiredGuests;
  },

  // Obtenir les invités dont le compte expire bientôt
  getExpiringSoon: (days = 1) => {
    const stmt = db.prepare(`
      SELECT * FROM guest_accounts
      WHERE is_active = 1
      AND datetime(account_expires_at) > datetime('now')
      AND datetime(account_expires_at) <= datetime('now', '+' || ? || ' days')
    `);
    return stmt.all(days);
  }
};

// Fonctions pour gérer la propriété des fichiers
const fileOwnershipDb = {
  // Créer un enregistrement de propriété
  create: (fileData) => {
    const stmt = db.prepare(`
      INSERT INTO file_ownership (
        blob_name, original_name, content_type, file_size,
        uploaded_by_user_id, uploaded_by_guest_id, folder_path, team_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      fileData.blobName,
      fileData.originalName,
      fileData.contentType,
      fileData.fileSize,
      fileData.uploadedByUserId || null,
      fileData.uploadedByGuestId || null,
      fileData.folderPath || null,
      fileData.teamId || null
    );
  },

  // Obtenir la propriété d'un fichier
  getByBlobName: (blobName) => {
    const stmt = db.prepare(`
      SELECT fo.*,
             u.username as user_owner,
             u.role as user_role,
             ga.email as guest_owner
      FROM file_ownership fo
      LEFT JOIN users u ON fo.uploaded_by_user_id = u.id
      LEFT JOIN guest_accounts ga ON fo.uploaded_by_guest_id = ga.id
      WHERE fo.blob_name = ?
    `);
    return stmt.get(blobName);
  },

  // Obtenir tous les fichiers d'un utilisateur
  getByUser: (userId) => {
    const stmt = db.prepare(`
      SELECT * FROM file_ownership
      WHERE uploaded_by_user_id = ? AND (is_trashed = 0 OR is_trashed IS NULL)
      ORDER BY uploaded_at DESC
    `);
    return stmt.all(userId);
  },

  // Obtenir tous les fichiers d'un invité
  getByGuest: (guestId) => {
    const stmt = db.prepare(`
      SELECT * FROM file_ownership
      WHERE uploaded_by_guest_id = ? AND (is_trashed = 0 OR is_trashed IS NULL)
      ORDER BY uploaded_at DESC
    `);
    return stmt.all(guestId);
  },

  // Obtenir tous les fichiers avec les infos propriétaires
  getAllWithOwners: () => {
    const stmt = db.prepare(`
      SELECT fo.*,
             u.username as user_owner,
             u.role as user_role,
             ga.email as guest_owner,
             ga.guest_id as guest_id,
             t.name as team_name
      FROM file_ownership fo
      LEFT JOIN users u ON fo.uploaded_by_user_id = u.id
      LEFT JOIN guest_accounts ga ON fo.uploaded_by_guest_id = ga.id
      LEFT JOIN teams t ON fo.team_id = t.id
      WHERE (fo.is_trashed = 0 OR fo.is_trashed IS NULL)
      ORDER BY fo.uploaded_at DESC
    `);
    return stmt.all();
  },

  // Obtenir les fichiers accessibles par un utilisateur april_user
  getAccessibleByAprilUser: (userId) => {
    const stmt = db.prepare(`
      SELECT fo.*,
             u.username as user_owner,
             u.role as user_role,
             ga.email as guest_owner,
             ga.guest_id as guest_id
      FROM file_ownership fo
      LEFT JOIN users u ON fo.uploaded_by_user_id = u.id
      LEFT JOIN guest_accounts ga ON fo.uploaded_by_guest_id = ga.id
      WHERE (fo.uploaded_by_user_id = ? OR ga.created_by_user_id = ?)
        AND (fo.is_trashed = 0 OR fo.is_trashed IS NULL)
      ORDER BY fo.uploaded_at DESC
    `);
    return stmt.all(userId, userId);
  },

  // Corbeille: fichiers supprimés
  getTrashed: (userId, teamId) => {
    let sql, params;
    if (teamId) {
      sql = `SELECT fo.*, u.username as user_owner FROM file_ownership fo
             LEFT JOIN users u ON fo.uploaded_by_user_id = u.id
             WHERE fo.team_id = ? AND fo.is_trashed = 1 ORDER BY fo.trashed_at DESC`;
      params = [teamId];
    } else {
      sql = `SELECT * FROM file_ownership WHERE uploaded_by_user_id = ? AND is_trashed = 1 ORDER BY trashed_at DESC`;
      params = [userId];
    }
    return db.prepare(sql).all(...params);
  },

  trash: (blobName, userId) => {
    return db.prepare(`UPDATE file_ownership SET is_trashed = 1, trashed_at = datetime('now'), trashed_by = ? WHERE blob_name = ?`).run(userId, blobName);
  },

  restore: (blobName) => {
    return db.prepare(`UPDATE file_ownership SET is_trashed = 0, trashed_at = NULL, trashed_by = NULL WHERE blob_name = ?`).run(blobName);
  },

  // Supprimer un enregistrement de propriété
  delete: (blobName) => {
    const stmt = db.prepare(`
      DELETE FROM file_ownership
      WHERE blob_name = ?
    `);
    return stmt.run(blobName);
  },

  // Supprimer tous les fichiers d'un invité
  deleteByGuest: (guestId) => {
    const stmt = db.prepare(`
      DELETE FROM file_ownership
      WHERE uploaded_by_guest_id = ?
    `);
    return stmt.run(guestId);
  }
};

// Fonctions pour gérer les équipes
const teamsDb = {
  // Créer une nouvelle équipe
  create: (teamData) => {
    const stmt = db.prepare(`
      INSERT INTO teams (name, display_name, description, storage_prefix, created_by_user_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(
      teamData.name,
      teamData.displayName,
      teamData.description || null,
      teamData.storagePrefix,
      teamData.createdByUserId
    );
  },

  // Obtenir une équipe par son ID
  getById: (id) => {
    const stmt = db.prepare(`
      SELECT * FROM teams WHERE id = ? AND is_active = 1
    `);
    return stmt.get(id);
  },

  // Obtenir toutes les équipes
  getAll: () => {
    const stmt = db.prepare(`
      SELECT * FROM teams WHERE is_active = 1 ORDER BY created_at DESC
    `);
    return stmt.all();
  },

  // Obtenir les équipes d'un membre
  getByMember: (userId) => {
    const stmt = db.prepare(`
      SELECT t.*, tm.role
      FROM teams t
      INNER JOIN team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = ? AND t.is_active = 1 AND tm.is_active = 1
      ORDER BY t.created_at DESC
    `);
    return stmt.all(userId);
  },

  // Mettre à jour une équipe
  update: (id, teamData) => {
    const stmt = db.prepare(`
      UPDATE teams
      SET display_name = ?, description = ?
      WHERE id = ?
    `);
    return stmt.run(teamData.displayName, teamData.description, id);
  },

  // Soft delete une équipe
  softDelete: (id) => {
    const stmt = db.prepare(`
      UPDATE teams
      SET is_active = 0, deleted_at = datetime('now')
      WHERE id = ?
    `);
    return stmt.run(id);
  },

  // Obtenir les statistiques d'une équipe
  getStats: (teamId) => {
    const fileCountStmt = db.prepare(`
      SELECT COUNT(*) as file_count, COALESCE(SUM(file_size), 0) as total_size
      FROM file_ownership
      WHERE team_id = ?
    `);
    const memberCountStmt = db.prepare(`
      SELECT COUNT(*) as member_count
      FROM team_members
      WHERE team_id = ? AND is_active = 1
    `);

    const fileStats = fileCountStmt.get(teamId);
    const memberStats = memberCountStmt.get(teamId);

    return {
      fileCount: fileStats.file_count,
      totalSize: fileStats.total_size,
      memberCount: memberStats.member_count
    };
  },

  // Mettre à jour le préfixe de stockage
  updateStoragePrefix: (id, storagePrefix) => {
    const stmt = db.prepare(`
      UPDATE teams
      SET storage_prefix = ?
      WHERE id = ?
    `);
    return stmt.run(storagePrefix, id);
  }
};

// Fonctions pour gérer les membres d'équipe
const teamMembersDb = {
  // Ajouter un membre à une équipe
  create: (memberData) => {
    const stmt = db.prepare(`
      INSERT INTO team_members (team_id, user_id, role, added_by_user_id)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(
      memberData.teamId,
      memberData.userId,
      memberData.role,
      memberData.addedByUserId || null
    );
  },

  // Obtenir tous les membres d'une équipe
  getByTeam: (teamId) => {
    const stmt = db.prepare(`
      SELECT tm.*, u.username, u.email, u.full_name
      FROM team_members tm
      INNER JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = ? AND tm.is_active = 1
      ORDER BY tm.joined_at ASC
    `);
    return stmt.all(teamId);
  },

  // Obtenir un membre spécifique d'une équipe
  getByTeamAndUser: (teamId, userId) => {
    const stmt = db.prepare(`
      SELECT * FROM team_members
      WHERE team_id = ? AND user_id = ? AND is_active = 1
    `);
    return stmt.get(teamId, userId);
  },

  // Obtenir toutes les équipes d'un utilisateur
  getByUser: (userId) => {
    const stmt = db.prepare(`
      SELECT tm.*, t.name, t.display_name, t.description
      FROM team_members tm
      INNER JOIN teams t ON tm.team_id = t.id
      WHERE tm.user_id = ? AND tm.is_active = 1 AND t.is_active = 1
      ORDER BY tm.joined_at DESC
    `);
    return stmt.all(userId);
  },

  // Mettre à jour le rôle d'un membre
  updateRole: (teamId, userId, role) => {
    const stmt = db.prepare(`
      UPDATE team_members
      SET role = ?
      WHERE team_id = ? AND user_id = ? AND is_active = 1
    `);
    return stmt.run(role, teamId, userId);
  },

  // Retirer un membre d'une équipe
  remove: (teamId, userId) => {
    const stmt = db.prepare(`
      UPDATE team_members
      SET is_active = 0, left_at = datetime('now')
      WHERE team_id = ? AND user_id = ?
    `);
    return stmt.run(teamId, userId);
  },

  // Obtenir les owners d'une équipe
  getOwners: (teamId) => {
    const stmt = db.prepare(`
      SELECT tm.*, u.username, u.email
      FROM team_members tm
      INNER JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = ? AND tm.role = 'owner' AND tm.is_active = 1
    `);
    return stmt.all(teamId);
  }
};

// Fonctions pour gérer le suivi des coûts
const costTrackingDb = {
  // Obtenir ou créer un enregistrement de coûts
  getOrCreate: (entityType, entityId, periodMonth) => {
    let record = costTrackingDb.get(entityType, entityId, periodMonth);

    if (!record) {
      const stmt = db.prepare(`
        INSERT INTO cost_tracking (entity_type, entity_id, period_month)
        VALUES (?, ?, ?)
      `);
      stmt.run(entityType, entityId, periodMonth);
      record = costTrackingDb.get(entityType, entityId, periodMonth);
    }

    return record;
  },

  // Obtenir un enregistrement de coûts
  get: (entityType, entityId, periodMonth) => {
    const stmt = db.prepare(`
      SELECT * FROM cost_tracking
      WHERE entity_type = ? AND entity_id = ? AND period_month = ?
    `);
    return stmt.get(entityType, entityId, periodMonth);
  },

  // Mettre à jour un enregistrement de coûts
  update: (entityType, entityId, periodMonth, costData) => {
    const stmt = db.prepare(`
      UPDATE cost_tracking
      SET storage_size_gb = ?,
          storage_cost = ?,
          operations_write = ?,
          operations_read = ?,
          operations_list = ?,
          operations_other = ?,
          operations_cost = ?,
          bandwidth_download_gb = ?,
          bandwidth_upload_gb = ?,
          bandwidth_cost = ?,
          storage_hot_gb = ?,
          storage_cool_gb = ?,
          storage_archive_gb = ?,
          total_cost = ?,
          last_updated_at = datetime('now')
      WHERE entity_type = ? AND entity_id = ? AND period_month = ?
    `);
    return stmt.run(
      costData.storageSizeGb,
      costData.storageCost,
      costData.operationsWrite,
      costData.operationsRead,
      costData.operationsList,
      costData.operationsOther,
      costData.operationsCost,
      costData.bandwidthDownloadGb,
      costData.bandwidthUploadGb,
      costData.bandwidthCost,
      costData.storageHotGb,
      costData.storageCoolGb,
      costData.storageArchiveGb,
      costData.totalCost,
      entityType,
      entityId,
      periodMonth
    );
  },

  // Obtenir les coûts mensuels d'une entité
  getMonthlyCosts: (entityType, entityId, periodMonth) => {
    const stmt = db.prepare(`
      SELECT * FROM cost_tracking
      WHERE entity_type = ? AND entity_id = ? AND period_month = ?
    `);
    return stmt.get(entityType, entityId, periodMonth);
  },

  // Obtenir les coûts annuels d'une entité
  getYearlyCosts: (entityType, entityId, year) => {
    const stmt = db.prepare(`
      SELECT * FROM cost_tracking
      WHERE entity_type = ? AND entity_id = ? AND period_month LIKE ?
      ORDER BY period_month ASC
    `);
    return stmt.all(entityType, entityId, `${year}-%`);
  },

  // Obtenir tous les coûts par type d'entité
  getAllByEntityType: (entityType, periodMonth) => {
    const stmt = db.prepare(`
      SELECT * FROM cost_tracking
      WHERE entity_type = ? AND period_month = ?
      ORDER BY total_cost DESC
    `);
    return stmt.all(entityType, periodMonth);
  },

  // Obtenir tous les coûts pour un mois
  getAllByMonth: (periodMonth) => {
    const stmt = db.prepare(`
      SELECT * FROM cost_tracking
      WHERE period_month = ?
      ORDER BY entity_type, total_cost DESC
    `);
    return stmt.all(periodMonth);
  }
};

// Fonctions pour gérer les logs d'opérations
const operationLogsDb = {
  // Logger une opération
  log: (logData) => {
    const stmt = db.prepare(`
      INSERT INTO operation_logs (
        entity_type, entity_id, operation_type, blob_name,
        operation_count, bytes_transferred, period_month
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      logData.entityType,
      logData.entityId,
      logData.operationType,
      logData.blobName || null,
      logData.operationCount || 1,
      logData.bytesTransferred || 0,
      logData.periodMonth
    );
  },

  // Agréger les opérations pour une entité et une période
  aggregateByEntity: (entityType, entityId, periodMonth) => {
    const stmt = db.prepare(`
      SELECT
        operation_type,
        SUM(operation_count) as total_count,
        SUM(bytes_transferred) as total_bytes
      FROM operation_logs
      WHERE entity_type = ? AND entity_id = ? AND period_month = ?
      GROUP BY operation_type
    `);
    return stmt.all(entityType, entityId, periodMonth);
  },

  // Nettoyer les anciens logs (garder 12 mois)
  cleanup: (monthsToKeep = 12) => {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsToKeep);
    const cutoffMonth = cutoffDate.toISOString().slice(0, 7);

    const stmt = db.prepare(`
      DELETE FROM operation_logs
      WHERE period_month < ?
    `);
    return stmt.run(cutoffMonth);
  }
};

// Fonctions pour gérer les tiers de stockage
const fileTiersDb = {
  // Créer un enregistrement de tier
  create: (tierData) => {
    const stmt = db.prepare(`
      INSERT INTO file_tiers (
        blob_name, current_tier, previous_tier, tier_changed_by_user_id,
        archived_at, archived_by_user_id, archive_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      tierData.blobName,
      tierData.currentTier,
      tierData.previousTier || null,
      tierData.tierChangedByUserId || null,
      tierData.archivedAt || null,
      tierData.archivedByUserId || null,
      tierData.archiveReason || null
    );
  },

  // Obtenir le tier d'un fichier
  getByBlobName: (blobName) => {
    const stmt = db.prepare(`
      SELECT * FROM file_tiers WHERE blob_name = ?
    `);
    return stmt.get(blobName);
  },

  // Mettre à jour le tier d'un fichier
  update: (blobName, tierData) => {
    const stmt = db.prepare(`
      UPDATE file_tiers
      SET current_tier = ?,
          previous_tier = ?,
          tier_changed_at = datetime('now'),
          tier_changed_by_user_id = ?,
          archived_at = ?,
          archived_by_user_id = ?,
          archive_reason = ?,
          rehydration_status = ?,
          rehydration_priority = ?,
          rehydration_started_at = ?,
          rehydration_completed_at = ?,
          rehydration_requested_by_user_id = ?
      WHERE blob_name = ?
    `);
    return stmt.run(
      tierData.currentTier,
      tierData.previousTier || null,
      tierData.tierChangedByUserId || null,
      tierData.archivedAt || null,
      tierData.archivedByUserId || null,
      tierData.archiveReason || null,
      tierData.rehydrationStatus || null,
      tierData.rehydrationPriority || null,
      tierData.rehydrationStartedAt || null,
      tierData.rehydrationCompletedAt || null,
      tierData.rehydrationRequestedByUserId || null,
      blobName
    );
  },

  // Supprimer un enregistrement de tier
  delete: (blobName) => {
    const stmt = db.prepare(`
      DELETE FROM file_tiers WHERE blob_name = ?
    `);
    return stmt.run(blobName);
  },

  // Obtenir les réhydratations en cours
  getPendingRehydrations: () => {
    const stmt = db.prepare(`
      SELECT * FROM file_tiers
      WHERE rehydration_status IN ('pending', 'in-progress')
      ORDER BY rehydration_started_at ASC
    `);
    return stmt.all();
  },

  // Obtenir tous les fichiers d'un tier
  getByTier: (tier) => {
    const stmt = db.prepare(`
      SELECT * FROM file_tiers
      WHERE current_tier = ?
      ORDER BY tier_changed_at DESC
    `);
    return stmt.all(tier);
  }
};

// ============================================================================
// FTS5 Search Index (virtual table)
// ============================================================================
try {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
      blob_name,
      tags,
      description,
      transcription,
      ocr_text,
      faces,
      content='',
      tokenize='unicode61'
    );
  `);
} catch (error) {
  console.error('⚠️  Erreur lors de la création de la table FTS5:', error.message);
}

// ============================================================================
// AI Database Helpers
// ============================================================================

// Media Analysis
const mediaAnalysisDb = {
  create: (data) => {
    const stmt = db.prepare(`
      INSERT INTO media_analysis (blob_name, analysis_type, status)
      VALUES (?, ?, 'pending')
    `);
    return stmt.run(data.blobName, data.analysisType);
  },

  getByBlobName: (blobName) => {
    const stmt = db.prepare(`SELECT * FROM media_analysis WHERE blob_name = ?`);
    return stmt.get(blobName);
  },

  update: (blobName, data) => {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(data)) {
      const col = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${col} = ?`);
      values.push(typeof value === 'object' && value !== null ? JSON.stringify(value) : value);
    }
    values.push(blobName);
    const stmt = db.prepare(`UPDATE media_analysis SET ${fields.join(', ')} WHERE blob_name = ?`);
    return stmt.run(...values);
  },

  delete: (blobName) => {
    const stmt = db.prepare(`DELETE FROM media_analysis WHERE blob_name = ?`);
    return stmt.run(blobName);
  },

  getAll: (limit = 100) => {
    const stmt = db.prepare(`SELECT * FROM media_analysis ORDER BY created_at DESC LIMIT ?`);
    return stmt.all(limit);
  },

  getByStatus: (status) => {
    const stmt = db.prepare(`SELECT * FROM media_analysis WHERE status = ? ORDER BY created_at ASC`);
    return stmt.all(status);
  },

  getStats: () => {
    const stmt = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM media_analysis
    `);
    return stmt.get();
  }
};

// Face Profiles
const faceProfilesDb = {
  create: (data) => {
    const stmt = db.prepare(`
      INSERT INTO face_profiles (name, sample_encoding, created_by)
      VALUES (?, ?, ?)
    `);
    return stmt.run(data.name, data.sampleEncoding || null, data.createdBy || null);
  },

  getById: (id) => {
    const stmt = db.prepare(`SELECT * FROM face_profiles WHERE id = ?`);
    return stmt.get(id);
  },

  getAll: () => {
    const stmt = db.prepare(`SELECT * FROM face_profiles ORDER BY name ASC`);
    return stmt.all();
  },

  update: (id, data) => {
    const stmt = db.prepare(`
      UPDATE face_profiles SET name = ?, updated_at = datetime('now') WHERE id = ?
    `);
    return stmt.run(data.name, id);
  },

  delete: (id) => {
    const stmt = db.prepare(`DELETE FROM face_profiles WHERE id = ?`);
    return stmt.run(id);
  },

  updatePhotoCount: (id) => {
    const stmt = db.prepare(`
      UPDATE face_profiles
      SET photo_count = (SELECT COUNT(DISTINCT blob_name) FROM face_occurrences WHERE face_profile_id = ?)
      WHERE id = ?
    `);
    return stmt.run(id, id);
  },

  merge: (targetId, sourceId) => {
    const transaction = db.transaction(() => {
      db.prepare(`UPDATE face_occurrences SET face_profile_id = ? WHERE face_profile_id = ?`).run(targetId, sourceId);
      db.prepare(`DELETE FROM face_profiles WHERE id = ?`).run(sourceId);
      db.prepare(`
        UPDATE face_profiles
        SET photo_count = (SELECT COUNT(DISTINCT blob_name) FROM face_occurrences WHERE face_profile_id = ?),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(targetId, targetId);
    });
    return transaction();
  }
};

// Face Occurrences
const faceOccurrencesDb = {
  create: (data) => {
    const stmt = db.prepare(`
      INSERT INTO face_occurrences (blob_name, face_profile_id, bounding_box, confidence, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.blobName,
      data.faceProfileId || null,
      data.boundingBox ? JSON.stringify(data.boundingBox) : null,
      data.confidence || null,
      data.timestamp || null
    );
  },

  getByBlobName: (blobName) => {
    const stmt = db.prepare(`
      SELECT fo.*, fp.name as face_name
      FROM face_occurrences fo
      LEFT JOIN face_profiles fp ON fo.face_profile_id = fp.id
      WHERE fo.blob_name = ?
    `);
    return stmt.all(blobName);
  },

  getByProfile: (profileId) => {
    const stmt = db.prepare(`
      SELECT DISTINCT blob_name FROM face_occurrences WHERE face_profile_id = ? ORDER BY created_at DESC
    `);
    return stmt.all(profileId);
  },

  deleteByBlobName: (blobName) => {
    const stmt = db.prepare(`DELETE FROM face_occurrences WHERE blob_name = ?`);
    return stmt.run(blobName);
  }
};

// Smart Albums
const smartAlbumsDb = {
  create: (data) => {
    const stmt = db.prepare(`
      INSERT INTO smart_albums (name, description, rules, type, cover_blob_name, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.name,
      data.description || null,
      data.rules ? JSON.stringify(data.rules) : null,
      data.type || 'manual',
      data.coverBlobName || null,
      data.createdBy || null
    );
  },

  getById: (id) => {
    const stmt = db.prepare(`
      SELECT sa.*, COUNT(sai.id) as item_count
      FROM smart_albums sa
      LEFT JOIN smart_album_items sai ON sa.id = sai.album_id
      WHERE sa.id = ?
      GROUP BY sa.id
    `);
    return stmt.get(id);
  },

  getAll: () => {
    const stmt = db.prepare(`
      SELECT sa.*, COUNT(sai.id) as item_count
      FROM smart_albums sa
      LEFT JOIN smart_album_items sai ON sa.id = sai.album_id
      GROUP BY sa.id
      ORDER BY sa.created_at DESC
    `);
    return stmt.all();
  },

  update: (id, data) => {
    const stmt = db.prepare(`
      UPDATE smart_albums
      SET name = ?, description = ?, rules = ?, cover_blob_name = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    return stmt.run(
      data.name,
      data.description || null,
      data.rules ? JSON.stringify(data.rules) : null,
      data.coverBlobName || null,
      id
    );
  },

  delete: (id) => {
    const stmt = db.prepare(`DELETE FROM smart_albums WHERE id = ?`);
    return stmt.run(id);
  },

  addItem: (albumId, blobName, addedBy) => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO smart_album_items (album_id, blob_name, added_by)
      VALUES (?, ?, ?)
    `);
    return stmt.run(albumId, blobName, addedBy || null);
  },

  removeItem: (albumId, blobName) => {
    const stmt = db.prepare(`DELETE FROM smart_album_items WHERE album_id = ? AND blob_name = ?`);
    return stmt.run(albumId, blobName);
  },

  getItems: (albumId) => {
    const stmt = db.prepare(`
      SELECT sai.*, ma.description, ma.tags, ma.thumbnail_path
      FROM smart_album_items sai
      LEFT JOIN media_analysis ma ON sai.blob_name = ma.blob_name
      WHERE sai.album_id = ?
      ORDER BY sai.added_at DESC
    `);
    return stmt.all(albumId);
  }
};

// Transcriptions
const transcriptionsDb = {
  create: (data) => {
    const stmt = db.prepare(`
      INSERT INTO transcriptions (blob_name, language, model, status)
      VALUES (?, ?, ?, 'pending')
    `);
    return stmt.run(data.blobName, data.language || null, data.model || null);
  },

  getByBlobName: (blobName) => {
    const stmt = db.prepare(`SELECT * FROM transcriptions WHERE blob_name = ?`);
    return stmt.get(blobName);
  },

  update: (blobName, data) => {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(data)) {
      const col = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${col} = ?`);
      values.push(typeof value === 'object' && value !== null ? JSON.stringify(value) : value);
    }
    values.push(blobName);
    const stmt = db.prepare(`UPDATE transcriptions SET ${fields.join(', ')} WHERE blob_name = ?`);
    return stmt.run(...values);
  },

  delete: (blobName) => {
    const stmt = db.prepare(`DELETE FROM transcriptions WHERE blob_name = ?`);
    return stmt.run(blobName);
  },

  search: (blobName, query) => {
    const transcription = transcriptionsDb.getByBlobName(blobName);
    if (!transcription || !transcription.segments) return [];
    const segments = JSON.parse(transcription.segments);
    const lowerQuery = query.toLowerCase();
    return segments.filter(s => s.text && s.text.toLowerCase().includes(lowerQuery));
  }
};

// Video Markers
const videoMarkersDb = {
  create: (data) => {
    const stmt = db.prepare(`
      INSERT INTO video_markers (blob_name, timestamp, type, label, thumbnail_path, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.blobName,
      data.timestamp,
      data.type,
      data.label || null,
      data.thumbnailPath || null,
      data.data ? JSON.stringify(data.data) : null
    );
  },

  getByBlobName: (blobName) => {
    const stmt = db.prepare(`SELECT * FROM video_markers WHERE blob_name = ? ORDER BY timestamp ASC`);
    return stmt.all(blobName);
  },

  getByBlobNameAndType: (blobName, type) => {
    const stmt = db.prepare(`SELECT * FROM video_markers WHERE blob_name = ? AND type = ? ORDER BY timestamp ASC`);
    return stmt.all(blobName, type);
  },

  deleteByBlobName: (blobName) => {
    const stmt = db.prepare(`DELETE FROM video_markers WHERE blob_name = ?`);
    return stmt.run(blobName);
  }
};

// AI Cost Tracking
const aiCostTrackingDb = {
  log: (data) => {
    const stmt = db.prepare(`
      INSERT INTO ai_cost_tracking (service, model, operation, input_tokens, output_tokens, cost, blob_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.service,
      data.model,
      data.operation,
      data.inputTokens || 0,
      data.outputTokens || 0,
      data.cost || 0,
      data.blobName || null
    );
  },

  getByPeriod: (startDate, endDate) => {
    const stmt = db.prepare(`
      SELECT * FROM ai_cost_tracking
      WHERE created_at >= ? AND created_at <= ?
      ORDER BY created_at DESC
    `);
    return stmt.all(startDate, endDate);
  },

  getCostSummary: (startDate, endDate) => {
    const stmt = db.prepare(`
      SELECT
        service,
        model,
        COUNT(*) as call_count,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens,
        SUM(cost) as total_cost
      FROM ai_cost_tracking
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY service, model
    `);
    return stmt.all(startDate, endDate);
  },

  getMonthlyTotal: () => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const stmt = db.prepare(`
      SELECT COALESCE(SUM(cost), 0) as total_cost
      FROM ai_cost_tracking
      WHERE created_at >= ?
    `);
    return stmt.get(startOfMonth.toISOString());
  },

  getTopOperations: (limit = 10) => {
    const stmt = db.prepare(`
      SELECT operation, COUNT(*) as count, SUM(cost) as total_cost
      FROM ai_cost_tracking
      GROUP BY operation
      ORDER BY total_cost DESC
      LIMIT ?
    `);
    return stmt.all(limit);
  }
};

// Search Index (FTS5)
const searchIndexDb = {
  upsert: (data) => {
    // Delete existing entry first, then insert
    const transaction = db.transaction(() => {
      try {
        db.prepare(`DELETE FROM search_index WHERE blob_name = ?`).run(data.blobName);
      } catch (e) { /* ignore if not found */ }
      db.prepare(`
        INSERT INTO search_index (blob_name, tags, description, transcription, ocr_text, faces)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        data.blobName,
        data.tags || '',
        data.description || '',
        data.transcription || '',
        data.ocrText || '',
        data.faces || ''
      );
    });
    return transaction();
  },

  search: (query, limit = 50) => {
    const stmt = db.prepare(`
      SELECT blob_name, rank,
        snippet(search_index, 1, '<mark>', '</mark>', '...', 30) as tags_match,
        snippet(search_index, 2, '<mark>', '</mark>', '...', 30) as description_match,
        snippet(search_index, 3, '<mark>', '</mark>', '...', 30) as transcription_match,
        snippet(search_index, 4, '<mark>', '</mark>', '...', 30) as ocr_match,
        snippet(search_index, 5, '<mark>', '</mark>', '...', 30) as faces_match
      FROM search_index
      WHERE search_index MATCH ?
      ORDER BY rank
      LIMIT ?
    `);
    return stmt.all(query, limit);
  },

  delete: (blobName) => {
    try {
      const stmt = db.prepare(`DELETE FROM search_index WHERE blob_name = ?`);
      return stmt.run(blobName);
    } catch (e) { /* ignore */ }
  },

  rebuild: () => {
    const transaction = db.transaction(() => {
      // Clear the index
      try {
        db.exec(`DELETE FROM search_index`);
      } catch (e) { /* ignore */ }

      // Re-index all analyzed media
      const analyses = db.prepare(`SELECT * FROM media_analysis WHERE status = 'completed'`).all();
      for (const analysis of analyses) {
        const transcription = db.prepare(`SELECT text FROM transcriptions WHERE blob_name = ?`).get(analysis.blob_name);
        const faces = db.prepare(`
          SELECT GROUP_CONCAT(DISTINCT fp.name) as names
          FROM face_occurrences fo
          JOIN face_profiles fp ON fo.face_profile_id = fp.id
          WHERE fo.blob_name = ?
        `).get(analysis.blob_name);

        let ocrText = '';
        if (analysis.azure_result) {
          try {
            const azureResult = JSON.parse(analysis.azure_result);
            ocrText = azureResult.ocrText || '';
          } catch (e) { /* ignore */ }
        }

        searchIndexDb.upsert({
          blobName: analysis.blob_name,
          tags: analysis.tags || '',
          description: analysis.description || '',
          transcription: transcription ? transcription.text : '',
          ocrText,
          faces: faces ? faces.names : ''
        });
      }
    });
    return transaction();
  },

  getSuggestions: (prefix, limit = 10) => {
    // Search across tags for suggestions
    const stmt = db.prepare(`
      SELECT DISTINCT blob_name, tags, description
      FROM search_index
      WHERE tags MATCH ? OR description MATCH ?
      LIMIT ?
    `);
    const ftsQuery = `${prefix}*`;
    try {
      return stmt.all(ftsQuery, ftsQuery, limit);
    } catch (e) {
      return [];
    }
  }
};

// Geolocation
const geolocationDb = {
  create: (data) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO geolocation (blob_name, latitude, longitude, altitude, address, city, country, country_code, raw_exif)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.blobName,
      data.latitude,
      data.longitude,
      data.altitude || null,
      data.address || null,
      data.city || null,
      data.country || null,
      data.countryCode || null,
      data.rawExif ? JSON.stringify(data.rawExif) : null
    );
  },

  getByBlobName: (blobName) => {
    const stmt = db.prepare(`SELECT * FROM geolocation WHERE blob_name = ?`);
    return stmt.get(blobName);
  },

  getAll: (limit = 500) => {
    const stmt = db.prepare(`SELECT * FROM geolocation ORDER BY created_at DESC LIMIT ?`);
    return stmt.all(limit);
  },

  delete: (blobName) => {
    const stmt = db.prepare(`DELETE FROM geolocation WHERE blob_name = ?`);
    return stmt.run(blobName);
  },

  getNearby: (lat, lng, radiusKm) => {
    // Approximate bounding box filter (1 degree ≈ 111 km)
    const latDelta = radiusKm / 111;
    const lngDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
    const stmt = db.prepare(`
      SELECT * FROM geolocation
      WHERE latitude BETWEEN ? AND ?
        AND longitude BETWEEN ? AND ?
      ORDER BY created_at DESC
    `);
    return stmt.all(lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta);
  },

  getStats: () => {
    const stmt = db.prepare(`
      SELECT COUNT(*) as total,
        COUNT(DISTINCT country) as countries,
        COUNT(DISTINCT city) as cities
      FROM geolocation
    `);
    return stmt.get();
  }
};

// Scan Schedules
const scanSchedulesDb = {
  getAll: () => {
    const stmt = db.prepare(`SELECT * FROM scan_schedules ORDER BY id ASC`);
    return stmt.all();
  },

  getByType: (scanType) => {
    const stmt = db.prepare(`SELECT * FROM scan_schedules WHERE scan_type = ?`);
    return stmt.get(scanType);
  },

  getById: (id) => {
    const stmt = db.prepare(`SELECT * FROM scan_schedules WHERE id = ?`);
    return stmt.get(id);
  },

  update: (id, data) => {
    const fields = [];
    const values = [];
    for (const [key, value] of Object.entries(data)) {
      const col = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${col} = ?`);
      values.push(value);
    }
    fields.push(`updated_at = datetime('now')`);
    values.push(id);
    const stmt = db.prepare(`UPDATE scan_schedules SET ${fields.join(', ')} WHERE id = ?`);
    return stmt.run(...values);
  },

  updateLastRun: (id, data) => {
    const stmt = db.prepare(`
      UPDATE scan_schedules
      SET last_run_at = datetime('now'),
          last_run_status = ?,
          last_run_files_processed = ?,
          last_run_error = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `);
    return stmt.run(
      data.status || 'completed',
      data.filesProcessed || 0,
      data.error || null,
      id
    );
  },

  getEnabled: () => {
    const stmt = db.prepare(`SELECT * FROM scan_schedules WHERE is_enabled = 1 AND schedule != 'manual'`);
    return stmt.all();
  }
};

// Fonctions pour les logs d'activité
const activityLogsDb = {
  log: ({ level = 'info', category = 'system', operation, message, username, details, ip_address }) => {
    const stmt = db.prepare(`
      INSERT INTO activity_logs (level, category, operation, message, username, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(level, category, operation, message || null, username || null,
      details ? JSON.stringify(details) : null, ip_address || null);
  },

  getAll: ({ limit = 100, offset = 0, level, category, operation, search } = {}) => {
    let where = [];
    let params = [];

    if (level) { where.push('level = ?'); params.push(level); }
    if (category) { where.push('category = ?'); params.push(category); }
    if (operation) { where.push('operation = ?'); params.push(operation); }
    if (search) { where.push('(message LIKE ? OR operation LIKE ? OR username LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM activity_logs ${whereClause}`);
    const total = countStmt.get(...params).total;

    const stmt = db.prepare(`
      SELECT * FROM activity_logs ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);
    const logs = stmt.all(...params, limit, offset);

    return { logs, total };
  },

  clear: () => {
    db.prepare('DELETE FROM activity_logs').run();
  }
};

// Fonctions pour gérer les quotas d'équipe
const teamQuotasDb = {
  get: (teamId) => {
    const stmt = db.prepare('SELECT * FROM team_quotas WHERE team_id = ?');
    return stmt.get(teamId);
  },

  upsert: (teamId, data) => {
    const existing = teamQuotasDb.get(teamId);
    if (existing) {
      const stmt = db.prepare(`
        UPDATE team_quotas SET
          max_storage_gb = ?, max_files = ?, max_shares_per_user = ?,
          max_file_size_mb = ?, max_share_duration_days = ?,
          updated_at = datetime('now'), updated_by = ?
        WHERE team_id = ?
      `);
      return stmt.run(
        data.max_storage_gb ?? existing.max_storage_gb,
        data.max_files ?? existing.max_files,
        data.max_shares_per_user ?? existing.max_shares_per_user,
        data.max_file_size_mb ?? existing.max_file_size_mb,
        data.max_share_duration_days ?? existing.max_share_duration_days,
        data.updated_by || null,
        teamId
      );
    } else {
      const stmt = db.prepare(`
        INSERT INTO team_quotas (team_id, max_storage_gb, max_files, max_shares_per_user, max_file_size_mb, max_share_duration_days, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      return stmt.run(
        teamId,
        data.max_storage_gb ?? 5,
        data.max_files ?? 1000,
        data.max_shares_per_user ?? 50,
        data.max_file_size_mb ?? 100,
        data.max_share_duration_days ?? 30,
        data.updated_by || null
      );
    }
  },

  getAll: () => {
    const stmt = db.prepare(`
      SELECT tq.*, t.name as team_name, t.display_name as team_display_name
      FROM team_quotas tq
      LEFT JOIN teams t ON tq.team_id = t.id
      ORDER BY t.name
    `);
    return stmt.all();
  },

  getDefaults: () => {
    return {
      max_storage_gb: parseFloat(settingsDb.get('defaultMaxStorageGb')) || 5,
      max_files: parseInt(settingsDb.get('defaultMaxFiles')) || 1000,
      max_file_size_mb: parseFloat(settingsDb.get('defaultMaxFileSizeMb')) || 100,
      max_shares_per_user: parseInt(settingsDb.get('defaultMaxSharesPerUser')) || 50,
      max_share_duration_days: parseInt(settingsDb.get('defaultMaxShareDurationDays')) || 30
    };
  },

  delete: (teamId) => {
    const stmt = db.prepare('DELETE FROM team_quotas WHERE team_id = ?');
    return stmt.run(teamId);
  }
};

// Fonctions pour la quarantaine antivirus
const virusQuarantineDb = {
  create: (data) => {
    const stmt = db.prepare(`
      INSERT INTO virus_quarantine (blob_name, original_name, virus_name, quarantine_path, uploaded_by, detected_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);
    return stmt.run(data.blobName, data.originalName || null, data.virusName, data.quarantinePath || null, data.uploadedBy || null);
  },

  getAll: () => {
    const stmt = db.prepare(`SELECT * FROM virus_quarantine ORDER BY detected_at DESC`);
    return stmt.all();
  },

  getById: (id) => {
    const stmt = db.prepare(`SELECT * FROM virus_quarantine WHERE id = ?`);
    return stmt.get(id);
  },

  resolve: (id, resolvedBy) => {
    const stmt = db.prepare(`
      UPDATE virus_quarantine SET resolved = 1, resolved_by = ?, resolved_at = datetime('now') WHERE id = ?
    `);
    return stmt.run(resolvedBy || null, id);
  },

  delete: (id) => {
    const stmt = db.prepare(`DELETE FROM virus_quarantine WHERE id = ?`);
    return stmt.run(id);
  },

  getStats: () => {
    const stmt = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved
      FROM virus_quarantine
    `);
    return stmt.get();
  }
};

// Migration: upload_requests tables
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS upload_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      created_by_user_id INTEGER NOT NULL,
      team_id INTEGER,
      allowed_email TEXT,
      allowed_domain TEXT,
      max_files INTEGER DEFAULT 10,
      max_file_size_mb REAL DEFAULT 50,
      allowed_extensions TEXT,
      expires_at TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      upload_count INTEGER DEFAULT 0,
      last_upload_at TEXT,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_upload_requests_request_id ON upload_requests(request_id);
    CREATE INDEX IF NOT EXISTS idx_upload_requests_created_by ON upload_requests(created_by_user_id);
    CREATE INDEX IF NOT EXISTS idx_upload_requests_expires ON upload_requests(expires_at);
    CREATE TABLE IF NOT EXISTS upload_request_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      blob_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_size INTEGER,
      content_type TEXT,
      uploader_email TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (request_id) REFERENCES upload_requests(request_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_upload_request_files_request ON upload_request_files(request_id);
  `);
} catch (error) {
  console.error('⚠️  Erreur migration upload_requests:', error);
}

const uploadRequestsDb = {
  create: (data) => {
    return db.prepare('INSERT INTO upload_requests (request_id, title, description, created_by_user_id, team_id, allowed_email, allowed_domain, max_files, max_file_size_mb, allowed_extensions, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(data.requestId, data.title, data.description || null, data.createdByUserId, data.teamId || null, data.allowedEmail || null, data.allowedDomain || null, data.maxFiles || 10, data.maxFileSizeMb || 50, data.allowedExtensions || null, data.expiresAt);
  },
  getByRequestId: (requestId) => db.prepare('SELECT * FROM upload_requests WHERE request_id = ?').get(requestId),
  getByUserId: (userId) => db.prepare("SELECT ur.*, (SELECT COUNT(*) FROM upload_request_files urf WHERE urf.request_id = ur.request_id) as file_count FROM upload_requests ur WHERE ur.created_by_user_id = ? ORDER BY ur.created_at DESC").all(userId),
  update: (requestId, data) => {
    const f = [], v = [];
    if (data.title !== undefined) { f.push('title = ?'); v.push(data.title); }
    if (data.description !== undefined) { f.push('description = ?'); v.push(data.description); }
    if (data.isActive !== undefined) { f.push('is_active = ?'); v.push(data.isActive ? 1 : 0); }
    if (f.length === 0) return;
    v.push(requestId);
    return db.prepare('UPDATE upload_requests SET ' + f.join(', ') + ' WHERE request_id = ?').run(...v);
  },
  delete: (requestId) => db.prepare('UPDATE upload_requests SET is_active = 0 WHERE request_id = ?').run(requestId),
  getFiles: (requestId) => db.prepare('SELECT * FROM upload_request_files WHERE request_id = ? ORDER BY uploaded_at DESC').all(requestId),
  addFile: (data) => db.prepare('INSERT INTO upload_request_files (request_id, blob_name, original_name, file_size, content_type, uploader_email) VALUES (?, ?, ?, ?, ?, ?)').run(data.requestId, data.blobName, data.originalName, data.fileSize || null, data.contentType || null, data.uploaderEmail),
  incrementUploadCount: (requestId) => db.prepare("UPDATE upload_requests SET upload_count = upload_count + 1, last_upload_at = datetime('now') WHERE request_id = ?").run(requestId)
};

// ============================================================================
// ROLE PERMISSIONS
// ============================================================================

// Create role_permissions table
db.exec(`
  CREATE TABLE IF NOT EXISTS role_permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    permission TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_by TEXT,
    UNIQUE(role, permission)
  );
`);

// Migration: rename april_user → com
try {
  db.prepare(`UPDATE users SET role = 'com' WHERE role = 'april_user'`).run();
} catch(e) { /* ignore if already done */ }

// Seed default permissions
const defaultPermissions = [
  { role: 'admin', permission: 'canCreateGuests', enabled: 1 },
  { role: 'admin', permission: 'canUseAI', enabled: 1 },
  { role: 'admin', permission: 'canCreateTeams', enabled: 1 },
  { role: 'admin', permission: 'canShareFiles', enabled: 1 },
  { role: 'admin', permission: 'canUploadFiles', enabled: 1 },
  { role: 'admin', permission: 'canManageUsers', enabled: 1 },
  { role: 'admin', permission: 'canViewReports', enabled: 1 },
  { role: 'admin', permission: 'canManageSettings', enabled: 1 },
  { role: 'com', permission: 'canCreateGuests', enabled: 1 },
  { role: 'com', permission: 'canUseAI', enabled: 1 },
  { role: 'com', permission: 'canCreateTeams', enabled: 1 },
  { role: 'com', permission: 'canShareFiles', enabled: 1 },
  { role: 'com', permission: 'canUploadFiles', enabled: 1 },
  { role: 'com', permission: 'canViewReports', enabled: 1 },
  { role: 'com', permission: 'canManageUsers', enabled: 0 },
  { role: 'com', permission: 'canManageSettings', enabled: 0 },
  { role: 'user', permission: 'canCreateGuests', enabled: 0 },
  { role: 'user', permission: 'canUseAI', enabled: 0 },
  { role: 'user', permission: 'canCreateTeams', enabled: 1 },
  { role: 'user', permission: 'canShareFiles', enabled: 1 },
  { role: 'user', permission: 'canUploadFiles', enabled: 1 },
  { role: 'user', permission: 'canViewReports', enabled: 0 },
  { role: 'user', permission: 'canManageUsers', enabled: 0 },
  { role: 'user', permission: 'canManageSettings', enabled: 0 },
  { role: 'viewer', permission: 'canCreateGuests', enabled: 0 },
  { role: 'viewer', permission: 'canUseAI', enabled: 0 },
  { role: 'viewer', permission: 'canCreateTeams', enabled: 0 },
  { role: 'viewer', permission: 'canShareFiles', enabled: 0 },
  { role: 'viewer', permission: 'canUploadFiles', enabled: 0 },
  { role: 'viewer', permission: 'canViewReports', enabled: 1 },
  { role: 'viewer', permission: 'canManageUsers', enabled: 0 },
  { role: 'viewer', permission: 'canManageSettings', enabled: 0 },
  // Audit permissions (disabled by default for ALL roles, including admin)
  { role: 'admin', permission: 'canAuditShares', enabled: 0 },
  { role: 'admin', permission: 'canAuditFiles', enabled: 0 },
  { role: 'admin', permission: 'canAuditActivity', enabled: 0 },
  { role: 'com', permission: 'canAuditShares', enabled: 0 },
  { role: 'com', permission: 'canAuditFiles', enabled: 0 },
  { role: 'com', permission: 'canAuditActivity', enabled: 0 },
  { role: 'user', permission: 'canAuditShares', enabled: 0 },
  { role: 'user', permission: 'canAuditFiles', enabled: 0 },
  { role: 'user', permission: 'canAuditActivity', enabled: 0 },
  { role: 'viewer', permission: 'canAuditShares', enabled: 0 },
  { role: 'viewer', permission: 'canAuditFiles', enabled: 0 },
  { role: 'viewer', permission: 'canAuditActivity', enabled: 0 },
];

const seedStmt = db.prepare(`
  INSERT OR IGNORE INTO role_permissions (role, permission, enabled, updated_at)
  VALUES (?, ?, ?, datetime('now'))
`);
const seedTx = db.transaction(() => {
  for (const p of defaultPermissions) {
    seedStmt.run(p.role, p.permission, p.enabled);
  }
});
seedTx();

const rolePermissionsDb = {
  getByRole(role) {
    return db.prepare('SELECT permission, enabled FROM role_permissions WHERE role = ?').all(role);
  },
  getAll() {
    return db.prepare('SELECT * FROM role_permissions ORDER BY role, permission').all();
  },
  hasPermission(role, permission) {
    // Audit permissions are NEVER auto-granted, even to admin
    const auditPermissions = ['canAuditShares', 'canAuditFiles', 'canAuditActivity'];
    if (role === 'admin' && !auditPermissions.includes(permission)) return true;
    const row = db.prepare('SELECT enabled FROM role_permissions WHERE role = ? AND permission = ?').get(role, permission);
    return row ? row.enabled === 1 : false;
  },
  update(role, permission, enabled, updatedBy) {
    return db.prepare(`
      INSERT INTO role_permissions (role, permission, enabled, updated_by, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(role, permission) DO UPDATE SET enabled = ?, updated_by = ?, updated_at = datetime('now')
    `).run(role, permission, enabled, updatedBy, enabled, updatedBy);
  },
  bulkUpdate(permissions) {
    const stmt = db.prepare(`
      INSERT INTO role_permissions (role, permission, enabled, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(role, permission) DO UPDATE SET enabled = ?, updated_at = datetime('now')
    `);
    const tx = db.transaction(() => {
      for (const p of permissions) {
        stmt.run(p.role, p.permission, p.enabled ? 1 : 0, p.enabled ? 1 : 0);
      }
    });
    tx();
  }
};

// ============================================================================
// ENTRA ROLE MAPPINGS
// ============================================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS entra_role_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL UNIQUE,
    entra_group_id TEXT,
    entra_group_name TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_by TEXT
  );
`);

// Seed defaults
db.exec(`
  INSERT OR IGNORE INTO entra_role_mappings (role, priority) VALUES ('admin', 100);
  INSERT OR IGNORE INTO entra_role_mappings (role, priority) VALUES ('com', 75);
  INSERT OR IGNORE INTO entra_role_mappings (role, priority) VALUES ('user', 50);
  INSERT OR IGNORE INTO entra_role_mappings (role, priority) VALUES ('viewer', 25);
`);

// Settings for Entra group sync
try {
  db.exec(`
    INSERT OR IGNORE INTO settings (key, value, category, description) VALUES
      ('entraDefaultRole', 'viewer', 'auth', 'Rôle par défaut si aucun groupe Entra ne correspond'),
      ('entraGroupSyncEnabled', 'true', 'auth', 'Synchroniser les rôles depuis les groupes Entra à la connexion');
  `);
} catch(e) { /* ignore */ }

const entraRoleMappingsDb = {
  getAll() {
    return db.prepare('SELECT * FROM entra_role_mappings ORDER BY priority DESC').all();
  },
  getByRole(role) {
    return db.prepare('SELECT * FROM entra_role_mappings WHERE role = ?').get(role);
  },
  update(role, data) {
    return db.prepare(`
      UPDATE entra_role_mappings
      SET entra_group_id = ?, entra_group_name = ?, updated_at = datetime('now'), updated_by = ?
      WHERE role = ?
    `).run(data.entra_group_id || null, data.entra_group_name || null, data.updatedBy || null, role);
  },
  getRoleForGroups(groupIds) {
    const defaultRole = settingsDb.get('entraDefaultRole') || 'viewer';
    if (!groupIds || groupIds.length === 0) return defaultRole;
    const mappings = this.getAll().filter(m => m.entra_group_id && groupIds.includes(m.entra_group_id));
    if (mappings.length === 0) return defaultRole;
    mappings.sort((a, b) => b.priority - a.priority);
    return mappings[0].role;
  }
};

const tieringPoliciesDb = {
  getAll() {
    return db.prepare('SELECT tp.*, t.name as team_name FROM tiering_policies tp LEFT JOIN teams t ON tp.team_id = t.id ORDER BY tp.team_id IS NULL DESC, t.name ASC').all();
  },
  getGlobal() {
    return db.prepare('SELECT * FROM tiering_policies WHERE team_id IS NULL').get();
  },
  getByTeam(teamId) {
    return db.prepare('SELECT * FROM tiering_policies WHERE team_id = ?').get(teamId);
  },
  upsertGlobal(hotDays, coolDays, enabled) {
    const existing = this.getGlobal();
    if (existing) {
      return db.prepare('UPDATE tiering_policies SET hot_to_cool_days = ?, cool_to_archive_days = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE team_id IS NULL').run(hotDays, coolDays, enabled ? 1 : 0);
    }
    return db.prepare('INSERT INTO tiering_policies (team_id, hot_to_cool_days, cool_to_archive_days, enabled) VALUES (NULL, ?, ?, ?)').run(hotDays, coolDays, enabled ? 1 : 0);
  },
  upsertTeam(teamId, hotDays, coolDays, enabled) {
    const existing = this.getByTeam(teamId);
    if (existing) {
      return db.prepare('UPDATE tiering_policies SET hot_to_cool_days = ?, cool_to_archive_days = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE team_id = ?').run(hotDays, coolDays, enabled ? 1 : 0, teamId);
    }
    return db.prepare('INSERT INTO tiering_policies (team_id, hot_to_cool_days, cool_to_archive_days, enabled) VALUES (?, ?, ?, ?)').run(teamId, hotDays, coolDays, enabled ? 1 : 0);
  },
  delete(id) {
    return db.prepare('DELETE FROM tiering_policies WHERE id = ? AND team_id IS NOT NULL').run(id);
  }
};

module.exports = {
  db,
  shareLinksDb,
  downloadLogsDb,
  settingsDb,
  allowedEmailDomainsDb,
  usersDb,
  guestAccountsDb,
  fileOwnershipDb,
  teamsDb,
  teamMembersDb,
  costTrackingDb,
  operationLogsDb,
  fileTiersDb,
  mediaAnalysisDb,
  faceProfilesDb,
  faceOccurrencesDb,
  smartAlbumsDb,
  transcriptionsDb,
  videoMarkersDb,
  aiCostTrackingDb,
  searchIndexDb,
  geolocationDb,
  scanSchedulesDb,
  activityLogsDb,
  teamQuotasDb,
  uploadRequestsDb,
  virusQuarantineDb,
  rolePermissionsDb,
  entraRoleMappingsDb,
  tieringPoliciesDb
};
