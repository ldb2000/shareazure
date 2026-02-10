const Database = require('better-sqlite3');
const path = require('path');

// Initialisation de la base de données
const dbPath = path.join(__dirname, 'shareazure.db');
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
    ('enableGuestAccounts', 'true', 'guest', 'Activer le système de comptes invités');
`);

console.log('✅ Base de données initialisée:', dbPath);

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

// Fonctions pour gérer les domaines d'emails autorisés
const allowedEmailDomainsDb = {
  // Ajouter un domaine autorisé
  add: (domain, createdBy = null) => {
    const stmt = db.prepare(`
      INSERT INTO allowed_email_domains (domain, created_by)
      VALUES (?, ?)
    `);
    return stmt.run(domain.toLowerCase(), createdBy);
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
      WHERE uploaded_by_user_id = ?
      ORDER BY uploaded_at DESC
    `);
    return stmt.all(userId);
  },

  // Obtenir tous les fichiers d'un invité
  getByGuest: (guestId) => {
    const stmt = db.prepare(`
      SELECT * FROM file_ownership
      WHERE uploaded_by_guest_id = ?
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
             ga.guest_id as guest_id
      FROM file_ownership fo
      LEFT JOIN users u ON fo.uploaded_by_user_id = u.id
      LEFT JOIN guest_accounts ga ON fo.uploaded_by_guest_id = ga.id
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
      WHERE fo.uploaded_by_user_id = ?
         OR ga.created_by_user_id = ?
      ORDER BY fo.uploaded_at DESC
    `);
    return stmt.all(userId, userId);
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
  fileTiersDb
};
