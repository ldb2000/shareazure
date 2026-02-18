require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { BlobServiceClient, BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { db, shareLinksDb, downloadLogsDb, settingsDb, allowedEmailDomainsDb, usersDb, guestAccountsDb, fileOwnershipDb, teamsDb, teamMembersDb, costTrackingDb, operationLogsDb, fileTiersDb, activityLogsDb, uploadRequestsDb, teamQuotasDb, rolePermissionsDb, entraRoleMappingsDb, tieringPoliciesDb } = require('./database');
const crypto = require('crypto');
const { migrateHardcodedUsers } = require('./migrateUsers');
const emailService = require('./emailService');
const { watermarkPDF, watermarkImage, canWatermark } = require('./watermarkService');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (Cloudflare tunnel)
app.set('trust proxy', 1);

// Middleware de sécurité
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limite chaque IP à 500 requêtes par fenêtre
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// Servir les fichiers statiques frontend et admin depuis Express
app.use('/admin', express.static(path.join(__dirname, '../admin')));
app.use(express.static(path.join(__dirname, '../frontend')));

// Fonction pour obtenir la taille maximale de fichier
function getMaxFileSizeMB() {
  try {
    const value = settingsDb.get('maxFileSizeMB');
    return parseInt(value) || 100;
  } catch (error) {
    return 100;
  }
}

// Configuration Multer pour l'upload en mémoire
// Note: La limite est définie statiquement au démarrage, mais vérifiée dans fileFilter
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024 // 500 MB comme limite absolue
  },
  fileFilter: (req, file, cb) => {
    // Vérifier la taille du fichier selon la config
    const maxSizeMB = getMaxFileSizeMB();
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    
    // Note: file.size n'est pas disponible dans fileFilter, 
    // la vérification réelle se fait après l'upload
    cb(null, true);
  }
});

// Middleware pour vérifier la taille après upload
function validateFileSize(req, res, next) {
  const maxSizeMB = getMaxFileSizeMB();
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  
  if (req.file && req.file.size > maxSizeBytes) {
    return res.status(400).json({
      success: false,
      error: `Fichier trop volumineux. Taille maximale autorisée : ${maxSizeMB} Mo`
    });
  }
  
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      if (file.size > maxSizeBytes) {
        return res.status(400).json({
          success: false,
          error: `Fichier "${file.originalname}" trop volumineux. Taille maximale autorisée : ${maxSizeMB} Mo`
        });
      }
    }
  }
  
  next();
}

// Vérification des quotas utilisateur
function checkQuota(userId, fileSize) {
  const membership = db.prepare(`
    SELECT tm.team_id FROM team_members tm WHERE tm.user_id = ? AND tm.is_active = 1 LIMIT 1
  `).get(userId);

  let quotas;
  if (membership) {
    quotas = teamQuotasDb.get(membership.team_id);
  }
  if (!quotas) {
    quotas = teamQuotasDb.getDefaults();
  }

  // Check file size
  if (fileSize && quotas.max_file_size_mb && fileSize > quotas.max_file_size_mb * 1024 * 1024) {
    return { allowed: false, error: `Fichier trop volumineux (max ${quotas.max_file_size_mb} Mo)` };
  }

  // Check total storage and file count
  const usage = db.prepare(`
    SELECT COALESCE(SUM(file_size), 0) as total_bytes, COUNT(*) as file_count
    FROM file_ownership WHERE uploaded_by_user_id = ?
  `).get(userId);

  if (quotas.max_storage_gb && (usage.total_bytes + (fileSize || 0)) > quotas.max_storage_gb * 1024 * 1024 * 1024) {
    return { allowed: false, error: `Quota de stockage dépassé (max ${quotas.max_storage_gb} Go)` };
  }

  if (quotas.max_files && usage.file_count >= quotas.max_files) {
    return { allowed: false, error: `Nombre maximum de fichiers atteint (${quotas.max_files})` };
  }

  return { allowed: true, quotas, usage };
}

function checkShareQuota(userId) {
  const membership = db.prepare(`
    SELECT tm.team_id FROM team_members tm WHERE tm.user_id = ? AND tm.is_active = 1 LIMIT 1
  `).get(userId);

  let quotas;
  if (membership) {
    quotas = teamQuotasDb.get(membership.team_id);
  }
  if (!quotas) {
    quotas = teamQuotasDb.getDefaults();
  }

  // Count active shares
  const shareCount = db.prepare(`
    SELECT COUNT(*) as count FROM share_links WHERE created_by = (SELECT username FROM users WHERE id = ?) AND is_active = 1
  `).get(userId);

  if (quotas.max_shares_per_user && shareCount.count >= quotas.max_shares_per_user) {
    return { allowed: false, error: `Nombre maximum de partages atteint (${quotas.max_shares_per_user})` };
  }

  return { allowed: true, quotas, maxDurationDays: quotas.max_share_duration_days };
}

// Initialisation du client Azure Blob Storage
let blobServiceClient;
let storageAccountName;
let storageAccountKey;

try {
  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING
    );
    // Extraire le nom et la clé depuis la connection string pour les SAS tokens
    const connString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const accountNameMatch = connString.match(/AccountName=([^;]+)/);
    const accountKeyMatch = connString.match(/AccountKey=([^;]+)/);
    
    if (accountNameMatch && accountKeyMatch) {
      storageAccountName = accountNameMatch[1];
      storageAccountKey = accountKeyMatch[1];
    }
  } else {
    storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
    storageAccountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
    blobServiceClient = new BlobServiceClient(
      `https://${storageAccountName}.blob.core.windows.net`,
      { accountKey: storageAccountKey }
    );
  }
  console.log('✅ Connexion Azure Blob Storage initialisée');
} catch (error) {
  console.error('❌ Erreur de connexion Azure:', error.message);
}

const containerName = process.env.AZURE_CONTAINER_NAME || 'uploads';

// Fonction helper pour convertir un stream en buffer
async function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on('error', reject);
  });
}

// Fonction pour logger les opérations
const LOG_CATEGORIES = {
  // Fichiers
  file_uploaded: 'file', multiple_files_uploaded: 'file', file_downloaded: 'file',
  file_previewed: 'file', file_deleted: 'file', file_renamed: 'file', file_moved: 'file',
  upload_error: 'file', multiple_upload_error: 'file', delete_error: 'file',
  folder_created: 'file',
  // Partages
  share_link_generated: 'share', share_generation_error: 'share', share_link_deactivated: 'share',
  share_link_deleted: 'share', file_downloaded_via_share: 'share',
  // Domaines
  email_domain_added: 'domain', email_domain_deleted: 'domain',
  email_domain_activated: 'domain', email_domain_deactivated: 'domain',
  // Utilisateurs
  user_created: 'user', user_creation_failed: 'user', user_deactivated: 'user', user_deleted: 'user',
  user_activated: 'user', user_role_changed: 'user', user_password_reset: 'user',
  // Invites
  guest_account_created: 'user', guest_login: 'auth',
  guest_account_disabled: 'user', guest_account_deleted: 'user',
  guest_account_expired_cleaned: 'user', guest_expiration_notification_sent: 'user',
  // Auth
  auth_login: 'auth', admin_login: 'auth', user_login: 'auth',
  // Systeme
  container_created: 'system'
};

const LOG_LEVELS = {
  // Fichiers
  file_uploaded: 'success', multiple_files_uploaded: 'success', file_downloaded: 'info',
  file_previewed: 'info', file_deleted: 'warning', file_renamed: 'info', file_moved: 'info',
  upload_error: 'error', multiple_upload_error: 'error', delete_error: 'error',
  folder_created: 'success',
  // Partages
  share_link_generated: 'success', share_generation_error: 'error', share_link_deactivated: 'warning',
  share_link_deleted: 'warning', file_downloaded_via_share: 'info',
  // Domaines
  email_domain_added: 'success', email_domain_deleted: 'warning',
  email_domain_activated: 'success', email_domain_deactivated: 'warning',
  // Utilisateurs
  user_created: 'success', user_creation_failed: 'error', user_deactivated: 'warning', user_deleted: 'error',
  user_activated: 'success', user_role_changed: 'info', user_password_reset: 'info',
  guest_account_created: 'success', guest_login: 'info',
  guest_account_disabled: 'warning', guest_account_deleted: 'warning',
  guest_account_expired_cleaned: 'info', guest_expiration_notification_sent: 'info',
  // Auth
  auth_login: 'info', admin_login: 'info', user_login: 'info',
  // Systeme
  container_created: 'success'
};

const LOG_MESSAGES = {
  // Fichiers
  file_uploaded: (d) => `Fichier "${d.originalName || d.blobName}" uploade`,
  file_trashed: (d) => `🗑️ "${d.blobName}" mis en corbeille par ${d.trashedBy || '?'}`,
  file_restored: (d) => `♻️ "${d.blobName}" restauré par ${d.restoredBy || '?'}`,
  trash_emptied: (d) => `🧹 Corbeille vidée: ${d.count} fichier(s) par ${d.by || '?'}`,
  trash_auto_purge: (d) => `🧹 Purge auto: ${d.count} fichier(s) >30j supprimés`,
  guest_approved: (d) => `✅ Invité "${d.email}" approuvé par ${d.approvedBy || '?'}`,
  multiple_files_uploaded: (d) => `${d.count || 0} fichiers uploades`,
  file_downloaded: (d) => `Fichier "${d.blobName}" telecharge`,
  file_previewed: (d) => `Fichier "${d.blobName}" previsualise`,
  file_deleted: (d) => `Fichier "${d.originalName || d.blobName}" supprime`,
  file_renamed: (d) => `Fichier renomme: "${d.oldPath}" → "${d.newPath}"`,
  file_moved: (d) => `Fichier deplace: "${d.sourcePath}" → "${d.destinationPath}"`,
  upload_error: (d) => `Erreur upload: ${d.error}`,
  multiple_upload_error: (d) => `Erreur upload multiple: ${d.error}`,
  delete_error: (d) => `Erreur suppression: ${d.error}`,
  folder_created: (d) => `Dossier "${d.folderName}" cree`,
  // Partages
  share_link_generated: (d) => `Lien de partage cree pour "${d.blobName}"`,
  share_generation_error: (d) => `Erreur generation lien: ${d.error}`,
  share_link_deactivated: (d) => `Lien de partage ${d.linkId} desactive`,
  share_link_deleted: (d) => `Lien de partage ${d.linkId} supprime`,
  file_downloaded_via_share: (d) => `Fichier "${d.blobName}" telecharge via partage`,
  // Domaines
  email_domain_added: (d) => `Domaine "${d.domain}" ajoute`,
  email_domain_deleted: (d) => `Domaine "${d.domain}" supprime`,
  email_domain_activated: (d) => `Domaine "${d.domain}" active`,
  email_domain_deactivated: (d) => `Domaine "${d.domain}" desactive`,
  // Utilisateurs
  user_created: (d) => `Utilisateur "${d.targetUsername || d.username}" cree (role: ${d.role})`,
  user_creation_failed: (d) => `Echec creation utilisateur "${d.targetUsername}": ${d.reason}`,
  user_deactivated: (d) => `Utilisateur "${d.targetUsername}" desactive`,
  user_deleted: (d) => `Utilisateur "${d.targetUsername}" supprime definitivement`,
  user_activated: (d) => `Utilisateur "${d.targetUsername}" reactive`,
  user_role_changed: (d) => `Role de "${d.targetUsername}" change: ${d.oldRole} → ${d.newRole}`,
  user_password_reset: (d) => `Mot de passe de "${d.targetUsername}" reinitialise`,
  guest_account_created: (d) => `Compte invite cree pour "${d.email}"`,
  guest_login: (d) => `Connexion invite "${d.email}"`,
  guest_account_disabled: (d) => `Compte invite "${d.email}" desactive`,
  guest_account_deleted: (d) => `Compte invite "${d.guestId}" supprime`,
  guest_account_expired_cleaned: (d) => `Compte invite expire nettoye`,
  guest_expiration_notification_sent: (d) => `Notification expiration envoyee`,
  // Auth
  auth_login: (d) => `Connexion de "${d.username}" (${d.role})`,
  admin_login: (d) => `Connexion admin "${d.username}"`,
  user_login: (d) => `Connexion de "${d.username}" (${d.role})`,
  // Systeme
  container_created: (d) => `Container "${d.containerName}" cree`
};

const logOperation = (operation, details = {}) => {
  try {
    const message = LOG_MESSAGES[operation] ? LOG_MESSAGES[operation](details) : operation;
    activityLogsDb.log({
      level: LOG_LEVELS[operation] || 'info',
      category: LOG_CATEGORIES[operation] || 'system',
      operation,
      message,
      username: details.username || details.addedBy || details.createdBy || details.deletedBy || details.deactivatedBy || null,
      details
    });
  } catch (e) {
    // Fallback console en cas d'erreur DB
    console.error('logOperation error:', e.message);
  }
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), operation, ...details }));
};

// ============================================
// MIDDLEWARES D'AUTHENTIFICATION
// ============================================

/**
 * Middleware pour authentifier un utilisateur (admin, com, user)
 * Le token doit être dans le format: "user:userId:username:timestamp"
 * Charge les infos utilisateur dans req.user
 */
function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Token d\'authentification manquant'
      });
    }

    // Décoder le token
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const parts = decoded.split(':');

      if (parts[0] !== 'user' || parts.length < 3) {
        return res.status(401).json({
          success: false,
          error: 'Token invalide'
        });
      }

      const userId = parseInt(parts[1]);
      const username = parts[2];

      // Récupérer l'utilisateur depuis la DB
      const user = usersDb.getById(userId);

      if (!user || user.username !== username) {
        return res.status(401).json({
          success: false,
          error: 'Utilisateur invalide ou inactif'
        });
      }

      // Charger l'utilisateur dans req.user
      req.user = user;
      next();

    } catch (decodeError) {
      return res.status(401).json({
        success: false,
        error: 'Token invalide'
      });
    }

  } catch (error) {
    console.error('Erreur authentification utilisateur:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
}

/**
 * Middleware pour authentifier un invité
 * Le token doit être dans le format: "guest:guestId:timestamp"
 * Charge les infos invité dans req.guest
 */
function authenticateGuest(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Token d\'authentification manquant'
      });
    }

    // Décoder le token
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const parts = decoded.split(':');

      if (parts[0] !== 'guest' || parts.length < 2) {
        return res.status(401).json({
          success: false,
          error: 'Token invité invalide'
        });
      }

      const guestId = parts[1];

      // Récupérer l'invité depuis la DB
      const guest = guestAccountsDb.getByGuestId(guestId);

      if (!guest) {
        return res.status(401).json({
          success: false,
          error: 'Compte invité introuvable'
        });
      }

      // Vérifier si le compte est actif
      if (!guest.is_active) {
        return res.status(401).json({
          success: false,
          error: 'Compte invité désactivé'
        });
      }

      // Vérifier si le compte n'est pas expiré
      const now = new Date();
      const expiresAt = new Date(guest.account_expires_at);
      if (expiresAt <= now) {
        return res.status(401).json({
          success: false,
          error: 'Compte invité expiré'
        });
      }

      // Charger l'invité dans req.guest
      req.guest = guest;
      next();

    } catch (decodeError) {
      return res.status(401).json({
        success: false,
        error: 'Token invité invalide'
      });
    }

  } catch (error) {
    console.error('Erreur authentification invité:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
}

/**
 * Middleware pour authentifier soit un utilisateur soit un invité
 * Tente d'abord l'authentification utilisateur, puis invité
 * Charge les infos dans req.user OU req.guest
 */
function authenticateUserOrGuest(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Token d\'authentification manquant'
    });
  }

  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const tokenType = decoded.split(':')[0];

    if (tokenType === 'user') {
      return authenticateUser(req, res, next);
    } else if (tokenType === 'guest') {
      return authenticateGuest(req, res, next);
    } else {
      return res.status(401).json({
        success: false,
        error: 'Type de token non reconnu'
      });
    }
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Token invalide'
    });
  }
}

/**
 * Middleware pour vérifier que l'utilisateur a un rôle spécifique
 * À utiliser APRÈS authenticateUser
 * @param {...string} roles - Liste des rôles autorisés
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentification utilisateur requise'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Permissions insuffisantes'
      });
    }

    next();
  };
}

/**
 * Middleware pour vérifier une permission spécifique via la table role_permissions
 * @param {string} permission - La permission requise
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Non authentifié' });
    }
    const { rolePermissionsDb } = require('./database');
    if (rolePermissionsDb.hasPermission(req.user.role, permission)) {
      return next();
    }
    return res.status(403).json({ success: false, error: `Permission insuffisante : ${permission}` });
  };
}

// Route de santé
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'shareazure-backend'
  });
});

// Route pour servir le logo APRIL
app.get('/api/logo-april.svg', (req, res) => {
  try {
    const logoPath = path.join(__dirname, '..', 'frontend', 'logo-april.svg');
    if (fs.existsSync(logoPath)) {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24h
      res.sendFile(logoPath);
    } else {
      res.status(404).send('Logo non trouvé');
    }
  } catch (error) {
    console.error('Erreur lors du service du logo:', error);
    res.status(500).send('Erreur serveur');
  }
});

// Route pour créer le conteneur s'il n'existe pas
app.post('/api/container/init', async (req, res) => {
  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const exists = await containerClient.exists();
    
    if (!exists) {
      await containerClient.create({
        access: 'private'
      });
      logOperation('container_created', { containerName });
      res.json({ message: 'Conteneur créé avec succès', containerName });
    } else {
      res.json({ message: 'Conteneur existe déjà', containerName });
    }
  } catch (error) {
    console.error('Erreur création conteneur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour uploader un fichier
app.post('/api/upload', authenticateUserOrGuest, upload.single('file'), validateFileSize, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    // Vérification des quotas pour les utilisateurs
    if (req.user) {
      const quotaCheck = checkQuota(req.user.id, req.file.size);
      if (!quotaCheck.allowed) {
        return res.status(403).json({ success: false, error: quotaCheck.error });
      }
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Support pour upload dans une équipe
    const teamId = req.query.teamId || req.body.teamId;
    let folderPath = req.query.path || req.body.path || '';
    let teamIdForDb = null;

    if (teamId) {
      // Vérifier que seuls les utilisateurs (pas les guests) peuvent uploader dans une équipe
      if (!req.user) {
        return res.status(403).json({
          success: false,
          error: 'Seuls les utilisateurs peuvent uploader dans une équipe'
        });
      }

      // Vérifier les permissions équipe
      const teamIdInt = parseInt(teamId);
      const membership = teamMembersDb.getByTeamAndUser(teamIdInt, req.user.id);
      if (!membership || !['owner', 'member'].includes(membership.role)) {
        return res.status(403).json({
          success: false,
          error: 'Permissions insuffisantes pour uploader dans cette équipe'
        });
      }

      const team = teamsDb.getById(teamIdInt);
      if (!team) {
        return res.status(404).json({
          success: false,
          error: 'Équipe non trouvée'
        });
      }

      // Utiliser le préfixe de l'équipe
      folderPath = team.storage_prefix + (folderPath || '');
      teamIdForDb = teamIdInt;
    } else if (req.user && !teamId) {
      // Upload personnel utilisateur
      const userPrefix = `users/${req.user.id}/`;
      folderPath = userPrefix + (folderPath || '');
    } else if (req.guest) {
      // Upload guest - use email as folder name for readability
      const guestEmail = req.guest.email || `guest-${req.guest.id}`;
      const guestPrefix = `guests/${guestEmail}/`;
      folderPath = guestPrefix + (folderPath || '');
    }

    // Scan antivirus avant upload
    const virusScanService = require('./ai/virusScanService');
    if (virusScanService.isEnabled()) {
      try {
        const scanResult = await virusScanService.scanBuffer(req.file.buffer, req.file.originalname);
        if (!scanResult.clean) {
          virusScanService.quarantine(req.file.originalname, req.file.buffer, scanResult.virus);
          console.warn(`🦠 Virus detected in ${req.file.originalname}: ${scanResult.virus}`);
          return res.status(400).json({
            success: false,
            error: `Fichier rejeté : menace détectée (${scanResult.virus})`
          });
        }
      } catch (scanErr) {
        console.error('Virus scan failed:', scanErr.message);
      }
    }

    // Utiliser le nom original du fichier au lieu d'un UUID
    // Nettoyer le nom pour éviter les caractères spéciaux problématiques
    let fileName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Vérifier si un fichier avec ce nom existe déjà dans ce dossier
    let blobName = folderPath ? `${folderPath}${fileName}` : fileName;
    let counter = 1;
    while (true) {
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      const exists = await blockBlobClient.exists();
      if (!exists) break;

      // Si le fichier existe, ajouter un numéro
      const nameParts = fileName.split('.');
      const ext = nameParts.length > 1 ? nameParts.pop() : '';
      const baseName = nameParts.join('.');
      fileName = ext ? `${baseName}_${counter}.${ext}` : `${baseName}_${counter}`;
      blobName = folderPath ? `${folderPath}${fileName}` : fileName;
      counter++;
    }

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Déterminer le propriétaire
    const uploadedByUserId = req.user ? req.user.id : null;
    const uploadedByGuestId = req.guest ? req.guest.id : null;
    const uploaderInfo = req.user
      ? `user:${req.user.username}`
      : `guest:${req.guest.email}`;

    // Métadonnées du fichier
    const metadata = {
      originalName: req.file.originalname,
      uploadedAt: new Date().toISOString(),
      uploadedBy: uploaderInfo,
      contentType: req.file.mimetype,
      size: req.file.size.toString()
    };

    // Upload du fichier
    await blockBlobClient.uploadData(req.file.buffer, {
      blobHTTPHeaders: {
        blobContentType: req.file.mimetype
      },
      metadata
    });

    // Enregistrer la propriété du fichier
    const fileData = {
      blobName: blobName,
      originalName: req.file.originalname,
      contentType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedByUserId: uploadedByUserId,
      uploadedByGuestId: uploadedByGuestId,
      folderPath: folderPath || null
    };

    // Ajouter teamId si upload dans une équipe
    if (teamIdForDb) {
      fileData.teamId = teamIdForDb;
    }

    fileOwnershipDb.create(fileData);

    // Logger l'opération pour le calcul des coûts
    if (teamIdForDb) {
      logOperationCost('team', teamIdForDb, 'write', blobName, req.file.size);
    } else if (req.user) {
      logOperationCost('user', req.user.id, 'write', blobName, req.file.size);
    } else if (req.guest) {
      logOperationCost('guest', req.guest.id, 'write', blobName, req.file.size);
    }

    logOperation('file_uploaded', {
      blobName,
      originalName: req.file.originalname,
      size: req.file.size,
      contentType: req.file.mimetype,
      folderPath,
      uploadedBy: uploaderInfo,
      username: req.user ? req.user.username : (req.guest ? req.guest.email : null)
    });

    res.json({
      success: true,
      message: 'Fichier uploadé avec succès',
      file: {
        blobName,
        originalName: req.file.originalname,
        displayName: fileName,
        size: req.file.size,
        contentType: req.file.mimetype,
        url: blockBlobClient.url
      }
    });

    // Auto-analyze with AI if enabled (fire-and-forget)
    try {
      const autoAnalyze = settingsDb.get('autoAnalyzeOnUpload');
      if (autoAnalyze === 'true') {
        const { isSupported } = require('./ai/mediaProcessor');
        if (isSupported(req.file.mimetype)) {
          const analysisOrchestrator = require('./ai/analysisOrchestrator');
          analysisOrchestrator.analyzeFile(blobName, req.file.mimetype, () => getBlobBufferHelper(blobName))
            .catch(err => console.error('Auto-analyze error:', err.message));
        }
      }
    } catch (aiErr) {
      // AI auto-analyze is optional, don't fail the upload
      console.error('Auto-analyze setup error:', aiErr.message);
    }

  } catch (error) {
    console.error('Erreur upload:', error);
    logOperation('upload_error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Route pour uploader plusieurs fichiers
app.post('/api/upload/multiple', authenticateUserOrGuest, upload.array('files', 10), validateFileSize, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);
    const folderPath = req.query.path || req.body.path || '';
    const uploadedFiles = [];

    // Déterminer le propriétaire
    const uploadedByUserId = req.user ? req.user.id : null;
    const uploadedByGuestId = req.guest ? req.guest.id : null;
    const uploaderInfo = req.user
      ? `user:${req.user.username}`
      : `guest:${req.guest.email}`;

    for (const file of req.files) {
      // Scan antivirus
      if (virusScanService.isEnabled()) {
        try {
          const scanResult = await virusScanService.scanBuffer(file.buffer, file.originalname);
          if (!scanResult.clean) {
            virusScanService.quarantine(file.originalname, file.buffer, scanResult.virus);
            console.warn(`🦠 Virus detected in ${file.originalname}: ${scanResult.virus}`);
            continue; // Skip this file
          }
        } catch (scanErr) {
          console.error('Virus scan failed:', scanErr.message);
        }
      }

      // Utiliser le nom original du fichier
      let fileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      let blobName = folderPath ? `${folderPath}${fileName}` : fileName;

      // Vérifier si un fichier avec ce nom existe déjà
      let counter = 1;
      while (true) {
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        const exists = await blockBlobClient.exists();
        if (!exists) break;

        const nameParts = fileName.split('.');
        const ext = nameParts.length > 1 ? nameParts.pop() : '';
        const baseName = nameParts.join('.');
        fileName = ext ? `${baseName}_${counter}.${ext}` : `${baseName}_${counter}`;
        blobName = folderPath ? `${folderPath}${fileName}` : fileName;
        counter++;
      }

      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      const metadata = {
        originalName: file.originalname,
        uploadedAt: new Date().toISOString(),
        uploadedBy: uploaderInfo,
        contentType: file.mimetype,
        size: file.size.toString()
      };

      await blockBlobClient.uploadData(file.buffer, {
        blobHTTPHeaders: {
          blobContentType: file.mimetype
        },
        metadata
      });

      // Enregistrer la propriété du fichier
      fileOwnershipDb.create({
        blobName: blobName,
        originalName: file.originalname,
        contentType: file.mimetype,
        fileSize: file.size,
        uploadedByUserId: uploadedByUserId,
        uploadedByGuestId: uploadedByGuestId,
        folderPath: folderPath || null
      });

      uploadedFiles.push({
        blobName,
        originalName: file.originalname,
        displayName: fileName,
        size: file.size,
        contentType: file.mimetype,
        url: blockBlobClient.url
      });
    }

    logOperation('multiple_files_uploaded', {
      count: uploadedFiles.length,
      folderPath,
      uploadedBy: uploaderInfo
    });

    res.json({
      success: true,
      message: `${uploadedFiles.length} fichier(s) uploadé(s) avec succès`,
      files: uploadedFiles
    });

  } catch (error) {
    console.error('Erreur upload multiple:', error);
    logOperation('multiple_upload_error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Route pour lister les fichiers (avec filtrage par permissions)
app.get('/api/files', authenticateUserOrGuest, async (req, res) => {
  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const { teamId } = req.query;
    let fileOwnershipRecords = [];

    // Logger l'opération list pour le calcul des coûts
    if (teamId && req.user) {
      logOperationCost('team', parseInt(teamId), 'list', null, 0);
    } else if (req.user) {
      logOperationCost('user', req.user.id, 'list', null, 0);
    } else if (req.guest) {
      logOperationCost('guest', req.guest.id, 'list', null, 0);
    }

    // Support pour filtrage par équipe
    if (teamId && req.user) {
      const teamIdInt = parseInt(teamId);
      const membership = teamMembersDb.getByTeamAndUser(teamIdInt, req.user.id);

      if (!membership && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Vous n\'êtes pas membre de cette équipe'
        });
      }

      // Récupérer les fichiers de l'équipe
      const stmt = db.prepare(`
        SELECT fo.*,
               u.username as user_owner,
               u.role as user_role
        FROM file_ownership fo
        LEFT JOIN users u ON fo.uploaded_by_user_id = u.id
        WHERE fo.team_id = ? AND (fo.is_trashed = 0 OR fo.is_trashed IS NULL)
        ORDER BY fo.uploaded_at DESC
      `);
      fileOwnershipRecords = stmt.all(teamIdInt);
    }
    // Filtrer selon le rôle et le type d'utilisateur
    else if (req.guest) {
      // Les invités voient uniquement leurs propres fichiers
      fileOwnershipRecords = fileOwnershipDb.getByGuest(req.guest.id);
    } else if (req.user) {
      if (req.user.role === 'admin') {
        // Admin voit tous les fichiers
        fileOwnershipRecords = fileOwnershipDb.getAllWithOwners();
      } else if (req.user.role === 'com') {
        // April_user voit ses fichiers + fichiers de ses invités
        fileOwnershipRecords = fileOwnershipDb.getAccessibleByAprilUser(req.user.id);
      } else {
        // User standard voit uniquement ses fichiers
        fileOwnershipRecords = fileOwnershipDb.getByUser(req.user.id);
      }
    }

    // Enrichir avec les infos d'Azure Blob Storage
    const files = [];
    for (const record of fileOwnershipRecords) {
      try {
        const blockBlobClient = containerClient.getBlockBlobClient(record.blob_name);
        const exists = await blockBlobClient.exists();

        if (!exists) {
          // Le fichier n'existe plus dans Azure, nettoyer la DB
          fileOwnershipDb.delete(record.blob_name);
          continue;
        }

        const properties = await blockBlobClient.getProperties();

        files.push({
          name: record.blob_name,
          originalName: record.original_name,
          size: record.file_size || properties.contentLength,
          contentType: record.content_type || properties.contentType,
          lastModified: properties.lastModified,
          uploadedAt: record.uploaded_at,
          uploadedBy: record.user_owner || record.guest_owner,
          ownerType: record.user_owner ? 'user' : 'guest',
          ownerRole: record.user_role || null,
          teamId: record.team_id || null,
          teamName: record.team_name || null,
          tier: properties.accessTier || 'Hot',
          metadata: properties.metadata
        });
      } catch (error) {
        console.error(`Erreur récupération fichier ${record.blob_name}:`, error);
        // Continuer avec les autres fichiers
      }
    }

    res.json({
      success: true,
      count: files.length,
      files,
      user: req.user ? {
        role: req.user.role,
        username: req.user.username
      } : null,
      guest: req.guest ? {
        email: req.guest.email
      } : null
    });

  } catch (error) {
    console.error('Erreur liste fichiers:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour télécharger un fichier
app.get('/api/download/:blobName', async (req, res) => {
  try {
    const { blobName } = req.params;
    // Vérification optionnelle du token (pour les utilisateurs connectés)
    const token = req.query.token || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);
    
    if (token) {
      // Vérifier le token si fourni
      try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        if (!decoded.startsWith('user:')) {
          return res.status(401).json({ error: 'Token invalide' });
        }
      } catch (e) {
        // Token invalide, mais on continue pour compatibilité
      }
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const downloadResponse = await blockBlobClient.download();
    const properties = await blockBlobClient.getProperties();

    // Logger l'opération pour le calcul des coûts
    const fileOwnership = fileOwnershipDb.getByBlobName(blobName);
    if (fileOwnership) {
      const fileSize = fileOwnership.file_size || properties.contentLength || 0;
      if (fileOwnership.team_id) {
        logOperationCost('team', fileOwnership.team_id, 'read', blobName, fileSize);
      } else if (fileOwnership.uploaded_by_user_id) {
        logOperationCost('user', fileOwnership.uploaded_by_user_id, 'read', blobName, fileSize);
      } else if (fileOwnership.uploaded_by_guest_id) {
        logOperationCost('guest', fileOwnership.uploaded_by_guest_id, 'read', blobName, fileSize);
      }
    }

    res.setHeader('Content-Type', properties.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${properties.metadata?.originalName || blobName}"`);

    downloadResponse.readableStreamBody.pipe(res);

    logOperation('file_downloaded', { blobName });

  } catch (error) {
    console.error('Erreur téléchargement:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour prévisualiser un fichier (inline, pas en téléchargement)
app.get('/api/preview/:blobName(*)', async (req, res) => {
  try {
    const blobName = req.params.blobName || req.params[0];
    // Vérification optionnelle du token (pour les utilisateurs connectés)
    let token = req.query.token || (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]);
    
    // Décoder le token de l'URL si nécessaire
    if (token) {
      try {
        token = decodeURIComponent(token);
      } catch (e) {
        // Le token n'est pas encodé, on continue
      }
      
      // Vérifier le token si fourni
      try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        if (!decoded.startsWith('user:')) {
          return res.status(401).json({ error: 'Token invalide' });
        }
      } catch (e) {
        // Token invalide, mais on continue pour compatibilité
      }
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const downloadResponse = await blockBlobClient.download();
    const properties = await blockBlobClient.getProperties();

    // Set Content-Type mais inline au lieu d'attachment
    res.setHeader('Content-Type', properties.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    
    // Headers CORS pour les previews
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    
    downloadResponse.readableStreamBody.pipe(res);

    logOperation('file_previewed', { blobName, contentType: properties.contentType });

  } catch (error) {
    console.error('Erreur preview:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour supprimer un fichier
// Route pour supprimer un fichier (restrictions selon permissions)
app.delete('/api/files/:blobName', authenticateUser, async (req, res) => {
  try {
    const { blobName } = req.params;

    // Vérifier la propriété du fichier
    const fileOwnership = fileOwnershipDb.getByBlobName(blobName);

    if (!fileOwnership) {
      return res.status(404).json({
        success: false,
        error: 'Fichier introuvable'
      });
    }

    // Vérifier les permissions selon le rôle
    let canDelete = false;

    if (req.user.role === 'admin') {
      // Admin peut tout supprimer
      canDelete = true;
    } else if (fileOwnership.team_id) {
      // Fichier d'équipe - vérifier les permissions équipe
      const membership = teamMembersDb.getByTeamAndUser(fileOwnership.team_id, req.user.id);
      canDelete = membership && ['owner', 'member'].includes(membership.role);
    } else if (req.user.role === 'com') {
      // April_user peut supprimer ses fichiers + fichiers de ses invités
      if (fileOwnership.uploaded_by_user_id === req.user.id) {
        canDelete = true;
      } else if (fileOwnership.uploaded_by_guest_id) {
        // Vérifier si l'invité a été créé par cet com
        const guest = guestAccountsDb.getByGuestId(fileOwnership.guest_id);
        if (guest && guest.created_by_user_id === req.user.id) {
          canDelete = true;
        }
      }
    } else {
      // User standard ne peut supprimer que ses propres fichiers
      if (fileOwnership.uploaded_by_user_id === req.user.id) {
        canDelete = true;
      }
    }

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        error: 'Vous n\'avez pas la permission de supprimer ce fichier'
      });
    }

    // Logger l'opération delete pour le calcul des coûts
    if (fileOwnership.team_id) {
      logOperationCost('team', fileOwnership.team_id, 'delete', blobName, 0);
    } else if (fileOwnership.uploaded_by_user_id) {
      logOperationCost('user', fileOwnership.uploaded_by_user_id, 'delete', blobName, 0);
    } else if (fileOwnership.uploaded_by_guest_id) {
      logOperationCost('guest', fileOwnership.uploaded_by_guest_id, 'delete', blobName, 0);
    }

    // Supprimer le fichier d'Azure
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.delete();

    // Supprimer l'enregistrement de propriété
    fileOwnershipDb.delete(blobName);

    logOperation('file_deleted', {
      blobName,
      deletedBy: req.user.username,
      originalOwner: fileOwnership.user_owner || fileOwnership.guest_owner,
      username: req.user.username
    });

    res.json({
      success: true,
      message: 'Fichier supprimé avec succès'
    });

  } catch (error) {
    console.error('Erreur suppression:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fonction helper pour extraire l'utilisateur du token
function extractUserFromToken(req) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return null;
  }

  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    if (parts[0] !== 'user') {
      return null;
    }
    const userId = parseInt(parts[1]);
    const username = parts[2];
    
    const user = USERS.find(u => u.id === userId && u.username === username);
    return user ? username : null;
  } catch (e) {
    return null;
  }
}

// Route pour générer un lien de partage temporaire (SAS) - Version avancée
app.post('/api/share/generate', async (req, res) => {
  try {
    const { blobName, expiresInMinutes = 60, permissions = 'r', password, recipientEmail, watermarkText } = req.body;

    if (!blobName) {
      return res.status(400).json({ error: 'blobName est requis' });
    }

    // Vérifier que l'email est fourni
    if (!recipientEmail || !recipientEmail.trim()) {
      return res.status(400).json({ error: 'Au moins un email de destinataire est requis' });
    }

    // Parser les emails (séparés par des virgules, points-virgules ou espaces)
    const emailList = recipientEmail
      .split(/[,;\s]+/)
      .map(email => email.trim())
      .filter(email => email.length > 0);

    if (emailList.length === 0) {
      return res.status(400).json({ error: 'Au moins un email de destinataire est requis' });
    }

    // Valider le format de chaque email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emailList.filter(email => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      return res.status(400).json({ 
        error: `Format d'email invalide pour : ${invalidEmails.join(', ')}` 
      });
    }

    // Vérifier que tous les domaines des emails sont autorisés
    const unauthorizedDomains = [];
    for (const email of emailList) {
      if (!allowedEmailDomainsDb.isAllowed(email)) {
        const domain = email.split('@')[1];
        if (!unauthorizedDomains.includes(domain)) {
          unauthorizedDomains.push(domain);
        }
      }
    }

    if (unauthorizedDomains.length > 0) {
      return res.status(403).json({ 
        error: `Les domaines suivants ne sont pas autorisés : ${unauthorizedDomains.join(', ')}. Contactez l'administrateur pour les ajouter.` 
      });
    }

    // Extraire le username du token (optionnel, pour enregistrer qui a créé le lien)
    const username = extractUserFromToken(req);

    // Vérification des quotas de partage
    if (username) {
      const user = usersDb.getByUsername(username);
      if (user) {
        const shareQuotaCheck = checkShareQuota(user.id);
        if (!shareQuotaCheck.allowed) {
          return res.status(403).json({ success: false, error: shareQuotaCheck.error });
        }
        // Vérifier la durée max de partage
        if (shareQuotaCheck.maxDurationDays && expiresInMinutes > shareQuotaCheck.maxDurationDays * 24 * 60) {
          return res.status(403).json({
            success: false,
            error: `Durée de partage trop longue (max ${shareQuotaCheck.maxDurationDays} jours)`
          });
        }
      }
    }

    // Vérifier que le fichier existe
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const exists = await blockBlobClient.exists();

    if (!exists) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }

    // Créer les credentials
    const sharedKeyCredential = new StorageSharedKeyCredential(
      storageAccountName,
      storageAccountKey
    );

    // Définir les permissions
    const blobSASPermissions = new BlobSASPermissions();
    if (permissions.includes('r')) blobSASPermissions.read = true;
    if (permissions.includes('w')) blobSASPermissions.write = true;
    if (permissions.includes('d')) blobSASPermissions.delete = true;

    // Définir la date d'expiration
    const expiresOn = new Date();
    expiresOn.setMinutes(expiresOn.getMinutes() + expiresInMinutes);

    // Générer le SAS token
    const sasToken = generateBlobSASQueryParameters({
      containerName,
      blobName,
      permissions: blobSASPermissions,
      startsOn: new Date(),
      expiresOn: expiresOn
    }, sharedKeyCredential).toString();

    // Construire l'URL complète
    const sasUrl = `${blockBlobClient.url}?${sasToken}`;

    // Récupérer les propriétés du fichier
    const properties = await blockBlobClient.getProperties();

    // Générer un ID unique pour le lien
    const linkId = uuidv4();

    // Mot de passe obligatoire
    if (!password || !password.trim()) {
      return res.status(400).json({ error: 'Un mot de passe est obligatoire pour tout partage de fichier' });
    }
    const passwordHash = await bcrypt.hash(password.trim(), 10);

    // URL accessible via notre API (avec protection par mot de passe)
    // Utiliser BACKEND_URL si disponible, sinon construire depuis la requête
    const backendUrl = process.env.BACKEND_URL || (req.protocol + '://' + req.get('host'));
    const protectedUrl = `${backendUrl}/api/share/download/${linkId}`;

    // Enregistrer dans la base de données (stocker tous les emails séparés par des virgules)
    shareLinksDb.create({
      linkId,
      blobName,
      originalName: properties.metadata?.originalName || blobName,
      contentType: properties.contentType,
      fileSize: properties.contentLength,
      shareUrl: protectedUrl, // Toujours URL protégée par mot de passe
      passwordHash,
      recipientEmail: emailList.join(','), // Stocker tous les emails séparés par des virgules
      expiresAt: expiresOn.toISOString(),
      expiresInMinutes,
      createdBy: username || null,
      watermarkText: watermarkText || null
    });

    // Générer le QR Code (toujours URL protégée)
    const qrCodeDataUrl = await QRCode.toDataURL(protectedUrl);

    logOperation('share_link_generated', {
      linkId,
      blobName,
      expiresInMinutes,
      expiresAt: expiresOn.toISOString(),
      hasPassword: !!passwordHash
    });

    // Envoyer les notifications email aux destinataires
    if (emailService.isEnabled()) {
      for (const recipientAddr of emailList) {
        emailService.sendShareNotification(recipientAddr, {
          senderName: username || 'Un utilisateur',
          fileName: properties.metadata?.originalName || blobName,
          shareUrl: protectedUrl,
          expiresAt: expiresOn.toISOString()
        }).catch(err => console.error('Share email error:', err));

        // 2ème email avec le mot de passe (délai 3s pour séparer)
        setTimeout(() => {
          emailService.sendSharePassword(recipientAddr, {
            senderName: username || 'Un utilisateur',
            fileName: properties.metadata?.originalName || blobName,
            password: password
          }).catch(err => console.error('Share password email error:', err));
        }, 3000);
      }
    }

    res.json({
      success: true,
      linkId,
      shareLink: protectedUrl,
      directLink: null, // SAS jamais exposé côté client
      expiresAt: expiresOn.toISOString(),
      expiresInMinutes,
      qrCode: qrCodeDataUrl,
      hasPassword: true,
      file: {
        blobName,
        originalName: properties.metadata?.originalName || blobName,
        contentType: properties.contentType,
        size: properties.contentLength
      }
    });

  } catch (error) {
    console.error('Erreur génération lien de partage:', error);
    logOperation('share_generation_error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Route pour envoyer le lien de partage par email
app.post('/api/share/send-email', async (req, res) => {
  try {
    const { linkId, recipientEmails, fileName, shareLink } = req.body;
    if (!linkId || !recipientEmails || !shareLink) {
      return res.status(400).json({ success: false, error: 'Paramètres manquants' });
    }

    const emailService = require('./emailService');
    const emails = recipientEmails.split(',').map(e => e.trim()).filter(e => e);
    
    for (const email of emails) {
      try {
        await emailService.sendEmail({
          to: email,
          subject: `Fichier partagé : ${fileName || 'Document'}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:#1565C0;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
                <h2 style="margin:0;">📎 ShareAzure</h2>
              </div>
              <div style="background:#f5f7fa;padding:24px;border-radius:0 0 8px 8px;">
                <p>Bonjour,</p>
                <p>Un fichier a été partagé avec vous :</p>
                <div style="background:white;border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin:16px 0;">
                  <strong>📄 ${fileName || 'Document'}</strong>
                </div>
                <p>Cliquez sur le bouton ci-dessous pour y accéder :</p>
                <div style="text-align:center;margin:24px 0;">
                  <a href="${shareLink}" style="background:#1565C0;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
                    Accéder au fichier
                  </a>
                </div>
                <p style="color:#888;font-size:0.85rem;">Un mot de passe vous sera demandé pour télécharger le fichier.</p>
              </div>
            </div>
          `
        });
      } catch (emailErr) {
        console.error(`Erreur envoi email à ${email}:`, emailErr.message);
      }
    }

    res.json({ success: true, message: `Email envoyé à ${emails.length} destinataire(s)` });
  } catch (e) {
    console.error('Send share email error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Route pour télécharger via un lien protégé par mot de passe
app.post('/api/share/download/:linkId', async (req, res) => {
  try {
    const { linkId } = req.params;
    const { password, email } = req.body;

    // Récupérer le lien de la base de données
    const link = shareLinksDb.getByLinkId(linkId);

    if (!link) {
      return res.status(404).json({ error: 'Lien non trouvé ou expiré' });
    }

    // Vérifier l'expiration
    const now = new Date();
    const expiresAt = new Date(link.expires_at);
    if (now > expiresAt) {
      return res.status(410).json({ error: 'Ce lien a expiré' });
    }

    // Vérifier l'email si un destinataire est spécifié
    if (link.recipient_email) {
      if (!email) {
        return res.status(401).json({ 
          error: 'Adresse email requise', 
          requiresEmail: true 
        });
      }

      // Vérifier que l'email correspond (peut être une liste d'emails séparés par des virgules)
      const allowedEmails = link.recipient_email.split(',').map(e => e.trim().toLowerCase());
      const providedEmail = email.trim().toLowerCase();
      
      if (!allowedEmails.includes(providedEmail)) {
        return res.status(403).json({ 
          error: 'Cette adresse email n\'est pas autorisée à télécharger ce fichier' 
        });
      }
    }

    // Vérifier le mot de passe si requis
    if (link.password_hash) {
      if (!password) {
        return res.status(401).json({ error: 'Mot de passe requis', requiresPassword: true });
      }

      const isValid = await bcrypt.compare(password, link.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Mot de passe incorrect' });
      }
    }

    // Télécharger le fichier depuis Azure
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(link.blob_name);

    const downloadResponse = await blockBlobClient.download();

    // Incrémenter le compteur
    shareLinksDb.incrementDownloadCount(linkId);

    // Logger le téléchargement
    downloadLogsDb.log({
      linkId,
      blobName: link.blob_name,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      email: email || null
    });

    logOperation('file_downloaded_via_share', { 
      linkId, 
      blobName: link.blob_name,
      email: email || 'non fourni'
    });

    // Appliquer le watermark si configuré
    if (link.watermark_text && canWatermark(link.content_type)) {
      const chunks = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);
      
      let watermarkedBuffer;
      const wType = canWatermark(link.content_type);
      if (wType === 'pdf') {
        watermarkedBuffer = await watermarkPDF(fileBuffer, link.watermark_text);
      } else if (wType === 'image') {
        watermarkedBuffer = await watermarkImage(fileBuffer, link.watermark_text);
      }

      if (watermarkedBuffer) {
        res.setHeader('Content-Type', link.content_type);
        res.setHeader('Content-Disposition', `attachment; filename="${link.original_name}"`);
        res.setHeader('Content-Length', watermarkedBuffer.length);
        return res.end(watermarkedBuffer);
      }
    }

    // Envoyer le fichier (sans watermark)
    res.setHeader('Content-Type', link.content_type);
    res.setHeader('Content-Disposition', `attachment; filename="${link.original_name}"`);
    downloadResponse.readableStreamBody.pipe(res);

  } catch (error) {
    console.error('Erreur téléchargement protégé:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route GET pour accéder au lien protégé (affiche une page de saisie de mot de passe)
app.get('/api/share/download/:linkId', async (req, res) => {
  try {
    const { linkId } = req.params;
    
    // Récupérer le lien
    const link = shareLinksDb.getByLinkId(linkId);

    if (!link) {
      return res.status(404).send(`
        <html>
          <head><title>Lien non trouvé</title></head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h2>❌ Lien non trouvé ou expiré</h2>
            <p>Ce lien de partage n'existe pas ou a expiré.</p>
          </body>
        </html>
      `);
    }

    // Vérifier l'expiration
    const now = new Date();
    const expiresAt = new Date(link.expires_at);
    if (now > expiresAt) {
      return res.status(410).send(`
        <html>
          <head><title>Lien expiré</title></head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h2>⏰ Lien expiré</h2>
            <p>Ce lien de partage a expiré le ${expiresAt.toLocaleString('fr-FR')}.</p>
          </body>
        </html>
      `);
    }

    // Si pas de mot de passe ET pas d'email requis, rediriger vers le fichier directement
    if (!link.password_hash && !link.recipient_email) {
      // Générer un nouveau SAS token temporaire
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(link.blob_name);
      
      const sharedKeyCredential = new StorageSharedKeyCredential(
        storageAccountName,
        storageAccountKey
      );

      const blobSASPermissions = new BlobSASPermissions();
      blobSASPermissions.read = true;

      const tempExpiresOn = new Date();
      tempExpiresOn.setMinutes(tempExpiresOn.getMinutes() + 5);

      const sasToken = generateBlobSASQueryParameters({
        containerName,
        blobName: link.blob_name,
        permissions: blobSASPermissions,
        startsOn: new Date(),
        expiresOn: tempExpiresOn
      }, sharedKeyCredential).toString();

      const tempSasUrl = `${blockBlobClient.url}?${sasToken}`;

      // Logger et rediriger
      shareLinksDb.incrementDownloadCount(linkId);
      downloadLogsDb.log({
        linkId,
        blobName: link.blob_name,
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers['user-agent']
      });

      return res.redirect(tempSasUrl);
    }

    // Construire l'URL du logo (servi par le backend)
    const backendUrl = process.env.BACKEND_URL || req.protocol + '://' + req.get('host');
    const logoUrl = `${backendUrl}/api/logo-april.svg`;

    // Afficher la page de saisie du mot de passe
    res.send(`
      <html>
        <head>
          <title>Fichier protégé</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
              background: linear-gradient(135deg, #003C61 0%, #0066CC 50%, #639E30 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
              margin: 0;
            }
            .container {
              background: white;
              padding: 2.5rem;
              border-radius: 20px;
              box-shadow: 0 25px 70px rgba(0, 0, 0, 0.3);
              max-width: 450px;
              width: 100%;
              animation: slideUp 0.5s ease;
            }
            @keyframes slideUp {
              from {
                opacity: 0;
                transform: translateY(30px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
            .logo-container {
              text-align: center;
              margin-bottom: 2rem;
            }
            .logo {
              height: 60px;
              width: auto;
              margin-bottom: 1rem;
            }
            h2 {
              color: #003C61;
              margin-top: 0;
              margin-bottom: 1.5rem;
              font-size: 1.75rem;
              font-weight: 600;
              text-align: center;
            }
            .file-info {
              background: #f5f5f5;
              padding: 1rem;
              border-radius: 8px;
              margin: 1.5rem 0;
              border: 1px solid #e0e0e0;
            }
            .file-name {
              font-weight: 600;
              color: #003C61;
              margin-bottom: 0.5rem;
              font-size: 1rem;
            }
            .file-size {
              color: #666;
              font-size: 0.875rem;
            }
            input[type="password"],
            input[type="email"] {
              width: 100%;
              padding: 0.75rem 1rem;
              border: 2px solid #ddd;
              border-radius: 8px;
              font-size: 1rem;
              box-sizing: border-box;
              margin: 1rem 0;
              transition: border-color 0.3s;
              font-family: inherit;
            }
            input[type="password"]:focus,
            input[type="email"]:focus {
              outline: none;
              border-color: #003C61;
            }
            button {
              width: 100%;
              padding: 0.875rem;
              background: #003C61;
              color: white;
              border: none;
              border-radius: 8px;
              font-size: 1rem;
              font-weight: 600;
              cursor: pointer;
              transition: background-color 0.3s, transform 0.2s;
              font-family: inherit;
            }
            button:hover {
              background: #005A8F;
              transform: translateY(-1px);
            }
            button:active {
              transform: translateY(0);
            }
            button:disabled {
              opacity: 0.6;
              cursor: not-allowed;
              transform: none;
            }
            .error {
              background: #fee;
              color: #c00;
              padding: 10px;
              border-radius: 5px;
              margin: 10px 0;
              display: none;
            }
            .expires {
              color: #666;
              font-size: 0.875rem;
              text-align: center;
              margin-top: 1.5rem;
              padding-top: 1rem;
              border-top: 1px solid #e0e0e0;
            }
            label {
              display: block;
              font-weight: 600;
              color: #0f172a;
              margin-bottom: 0.5rem;
              font-size: 0.875rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo-container">
              <img src="${logoUrl}" alt="APRIL" class="logo" onerror="this.style.display='none'">
            </div>
            <h2>🔒 Fichier protégé</h2>
            <div class="file-info">
              <div class="file-name">${link.original_name}</div>
            </div>
            <form id="downloadForm" onsubmit="return false;">
              ${link.recipient_email ? `
                <label for="email">Adresse email</label>
                <input 
                  type="email" 
                  id="email" 
                  placeholder="Entrez votre adresse email"
                  required
                  autofocus
                  autocomplete="email"
                >
              ` : ''}
              ${link.password_hash ? `
                <label for="password">Mot de passe</label>
                <input 
                  type="password" 
                  id="password" 
                  placeholder="Entrez le mot de passe"
                  required
                  ${!link.recipient_email ? 'autofocus' : ''}
                  autocomplete="current-password"
                >
              ` : ''}
              <div class="error" id="error"></div>
              <button type="button" id="submitBtn">⬇️ Télécharger</button>
            </form>
            <div class="expires">
              🕒 Expire le ${expiresAt.toLocaleString('fr-FR')}
            </div>
          </div>
          <script>
            const form = document.getElementById('downloadForm');
            const errorDiv = document.getElementById('error');
            const submitBtn = document.getElementById('submitBtn');
            const passwordInput = document.getElementById('password');
            const emailInput = document.getElementById('email');

            // Gérer le clic sur le bouton de téléchargement
            submitBtn.addEventListener('click', async (e) => {
              e.preventDefault();
              e.stopPropagation();
              
              // Validation
              if (emailInput && !emailInput.value) {
                errorDiv.textContent = 'Veuillez entrer votre adresse email';
                errorDiv.style.display = 'block';
                return;
              }
              
              if (passwordInput && !passwordInput.value) {
                errorDiv.textContent = 'Veuillez entrer le mot de passe';
                errorDiv.style.display = 'block';
                return;
              }
              
              errorDiv.style.display = 'none';
              submitBtn.disabled = true;
              submitBtn.textContent = '⏳ Vérification...';

              try {
                // Préparer le body de la requête
                const requestBody = {};
                if (emailInput) requestBody.email = emailInput.value;
                if (passwordInput) requestBody.password = passwordInput.value;
                
                // Utiliser l'URL actuelle pour la requête POST
                const downloadUrl = window.location.origin + window.location.pathname;
                const response = await fetch(downloadUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(requestBody),
                  credentials: 'same-origin'
                });

                if (response.ok) {
                  submitBtn.textContent = '✅ Téléchargement...';
                  
                  // Récupérer le fichier comme blob
                  const blob = await response.blob();
                  
                  // Vérifier que c'est bien un fichier (pas une erreur JSON)
                  if (blob.type && blob.type.startsWith('application/json')) {
                    // Si c'est du JSON, c'est une erreur
                    const text = await blob.text();
                    const data = JSON.parse(text);
                    errorDiv.textContent = data.error || 'Erreur de téléchargement';
                    errorDiv.style.display = 'block';
                    submitBtn.disabled = false;
                    submitBtn.textContent = '⬇️ Télécharger';
                    return;
                  }
                  
                  // Créer un lien de téléchargement
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = ${JSON.stringify(link.original_name)};
                  a.style.display = 'none';
                  document.body.appendChild(a);
                  a.click();
                  
                  // Nettoyer après un court délai
                  setTimeout(() => {
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                  }, 100);
                  
                  submitBtn.textContent = '✅ Téléchargé !';
                  setTimeout(() => {
                    submitBtn.textContent = '⬇️ Télécharger';
                    submitBtn.disabled = false;
                    if (passwordInput) passwordInput.value = '';
                    if (emailInput) emailInput.value = '';
                  }, 2000);
                } else {
                  // Gérer les erreurs
                  let errorMessage = 'Erreur de téléchargement';
                  try {
                    const data = await response.json();
                    if (response.status === 401 && data.error === 'Mot de passe incorrect') {
                      errorMessage = '❌ Mot de passe incorrect. Veuillez réessayer.';
                    } else {
                      errorMessage = data.error || errorMessage;
                    }
                  } catch (e) {
                    if (response.status === 401) {
                      errorMessage = '❌ Mot de passe incorrect. Veuillez réessayer.';
                    } else {
                      errorMessage = 'Erreur ' + response.status + ': ' + response.statusText;
                    }
                  }
                  errorDiv.textContent = errorMessage;
                  errorDiv.style.display = 'block';
                  submitBtn.disabled = false;
                  submitBtn.textContent = '⬇️ Télécharger';
                  // Réinitialiser les champs en cas d'erreur
                  if (passwordInput) {
                    passwordInput.value = '';
                    passwordInput.focus();
                  } else if (emailInput) {
                    emailInput.focus();
                  }
                }
              } catch (error) {
                console.error('Erreur téléchargement:', error);
                errorDiv.textContent = 'Erreur réseau: ' + error.message;
                errorDiv.style.display = 'block';
                submitBtn.disabled = false;
                submitBtn.textContent = '⬇️ Télécharger';
              }
            });
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Erreur page de téléchargement:', error);
    res.status(500).send('Erreur serveur');
  }
});

// Route pour obtenir les informations d'un lien de partage existant
app.get('/api/share/info/:blobName', async (req, res) => {
  try {
    const { blobName } = req.params;
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const exists = await blockBlobClient.exists();
    if (!exists) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }

    const properties = await blockBlobClient.getProperties();

    res.json({
      success: true,
      file: {
        blobName,
        originalName: properties.metadata?.originalName || blobName,
        contentType: properties.contentType,
        size: properties.contentLength,
        lastModified: properties.lastModified,
        uploadedAt: properties.metadata?.uploadedAt
      }
    });

  } catch (error) {
    console.error('Erreur info partage:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour obtenir l'historique des liens de partage
app.get('/api/share/history', async (req, res) => {
  try {
    const { blobName, limit = 100 } = req.query;

    let links;
    if (blobName) {
      links = shareLinksDb.getByBlobName(blobName);
    } else {
      links = shareLinksDb.getAll(parseInt(limit));
    }

    // Enrichir avec le statut d'expiration
    const enrichedLinks = links.map(link => {
      const now = new Date();
      const expiresAt = new Date(link.expires_at);
      const isExpired = now > expiresAt;

      return {
        ...link,
        isExpired,
        isActive: link.is_active === 1 && !isExpired,
        hasPassword: !!link.password_hash
      };
    });

    res.json({
      success: true,
      count: enrichedLinks.length,
      links: enrichedLinks
    });

  } catch (error) {
    console.error('Erreur historique:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour obtenir les statistiques d'un lien
app.get('/api/share/stats/:linkId', async (req, res) => {
  try {
    const { linkId } = req.params;

    const stats = shareLinksDb.getStats(linkId);
    const downloadLogs = downloadLogsDb.getByLinkId(linkId);

    if (!stats.link) {
      return res.status(404).json({ error: 'Lien non trouvé' });
    }

    const now = new Date();
    const expiresAt = new Date(stats.link.expires_at);
    const isExpired = now > expiresAt;

    res.json({
      success: true,
      link: {
        ...stats.link,
        isExpired,
        isActive: stats.link.is_active === 1 && !isExpired,
        hasPassword: !!stats.link.password_hash
      },
      statistics: {
        totalDownloads: stats.link.download_count,
        firstDownload: stats.downloads.first_download,
        lastDownload: stats.downloads.last_download,
        downloadLogs: downloadLogs.map(log => ({
          downloadedAt: log.downloaded_at,
          ipAddress: log.ip_address,
          userAgent: log.user_agent
        }))
      }
    });

  } catch (error) {
    console.error('Erreur statistiques:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route pour désactiver un lien
app.delete('/api/share/:linkId', async (req, res) => {
  try {
    const { linkId } = req.params;

    const result = shareLinksDb.deactivate(linkId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Lien non trouvé' });
    }

    logOperation('share_link_deactivated', { linkId });

    res.json({
      success: true,
      message: 'Lien désactivé avec succès'
    });

  } catch (error) {
    console.error('Erreur désactivation lien:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// API Settings Auth (must be before /api/settings/:key)
// ============================================

// GET /api/settings/auth - retourne la config auth (sans le secret)
app.get('/api/settings/auth', (req, res) => {
  try {
    const authMode = settingsDb.get('authMode') || 'local';
    const entraTenantId = settingsDb.get('entraTenantId') || '';
    const entraClientId = settingsDb.get('entraClientId') || '';
    const entraClientSecret = settingsDb.get('entraClientSecret') || '';
    const entraRedirectUri = settingsDb.get('entraRedirectUri') || '';

    res.json({
      success: true,
      auth: {
        authMode,
        entraTenantId,
        entraClientId,
        entraClientSecretSet: entraClientSecret.length > 0,
        entraRedirectUri
      }
    });
  } catch (error) {
    console.error('Erreur get auth settings:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// PUT /api/settings/auth - sauvegarde la config auth (admin only)
app.put('/api/settings/auth', authenticateUser, requireRole('admin'), (req, res) => {
  try {
    const { authMode, entraTenantId, entraClientId, entraClientSecret, entraRedirectUri } = req.body;

    if (authMode) settingsDb.update('authMode', authMode);
    if (entraTenantId !== undefined) settingsDb.update('entraTenantId', entraTenantId);
    if (entraClientId !== undefined) settingsDb.update('entraClientId', entraClientId);
    if (entraClientSecret !== undefined && entraClientSecret !== '') {
      settingsDb.update('entraClientSecret', entraClientSecret);
    }
    if (entraRedirectUri !== undefined) settingsDb.update('entraRedirectUri', entraRedirectUri);

    res.json({ success: true, message: 'Configuration auth sauvegardée' });
  } catch (error) {
    console.error('Erreur save auth settings:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// POST /api/settings/auth/test - teste la connexion Entra
app.post('/api/settings/auth/test', authenticateUser, requireRole('admin'), async (req, res) => {
  try {
    const tenantId = req.body.entraTenantId || settingsDb.get('entraTenantId');
    const clientId = req.body.entraClientId || settingsDb.get('entraClientId');
    const clientSecret = req.body.entraClientSecret || settingsDb.get('entraClientSecret');

    if (!tenantId || !clientId || !clientSecret) {
      return res.status(400).json({ success: false, error: 'Tenant ID, Client ID et Client Secret requis' });
    }

    const postData = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    }).toString();

    const result = await httpsRequest(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) } },
      postData
    );

    if (result.status === 200 && result.data.access_token) {
      res.json({ success: true, message: 'Connexion réussie ! Configuration valide.' });
    } else {
      res.json({ success: false, error: result.data.error_description || result.data.error || 'Échec de connexion' });
    }
  } catch (error) {
    console.error('Erreur test auth Entra:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// API Settings (Paramètres)
// ============================================

// GET /api/settings - Récupérer tous les paramètres
app.get('/api/settings', async (req, res) => {
  try {
    const settings = settingsDb.getAll();
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des paramètres:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des paramètres'
    });
  }
});

// GET /api/settings/:key - Récupérer un paramètre spécifique
app.get('/api/settings/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const value = settingsDb.get(key);
    
    if (value === null) {
      return res.status(404).json({
        success: false,
        error: 'Paramètre non trouvé'
      });
    }

    res.json({
      success: true,
      key,
      value
    });
  } catch (error) {
    console.error('Erreur lors de la récupération du paramètre:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération du paramètre'
    });
  }
});

// PUT /api/settings - Mettre à jour les paramètres
app.put('/api/settings', async (req, res) => {
  try {
    const settings = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Format de paramètres invalide'
      });
    }

    settingsDb.updateMany(settings);

    res.json({
      success: true,
      message: 'Paramètres mis à jour avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour des paramètres:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la mise à jour des paramètres'
    });
  }
});

// POST /api/settings/reset - Réinitialiser les paramètres
app.post('/api/settings/reset', async (req, res) => {
  try {
    settingsDb.reset();
    
    res.json({
      success: true,
      message: 'Paramètres réinitialisés aux valeurs par défaut'
    });
  } catch (error) {
    console.error('Erreur lors de la réinitialisation des paramètres:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la réinitialisation des paramètres'
    });
  }
});

// ============================================
// LOGO ENTREPRISE
// ============================================

// GET /api/company-logo — Servir le logo SVG
app.get('/api/company-logo', (req, res) => {
  const logoPath = path.join(__dirname, '..', 'frontend', 'img', 'company-logo.svg');
  if (fs.existsSync(logoPath)) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.sendFile(logoPath);
  }
  res.status(404).json({ error: 'Logo non trouvé' });
});

// POST /api/admin/company-logo — Upload nouveau logo SVG
app.post('/api/admin/company-logo', authenticateUser, requireAdmin, express.raw({ type: 'image/svg+xml', limit: '500kb' }), (req, res) => {
  try {
    const svgContent = req.body.toString('utf-8');
    // Validation basique SVG
    if (!svgContent.includes('<svg') || !svgContent.includes('</svg>')) {
      return res.status(400).json({ success: false, error: 'Fichier SVG invalide' });
    }
    // Sauvegarder dans frontend et admin
    const frontendPath = path.join(__dirname, '..', 'frontend', 'img', 'company-logo.svg');
    const adminPath = path.join(__dirname, '..', 'admin', 'img', 'company-logo.svg');
    fs.writeFileSync(frontendPath, svgContent);
    fs.writeFileSync(adminPath, svgContent);
    
    activityLogsDb.log({ level: 'info', category: 'settings', operation: 'logo_updated',
      message: `Logo entreprise mis à jour par ${req.user.username}`,
      username: req.user.username, ip_address: req.ip });
    
    res.json({ success: true, message: 'Logo mis à jour' });
  } catch (error) {
    console.error('Erreur upload logo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/company-info — Nom + logo pour affichage public
app.get('/api/company-info', (req, res) => {
  const companyName = settingsDb.get('companyName') || 'ShareAzure';
  const logoExists = fs.existsSync(path.join(__dirname, '..', 'frontend', 'img', 'company-logo.svg'));
  res.json({ success: true, companyName, hasLogo: logoExists });
});

// ============================================
// ANNOTATIONS PDF
// ============================================

// GET /api/files/:blobName(*)/annotations
app.get('/api/files/:blobName(*)/annotations', authenticateUser, (req, res) => {
  try {
    const blobName = req.params.blobName || req.params[0];
    const annotations = db.prepare(
      'SELECT * FROM pdf_annotations WHERE blob_name = ? ORDER BY page_number, created_at'
    ).all(blobName);
    res.json({ success: true, annotations });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/files/:blobName(*)/annotations — Sauvegarder annotations (bulk par page)
app.post('/api/files/:blobName(*)/annotations', authenticateUser, (req, res) => {
  try {
    const blobName = req.params.blobName || req.params[0];
    const { annotations } = req.body; // [{page_number, annotation_type, data}]
    if (!Array.isArray(annotations)) {
      return res.status(400).json({ success: false, error: 'Format invalide' });
    }
    
    const insert = db.prepare(
      'INSERT INTO pdf_annotations (blob_name, page_number, user_id, username, annotation_type, data) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const insertMany = db.transaction((items) => {
      for (const a of items) {
        insert.run(blobName, a.page_number, req.user.id, req.user.username, a.annotation_type, JSON.stringify(a.data));
      }
    });
    insertMany(annotations);
    
    activityLogsDb.log({ level: 'info', category: 'file', operation: 'pdf_annotated',
      message: `${req.user.username} a annoté "${blobName.split('/').pop()}" (${annotations.length} annotations)`,
      username: req.user.username, details: { blobName, count: annotations.length }, ip_address: req.ip });
    
    res.json({ success: true, count: annotations.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/files/:blobName(*)/annotations — Supprimer toutes les annotations d'un user
app.delete('/api/files/:blobName(*)/annotations', authenticateUser, (req, res) => {
  try {
    const blobName = req.params.blobName || req.params[0];
    const { page } = req.query;
    let result;
    if (page) {
      result = db.prepare('DELETE FROM pdf_annotations WHERE blob_name = ? AND user_id = ? AND page_number = ?')
        .run(blobName, req.user.id, parseInt(page));
    } else {
      result = db.prepare('DELETE FROM pdf_annotations WHERE blob_name = ? AND user_id = ?')
        .run(blobName, req.user.id);
    }
    res.json({ success: true, deleted: result.changes });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/files/:blobName(*)/annotations/export — Export PDF avec annotations gravées
app.post('/api/files/:blobName(*)/annotations/export', authenticateUser, async (req, res) => {
  try {
    const blobName = req.params.blobName || req.params[0];
    
    // Récupérer le PDF original
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const downloadResponse = await blockBlobClient.download();
    const chunks = [];
    for await (const chunk of downloadResponse.readableStreamBody) chunks.push(chunk);
    const pdfBuffer = Buffer.concat(chunks);
    
    // Récupérer les annotations
    const annotations = db.prepare(
      'SELECT * FROM pdf_annotations WHERE blob_name = ? ORDER BY page_number'
    ).all(blobName);
    
    if (annotations.length === 0) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="annotated_${blobName.split('/').pop()}"`);
      return res.end(pdfBuffer);
    }
    
    // Appliquer les annotations avec pdf-lib
    const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pages = pdfDoc.getPages();
    
    for (const annot of annotations) {
      const pageIdx = annot.page_number - 1;
      if (pageIdx < 0 || pageIdx >= pages.length) continue;
      const page = pages[pageIdx];
      const { width, height } = page.getSize();
      const data = JSON.parse(annot.data);
      
      if (annot.annotation_type === 'text') {
        // Note texte avec fond jaune
        const x = data.x * width;
        const y = height - (data.y * height);
        const noteText = data.text || '';
        const fontSize = 10;
        // Fond jaune
        page.drawRectangle({ x: x - 2, y: y - 4, width: Math.min(noteText.length * 5.5 + 10, 250), height: fontSize + 8, color: rgb(1, 0.96, 0.76), opacity: 0.9 });
        page.drawText(noteText.substring(0, 50), { x, y, size: fontSize, font, color: rgb(0.2, 0.2, 0.2) });
        // Auteur
        page.drawText(`— ${annot.username}`, { x, y: y - 12, size: 7, font, color: rgb(0.5, 0.5, 0.5) });
      } else if (annot.annotation_type === 'highlight') {
        const x = data.x * width;
        const y = height - (data.y * height);
        const w = (data.w || 0.1) * width;
        const h = (data.h || 0.02) * height;
        page.drawRectangle({ x, y: y - h, width: w, height: h, color: rgb(1, 1, 0), opacity: 0.35 });
      } else if (annot.annotation_type === 'drawing') {
        // Dessins = séries de lignes
        if (data.paths) {
          for (const path of data.paths) {
            for (let i = 1; i < path.length; i++) {
              page.drawLine({
                start: { x: path[i-1].x * width, y: height - path[i-1].y * height },
                end: { x: path[i].x * width, y: height - path[i].y * height },
                thickness: data.lineWidth || 2,
                color: rgb(...(data.color || [1, 0, 0])),
                opacity: 0.8
              });
            }
          }
        }
      }
    }
    
    const resultBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="annotated_${blobName.split('/').pop()}"`);
    res.end(Buffer.from(resultBytes));
    
  } catch (e) {
    console.error('Export annotations error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// COMMENTAIRES FICHIERS
// ============================================

// GET /api/files/:blobName(*)/comments
app.get('/api/files/:blobName(*)/comments', authenticateUser, (req, res) => {
  try {
    const blobName = req.params.blobName || req.params[0];
    const comments = db.prepare(
      'SELECT * FROM file_comments WHERE blob_name = ? ORDER BY created_at DESC'
    ).all(blobName);
    res.json({ success: true, comments });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/files/:blobName(*)/comments
app.post('/api/files/:blobName(*)/comments', authenticateUser, (req, res) => {
  try {
    const blobName = req.params.blobName || req.params[0];
    const { comment } = req.body;
    if (!comment || !comment.trim()) {
      return res.status(400).json({ success: false, error: 'Commentaire vide' });
    }
    const result = db.prepare(
      'INSERT INTO file_comments (blob_name, user_id, username, comment) VALUES (?, ?, ?, ?)'
    ).run(blobName, req.user.id, req.user.username, comment.trim());
    
    activityLogsDb.log({ level: 'info', category: 'file', operation: 'file_commented',
      message: `${req.user.username} a commenté "${blobName.split('/').pop()}"`,
      username: req.user.username, details: { blobName }, ip_address: req.ip });
    
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/files/comments/:id
app.delete('/api/files/comments/:id', authenticateUser, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const comment = db.prepare('SELECT * FROM file_comments WHERE id = ?').get(id);
    if (!comment) return res.status(404).json({ success: false, error: 'Non trouvé' });
    // Seul l'auteur ou un admin peut supprimer
    if (comment.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Non autorisé' });
    }
    db.prepare('DELETE FROM file_comments WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// API Logs d'activité
// ============================================

// GET /api/admin/logs - Récupérer les logs d'activité
app.get('/api/admin/logs', async (req, res) => {
  try {
    const { level, category, operation, search, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const result = activityLogsDb.getAll({ limit: limitNum, offset, level, category, operation, search });

    res.json({
      success: true,
      logs: result.logs,
      total: result.total,
      page: pageNum,
      totalPages: Math.ceil(result.total / limitNum)
    });
  } catch (error) {
    console.error('Erreur chargement logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/admin/logs - Effacer tous les logs d'activité
app.delete('/api/admin/logs', async (req, res) => {
  try {
    activityLogsDb.clear();
    res.json({ success: true });
  } catch (error) {
    console.error('Erreur suppression logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// API Domaines d'emails autorisés
// ============================================

// GET /api/admin/email-domains - Récupérer tous les domaines autorisés
app.get('/api/admin/email-domains', async (req, res) => {
  try {
    const domains = allowedEmailDomainsDb.getAll();
    res.json({
      success: true,
      domains
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des domaines:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des domaines'
    });
  }
});

// Helper: RDAP lookup pour obtenir la date de création d'un domaine
const dns = require('dns');
function rdapLookup(domain) {
  const { execFile } = require('child_process');
  return new Promise((resolve) => {
    execFile('whois', [domain], { timeout: 10000 }, (err, stdout) => {
      if (err) { resolve(null); return; }
      // Chercher "Creation Date:" ou "created:" dans la sortie whois
      const match = stdout.match(/(?:Creation Date|created|Registration Date|domain_dateregistered):\s*(.+)/i);
      if (match) {
        const dateStr = match[1].trim();
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          resolve(date.toISOString());
          return;
        }
      }
      resolve(null);
    });
  });
}

// Helper: Vérification DMARC via DNS
function checkDmarc(domain) {
  return new Promise((resolve) => {
    dns.resolveTxt('_dmarc.' + domain, (err, records) => {
      if (err) { resolve(0); return; }
      const hasDmarc = records.some(r => r.join('').includes('v=DMARC1'));
      resolve(hasDmarc ? 1 : 0);
    });
  });
}

// Helper: Check BIMI record for a domain — returns SVG logo URL or null
function checkBimi(domain) {
  return new Promise((resolve) => {
    dns.resolveTxt('default._bimi.' + domain, (err, records) => {
      if (err) { resolve(null); return; }
      const bimi = records.map(r => r.join('')).find(r => r.includes('v=BIMI1'));
      if (!bimi) { resolve(null); return; }
      const match = bimi.match(/l=([^;\s]+)/);
      resolve(match ? match[1] : null);
    });
  });
}

// Helper: Get favicon URL for a domain (Google Favicon API as fallback)
function getFaviconUrl(domain) {
  return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
}

// Helper: Effectuer les vérifications RDAP + DMARC + BIMI pour un domaine et mettre à jour la DB
async function performDomainChecks(domain) {
  const [creationDate, hasDmarc, bimiLogo] = await Promise.all([
    rdapLookup(domain),
    checkDmarc(domain),
    checkBimi(domain)
  ]);
  const logoUrl = bimiLogo || getFaviconUrl(domain);
  allowedEmailDomainsDb.updateChecks(domain, creationDate || null, hasDmarc, bimiLogo || null);
  return { creationDate: creationDate || null, hasDmarc, logoUrl, bimiLogo: bimiLogo || null };
}

// POST /api/admin/email-domains - Ajouter un domaine autorisé
app.post('/api/admin/email-domains', async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain || !domain.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Le domaine est requis'
      });
    }

    // Valider le format du domaine
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain.trim())) {
      return res.status(400).json({
        success: false,
        error: 'Format de domaine invalide'
      });
    }

    // Extraire le username du token (optionnel)
    const username = extractUserFromToken(req);

    try {
      allowedEmailDomainsDb.add(domain.trim(), username || null);
      logOperation('email_domain_added', { domain: domain.trim(), username });
      
      // Lancer les vérifications RDAP + DMARC en arrière-plan
      performDomainChecks(domain.trim()).catch(e => console.error('Domain checks error:', e));

      res.json({
        success: true,
        message: 'Domaine ajouté avec succès'
      });
    } catch (error) {
      if (error.message && error.message.includes('UNIQUE constraint')) {
        return res.status(409).json({
          success: false,
          error: 'Ce domaine existe déjà'
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('Erreur lors de l\'ajout du domaine:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'ajout du domaine'
    });
  }
});

// POST /api/admin/email-domains/bulk - Import en masse de domaines
app.post('/api/admin/email-domains/bulk', async (req, res) => {
  try {
    const { domains } = req.body;
    if (!Array.isArray(domains) || domains.length === 0) {
      return res.status(400).json({ success: false, error: 'Liste de domaines requise' });
    }
    if (domains.length > 100) {
      return res.status(400).json({ success: false, error: 'Maximum 100 domaines par import' });
    }

    const username = extractUserFromToken(req);
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    let imported = 0, skipped = 0;

    for (const d of domains) {
      const domain = (d || '').trim().toLowerCase();
      if (!domain || !domainRegex.test(domain)) { skipped++; continue; }
      try {
        allowedEmailDomainsDb.add(domain, username || null);
        imported++;
        // Lancer les vérifications en arrière-plan
        performDomainChecks(domain).catch(e => console.error('Domain checks error:', e));
      } catch (error) {
        if (error.message && error.message.includes('UNIQUE constraint')) {
          skipped++;
        } else {
          skipped++;
        }
      }
    }

    logOperation('email_domain_added', { bulk: true, imported, skipped, username });
    res.json({ success: true, imported, skipped });
  } catch (error) {
    console.error('Erreur bulk import domaines:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de l\'import' });
  }
});

// POST /api/admin/email-domains/:id/recheck - Relancer les vérifications RDAP + DMARC
app.post('/api/admin/email-domains/:id/recheck', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const domainRecord = allowedEmailDomainsDb.getById(id);
    if (!domainRecord) {
      return res.status(404).json({ success: false, error: 'Domaine non trouvé' });
    }
    const result = await performDomainChecks(domainRecord.domain);
    res.json({ success: true, domain: domainRecord.domain, ...result });
  } catch (error) {
    console.error('Erreur recheck domaine:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la vérification' });
  }
});

// DELETE /api/admin/email-domains/:domain - Supprimer un domaine
app.delete('/api/admin/email-domains/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    
    const result = allowedEmailDomainsDb.delete(domain);
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Domaine non trouvé'
      });
    }

    const username = extractUserFromToken(req);
    logOperation('email_domain_deleted', { domain, username });

    res.json({
      success: true,
      message: 'Domaine supprimé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du domaine:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression du domaine'
    });
  }
});

// PUT /api/admin/email-domains/:domain/activate - Activer un domaine
app.put('/api/admin/email-domains/:domain/activate', async (req, res) => {
  try {
    const { domain } = req.params;

    const result = allowedEmailDomainsDb.activate(domain);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Domaine non trouvé'
      });
    }

    const username = extractUserFromToken(req);
    logOperation('email_domain_activated', { domain, username });

    res.json({
      success: true,
      message: 'Domaine activé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de l\'activation du domaine:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de l\'activation du domaine'
    });
  }
});

// PUT /api/admin/email-domains/:domain/deactivate - Désactiver un domaine
app.put('/api/admin/email-domains/:domain/deactivate', async (req, res) => {
  try {
    const { domain } = req.params;

    const result = allowedEmailDomainsDb.deactivate(domain);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Domaine non trouvé'
      });
    }

    const username = extractUserFromToken(req);
    logOperation('email_domain_deactivated', { domain, username });

    res.json({
      success: true,
      message: 'Domaine désactivé avec succès'
    });
  } catch (error) {
    console.error('Erreur lors de la désactivation du domaine:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la désactivation du domaine'
    });
  }
});

// ============================================
// AI / MULTIMEDIA ROUTES
// ============================================
const { router: aiRouter, adminRouter: aiAdminRouter, configure: configureAi } = require('./ai');

// Helper to download a blob buffer from Azure
async function getBlobBufferHelper(blobName) {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const downloadResponse = await blockBlobClient.download();
  return streamToBuffer(downloadResponse.readableStreamBody);
}

configureAi({
  getBlobBuffer: getBlobBufferHelper,
  getContainerClient: () => blobServiceClient.getContainerClient(containerName)
});

app.use('/api/ai', aiRouter);
app.use('/api/admin/ai', aiAdminRouter);

// Serve AI thumbnails
app.use('/api/ai/thumbnails', express.static(path.join(__dirname, 'thumbnails')));

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error('Erreur serveur:', err);
  res.status(500).json({
    error: 'Erreur serveur interne',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Démarrage du serveur
// ============================================
// Admin Authentication Routes
// ============================================

// Utilisateurs admin (en production : utiliser Azure AD B2C)
const ADMIN_USERS = [
  {
    id: 1,
    username: 'admin',
    // Mot de passe: admin123 (hashé avec bcrypt)
    passwordHash: '$2b$10$rQ9bZ8KZJ8KZJ8KZJ8KZJ.8KZJ8KZJ8KZJ8KZJ8KZJ8KZJ8KZJ8KZ',
    role: 'admin',
    name: 'Administrateur'
  }
];

// Utilisateurs standards (en production : utiliser Azure AD B2C)
const USERS = [
  {
    id: 2,
    username: 'user',
    // Mot de passe: user123 (pour le développement)
    passwordHash: '$2b$10$rQ9bZ8KZJ8KZJ8KZJ8KZJ.8KZJ8KZJ8KZJ8KZJ8KZJ8KZJ8KZJ8KZ',
    role: 'user',
    name: 'Utilisateur'
  }
];

// Générer un hash pour admin123 au démarrage (pour la première fois)
async function initializeAdminPassword() {
  if (ADMIN_USERS[0].passwordHash.startsWith('$2b$10$rQ9bZ8KZJ8KZJ8KZJ8KZJ')) {
    // Si c'est le hash par défaut, générer le vrai hash
    const hash = await bcrypt.hash('admin123', 10);
    console.log('⚠️  Hash pour admin123:', hash);
    console.log('⚠️  Remplacez ADMIN_USERS[0].passwordHash avec ce hash en production');
  }
}

// Route POST /api/auth/login - Connexion unifiée (tous les rôles)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Nom d\'utilisateur et mot de passe requis'
      });
    }

    const user = usersDb.getByUsername(username);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Identifiants invalides'
      });
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        error: 'Identifiants invalides'
      });
    }

    usersDb.updateLastLogin(user.id);

    const token = Buffer.from(`user:${user.id}:${user.username}:${Date.now()}`).toString('base64');

    // Enrichir avec les infos d'équipe
    const memberships = teamMembersDb.getByUser(user.id);
    const teams = memberships.map(m => ({
      teamId: m.team_id,
      name: m.name,
      displayName: m.display_name,
      role: m.role
    }));
    const isTeamLeader = user.role === 'com' || teams.some(t => t.role === 'owner');

    // Déterminer la redirection
    let redirect;
    if (user.role === 'admin') {
      redirect = '/admin/';
    } else if (isTeamLeader) {
      redirect = 'team.html';
    } else {
      redirect = 'user.html';
    }

    logOperation('auth_login', { username: user.username, role: user.role });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.full_name || user.username,
        role: user.role,
        email: user.email,
        teams,
        isTeamLeader
      },
      redirect
    });

  } catch (error) {
    console.error('Erreur login unifié:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// ============================================
// Auth Entra ID (SSO) Routes
// ============================================

// https already required at top of file
// crypto already required at top of file

// Helper: make HTTPS request returning a promise
function httpsRequest(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

// Helper: decode JWT payload (no verification - token comes from Microsoft)
function decodeJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
  return JSON.parse(payload);
}

// Fetch user's group memberships from Microsoft Graph API
async function getUserGroups(accessToken) {
  try {
    const result = await httpsRequest(
      'https://graph.microsoft.com/v1.0/me/memberOf?$select=id,displayName,@odata.type',
      { method: 'GET', headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    if (result.status === 200 && result.data && result.data.value) {
      return result.data.value
        .filter(v => v['@odata.type'] === '#microsoft.graph.group')
        .map(g => ({ id: g.id, displayName: g.displayName }));
    }
    return [];
  } catch (e) {
    console.error('Error fetching user groups:', e.message);
    return [];
  }
}

// Get app-level token using client credentials flow (for admin Graph API calls)
async function getAppToken() {
  const tenantId = process.env.AZURE_TENANT_ID || settingsDb.get('entraTenantId');
  const clientId = process.env.AZURE_CLIENT_ID || settingsDb.get('entraClientId');
  const clientSecret = process.env.AZURE_CLIENT_SECRET || settingsDb.get('entraClientSecret');
  if (!tenantId || !clientId || !clientSecret) return null;
  try {
    const postData = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&scope=https://graph.microsoft.com/.default`;
    const result = await httpsRequest(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) } },
      postData
    );
    return (result.status === 200 && result.data.access_token) ? result.data.access_token : null;
  } catch (e) {
    console.error('Error getting app token:', e.message);
    return null;
  }
}

// Store for OAuth state parameters
const oauthStates = new Map();

// GET /api/auth/entra/login - redirige vers Microsoft login
app.get('/api/auth/entra/login', (req, res) => {
  try {
    const authMode = settingsDb.get('authMode') || 'local';
    if (authMode === 'local') {
      return res.status(400).json({ success: false, error: 'Authentification Entra non activée' });
    }

    const tenantId = settingsDb.get('entraTenantId');
    const clientId = settingsDb.get('entraClientId');
    const redirectUri = settingsDb.get('entraRedirectUri');

    if (!tenantId || !clientId || !redirectUri) {
      return res.status(500).json({ success: false, error: 'Configuration Entra incomplète' });
    }

    const state = crypto.randomBytes(32).toString('hex');
    oauthStates.set(state, { timestamp: Date.now() });
    // Clean old states (>10min)
    for (const [k, v] of oauthStates) {
      if (Date.now() - v.timestamp > 600000) oauthStates.delete(k);
    }

    const authorizeUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
      new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        response_mode: 'query',
        scope: 'openid profile email User.Read GroupMember.Read.All',
        state
      }).toString();

    res.redirect(authorizeUrl);
  } catch (error) {
    console.error('Erreur Entra login redirect:', error);
    res.redirect('/login.html?error=server_error');
  }
});

// GET /api/auth/callback - callback OAuth2
app.get('/api/auth/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      return res.redirect(`/login.html?error=${encodeURIComponent(oauthError)}`);
    }

    if (!code || !state || !oauthStates.has(state)) {
      return res.redirect('/login.html?error=invalid_state');
    }
    oauthStates.delete(state);

    const tenantId = settingsDb.get('entraTenantId');
    const clientId = settingsDb.get('entraClientId');
    const clientSecret = settingsDb.get('entraClientSecret');
    const redirectUri = settingsDb.get('entraRedirectUri');

    // Exchange code for token
    const postData = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: 'openid profile email User.Read GroupMember.Read.All'
    }).toString();

    const tokenResult = await httpsRequest(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) } },
      postData
    );

    if (tokenResult.status !== 200 || !tokenResult.data.id_token) {
      console.error('Token exchange failed:', tokenResult.data);
      return res.redirect('/login.html?error=token_exchange_failed');
    }

    // Decode id_token
    const claims = decodeJwtPayload(tokenResult.data.id_token);
    const email = claims.email || claims.preferred_username || claims.upn || '';
    const name = claims.name || '';
    const oid = claims.oid || claims.sub || '';

    if (!email) {
      return res.redirect('/login.html?error=no_email');
    }

    // Fetch user groups and map to role (if sync enabled)
    const groupSyncEnabled = settingsDb.get('entraGroupSyncEnabled') !== 'false';
    let mappedRole = settingsDb.get('entraDefaultRole') || 'viewer';
    let userGroups = [];
    if (groupSyncEnabled && tokenResult.data.access_token) {
      userGroups = await getUserGroups(tokenResult.data.access_token);
      const groupIds = userGroups.map(g => g.id);
      mappedRole = entraRoleMappingsDb.getRoleForGroups(groupIds);
    }

    // Find or create user
    let user = usersDb.getByEntraOid(oid);
    if (!user) {
      user = usersDb.getByEmail(email);
    }

    if (user) {
      // Update Entra fields
      try {
        db.prepare(`UPDATE users SET entra_oid = ?, entra_email = ?, auth_provider = CASE WHEN auth_provider = 'local' THEN 'hybrid' ELSE auth_provider END WHERE id = ?`)
          .run(oid, email, user.id);
      } catch (e) { /* ignore */ }
      // Update role from group mapping on each login (if sync enabled)
      if (groupSyncEnabled && userGroups.length > 0) {
        try {
          usersDb.updateRole(user.id, mappedRole);
        } catch (e) { /* ignore */ }
      }
      usersDb.updateLastLogin(user.id);
      // Refresh user object after updates
      user = usersDb.getById(user.id);
    } else {
      // Create new user
      const username = email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '_');
      let uniqueUsername = username;
      let counter = 1;
      while (usersDb.getByUsername(uniqueUsername)) {
        uniqueUsername = `${username}_${counter++}`;
      }

      usersDb.createEntra({
        username: uniqueUsername,
        email,
        passwordHash: '',
        role: mappedRole,
        fullName: name,
        entraOid: oid,
        entraEmail: email
      });
      user = usersDb.getByEmail(email);
    }

    if (!user) {
      return res.redirect('/login.html?error=user_creation_failed');
    }

    const token = Buffer.from(`user:${user.id}:${user.username}:${Date.now()}`).toString('base64');
    logOperation('auth_login', { username: user.username, role: user.role, provider: 'entra' });

    // Redirect to login page which will store token and redirect appropriately
    res.redirect(`/login.html?token=${encodeURIComponent(token)}`);

  } catch (error) {
    console.error('Erreur auth callback:', error);
    res.redirect('/login.html?error=callback_error');
  }
});

// Route POST /api/admin/login - Connexion admin
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Nom d\'utilisateur et mot de passe requis'
      });
    }

    // Trouver l'utilisateur dans la DB
    const user = usersDb.getByUsername(username);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Identifiants invalides'
      });
    }

    // Vérifier que c'est un admin
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Accès admin requis'
      });
    }

    // Vérifier le mot de passe avec bcrypt
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        error: 'Identifiants invalides'
      });
    }

    // Mettre à jour la dernière connexion
    usersDb.updateLastLogin(user.id);

    // Générer un token simple (en production, utiliser JWT)
    const token = Buffer.from(`user:${user.id}:${user.username}:${Date.now()}`).toString('base64');

    logOperation('admin_login', { username: user.username });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.full_name || user.username,
        role: user.role,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Erreur login admin:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Route POST /api/admin/verify - Vérifier un token
app.post('/api/admin/verify', authenticateUser, (req, res) => {
  try {
    // L'authentification est déjà faite par le middleware
    // Vérifier que c'est un admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Accès admin requis'
      });
    }

    res.json({
      success: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        name: req.user.full_name || req.user.username,
        role: req.user.role,
        email: req.user.email
      }
    });

  } catch (error) {
    console.error('Erreur vérification token:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Route POST /api/user/login - Connexion utilisateur
app.post('/api/user/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Nom d\'utilisateur et mot de passe requis'
      });
    }

    // Trouver l'utilisateur dans la DB
    const user = usersDb.getByUsername(username);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Identifiants invalides'
      });
    }

    // Vérifier le mot de passe avec bcrypt
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        error: 'Identifiants invalides'
      });
    }

    // Mettre à jour la dernière connexion
    usersDb.updateLastLogin(user.id);

    // Générer un token simple (en production, utiliser JWT)
    const token = Buffer.from(`user:${user.id}:${user.username}:${Date.now()}`).toString('base64');

    logOperation('user_login', { username: user.username, role: user.role });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.full_name || user.username,
        role: user.role,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Erreur login utilisateur:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Route POST /api/user/verify - Vérifier un token utilisateur
app.post('/api/user/verify', authenticateUser, (req, res) => {
  try {
    // Enrichir avec les infos d'équipe
    const memberships = teamMembersDb.getByUser(req.user.id);
    const teams = memberships.map(m => ({
      teamId: m.team_id,
      name: m.name,
      displayName: m.display_name,
      role: m.role
    }));
    const isTeamLeader = req.user.role === 'com' || teams.some(t => t.role === 'owner');

    res.json({
      success: true,
      user: {
        id: req.user.id,
        username: req.user.username,
        name: req.user.full_name || req.user.username,
        role: req.user.role,
        email: req.user.email,
        teams,
        isTeamLeader
      }
    });

  } catch (error) {
    console.error('Erreur vérification token utilisateur:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// ============================================
// ENDPOINTS GESTION DES INVITÉS
// ============================================

// Route POST /api/admin/guest-accounts - Créer un compte invité
app.post('/api/admin/guest-accounts', authenticateUser, async (req, res) => {
  try {
    const { email, durationDays } = req.body;

    // Validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Email invalide'
      });
    }

    // Si l'utilisateur n'a pas la permission canCreateGuests,
    // vérifier que le domaine de l'email invité est approuvé
    const userPerms = rolePermissionsDb.getByRole(req.user.role);
    const hasGuestPerm = req.user.role === 'admin' || (userPerms && userPerms.canCreateGuests);
    if (!hasGuestPerm) {
      const domain = email.split('@')[1].toLowerCase();
      const approvedDomains = allowedEmailDomainsDb.getAll();
      const domainApproved = approvedDomains.some(d => d.domain.toLowerCase() === domain && d.is_active);
      if (!domainApproved) {
        return res.status(403).json({
          success: false,
          error: `Le domaine "${domain}" n'est pas dans la liste des domaines approuvés`
        });
      }
    }

    // Vérifier que le système d'invités est activé
    const guestEnabled = settingsDb.get('enableGuestAccounts');
    if (guestEnabled === 'false') {
      return res.status(403).json({
        success: false,
        error: 'Le système de comptes invités est désactivé'
      });
    }

    // Vérifier s'il existe déjà un compte actif pour cet email
    const existingGuest = guestAccountsDb.getByEmail(email);
    if (existingGuest) {
      return res.status(400).json({
        success: false,
        error: 'Un compte invité actif existe déjà pour cet email'
      });
    }

    // Générer un code de vérification à 6 chiffres
    const codeLength = parseInt(settingsDb.get('guestCodeLength') || '6');
    const verificationCode = Math.floor(Math.random() * Math.pow(10, codeLength))
      .toString()
      .padStart(codeLength, '0');

    // Hasher le code
    const codeHash = await bcrypt.hash(verificationCode, 10);

    // Calculer les dates d'expiration
    const codeExpirationHours = parseInt(settingsDb.get('guestCodeExpirationHours') || '24');
    const defaultDays = parseInt(settingsDb.get('guestAccountExpirationDays') || '3');
    // durationDays: 0 = illimité (soumis à validation admin), sinon 3/7/15/30
    const requestedDays = durationDays !== undefined ? parseInt(durationDays) : defaultDays;
    const isUnlimited = requestedDays === 0;

    // Si illimité, nécessite validation admin → créer en is_active=0 (pending)
    const needsApproval = isUnlimited && req.user.role !== 'admin';
    const accountExpirationDays = isUnlimited ? 365 * 10 : (requestedDays || defaultDays); // 10 ans si illimité

    const now = new Date();
    const codeExpiresAt = new Date(now.getTime() + codeExpirationHours * 60 * 60 * 1000);
    const accountExpiresAt = new Date(now.getTime() + accountExpirationDays * 24 * 60 * 60 * 1000);

    // Créer l'invité
    const guestId = uuidv4();
    // Si needsApproval, créer en is_active=0 + pending_approval=1
    const stmt = db.prepare(`
      INSERT INTO guest_accounts (
        guest_id, email, verification_code, code_hash,
        code_expires_at, account_expires_at, created_by_user_id,
        is_active, pending_approval, is_unlimited
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      guestId, email, verificationCode, codeHash,
      codeExpiresAt.toISOString(), accountExpiresAt.toISOString(),
      req.user.id,
      needsApproval ? 0 : 1,
      needsApproval ? 1 : 0,
      isUnlimited ? 1 : 0
    );

    // Envoyer l'email avec le code + lien vers la page de login invité (sauf si en attente)
    let emailSent = false;
    if (!needsApproval) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      emailSent = await emailService.sendGuestCode(email, verificationCode, codeExpirationHours, baseUrl);
    }

    logOperation('guest_account_created', {
      guestId,
      email,
      createdBy: req.user.username,
      emailSent,
      needsApproval,
      isUnlimited
    });

    res.json({
      success: true,
      needsApproval,
      guest: {
        id: result.lastInsertRowid,
        guestId: guestId,
        email: email,
        codeExpiresAt: codeExpiresAt.toISOString(),
        accountExpiresAt: accountExpiresAt.toISOString(),
        emailSent: emailSent
      },
      message: emailSent
        ? 'Compte invité créé. Le code de vérification a été envoyé par email.'
        : 'Compte invité créé mais l\'email n\'a pas pu être envoyé. Code: ' + verificationCode
    });

  } catch (error) {
    console.error('Erreur création compte invité:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Route POST /api/guest/login - Connexion invité avec code
app.post('/api/guest/login', async (req, res) => {
  try {
    const { email, code } = req.body;

    // Validation
    if (!email || !code) {
      return res.status(400).json({
        success: false,
        error: 'Email et code requis'
      });
    }

    // Trouver l'invité
    const guest = guestAccountsDb.getByEmail(email);
    if (!guest) {
      return res.status(401).json({
        success: false,
        error: 'Email ou code invalide'
      });
    }

    // Vérifier que le compte est actif
    if (!guest.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Compte invité désactivé'
      });
    }

    // Vérifier que le code n'a pas déjà été utilisé
    if (guest.code_used) {
      return res.status(401).json({
        success: false,
        error: 'Ce code a déjà été utilisé. Votre compte est actif, utilisez votre token.'
      });
    }

    // Vérifier que le code n'est pas expiré
    const now = new Date();
    const codeExpiresAt = new Date(guest.code_expires_at);
    if (codeExpiresAt <= now) {
      return res.status(401).json({
        success: false,
        error: 'Code de vérification expiré'
      });
    }

    // Vérifier que le compte n'est pas expiré
    const accountExpiresAt = new Date(guest.account_expires_at);
    if (accountExpiresAt <= now) {
      return res.status(401).json({
        success: false,
        error: 'Compte invité expiré'
      });
    }

    // Vérifier le code avec bcrypt
    const codeValid = await bcrypt.compare(code, guest.code_hash);
    if (!codeValid) {
      return res.status(401).json({
        success: false,
        error: 'Email ou code invalide'
      });
    }

    // Marquer le code comme utilisé
    guestAccountsDb.markCodeUsed(guest.guest_id);

    // Générer un token
    const token = Buffer.from(`guest:${guest.guest_id}:${Date.now()}`).toString('base64');

    logOperation('guest_login', {
      guestId: guest.guest_id,
      email: guest.email
    });

    res.json({
      success: true,
      token,
      guest: {
        id: guest.id,
        guestId: guest.guest_id,
        email: guest.email,
        accountExpiresAt: guest.account_expires_at
      }
    });

  } catch (error) {
    console.error('Erreur login invité:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Route GET /api/admin/guest-accounts - Liste des comptes invités
app.get('/api/admin/guest-accounts', authenticateUser, requirePermission('canCreateGuests'), (req, res) => {
  try {
    let guests;

    // Admin voit tous les invités, com voit uniquement les siens
    if (req.user.role === 'admin') {
      guests = guestAccountsDb.getAll();
    } else {
      guests = guestAccountsDb.getByCreator(req.user.id);
    }

    // Enrichir avec les statistiques
    const now = new Date();
    const enrichedGuests = guests.map(guest => {
      const expiresAt = new Date(guest.account_expires_at);
      const timeRemaining = expiresAt - now;
      const daysRemaining = Math.ceil(timeRemaining / (1000 * 60 * 60 * 24));

      return {
        ...guest,
        isExpired: timeRemaining <= 0,
        daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
        hoursRemaining: Math.ceil(timeRemaining / (1000 * 60 * 60))
      };
    });

    res.json({
      success: true,
      guests: enrichedGuests,
      stats: {
        total: enrichedGuests.length,
        active: enrichedGuests.filter(g => g.is_active && !g.isExpired).length,
        expired: enrichedGuests.filter(g => g.isExpired).length,
        disabled: enrichedGuests.filter(g => !g.is_active).length
      }
    });

  } catch (error) {
    console.error('Erreur liste invités:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Route PUT /api/admin/guest-accounts/:guestId/approve - Approuver un invité illimité en attente
app.put('/api/admin/guest-accounts/:guestId/approve', authenticateUser, requireAdmin, (req, res) => {
  try {
    const { guestId } = req.params;
    const guest = db.prepare('SELECT * FROM guest_accounts WHERE guest_id = ?').get(guestId);
    if (!guest) return res.status(404).json({ success: false, error: 'Invité non trouvé' });
    if (!guest.pending_approval) return res.status(400).json({ success: false, error: 'Cet invité n\'est pas en attente d\'approbation' });

    db.prepare('UPDATE guest_accounts SET is_active = 1, pending_approval = 0 WHERE guest_id = ?').run(guestId);
    logOperation('guest_approved', { guestId, email: guest.email, approvedBy: req.user.username });
    res.json({ success: true, message: 'Invité approuvé' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Route PUT /api/admin/guest-accounts/:guestId/disable - Désactiver un invité
app.put('/api/admin/guest-accounts/:guestId/disable', authenticateUser, requirePermission('canCreateGuests'), (req, res) => {
  try {
    const { guestId } = req.params;

    // Récupérer l'invité
    const guest = guestAccountsDb.getByGuestId(guestId);
    if (!guest) {
      return res.status(404).json({
        success: false,
        error: 'Compte invité introuvable'
      });
    }

    // Vérifier les permissions (com ne peut désactiver que ses propres invités)
    if (req.user.role === 'com' && guest.created_by_user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Vous ne pouvez désactiver que vos propres invités'
      });
    }

    // Désactiver l'invité
    guestAccountsDb.disable(guestId, req.user.id);

    logOperation('guest_account_disabled', {
      guestId,
      email: guest.email,
      disabledBy: req.user.username
    });

    res.json({
      success: true,
      message: 'Compte invité désactivé'
    });

  } catch (error) {
    console.error('Erreur désactivation invité:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Route DELETE /api/admin/guest-accounts/:guestId - Supprimer un invité et ses fichiers
app.delete('/api/admin/guest-accounts/:guestId', authenticateUser, requirePermission('canCreateGuests'), async (req, res) => {
  try {
    const { guestId } = req.params;

    // Récupérer l'invité (incluant les désactivés)
    const guest = guestAccountsDb.getByGuestIdIncludingInactive(guestId);
    if (!guest) {
      return res.status(404).json({
        success: false,
        error: 'Compte invité introuvable'
      });
    }

    // Vérifier les permissions (com ne peut supprimer que ses propres invités)
    if (req.user.role === 'com' && guest.created_by_user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Vous ne pouvez supprimer que vos propres invités'
      });
    }

    // Récupérer tous les fichiers de l'invité
    const files = fileOwnershipDb.getByGuest(guest.id);

    // Supprimer les fichiers d'Azure Blob Storage
    const containerClient = blobServiceClient.getContainerClient(containerName);
    let deletedFiles = 0;
    let errors = [];

    for (const file of files) {
      try {
        const blockBlobClient = containerClient.getBlockBlobClient(file.blob_name);
        await blockBlobClient.delete();
        fileOwnershipDb.delete(file.blob_name);
        deletedFiles++;
      } catch (error) {
        console.error(`Erreur suppression fichier ${file.blob_name}:`, error);
        errors.push(file.blob_name);
      }
    }

    // Supprimer le compte invité
    guestAccountsDb.delete(guestId);

    logOperation('guest_account_deleted', {
      guestId,
      email: guest.email,
      deletedBy: req.user.username,
      filesDeleted: deletedFiles,
      errors: errors.length
    });

    res.json({
      success: true,
      message: 'Compte invité et fichiers supprimés',
      stats: {
        filesDeleted: deletedFiles,
        errors: errors.length
      }
    });

  } catch (error) {
    console.error('Erreur suppression invité:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
});

// Route GET /api/user/my-guests - Récupérer les invités créés par l'utilisateur courant
app.get('/api/user/my-guests', authenticateUser, (req, res) => {
  try {
    const guests = db.prepare(`
      SELECT id, guest_id, email, verification_code, code_used, is_active,
             code_expires_at, account_expires_at, created_at,
             pending_approval, is_unlimited
      FROM guest_accounts
      WHERE created_by_user_id = ?
      ORDER BY created_at DESC
    `).all(req.user.id);

    res.json({ success: true, guests });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Route DELETE /api/user/my-guests/:id - Supprimer un invité créé par l'utilisateur courant
app.delete('/api/user/my-guests/:id', authenticateUser, async (req, res) => {
  try {
    const guest = db.prepare('SELECT * FROM guest_accounts WHERE id = ?').get(req.params.id);
    if (!guest) return res.status(404).json({ success: false, error: 'Invité non trouvé' });
    if (guest.created_by_user_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Vous ne pouvez supprimer que vos propres invités' });
    }
    db.prepare('DELETE FROM guest_accounts WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: `Invité ${guest.email} supprimé` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Route GET /api/user/files - Récupérer les fichiers de l'utilisateur
app.get('/api/user/files', async (req, res) => {
  try {
    // Vérifier l'authentification
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    // Décoder et vérifier le token
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    if (parts[0] !== 'user') {
      return res.status(401).json({ error: 'Token invalide' });
    }

    const folderPath = req.query.path || '';
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const files = [];
    const folders = new Set();
    
    // Lister les blobs avec le préfixe du dossier
    const listOptions = folderPath ? { prefix: folderPath } : {};
    
    for await (const blob of containerClient.listBlobsFlat(listOptions)) {
      // Ignorer si le blob est dans un sous-dossier
      const relativePath = folderPath ? blob.name.substring(folderPath.length) : blob.name;
      const pathParts = relativePath.split('/');
      
      if (pathParts.length === 1 && pathParts[0]) {
        // Fichier à la racine du dossier courant
        const blockBlobClient = containerClient.getBlockBlobClient(blob.name);
        const properties = await blockBlobClient.getProperties();
        
        files.push({
          name: blob.name,
          displayName: pathParts[0],
          originalName: properties.metadata?.originalName || pathParts[0],
          size: blob.properties.contentLength,
          contentType: blob.properties.contentType,
          lastModified: blob.properties.lastModified.toISOString(),
          url: blockBlobClient.url,
          isFolder: false
        });
      } else if (pathParts.length > 1 && pathParts[0]) {
        // Sous-dossier
        folders.add(pathParts[0]);
      }
    }

    // Convertir les dossiers en entrées
    const folderEntries = Array.from(folders).map(folderName => ({
      name: folderPath ? `${folderPath}${folderName}/` : `${folderName}/`,
      displayName: folderName,
      isFolder: true,
      size: 0,
      contentType: 'folder',
      lastModified: new Date().toISOString()
    }));

    // Combiner fichiers et dossiers, trier
    const allItems = [...folderEntries, ...files].sort((a, b) => {
      // Dossiers en premier
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      // Puis par nom
      return (a.displayName || a.originalName || '').localeCompare(b.displayName || b.originalName || '');
    });

    res.json({
      success: true,
      files: allItems,
      currentPath: folderPath
    });

  } catch (error) {
    console.error('Erreur récupération fichiers utilisateur:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route POST /api/user/folders/create - Créer un dossier
app.post('/api/user/folders/create', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    if (parts[0] !== 'user') {
      return res.status(401).json({ error: 'Token invalide' });
    }

    const { folderName, parentPath = '' } = req.body;
    
    if (!folderName || folderName.includes('/')) {
      return res.status(400).json({ error: 'Nom de dossier invalide' });
    }

    const folderPath = parentPath ? `${parentPath}${folderName}/` : `${folderName}/`;
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // Vérifier si le dossier existe déjà
    const listOptions = { prefix: folderPath };
    let exists = false;
    for await (const blob of containerClient.listBlobsFlat(listOptions)) {
      exists = true;
      break;
    }

    // Créer un blob vide pour représenter le dossier (Azure n'a pas de vrais dossiers)
    // On crée un blob avec un nom qui se termine par "/"
    const blockBlobClient = containerClient.getBlockBlobClient(folderPath);
    
    // Vérifier si un blob avec ce nom existe déjà
    try {
      await blockBlobClient.getProperties();
      exists = true;
    } catch (e) {
      // Le blob n'existe pas, on peut le créer
    }

    if (!exists) {
      await blockBlobClient.upload('', 0, {
        blobHTTPHeaders: {
          blobContentType: 'application/x-directory'
        },
        metadata: {
          isFolder: 'true',
          folderName: folderName,
          createdAt: new Date().toISOString()
        }
      });
    }

    logOperation('folder_created', { folderPath, folderName });

    res.json({
      success: true,
      folderPath,
      folderName,
      message: 'Dossier créé avec succès'
    });

  } catch (error) {
    console.error('Erreur création dossier:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route PUT /api/user/files/rename - Renommer un fichier ou dossier
app.put('/api/user/files/rename', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    if (parts[0] !== 'user') {
      return res.status(401).json({ error: 'Token invalide' });
    }

    const { oldPath, newName } = req.body;
    
    if (!oldPath || !newName || newName.includes('/')) {
      return res.status(400).json({ error: 'Paramètres invalides' });
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Construire le nouveau chemin
    const isFolder = oldPath.endsWith('/');
    // Pour un dossier "photos/", split donne ["photos", ""] — on retire le vide final
    const pathParts = oldPath.split('/').filter(p => p);
    pathParts[pathParts.length - 1] = newName;
    const newPath = pathParts.join('/') + (isFolder ? '/' : '');

    if (isFolder) {
      // C'est un dossier — oldPath et newPath ont deja un trailing /
      const oldFolderPath = oldPath;
      const newFolderPath = newPath;
      
      // Renommer tous les blobs qui commencent par oldFolderPath
      const blobsToRename = [];
      for await (const blob of containerClient.listBlobsFlat({ prefix: oldFolderPath })) {
        blobsToRename.push(blob.name);
      }
      
      for (const blobName of blobsToRename) {
        const newBlobName = blobName.replace(oldFolderPath, newFolderPath);
        const sourceClient = containerClient.getBlockBlobClient(blobName);
        const destClient = containerClient.getBlockBlobClient(newBlobName);
        
        // Télécharger puis uploader
        const downloadResponse = await sourceClient.download();
        const buffer = await streamToBuffer(downloadResponse.readableStreamBody);
        const properties = await sourceClient.getProperties();
        
        await destClient.uploadData(buffer, {
          blobHTTPHeaders: { blobContentType: properties.contentType },
          metadata: properties.metadata
        });
        await sourceClient.delete();
      }
    } else {
      // C'est un fichier
      const sourceClient = containerClient.getBlockBlobClient(oldPath);
      const destClient = containerClient.getBlockBlobClient(newPath);
      
      // Télécharger puis uploader
      const downloadResponse = await sourceClient.download();
      const buffer = await streamToBuffer(downloadResponse.readableStreamBody);
      const properties = await sourceClient.getProperties();
      
      // Mettre à jour les métadonnées
      const metadata = { ...properties.metadata };
      metadata.originalName = newName;
      
      await destClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: properties.contentType },
        metadata: metadata
      });
      
      await sourceClient.delete();
    }

    logOperation('file_renamed', { oldPath, newPath });

    res.json({
      success: true,
      oldPath,
      newPath,
      message: 'Renommé avec succès'
    });

  } catch (error) {
    console.error('Erreur renommage:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route PUT /api/user/files/move - Déplacer un fichier ou dossier
app.put('/api/user/files/move', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    if (parts[0] !== 'user') {
      return res.status(401).json({ error: 'Token invalide' });
    }

    const { sourcePath, destinationPath } = req.body;
    
    if (!sourcePath || !destinationPath) {
      return res.status(400).json({ error: 'Paramètres invalides' });
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    if (sourcePath.endsWith('/')) {
      // C'est un dossier
      const sourceFolderPath = sourcePath;
      const destFolderPath = destinationPath.endsWith('/') ? destinationPath : destinationPath + '/';
      
      // Extraire le nom du dossier source
      const sourceFolderName = sourcePath.split('/').filter(p => p).pop() || '';
      const newFolderPath = destFolderPath + sourceFolderName + '/';
      
      // Déplacer tous les blobs qui commencent par sourceFolderPath
      const blobsToMove = [];
      for await (const blob of containerClient.listBlobsFlat({ prefix: sourceFolderPath })) {
        blobsToMove.push(blob.name);
      }
      
      for (const blobName of blobsToMove) {
        const newBlobName = blobName.replace(sourceFolderPath, newFolderPath);
        const sourceClient = containerClient.getBlockBlobClient(blobName);
        const destClient = containerClient.getBlockBlobClient(newBlobName);
        
        // Télécharger puis uploader
        const downloadResponse = await sourceClient.download();
        const buffer = await streamToBuffer(downloadResponse.readableStreamBody);
        const properties = await sourceClient.getProperties();
        
        await destClient.uploadData(buffer, {
          blobHTTPHeaders: { blobContentType: properties.contentType },
          metadata: properties.metadata
        });
        await sourceClient.delete();
      }
    } else {
      // C'est un fichier
      const fileName = sourcePath.split('/').pop();
      const newPath = destinationPath.endsWith('/') ? destinationPath + fileName : destinationPath;
      
      const sourceClient = containerClient.getBlockBlobClient(sourcePath);
      const destClient = containerClient.getBlockBlobClient(newPath);
      
      // Télécharger puis uploader
      const downloadResponse = await sourceClient.download();
      const buffer = await streamToBuffer(downloadResponse.readableStreamBody);
      const properties = await sourceClient.getProperties();
      
      await destClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: properties.contentType },
        metadata: properties.metadata
      });
      await sourceClient.delete();
    }

    logOperation('file_moved', { sourcePath, destinationPath });

    res.json({
      success: true,
      sourcePath,
      destinationPath,
      message: 'Déplacé avec succès'
    });

  } catch (error) {
    console.error('Erreur déplacement:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Corbeille (Trash) Routes
// ============================================

// PUT /api/files/trash - Mettre un fichier en corbeille (soft delete + tier Archive)
app.put('/api/files/trash', authenticateUser, async (req, res) => {
  try {
    const { blobName } = req.body;
    if (!blobName) return res.status(400).json({ success: false, error: 'blobName requis' });

    // Vérifier propriété
    let file = db.prepare('SELECT * FROM file_ownership WHERE blob_name = ?').get(blobName);
    
    // Si pas trouvé dans file_ownership, créer une entrée (fichier listé depuis Azure directement)
    if (!file) {
      // Vérifier que le blob existe sur Azure
      try {
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        const exists = await blockBlobClient.exists();
        if (!exists) return res.status(404).json({ success: false, error: 'Fichier non trouvé' });
        
        // Créer l'entrée file_ownership
        const properties = await blockBlobClient.getProperties();
        db.prepare(`INSERT INTO file_ownership (blob_name, original_name, content_type, file_size, uploaded_by_user_id, uploaded_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))`).run(
          blobName, blobName.split('/').pop(), properties.contentType, properties.contentLength, req.user.id
        );
        file = db.prepare('SELECT * FROM file_ownership WHERE blob_name = ?').get(blobName);
      } catch (e) {
        return res.status(404).json({ success: false, error: 'Fichier non trouvé sur Azure' });
      }
    }

    // Vérifier que l'user a le droit (propriétaire, team member, ou admin)
    const isOwner = file.uploaded_by_user_id === req.user.id;
    const isTeamMember = file.team_id && teamMembersDb.getByTeamAndUser(file.team_id, req.user.id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isTeamMember && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Non autorisé' });
    }

    // Soft delete
    fileOwnershipDb.trash(blobName, req.user.id);

    // Passer le blob en tier Archive sur Azure
    try {
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.setAccessTier('Archive');
    } catch (tierErr) {
      console.error('Erreur changement tier Archive:', tierErr.message);
    }

    logOperation('file_trashed', { blobName, username: req.user.username, trashedBy: req.user.username, teamId: file.team_id });
    res.json({ success: true, message: 'Fichier mis en corbeille' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/files/trash - Lister les fichiers en corbeille
app.get('/api/files/trash', authenticateUser, async (req, res) => {
  try {
    const { teamId } = req.query;
    const files = fileOwnershipDb.getTrashed(req.user.id, teamId ? parseInt(teamId) : null);
    res.json({ success: true, files });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/files/restore - Restaurer un fichier de la corbeille
app.put('/api/files/restore', authenticateUser, async (req, res) => {
  try {
    const { blobName } = req.body;
    if (!blobName) return res.status(400).json({ success: false, error: 'blobName requis' });

    const file = db.prepare('SELECT * FROM file_ownership WHERE blob_name = ? AND is_trashed = 1').get(blobName);
    if (!file) return res.status(404).json({ success: false, error: 'Fichier non trouvé dans la corbeille' });

    const isOwner = file.uploaded_by_user_id === req.user.id;
    const isTeamMember = file.team_id && teamMembersDb.getByTeamAndUser(file.team_id, req.user.id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isTeamMember && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Non autorisé' });
    }

    fileOwnershipDb.restore(blobName);

    // Remettre en Hot tier
    try {
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.setAccessTier('Hot');
    } catch (tierErr) {
      console.error('Erreur changement tier Hot:', tierErr.message);
      // Archive → Hot peut prendre du temps (réhydratation)
    }

    logOperation('file_restored', { blobName, username: req.user.username, restoredBy: req.user.username });
    res.json({ success: true, message: 'Fichier restauré (la réhydratation depuis Archive peut prendre quelques heures)' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/files/trash/restore-all - Restaurer tous les fichiers de la corbeille
app.put('/api/files/trash/restore-all', authenticateUser, async (req, res) => {
  try {
    const { teamId } = req.body;
    const files = fileOwnershipDb.getTrashed(req.user.id, teamId ? parseInt(teamId) : null);

    const containerClient = blobServiceClient.getContainerClient(containerName);
    let restored = 0;
    for (const file of files) {
      try {
        fileOwnershipDb.restore(file.blob_name);
        const blockBlobClient = containerClient.getBlockBlobClient(file.blob_name);
        await blockBlobClient.setAccessTier('Hot').catch(() => {});
        restored++;
      } catch (e) { console.error('Restore error:', file.blob_name, e.message); }
    }

    logOperation('trash_restore_all', { username: req.user.username, count: restored, teamId });
    res.json({ success: true, message: `${restored} fichier(s) restauré(s). La réhydratation depuis Archive peut prendre quelques heures.` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/files/trash/empty - Vider la corbeille (suppression définitive)
app.delete('/api/files/trash/empty', authenticateUser, async (req, res) => {
  try {
    const { teamId } = req.query;
    const files = fileOwnershipDb.getTrashed(req.user.id, teamId ? parseInt(teamId) : null);

    const containerClient = blobServiceClient.getContainerClient(containerName);
    let deleted = 0;
    for (const file of files) {
      try {
        const blockBlobClient = containerClient.getBlockBlobClient(file.blob_name);
        await blockBlobClient.deleteIfExists();
        fileOwnershipDb.delete(file.blob_name);
        deleted++;
      } catch (e) { console.error('Erreur suppression blob:', file.blob_name, e.message); }
    }

    logOperation('trash_emptied', { count: deleted, by: req.user.username, teamId });
    res.json({ success: true, message: `${deleted} fichier(s) supprimé(s) définitivement` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Route DELETE /api/user/files - Supprimer un fichier ou dossier
app.delete('/api/user/files', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    if (parts[0] !== 'user') {
      return res.status(401).json({ error: 'Token invalide' });
    }

    const { path } = req.body;
    
    if (!path) {
      return res.status(400).json({ error: 'Chemin manquant' });
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    if (path.endsWith('/')) {
      // C'est un dossier - supprimer tous les blobs qui commencent par ce préfixe
      const blobsToDelete = [];
      for await (const blob of containerClient.listBlobsFlat({ prefix: path })) {
        blobsToDelete.push(blob.name);
      }
      
      for (const blobName of blobsToDelete) {
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        await blockBlobClient.delete();
      }
      
      // Supprimer aussi le blob qui représente le dossier lui-même
      const folderBlobClient = containerClient.getBlockBlobClient(path);
      try {
        await folderBlobClient.delete();
      } catch (e) {
        // Le blob dossier n'existe peut-être pas, ce n'est pas grave
      }
    } else {
      // C'est un fichier
      const blockBlobClient = containerClient.getBlockBlobClient(path);
      await blockBlobClient.delete();
    }

    logOperation('file_deleted', { path });

    res.json({
      success: true,
      message: 'Supprimé avec succès'
    });

  } catch (error) {
    console.error('Erreur suppression:', error);
    logOperation('delete_error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Route GET /api/user/share-links - Récupérer les liens de partage de l'utilisateur
app.get('/api/user/share-links', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    if (parts[0] !== 'user') {
      return res.status(401).json({ error: 'Token invalide' });
    }
    
    const username = parts[2];
    
    // Récupérer tous les liens de l'utilisateur
    const links = shareLinksDb.getAllByUser(username, 100);
    
    // Calculer les coûts pour chaque lien
    const STORAGE_COST_PER_GB_PER_MONTH = 0.018; // €/GB/mois (d'après ARCHITECTURE.md)
    const EGRESS_COST_PER_GB = 0.08; // €/GB (d'après ARCHITECTURE.md : 500 GB = 40 €)
    
    const enrichedLinks = links.map(link => {
      const now = new Date();
      const createdAt = new Date(link.created_at);
      const expiresAt = new Date(link.expires_at);
      const isExpired = now > expiresAt;
      
      // Calculer la durée de vie du lien (en jours)
      const lifetimeDays = (expiresAt - createdAt) / (1000 * 60 * 60 * 24);
      
      // Coût de stockage (basé sur la taille du fichier et la durée de stockage)
      // Note: Le fichier est déjà stocké dans Azure, donc on calcule seulement le coût théorique
      // du stockage pendant la durée de vie du lien
      const fileSizeGB = (link.file_size || 0) / (1024 * 1024 * 1024);
      const storageCost = fileSizeGB * STORAGE_COST_PER_GB_PER_MONTH * (lifetimeDays / 30);
      
      // Coût de l'egress (basé sur le nombre de téléchargements et la taille du fichier)
      const downloadCount = link.download_count || 0;
      const egressCost = fileSizeGB * downloadCount * EGRESS_COST_PER_GB;
      
      // Coût total
      const totalCost = storageCost + egressCost;
      
      return {
        ...link,
        isExpired,
        isActive: link.is_active === 1 && !isExpired,
        hasPassword: !!link.password_hash,
        costs: {
          storage: storageCost,
          egress: egressCost,
          total: totalCost
        },
        downloadCount: downloadCount || 0
      };
    });
    
    res.json({
      success: true,
      count: enrichedLinks.length,
      links: enrichedLinks
    });
    
  } catch (error) {
    console.error('Erreur récupération liens:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route DELETE /api/user/share-links/:linkId - Supprimer un lien de partage
app.delete('/api/user/share-links/:linkId', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    if (parts[0] !== 'user') {
      return res.status(401).json({ error: 'Token invalide' });
    }
    
    const username = parts[2];
    const { linkId } = req.params;
    
    // Vérifier que le lien existe et appartient à l'utilisateur
    const link = shareLinksDb.getByLinkId(linkId);
    if (!link) {
      // Si le lien n'est pas actif, chercher quand même
      const allLinks = shareLinksDb.getAllByUser(username, 1000);
      const userLink = allLinks.find(l => l.link_id === linkId);
      
      if (!userLink) {
        return res.status(404).json({ error: 'Lien non trouvé' });
      }
      
      // Le lien existe mais n'est pas actif, on peut quand même le supprimer
      shareLinksDb.delete(linkId);
      
      return res.json({
        success: true,
        message: 'Lien supprimé avec succès'
      });
    }
    
    // Vérifier que le lien appartient à l'utilisateur
    if (link.created_by !== username) {
      return res.status(403).json({ error: 'Vous n\'avez pas le droit de supprimer ce lien' });
    }
    
    // Supprimer le lien
    shareLinksDb.delete(linkId);
    
    logOperation('share_link_deleted', { linkId, username });
    
    res.json({
      success: true,
      message: 'Lien supprimé avec succès'
    });
    
  } catch (error) {
    console.error('Erreur suppression lien:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// API ADMIN - GESTION DES UTILISATEURS
// ============================================================================

// Middleware pour vérifier si l'utilisateur est admin
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Accès réservé aux administrateurs'
    });
  }
  next();
}

// Route GET /api/admin/users - Lister tous les utilisateurs avec leurs équipes
app.get('/api/admin/users', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const users = usersDb.getAll();
    const enriched = users.map(user => {
      const memberships = teamMembersDb.getByUser(user.id);
      return {
        ...user,
        teams: memberships.map(m => ({
          teamId: m.team_id,
          name: m.name,
          displayName: m.display_name,
          role: m.role
        }))
      };
    });
    res.json({ success: true, users: enriched });
  } catch (error) {
    console.error('Erreur liste utilisateurs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route POST /api/admin/users - Créer un utilisateur
app.post('/api/admin/users', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { username, password, email, fullName, role } = req.body;
    const actor = req.user.username;

    if (!username || !password) {
      logOperation('user_creation_failed', { targetUsername: username || '?', reason: 'Username ou mot de passe manquant', username: actor });
      return res.status(400).json({ success: false, error: 'Username et mot de passe requis' });
    }
    if (!email) {
      logOperation('user_creation_failed', { targetUsername: username, reason: 'Email manquant', username: actor });
      return res.status(400).json({ success: false, error: 'Email requis' });
    }

    // Vérifier unicité username
    const existingUser = usersDb.getByUsername(username);
    if (existingUser) {
      logOperation('user_creation_failed', { targetUsername: username, reason: 'Username deja utilise', username: actor });
      return res.status(400).json({ success: false, error: 'Ce username existe déjà' });
    }

    // Vérifier unicité email
    const existingEmail = usersDb.getByEmail(email);
    if (existingEmail) {
      logOperation('user_creation_failed', { targetUsername: username, reason: `Email "${email}" deja utilise`, username: actor });
      return res.status(400).json({ success: false, error: 'Cet email est déjà utilisé' });
    }

    // Vérifier que le domaine de l'email est autorisé
    const activeDomains = allowedEmailDomainsDb.getAllActive();
    if (activeDomains.length > 0 && !allowedEmailDomainsDb.isAllowed(email)) {
      const domain = email.split('@')[1];
      logOperation('user_creation_failed', { targetUsername: username, reason: `Domaine "${domain}" non autorise`, username: actor });
      return res.status(403).json({
        success: false,
        error: `Le domaine "${domain}" n'est pas autorisé. Ajoutez-le dans la liste des domaines autorisés avant de créer cet utilisateur.`
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    usersDb.create({
      username,
      email,
      passwordHash,
      role: role || 'user',
      fullName: fullName || null
    });

    const created = usersDb.getByUsername(username);
    logOperation('user_created', { targetUsername: username, role: role || 'user', email, username: actor });

    res.status(201).json({ success: true, user: created });
  } catch (error) {
    console.error('Erreur création utilisateur:', error);
    logOperation('user_creation_failed', { targetUsername: req.body?.username || '?', reason: error.message, username: req.user?.username });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route PUT /api/admin/users/:id - Modifier un utilisateur (role, nom)
app.put('/api/admin/users/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const user = usersDb.getAll().find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }

    const { role, fullName } = req.body;
    const actor = req.user.username;

    if (role && role !== user.role) {
      // Empêcher de retirer le rôle admin à soi-même
      if (userId === req.user.id && role !== 'admin') {
        return res.status(400).json({ success: false, error: 'Vous ne pouvez pas changer votre propre rôle' });
      }
      usersDb.updateRole(userId, role);
      logOperation('user_role_changed', { targetUsername: user.username, oldRole: user.role, newRole: role, username: actor });
    }

    if (fullName !== undefined && fullName !== user.full_name) {
      usersDb.updateFullName(userId, fullName);
    }

    const updated = usersDb.getAll().find(u => u.id === userId);
    res.json({ success: true, user: updated });
  } catch (error) {
    console.error('Erreur modification utilisateur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route PUT /api/admin/users/:id/activate - Réactiver un utilisateur
app.put('/api/admin/users/:id/activate', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const user = usersDb.getAll().find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }

    usersDb.activate(userId);
    logOperation('user_activated', { targetUsername: user.username, username: req.user.username });

    res.json({ success: true, message: 'Utilisateur réactivé' });
  } catch (error) {
    console.error('Erreur réactivation utilisateur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route PUT /api/admin/users/:id/password - Réinitialiser le mot de passe
app.put('/api/admin/users/:id/password', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    const { password } = req.body;
    if (!password || password.length < 4) {
      return res.status(400).json({ success: false, error: 'Mot de passe requis (min. 4 caractères)' });
    }

    const user = usersDb.getAll().find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    usersDb.updatePassword(userId, passwordHash);
    logOperation('user_password_reset', { targetUsername: user.username, username: req.user.username });

    res.json({ success: true, message: 'Mot de passe réinitialisé' });
  } catch (error) {
    console.error('Erreur réinitialisation mot de passe:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route DELETE /api/admin/users/:id - Désactiver un utilisateur (soft-delete)
app.delete('/api/admin/users/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    // Empêcher un admin de se supprimer lui-même
    if (userId === req.user.id) {
      return res.status(400).json({ success: false, error: 'Vous ne pouvez pas supprimer votre propre compte' });
    }

    const user = usersDb.getAll().find(u => u.id === userId);
    usersDb.deactivate(userId);
    logOperation('user_deactivated', { targetUsername: user?.username || `id:${userId}`, username: req.user.username });

    res.json({ success: true, message: 'Utilisateur désactivé' });
  } catch (error) {
    console.error('Erreur désactivation utilisateur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route DELETE /api/admin/users/:id/permanent - Supprimer définitivement un utilisateur
app.delete('/api/admin/users/:id/permanent', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'ID invalide' });
    }

    if (userId === req.user.id) {
      return res.status(400).json({ success: false, error: 'Vous ne pouvez pas supprimer votre propre compte' });
    }

    const user = usersDb.getAll().find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Utilisateur non trouvé' });
    }

    // Retirer des équipes
    const memberships = teamMembersDb.getByUser(userId);
    for (const m of memberships) {
      teamMembersDb.remove(m.team_id, userId);
    }

    usersDb.delete(userId);
    logOperation('user_deleted', { targetUsername: user.username, username: req.user.username });

    res.json({ success: true, message: 'Utilisateur supprimé définitivement' });
  } catch (error) {
    console.error('Erreur suppression utilisateur:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// API ÉQUIPES (TEAMS)
// ============================================================================

// Route POST /api/teams - Créer une équipe (admin uniquement)
app.post('/api/teams', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { name, displayName, description } = req.body;

    if (!name || !displayName) {
      return res.status(400).json({
        success: false,
        error: 'Le nom et le nom d\'affichage sont requis'
      });
    }

    // Vérifier que le nom est unique
    const existingTeam = teamsDb.getAll().find(t => t.name === name);
    if (existingTeam) {
      return res.status(400).json({
        success: false,
        error: 'Une équipe avec ce nom existe déjà'
      });
    }

    // Créer l'équipe avec un ID temporaire pour le préfixe
    const result = teamsDb.create({
      name,
      displayName,
      description,
      storagePrefix: `teams/temp/`, // Sera mis à jour après
      createdByUserId: req.user.id
    });

    // Mettre à jour le préfixe avec l'ID réel
    const teamId = result.lastInsertRowid;
    const storagePrefix = `teams/${teamId}/`;
    teamsDb.updateStoragePrefix(teamId, storagePrefix);

    // Ajouter le créateur comme owner
    teamMembersDb.create({
      teamId,
      userId: req.user.id,
      role: 'owner',
      addedByUserId: req.user.id
    });

    const team = teamsDb.getById(teamId);

    res.json({
      success: true,
      message: 'Équipe créée avec succès',
      team
    });

  } catch (error) {
    console.error('Erreur création équipe:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route GET /api/teams - Lister les équipes
app.get('/api/teams', authenticateUser, async (req, res) => {
  try {
    let teams;

    if (req.user.role === 'admin') {
      // Admin voit toutes les équipes
      teams = teamsDb.getAll();
    } else {
      // Utilisateur voit uniquement ses équipes
      teams = teamsDb.getByMember(req.user.id);
    }

    // Ajouter les stats pour chaque équipe
    const teamsWithStats = teams.map(team => ({
      ...team,
      stats: teamsDb.getStats(team.id)
    }));

    res.json({
      success: true,
      teams: teamsWithStats
    });

  } catch (error) {
    console.error('Erreur liste équipes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route GET /api/teams/:teamId - Détails d'une équipe
app.get('/api/teams/:teamId', authenticateUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const team = teamsDb.getById(teamId);

    if (!team) {
      return res.status(404).json({
        success: false,
        error: 'Équipe non trouvée'
      });
    }

    // Vérifier les permissions
    const membership = teamMembersDb.getByTeamAndUser(teamId, req.user.id);
    if (!membership && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Vous n\'êtes pas membre de cette équipe'
      });
    }

    // Récupérer les membres et les stats
    const members = teamMembersDb.getByTeam(teamId);
    const stats = teamsDb.getStats(teamId);

    res.json({
      success: true,
      team: {
        ...team,
        members,
        stats
      }
    });

  } catch (error) {
    console.error('Erreur détails équipe:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route PUT /api/teams/:teamId - Modifier une équipe (admin ou owner)
app.put('/api/teams/:teamId', authenticateUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const { displayName, description } = req.body;

    const team = teamsDb.getById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        error: 'Équipe non trouvée'
      });
    }

    // Vérifier les permissions (admin ou owner)
    const membership = teamMembersDb.getByTeamAndUser(teamId, req.user.id);
    if (req.user.role !== 'admin' && (!membership || membership.role !== 'owner')) {
      return res.status(403).json({
        success: false,
        error: 'Seuls les owners et admins peuvent modifier l\'équipe'
      });
    }

    teamsDb.update(teamId, { displayName, description });
    const updatedTeam = teamsDb.getById(teamId);

    res.json({
      success: true,
      message: 'Équipe mise à jour avec succès',
      team: updatedTeam
    });

  } catch (error) {
    console.error('Erreur mise à jour équipe:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route DELETE /api/teams/:teamId - Supprimer une équipe (admin uniquement)
app.delete('/api/teams/:teamId', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const team = teamsDb.getById(teamId);

    if (!team) {
      return res.status(404).json({
        success: false,
        error: 'Équipe non trouvée'
      });
    }

    // Soft delete
    teamsDb.softDelete(teamId);

    res.json({
      success: true,
      message: 'Équipe supprimée avec succès'
    });

  } catch (error) {
    console.error('Erreur suppression équipe:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// API MEMBRES D'ÉQUIPES
// ============================================================================

// Route POST /api/teams/:teamId/members - Ajouter un membre (admin ou owner)
app.post('/api/teams/:teamId/members', authenticateUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const { userId, role } = req.body;

    if (!userId || !role) {
      return res.status(400).json({
        success: false,
        error: 'userId et role sont requis'
      });
    }

    if (!['owner', 'member', 'viewer'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Rôle invalide. Valeurs possibles: owner, member, viewer'
      });
    }

    const team = teamsDb.getById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        error: 'Équipe non trouvée'
      });
    }

    // Vérifier les permissions
    const membership = teamMembersDb.getByTeamAndUser(teamId, req.user.id);
    if (req.user.role !== 'admin' && (!membership || membership.role !== 'owner')) {
      return res.status(403).json({
        success: false,
        error: 'Seuls les owners et admins peuvent ajouter des membres'
      });
    }

    // Vérifier que l'utilisateur existe
    const userToAdd = usersDb.getById(userId);
    if (!userToAdd) {
      return res.status(404).json({
        success: false,
        error: 'Utilisateur non trouvé'
      });
    }

    // Vérifier si déjà membre
    const existingMembership = teamMembersDb.getByTeamAndUser(teamId, userId);
    if (existingMembership) {
      return res.status(400).json({
        success: false,
        error: 'Cet utilisateur est déjà membre de l\'équipe'
      });
    }

    // Ajouter le membre
    teamMembersDb.create({
      teamId,
      userId,
      role,
      addedByUserId: req.user.id
    });

    const members = teamMembersDb.getByTeam(teamId);

    res.json({
      success: true,
      message: 'Membre ajouté avec succès',
      members
    });

  } catch (error) {
    console.error('Erreur ajout membre:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route GET /api/teams/:teamId/members - Lister les membres
app.get('/api/teams/:teamId/members', authenticateUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const team = teamsDb.getById(teamId);

    if (!team) {
      return res.status(404).json({
        success: false,
        error: 'Équipe non trouvée'
      });
    }

    // Vérifier les permissions
    const membership = teamMembersDb.getByTeamAndUser(teamId, req.user.id);
    if (!membership && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Vous n\'êtes pas membre de cette équipe'
      });
    }

    const members = teamMembersDb.getByTeam(teamId);

    res.json({
      success: true,
      members
    });

  } catch (error) {
    console.error('Erreur liste membres:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route PUT /api/teams/:teamId/members/:userId - Changer le rôle d'un membre
app.put('/api/teams/:teamId/members/:userId', authenticateUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const userId = parseInt(req.params.userId);
    const { role } = req.body;

    if (!role || !['owner', 'member', 'viewer'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Rôle invalide. Valeurs possibles: owner, member, viewer'
      });
    }

    const team = teamsDb.getById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        error: 'Équipe non trouvée'
      });
    }

    // Vérifier les permissions
    const membership = teamMembersDb.getByTeamAndUser(teamId, req.user.id);
    if (req.user.role !== 'admin' && (!membership || membership.role !== 'owner')) {
      return res.status(403).json({
        success: false,
        error: 'Seuls les owners et admins peuvent modifier les rôles'
      });
    }

    // Mettre à jour le rôle
    teamMembersDb.updateRole(teamId, userId, role);

    const members = teamMembersDb.getByTeam(teamId);

    res.json({
      success: true,
      message: 'Rôle mis à jour avec succès',
      members
    });

  } catch (error) {
    console.error('Erreur mise à jour rôle:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route DELETE /api/teams/:teamId/members/:userId - Retirer un membre
app.delete('/api/teams/:teamId/members/:userId', authenticateUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const userId = parseInt(req.params.userId);

    const team = teamsDb.getById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        error: 'Équipe non trouvée'
      });
    }

    // Vérifier les permissions
    const membership = teamMembersDb.getByTeamAndUser(teamId, req.user.id);
    if (req.user.role !== 'admin' && (!membership || membership.role !== 'owner')) {
      return res.status(403).json({
        success: false,
        error: 'Seuls les owners et admins peuvent retirer des membres'
      });
    }

    // Empêcher de retirer le dernier owner
    const owners = teamMembersDb.getOwners(teamId);
    const memberToRemove = teamMembersDb.getByTeamAndUser(teamId, userId);

    if (memberToRemove && memberToRemove.role === 'owner' && owners.length === 1) {
      return res.status(400).json({
        success: false,
        error: 'Impossible de retirer le dernier owner de l\'équipe'
      });
    }

    // Retirer le membre
    teamMembersDb.remove(teamId, userId);

    const members = teamMembersDb.getByTeam(teamId);

    res.json({
      success: true,
      message: 'Membre retiré avec succès',
      members
    });

  } catch (error) {
    console.error('Erreur retrait membre:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// API FINOPS UTILISATEUR
// ============================================================================

// Tarifs Azure France Central (€/Go/mois)
const TIER_COSTS = {
  Hot: 0.0184,
  Cool: 0.01,
  Archive: 0.00099
};
const EGRESS_COST_PER_GB = 0.087;
const READ_OP_COST = { Hot: 0.0044 / 10000, Cool: 0.01 / 10000, Archive: 0.05 / 1000 };
const WRITE_OP_COST = { Hot: 0.055 / 10000, Cool: 0.10 / 10000, Archive: 0.10 / 10000 };
const REHYDRATION_PER_GB = 0.022;

// GET /api/finops/me — FinOps dashboard pour l'utilisateur connecté
app.get('/api/finops/me', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id;
    const username = req.user.username;

    // 1. Fichiers de l'utilisateur avec tiers
    const userFiles = db.prepare(`
      SELECT fo.blob_name, fo.file_size, fo.uploaded_at,
             COALESCE(ft.current_tier, 'Hot') as tier,
             fo.original_name
      FROM file_ownership fo
      LEFT JOIN file_tiers ft ON fo.blob_name = ft.blob_name
      WHERE fo.uploaded_by_user_id = ? AND (fo.is_trashed = 0 OR fo.is_trashed IS NULL)
    `).all(userId);

    // 2. Calculer coûts par tier
    let totalSizeBytes = 0;
    let costByTier = { Hot: { size: 0, count: 0, cost: 0 }, Cool: { size: 0, count: 0, cost: 0 }, Archive: { size: 0, count: 0, cost: 0 } };
    let optimizations = [];

    for (const f of userFiles) {
      const sizeGB = (f.file_size || 0) / (1024 * 1024 * 1024);
      const tier = f.tier || 'Hot';
      totalSizeBytes += (f.file_size || 0);
      if (!costByTier[tier]) costByTier[tier] = { size: 0, count: 0, cost: 0 };
      costByTier[tier].size += (f.file_size || 0);
      costByTier[tier].count++;
      costByTier[tier].cost += sizeGB * TIER_COSTS[tier];

      // Suggestion d'optimisation: fichier Hot > 30 jours → suggérer Cool
      if (tier === 'Hot' && f.uploaded_at) {
        const ageDays = (Date.now() - new Date(f.uploaded_at).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > 30 && (f.file_size || 0) > 1024 * 1024) { // >1MB et >30j
          const currentCost = sizeGB * TIER_COSTS.Hot;
          const coolCost = sizeGB * TIER_COSTS.Cool;
          const archiveCost = sizeGB * TIER_COSTS.Archive;
          optimizations.push({
            blobName: f.blob_name,
            fileName: f.original_name || f.blob_name.split('/').pop(),
            fileSize: f.file_size,
            ageDays: Math.floor(ageDays),
            currentTier: 'Hot',
            currentCostMonth: currentCost,
            suggestions: [
              { tier: 'Cool', costMonth: coolCost, savingMonth: currentCost - coolCost, savingPercent: Math.round((1 - coolCost / currentCost) * 100) },
              { tier: 'Archive', costMonth: archiveCost, savingMonth: currentCost - archiveCost, savingPercent: Math.round((1 - archiveCost / currentCost) * 100) }
            ]
          });
        }
      }
      // Fichier Cool > 90 jours → suggérer Archive
      if (tier === 'Cool' && f.uploaded_at) {
        const ageDays = (Date.now() - new Date(f.uploaded_at).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > 90 && (f.file_size || 0) > 1024 * 1024) {
          const currentCost = sizeGB * TIER_COSTS.Cool;
          const archiveCost = sizeGB * TIER_COSTS.Archive;
          optimizations.push({
            blobName: f.blob_name,
            fileName: f.original_name || f.blob_name.split('/').pop(),
            fileSize: f.file_size,
            ageDays: Math.floor(ageDays),
            currentTier: 'Cool',
            currentCostMonth: currentCost,
            suggestions: [
              { tier: 'Archive', costMonth: archiveCost, savingMonth: currentCost - archiveCost, savingPercent: Math.round((1 - archiveCost / currentCost) * 100) }
            ]
          });
        }
      }
    }

    // 3. Partages actifs et coûts egress
    const shareLinks = shareLinksDb.getAllByUser(username, 1000);
    let shareCost = 0;
    let totalDownloads = 0;
    for (const link of shareLinks) {
      const sizeGB = (link.file_size || 0) / (1024 * 1024 * 1024);
      const downloads = link.download_count || 0;
      totalDownloads += downloads;
      shareCost += sizeGB * downloads * EGRESS_COST_PER_GB;
    }

    // 4. Fichiers reçus d'invités
    const guestUploads = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(urf.file_size), 0) as totalSize
      FROM upload_request_files urf
      JOIN upload_requests ur ON urf.request_id = ur.request_id
      WHERE ur.created_by_user_id = ?
    `).get(userId) || { count: 0, totalSize: 0 };

    // 5. Coût total mensuel
    const totalStorageCost = Object.values(costByTier).reduce((s, t) => s + t.cost, 0);
    const totalPotentialSaving = optimizations.reduce((s, o) => s + (o.suggestions[0]?.savingMonth || 0), 0);

    res.json({
      success: true,
      summary: {
        totalFiles: userFiles.length,
        totalSize: totalSizeBytes,
        totalStorageCostMonth: totalStorageCost,
        totalShareCost: shareCost,
        totalCostMonth: totalStorageCost + shareCost,
        potentialSavingMonth: totalPotentialSaving,
        totalDownloads,
        activeShares: shareLinks.filter(l => l.is_active && new Date(l.expires_at) > new Date()).length
      },
      costByTier,
      optimizations: optimizations.sort((a, b) => (b.suggestions[0]?.savingMonth || 0) - (a.suggestions[0]?.savingMonth || 0)).slice(0, 20),
      guestUploads: {
        count: guestUploads.count,
        totalSize: guestUploads.totalSize,
        estimatedCost: (guestUploads.totalSize / (1024 * 1024 * 1024)) * TIER_COSTS.Hot
      },
      tierPricing: TIER_COSTS
    });
  } catch (error) {
    console.error('Erreur FinOps:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/finops/optimize — Changer le tier d'un fichier (utilisateur)
app.post('/api/finops/optimize', authenticateUser, async (req, res) => {
  try {
    const { blobName, targetTier } = req.body;
    if (!['Cool', 'Archive'].includes(targetTier)) {
      return res.status(400).json({ success: false, error: 'Tier invalide' });
    }

    // Vérifier que le fichier appartient à l'utilisateur
    const ownership = fileOwnershipDb.getByBlobName(blobName);
    if ((!ownership || ownership.uploaded_by_user_id !== req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Ce fichier ne vous appartient pas' });
    }

    // Changer le tier sur Azure
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
    const blobClient = containerClient.getBlobClient(blobName);
    await blobClient.setAccessTier(targetTier);

    // Mettre à jour en DB
    const existing = fileTiersDb.getByBlobName(blobName);
    if (existing) {
      fileTiersDb.update(blobName, { currentTier: targetTier, previousTier: existing.current_tier, tierChangedByUserId: req.user.id });
    } else {
      fileTiersDb.create({ blobName, currentTier: targetTier, previousTier: 'Hot', tierChangedByUserId: req.user.id });
    }

    // Log
    activityLogsDb.log({ level: 'info', category: 'storage', operation: 'tier_change',
      message: `${req.user.username} a changé ${blobName.split('/').pop()} vers ${targetTier}`,
      username: req.user.username, details: { blobName, targetTier }, ip_address: req.ip });

    res.json({ success: true, message: `Fichier déplacé vers ${targetTier}` });
  } catch (error) {
    console.error('Erreur optimize:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// API COÛTS (COSTS)
// ============================================================================

// Route GET /api/costs/user/:userId - Coûts personnels
app.get('/api/costs/user/:userId', authenticateUser, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { period } = req.query;

    // Vérifier les permissions (admin ou soi-même)
    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Vous ne pouvez consulter que vos propres coûts'
      });
    }

    let costs;
    if (period && period.length === 7) {
      // Période mensuelle (YYYY-MM)
      costs = costTrackingDb.getMonthlyCosts('user', userId, period);
    } else if (period && period.length === 4) {
      // Période annuelle (YYYY)
      costs = costTrackingDb.getYearlyCosts('user', userId, period);
    } else {
      // Mois actuel par défaut
      const currentMonth = new Date().toISOString().slice(0, 7);
      costs = costTrackingDb.getMonthlyCosts('user', userId, currentMonth);
    }

    res.json({
      success: true,
      costs: costs || []
    });

  } catch (error) {
    console.error('Erreur récupération coûts utilisateur:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route GET /api/costs/team/:teamId - Coûts d'équipe
app.get('/api/costs/team/:teamId', authenticateUser, async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const { period } = req.query;

    const team = teamsDb.getById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        error: 'Équipe non trouvée'
      });
    }

    // Vérifier les permissions (admin ou membre de l'équipe)
    const membership = teamMembersDb.getByTeamAndUser(teamId, req.user.id);
    if (req.user.role !== 'admin' && !membership) {
      return res.status(403).json({
        success: false,
        error: 'Vous devez être membre de l\'équipe pour consulter ses coûts'
      });
    }

    let costs;
    if (period && period.length === 7) {
      // Période mensuelle (YYYY-MM)
      costs = costTrackingDb.getMonthlyCosts('team', teamId, period);
    } else if (period && period.length === 4) {
      // Période annuelle (YYYY)
      costs = costTrackingDb.getYearlyCosts('team', teamId, period);
    } else {
      // Mois actuel par défaut
      const currentMonth = new Date().toISOString().slice(0, 7);
      costs = costTrackingDb.getMonthlyCosts('team', teamId, currentMonth);
    }

    res.json({
      success: true,
      costs: costs || []
    });

  } catch (error) {
    console.error('Erreur récupération coûts équipe:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route GET /api/admin/costs - Vue globale des coûts (admin uniquement)
app.get('/api/admin/costs', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { period } = req.query;

    // Mois actuel par défaut
    const periodMonth = period || new Date().toISOString().slice(0, 7);

    // Récupérer tous les coûts pour le mois
    const allCosts = costTrackingDb.getAllByMonth(periodMonth);

    // Grouper par type d'entité
    const summary = {
      users: allCosts.filter(c => c.entity_type === 'user'),
      teams: allCosts.filter(c => c.entity_type === 'team'),
      guests: allCosts.filter(c => c.entity_type === 'guest')
    };

    // Calculer les totaux
    const totals = {
      users: summary.users.reduce((sum, c) => sum + c.total_cost, 0),
      teams: summary.teams.reduce((sum, c) => sum + c.total_cost, 0),
      guests: summary.guests.reduce((sum, c) => sum + c.total_cost, 0)
    };

    totals.overall = totals.users + totals.teams + totals.guests;

    res.json({
      success: true,
      period: periodMonth,
      summary,
      totals
    });

  } catch (error) {
    console.error('Erreur récupération coûts globaux:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// API ARCHIVAGE (STORAGE TIERS)
// ============================================================================

// Route POST /api/files/:blobName/archive - Archiver un fichier
app.post('/api/files/:blobName(*)/archive', authenticateUser, async (req, res) => {
  try {
    const blobName = req.params.blobName;
    const { tier, reason } = req.body;

    if (!tier || !['Hot', 'Cool', 'Archive'].includes(tier)) {
      return res.status(400).json({
        success: false,
        error: 'Tier invalide. Valeurs possibles: Hot, Cool, Archive'
      });
    }

    // Vérifier que le fichier existe
    const fileOwnership = fileOwnershipDb.getByBlobName(blobName);
    if (!fileOwnership) {
      return res.status(404).json({
        success: false,
        error: 'Fichier non trouvé'
      });
    }

    // Vérifier les permissions
    let hasPermission = false;

    if (req.user.role === 'admin') {
      hasPermission = true;
    } else if (fileOwnership.uploaded_by_user_id === req.user.id) {
      // Propriétaire du fichier
      hasPermission = true;
    } else if (fileOwnership.team_id) {
      // Fichier d'équipe
      const membership = teamMembersDb.getByTeamAndUser(fileOwnership.team_id, req.user.id);
      hasPermission = membership && ['owner', 'member'].includes(membership.role);
    }

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'Vous n\'avez pas le droit d\'archiver ce fichier'
      });
    }

    // Récupérer les propriétés actuelles du blob
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    let currentTier = 'Hot';
    try {
      const properties = await blockBlobClient.getProperties();
      currentTier = properties.accessTier || 'Hot';
    } catch (error) {
      console.error('Erreur récupération propriétés blob:', error);
    }

    // Valider la transition
    const validTransitions = {
      'Hot': ['Cool', 'Archive'],
      'Cool': ['Hot', 'Archive'],
      'Archive': ['Hot', 'Cool']
    };

    if (!validTransitions[currentTier]?.includes(tier)) {
      return res.status(400).json({
        success: false,
        error: `Transition invalide de ${currentTier} vers ${tier}`
      });
    }

    // Changer le tier
    await blockBlobClient.setAccessTier(tier);

    // Enregistrer dans la base de données
    const existingTier = fileTiersDb.getByBlobName(blobName);

    if (existingTier) {
      fileTiersDb.update(blobName, {
        currentTier: tier,
        previousTier: currentTier,
        tierChangedByUserId: req.user.id,
        archivedAt: ['Cool', 'Archive'].includes(tier) ? new Date().toISOString() : null,
        archivedByUserId: ['Cool', 'Archive'].includes(tier) ? req.user.id : null,
        archiveReason: reason || null
      });
    } else {
      fileTiersDb.create({
        blobName,
        currentTier: tier,
        previousTier: currentTier,
        tierChangedByUserId: req.user.id,
        archivedAt: ['Cool', 'Archive'].includes(tier) ? new Date().toISOString() : null,
        archivedByUserId: ['Cool', 'Archive'].includes(tier) ? req.user.id : null,
        archiveReason: reason || null
      });
    }

    res.json({
      success: true,
      message: `Fichier archivé en tier ${tier}`,
      tier: {
        current: tier,
        previous: currentTier
      }
    });

  } catch (error) {
    console.error('Erreur archivage fichier:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route POST /api/files/:blobName/rehydrate - Réhydrater un fichier archivé
app.post('/api/files/:blobName(*)/rehydrate', authenticateUser, async (req, res) => {
  try {
    const blobName = req.params.blobName;
    const { targetTier, priority } = req.body;

    if (!targetTier || !['Hot', 'Cool'].includes(targetTier)) {
      return res.status(400).json({
        success: false,
        error: 'Target tier invalide. Valeurs possibles: Hot, Cool'
      });
    }

    if (priority && !['Standard', 'High'].includes(priority)) {
      return res.status(400).json({
        success: false,
        error: 'Priority invalide. Valeurs possibles: Standard, High'
      });
    }

    // Vérifier que le fichier existe
    const fileOwnership = fileOwnershipDb.getByBlobName(blobName);
    if (!fileOwnership) {
      return res.status(404).json({
        success: false,
        error: 'Fichier non trouvé'
      });
    }

    // Vérifier les permissions (même logique que pour l'archivage)
    let hasPermission = false;

    if (req.user.role === 'admin') {
      hasPermission = true;
    } else if (fileOwnership.uploaded_by_user_id === req.user.id) {
      hasPermission = true;
    } else if (fileOwnership.team_id) {
      const membership = teamMembersDb.getByTeamAndUser(fileOwnership.team_id, req.user.id);
      hasPermission = membership && ['owner', 'member'].includes(membership.role);
    }

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'Vous n\'avez pas le droit de réhydrater ce fichier'
      });
    }

    // Récupérer les propriétés actuelles
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const properties = await blockBlobClient.getProperties();
    const currentTier = properties.accessTier;

    // Vérifier que le fichier est en Archive
    if (currentTier !== 'Archive') {
      return res.status(400).json({
        success: false,
        error: 'Seuls les fichiers en Archive peuvent être réhydratés'
      });
    }

    // Démarrer la réhydratation
    const rehydratePriority = priority || 'Standard';
    await blockBlobClient.setAccessTier(targetTier, {
      rehydratePriority
    });

    // Mettre à jour la base de données
    const existingTier = fileTiersDb.getByBlobName(blobName);

    if (existingTier) {
      fileTiersDb.update(blobName, {
        currentTier: 'Archive', // Reste Archive pendant la réhydratation
        previousTier: existingTier.current_tier,
        tierChangedByUserId: req.user.id,
        rehydrationStatus: 'in-progress',
        rehydrationPriority: rehydratePriority,
        rehydrationStartedAt: new Date().toISOString(),
        rehydrationRequestedByUserId: req.user.id
      });
    }

    res.json({
      success: true,
      message: `Réhydratation démarrée vers ${targetTier} (priorité: ${rehydratePriority})`,
      rehydration: {
        targetTier,
        priority: rehydratePriority,
        status: 'in-progress',
        estimatedTime: priority === 'High' ? '1h' : '15h'
      }
    });

  } catch (error) {
    console.error('Erreur réhydratation fichier:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route GET /api/files/:blobName/tier-status - Statut du tier d'un fichier
app.get('/api/files/:blobName(*)/tier-status', authenticateUser, async (req, res) => {
  try {
    const blobName = req.params.blobName;

    // Vérifier que le fichier existe
    const fileOwnership = fileOwnershipDb.getByBlobName(blobName);
    if (!fileOwnership) {
      return res.status(404).json({
        success: false,
        error: 'Fichier non trouvé'
      });
    }

    // Vérifier les permissions
    let hasPermission = false;

    if (req.user.role === 'admin') {
      hasPermission = true;
    } else if (fileOwnership.uploaded_by_user_id === req.user.id) {
      hasPermission = true;
    } else if (fileOwnership.team_id) {
      const membership = teamMembersDb.getByTeamAndUser(fileOwnership.team_id, req.user.id);
      hasPermission = membership !== null;
    }

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'Vous n\'avez pas accès à ce fichier'
      });
    }

    // Récupérer les informations depuis Azure
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    const properties = await blockBlobClient.getProperties();
    const azureTier = properties.accessTier || 'Hot';
    const archiveStatus = properties.archiveStatus;

    // Récupérer les informations depuis la DB
    const dbTier = fileTiersDb.getByBlobName(blobName);

    res.json({
      success: true,
      tier: {
        current: azureTier,
        azure: {
          tier: azureTier,
          archiveStatus
        },
        database: dbTier || null
      }
    });

  } catch (error) {
    console.error('Erreur récupération statut tier:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Initialiser le hash du mot de passe au démarrage
initializeAdminPassword();

// ============================================================================
// SYSTÈME DE CALCUL DES COÛTS
// ============================================================================

// Tarifs Azure (West Europe, 2026)
const AZURE_PRICING = {
  storage: {
    Hot: 0.018,      // $/GB/mois
    Cool: 0.010,     // $/GB/mois
    Archive: 0.00099 // $/GB/mois
  },
  operations: {
    write: 0.05 / 10000,   // $ par opération
    read: 0.004 / 10000,   // $ par opération
    list: 0.05 / 10000,    // $ par opération
    other: 0.004 / 10000   // $ par opération
  },
  bandwidth: 0.087,        // $/GB (après 5GB gratuits)
  freeEgressGB: 5          // 5GB gratuits par mois
};

// Fonction pour logger les opérations
function logOperationCost(entityType, entityId, operationType, blobName, bytesTransferred) {
  try {
    const periodMonth = new Date().toISOString().slice(0, 7);
    operationLogsDb.log({
      entityType,
      entityId,
      operationType,
      blobName: blobName || null,
      operationCount: 1,
      bytesTransferred: bytesTransferred || 0,
      periodMonth
    });
  } catch (error) {
    console.error('Erreur logging opération:', error);
  }
}

// Fonction pour calculer les coûts mensuels d'une entité
async function calculateMonthlyCosts(entityType, entityId, periodMonth) {
  try {
    // 1. Calculer les coûts de stockage par tier
    let storageSizeGb = 0;
    let storageHotGb = 0;
    let storageCoolGb = 0;
    let storageArchiveGb = 0;

    // Récupérer tous les fichiers de l'entité
    let files = [];
    if (entityType === 'user') {
      files = fileOwnershipDb.getByUser(entityId);
    } else if (entityType === 'guest') {
      files = fileOwnershipDb.getByGuest(entityId);
    } else if (entityType === 'team') {
      const stmt = db.prepare(`
        SELECT * FROM file_ownership WHERE team_id = ?
      `);
      files = stmt.all(entityId);
    }

    // Calculer la taille totale par tier
    for (const file of files) {
      const sizeGb = (file.file_size || 0) / (1024 * 1024 * 1024);
      storageSizeGb += sizeGb;

      // Vérifier le tier du fichier
      const tierInfo = fileTiersDb.getByBlobName(file.blob_name);
      const tier = tierInfo ? tierInfo.current_tier : 'Hot';

      if (tier === 'Hot') {
        storageHotGb += sizeGb;
      } else if (tier === 'Cool') {
        storageCoolGb += sizeGb;
      } else if (tier === 'Archive') {
        storageArchiveGb += sizeGb;
      }
    }

    // Calculer le coût de stockage
    const storageCost =
      (storageHotGb * AZURE_PRICING.storage.Hot) +
      (storageCoolGb * AZURE_PRICING.storage.Cool) +
      (storageArchiveGb * AZURE_PRICING.storage.Archive);

    // 2. Agréger les opérations
    const operations = operationLogsDb.aggregateByEntity(entityType, entityId, periodMonth);

    let operationsWrite = 0;
    let operationsRead = 0;
    let operationsList = 0;
    let operationsOther = 0;

    for (const op of operations) {
      if (op.operation_type === 'write') operationsWrite = op.total_count;
      else if (op.operation_type === 'read') operationsRead = op.total_count;
      else if (op.operation_type === 'list') operationsList = op.total_count;
      else operationsOther += op.total_count;
    }

    // Calculer le coût des opérations
    const operationsCost =
      (operationsWrite * AZURE_PRICING.operations.write) +
      (operationsRead * AZURE_PRICING.operations.read) +
      (operationsList * AZURE_PRICING.operations.list) +
      (operationsOther * AZURE_PRICING.operations.other);

    // 3. Calculer la bande passante (approximation basée sur les téléchargements)
    let bandwidthDownloadGb = 0;
    let bandwidthUploadGb = 0;

    for (const op of operations) {
      if (op.operation_type === 'read') {
        bandwidthDownloadGb += (op.total_bytes || 0) / (1024 * 1024 * 1024);
      } else if (op.operation_type === 'write') {
        bandwidthUploadGb += (op.total_bytes || 0) / (1024 * 1024 * 1024);
      }
    }

    // Calculer le coût de la bande passante (uniquement download après les 5GB gratuits)
    const billableDownload = Math.max(0, bandwidthDownloadGb - AZURE_PRICING.freeEgressGB);
    const bandwidthCost = billableDownload * AZURE_PRICING.bandwidth;

    // 4. Calculer le coût total
    const totalCost = storageCost + operationsCost + bandwidthCost;

    // 5. Mettre à jour ou créer l'enregistrement
    costTrackingDb.getOrCreate(entityType, entityId, periodMonth);
    costTrackingDb.update(entityType, entityId, periodMonth, {
      storageSizeGb,
      storageCost,
      operationsWrite,
      operationsRead,
      operationsList,
      operationsOther,
      operationsCost,
      bandwidthDownloadGb,
      bandwidthUploadGb,
      bandwidthCost,
      storageHotGb,
      storageCoolGb,
      storageArchiveGb,
      totalCost
    });

    return { success: true, totalCost };

  } catch (error) {
    console.error(`Erreur calcul coûts ${entityType} ${entityId}:`, error);
    return { success: false, error: error.message };
  }
}

// Fonction pour calculer tous les coûts du mois actuel
async function calculateAllMonthlyCosts() {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    console.log(`📊 Calcul des coûts pour ${currentMonth}...`);

    let totalCalculated = 0;

    // Calculer pour tous les utilisateurs
    const users = usersDb.getAll();
    for (const user of users) {
      await calculateMonthlyCosts('user', user.id, currentMonth);
      totalCalculated++;
    }

    // Calculer pour toutes les équipes
    const teams = teamsDb.getAll();
    for (const team of teams) {
      await calculateMonthlyCosts('team', team.id, currentMonth);
      totalCalculated++;
    }

    // Calculer pour tous les invités actifs
    const guests = guestAccountsDb.getAll().filter(g => g.is_active);
    for (const guest of guests) {
      await calculateMonthlyCosts('guest', guest.id, currentMonth);
      totalCalculated++;
    }

    console.log(`✅ Coûts calculés pour ${totalCalculated} entité(s)`);

  } catch (error) {
    console.error('❌ Erreur calcul coûts globaux:', error);
  }
}

// Fonction pour vérifier les réhydratations en cours
async function checkRehydrationStatus() {
  try {
    const pending = fileTiersDb.getPendingRehydrations();

    if (pending.length === 0) return;

    console.log(`🔄 Vérification de ${pending.length} réhydratation(s) en cours...`);

    const containerClient = blobServiceClient.getContainerClient(containerName);
    let completed = 0;

    for (const record of pending) {
      try {
        const blockBlobClient = containerClient.getBlockBlobClient(record.blob_name);
        const properties = await blockBlobClient.getProperties();

        // Si archiveStatus est null, la réhydratation est terminée
        if (!properties.archiveStatus) {
          fileTiersDb.update(record.blob_name, {
            currentTier: properties.accessTier,
            previousTier: record.current_tier,
            tierChangedByUserId: record.tier_changed_by_user_id,
            rehydrationStatus: 'completed',
            rehydrationPriority: null,
            rehydrationCompletedAt: new Date().toISOString(),
            rehydrationRequestedByUserId: record.rehydration_requested_by_user_id
          });
          completed++;
          console.log(`  ✅ Réhydratation terminée: ${record.blob_name} -> ${properties.accessTier}`);
        }
      } catch (error) {
        console.error(`  ❌ Erreur vérification ${record.blob_name}:`, error.message);
      }
    }

    if (completed > 0) {
      console.log(`✅ ${completed} réhydratation(s) terminée(s)`);
    }

  } catch (error) {
    console.error('❌ Erreur vérification réhydratations:', error);
  }
}

// Tâche de nettoyage complet des comptes invités expirés (fichiers Azure + DB)
async function cleanupExpiredGuestAccounts() {
  try {
    const expiredGuests = guestAccountsDb.cleanupExpired();

    if (expiredGuests.length > 0) {
      console.log(`🧹 Nettoyage de ${expiredGuests.length} compte(s) invité(s) expiré(s)...`);

      const containerClient = blobServiceClient.getContainerClient(containerName);
      let totalFilesDeleted = 0;

      for (const guest of expiredGuests) {
        try {
          // Récupérer tous les fichiers de l'invité
          const files = fileOwnershipDb.getByGuest(guest.id);

          console.log(`  - Guest ${guest.email} (${files.length} fichier(s))`);

          // Supprimer les fichiers d'Azure Blob Storage
          for (const file of files) {
            try {
              const blockBlobClient = containerClient.getBlockBlobClient(file.blob_name);
              await blockBlobClient.delete();
              fileOwnershipDb.delete(file.blob_name);
              totalFilesDeleted++;
            } catch (error) {
              console.error(`    ❌ Erreur suppression fichier ${file.blob_name}:`, error.message);
            }
          }

          logOperation('guest_account_expired_cleaned', {
            guestId: guest.guest_id,
            email: guest.email,
            filesDeleted: files.length
          });

        } catch (error) {
          console.error(`  ❌ Erreur nettoyage guest ${guest.email}:`, error.message);
        }
      }

      console.log(`✅ Nettoyage terminé: ${totalFilesDeleted} fichier(s) supprimé(s)`);
    }
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage des comptes invités:', error);
  }
}

// Tâche de notification d'expiration imminente (optionnel)
async function notifyExpiringGuestAccounts() {
  try {
    const expiringGuests = guestAccountsDb.getExpiringSoon(1); // 1 jour avant expiration

    for (const guest of expiringGuests) {
      try {
        const now = new Date();
        const expiresAt = new Date(guest.account_expires_at);
        const daysRemaining = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));

        await emailService.sendAccountExpiringSoon(guest.email, daysRemaining);

        logOperation('guest_expiration_notification_sent', {
          guestId: guest.guest_id,
          email: guest.email,
          daysRemaining
        });

      } catch (error) {
        console.error(`Erreur notification guest ${guest.email}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Erreur lors des notifications d\'expiration:', error);
  }
}

// ============================================
// FACES API ROUTES
// ============================================
const faceService = require('./ai/faceService');

app.get('/api/admin/faces/profiles', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const profiles = faceService.getAllProfiles();
    res.json(profiles);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/faces/profiles', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    const profile = faceService.createProfile({ name, createdBy: req.user?.email || 'admin' });
    res.json(profile);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/faces/profiles/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const result = faceService.updateProfile(req.params.id, { name: req.body.name });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/faces/profiles/:id', authenticateUser, requireAdmin, async (req, res) => {
  try {
    faceService.deleteProfile(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/faces/profiles/:id/files', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const files = faceService.getFilesByProfile(req.params.id);
    res.json(files);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/faces/profiles/merge', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { targetId, sourceId } = req.body;
    const result = faceService.mergeProfiles(targetId, sourceId);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/faces/occurrences', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT fo.*, fp.name as profile_name 
      FROM face_occurrences fo 
      LEFT JOIN face_profiles fp ON fo.face_profile_id = fp.id 
      ORDER BY fo.timestamp DESC
    `).all();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/faces/occurrences/unassigned', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM face_occurrences WHERE face_profile_id IS NULL ORDER BY timestamp DESC
    `).all();
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/faces/file/:blobName', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const occurrences = faceService.getOccurrencesByBlobName(req.params.blobName);
    res.json(occurrences);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/faces/occurrences/:id/assign', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const result = faceService.assignFaceToProfile(req.params.id, req.body.profileId);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// UPLOAD REQUESTS (Portail de dépôt externe)
// ============================================

// In-memory upload tokens with auto-cleanup
const uploadTokens = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of uploadTokens) {
    if (data.expiresAt < now) uploadTokens.delete(token);
  }
}, 15 * 60 * 1000);

// Serve public upload page
app.get('/upload/:requestId', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/upload.html'));
});

// === User routes (authenticated) ===

// Create upload request
app.post('/api/upload-requests', authenticateUser, async (req, res) => {
  try {
    const { title, description, allowedEmail, allowedDomain, teamId, maxFiles, maxFileSizeMb, allowedExtensions, expiresInDays } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Le titre est requis' });
    }

    // Validate allowed email domain if specific email provided
    if (allowedEmail) {
      const domain = allowedEmail.split('@')[1]?.toLowerCase();
      if (!domain) return res.status(400).json({ error: 'Email invalide' });
      const approved = db.prepare('SELECT 1 FROM allowed_email_domains WHERE domain = ? AND is_active = 1').get(domain);
      if (!approved) {
        return res.status(403).json({ error: `Domaine "${domain}" non approuvé` });
      }
    }

    // Validate allowed domain if provided
    if (allowedDomain) {
      const approved = db.prepare('SELECT 1 FROM allowed_email_domains WHERE domain = ? AND is_active = 1').get(allowedDomain.toLowerCase());
      if (!approved) {
        return res.status(403).json({ error: `Domaine "${allowedDomain}" non approuvé` });
      }
    }

    // Validate team membership if teamId
    if (teamId) {
      const membership = teamMembersDb.getByTeamAndUser(parseInt(teamId), req.user.id);
      if (!membership && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Vous n\'êtes pas membre de cette équipe' });
      }
    }

    const requestId = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + (expiresInDays || 7) * 86400000).toISOString();

    uploadRequestsDb.create({
      requestId,
      title: title.trim(),
      description: description || null,
      createdByUserId: req.user.id,
      teamId: teamId ? parseInt(teamId) : null,
      allowedEmail: allowedEmail || null,
      allowedDomain: allowedDomain || null,
      maxFiles: maxFiles || 10,
      maxFileSizeMb: maxFileSizeMb || 50,
      allowedExtensions: allowedExtensions || null,
      expiresAt
    });

    const backendUrl = process.env.BACKEND_URL || (req.protocol + '://' + req.get('host'));
    res.json({
      success: true,
      requestId,
      uploadUrl: `${backendUrl}/upload/${requestId}`,
      expiresAt
    });
  } catch (error) {
    console.error('Erreur création upload request:', error);
    res.status(500).json({ error: error.message });
  }
});

// List my upload requests
app.get('/api/upload-requests', authenticateUser, async (req, res) => {
  try {
    const requests = uploadRequestsDb.getByUserId(req.user.id);
    res.json({ success: true, requests });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get upload request details + files
app.get('/api/upload-requests/:requestId', authenticateUser, async (req, res) => {
  try {
    const request = uploadRequestsDb.getByRequestId(req.params.requestId);
    if (!request || request.created_by_user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }
    const files = uploadRequestsDb.getFiles(req.params.requestId);
    res.json({ success: true, request, files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update upload request
app.put('/api/upload-requests/:requestId', authenticateUser, async (req, res) => {
  try {
    const request = uploadRequestsDb.getByRequestId(req.params.requestId);
    if (!request || request.created_by_user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }
    const { title, description, isActive } = req.body;
    uploadRequestsDb.update(req.params.requestId, { title, description, isActive });
    res.json({ success: true, message: 'Demande mise à jour' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete (deactivate) upload request
app.delete('/api/upload-requests/:requestId', authenticateUser, async (req, res) => {
  try {
    const request = uploadRequestsDb.getByRequestId(req.params.requestId);
    if (!request || request.created_by_user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(404).json({ error: 'Demande non trouvée' });
    }
    uploadRequestsDb.delete(req.params.requestId);
    res.json({ success: true, message: 'Demande désactivée' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === Public routes (no auth, for external uploaders) ===

// Get public request info
app.get('/api/public/upload/:requestId', async (req, res) => {
  try {
    const request = uploadRequestsDb.getByRequestId(req.params.requestId);
    if (!request || !request.is_active || new Date(request.expires_at) < new Date()) {
      return res.status(404).json({ error: 'Lien de dépôt invalide ou expiré' });
    }
    res.json({
      success: true,
      title: request.title,
      description: request.description,
      maxFiles: request.max_files,
      maxFileSizeMb: request.max_file_size_mb,
      allowedExtensions: request.allowed_extensions,
      expiresAt: request.expires_at,
      uploadCount: request.upload_count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify email for public upload
app.post('/api/public/upload/:requestId/verify', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requis' });

    const request = uploadRequestsDb.getByRequestId(req.params.requestId);
    if (!request || !request.is_active || new Date(request.expires_at) < new Date()) {
      return res.status(404).json({ error: 'Lien de dépôt invalide ou expiré' });
    }

    const emailLower = email.trim().toLowerCase();
    const domain = emailLower.split('@')[1];
    if (!domain) return res.status(400).json({ error: 'Email invalide' });

    // Check if email matches allowed_email constraint
    if (request.allowed_email && request.allowed_email.toLowerCase() !== emailLower) {
      return res.status(403).json({ error: 'Email non autorisé pour cette demande' });
    }

    // Check if domain matches allowed_domain constraint
    if (request.allowed_domain && request.allowed_domain.toLowerCase() !== domain) {
      return res.status(403).json({ error: 'Domaine email non autorisé pour cette demande' });
    }

    // Check domain is in approved list
    const domainApproved = db.prepare('SELECT 1 FROM allowed_email_domains WHERE domain = ? AND is_active = 1').get(domain);
    if (!domainApproved) {
      return res.status(403).json({ error: 'Domaine email non approuvé' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    uploadTokens.set(token, {
      email: emailLower,
      requestId: req.params.requestId,
      expiresAt: Date.now() + 3600000 // 1 hour
    });

    res.json({ success: true, token, expiresIn: 3600 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload file via public link
app.post('/api/public/upload/:requestId/file', upload.single('file'), async (req, res) => {
  try {
    const token = req.headers['x-upload-token'];
    if (!token) return res.status(401).json({ error: 'Token requis' });

    const tokenData = uploadTokens.get(token);
    if (!tokenData || tokenData.expiresAt < Date.now()) {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
    if (tokenData.requestId !== req.params.requestId) {
      return res.status(403).json({ error: 'Token non valide pour cette demande' });
    }

    const request = uploadRequestsDb.getByRequestId(req.params.requestId);
    if (!request || !request.is_active || new Date(request.expires_at) < new Date()) {
      return res.status(404).json({ error: 'Lien de dépôt invalide ou expiré' });
    }

    if (!req.file) return res.status(400).json({ error: 'Aucun fichier fourni' });

    // Check max files
    if (request.upload_count >= request.max_files) {
      return res.status(400).json({ error: `Nombre maximum de fichiers atteint (${request.max_files})` });
    }

    // Check file size
    const maxBytes = (request.max_file_size_mb || 50) * 1024 * 1024;
    if (req.file.size > maxBytes) {
      return res.status(400).json({ error: `Fichier trop volumineux. Maximum: ${request.max_file_size_mb} Mo` });
    }

    // Check extensions
    if (request.allowed_extensions) {
      const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
      const allowed = request.allowed_extensions.split(',').map(e => e.trim().toLowerCase().replace('.', ''));
      if (!allowed.includes(ext)) {
        return res.status(400).json({ error: `Extension .${ext} non autorisée. Extensions acceptées: ${request.allowed_extensions}` });
      }
    }

    // Determine upload path
    const containerClient = blobServiceClient.getContainerClient(containerName);
    let folderPath;
    if (request.team_id) {
      const team = teamsDb.getById(request.team_id);
      folderPath = team ? `${team.storage_prefix}depot-externe/` : `users/${request.created_by_user_id}/depot-externe/`;
    } else {
      folderPath = `users/${request.created_by_user_id}/depot-externe/`;
    }

    let fileName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    let blobName = `${folderPath}${fileName}`;

    // Handle duplicates
    let counter = 1;
    while (true) {
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      const exists = await blockBlobClient.exists();
      if (!exists) break;
      const nameParts = fileName.split('.');
      const ext = nameParts.length > 1 ? nameParts.pop() : '';
      const baseName = nameParts.join('.');
      fileName = ext ? `${baseName}_${counter}.${ext}` : `${baseName}_${counter}`;
      blobName = `${folderPath}${fileName}`;
      counter++;
    }

    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(req.file.buffer, {
      blobHTTPHeaders: { blobContentType: req.file.mimetype },
      metadata: {
        originalName: req.file.originalname,
        uploadedAt: new Date().toISOString(),
        uploadedBy: `external:${tokenData.email}`,
        uploadRequestId: req.params.requestId,
        contentType: req.file.mimetype,
        size: req.file.size.toString()
      }
    });

    // Record file ownership (linked to requesting user)
    fileOwnershipDb.create({
      blobName,
      originalName: req.file.originalname,
      contentType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedByUserId: request.created_by_user_id,
      uploadedByGuestId: null,
      folderPath,
      teamId: request.team_id || null
    });

    // Record in upload_request_files
    uploadRequestsDb.addFile({
      requestId: req.params.requestId,
      blobName,
      originalName: req.file.originalname,
      fileSize: req.file.size,
      contentType: req.file.mimetype,
      uploaderEmail: tokenData.email
    });

    // Increment upload count
    uploadRequestsDb.incrementUploadCount(req.params.requestId);

    logOperation('file_uploaded', {
      blobName,
      originalName: req.file.originalname,
      size: req.file.size,
      contentType: req.file.mimetype,
      uploadedBy: `external:${tokenData.email}`,
      uploadRequestId: req.params.requestId,
      username: `externe:${tokenData.email}`
    });

    res.json({
      success: true,
      message: 'Fichier déposé avec succès',
      file: {
        originalName: req.file.originalname,
        size: req.file.size,
        contentType: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Erreur upload public:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// QUOTAS API
// ============================================

// Liste tous les quotas d'équipe
app.get('/api/admin/quotas', authenticateUser, requireAdmin, (req, res) => {
  try {
    const quotas = teamQuotasDb.getAll();
    const teams = teamsDb.getAll();
    // Include teams without quotas
    const result = teams.map(t => {
      const q = quotas.find(q => q.team_id === t.id);
      return {
        team_id: t.id,
        team_name: t.name,
        team_display_name: t.display_name,
        ...(q || teamQuotasDb.getDefaults()),
        has_custom_quota: !!q
      };
    });
    res.json({ success: true, quotas: result });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Quotas par défaut
app.get('/api/admin/quotas/defaults', authenticateUser, requireAdmin, (req, res) => {
  try {
    res.json({ success: true, defaults: teamQuotasDb.getDefaults() });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/admin/quotas/defaults', authenticateUser, requireAdmin, (req, res) => {
  try {
    const { max_storage_gb, max_files, max_file_size_mb, max_shares_per_user, max_share_duration_days } = req.body;
    const updates = {};
    if (max_storage_gb !== undefined) updates.defaultMaxStorageGb = String(max_storage_gb);
    if (max_files !== undefined) updates.defaultMaxFiles = String(max_files);
    if (max_file_size_mb !== undefined) updates.defaultMaxFileSizeMb = String(max_file_size_mb);
    if (max_shares_per_user !== undefined) updates.defaultMaxSharesPerUser = String(max_shares_per_user);
    if (max_share_duration_days !== undefined) updates.defaultMaxShareDurationDays = String(max_share_duration_days);
    settingsDb.updateMany(updates);
    res.json({ success: true, defaults: teamQuotasDb.getDefaults() });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Quota d'une équipe
app.get('/api/admin/quotas/team/:teamId', authenticateUser, requireAdmin, (req, res) => {
  try {
    const quota = teamQuotasDb.get(parseInt(req.params.teamId));
    res.json({ success: true, quota: quota || teamQuotasDb.getDefaults() });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.put('/api/admin/quotas/team/:teamId', authenticateUser, requireAdmin, (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);
    const team = teamsDb.getById(teamId);
    if (!team) return res.status(404).json({ success: false, error: 'Équipe non trouvée' });
    teamQuotasDb.upsert(teamId, { ...req.body, updated_by: req.user.username });
    res.json({ success: true, quota: teamQuotasDb.get(teamId) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Usage stats par équipe
app.get('/api/admin/quotas/usage', authenticateUser, requireAdmin, (req, res) => {
  try {
    const teams = teamsDb.getAll();
    const usage = teams.map(t => {
      const stats = teamsDb.getStats(t.id);
      const quota = teamQuotasDb.get(t.id) || teamQuotasDb.getDefaults();
      const shareCount = db.prepare(`
        SELECT COUNT(*) as count FROM share_links sl
        INNER JOIN team_members tm ON sl.created_by = (SELECT username FROM users WHERE id = tm.user_id)
        WHERE tm.team_id = ? AND tm.is_active = 1 AND sl.is_active = 1
      `).get(t.id);
      return {
        team_id: t.id,
        team_name: t.name,
        team_display_name: t.display_name,
        storage_used_bytes: stats.totalSize,
        storage_used_gb: Math.round((stats.totalSize / (1024 * 1024 * 1024)) * 100) / 100,
        file_count: stats.fileCount,
        member_count: stats.memberCount,
        share_count: shareCount.count,
        quota
      };
    });
    res.json({ success: true, usage });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Quota de l'utilisateur courant
app.get('/api/user/quota', authenticateUser, (req, res) => {
  try {
    const membership = db.prepare(`
      SELECT tm.team_id, t.display_name as team_name FROM team_members tm
      INNER JOIN teams t ON tm.team_id = t.id
      WHERE tm.user_id = ? AND tm.is_active = 1 AND t.is_active = 1 LIMIT 1
    `).get(req.user.id);

    let quotas;
    if (membership) {
      quotas = teamQuotasDb.get(membership.team_id) || teamQuotasDb.getDefaults();
    } else {
      quotas = teamQuotasDb.getDefaults();
    }

    const usage = db.prepare(`
      SELECT COALESCE(SUM(file_size), 0) as total_bytes, COUNT(*) as file_count
      FROM file_ownership WHERE uploaded_by_user_id = ?
    `).get(req.user.id);

    const shareCount = db.prepare(`
      SELECT COUNT(*) as count FROM share_links WHERE created_by = ? AND is_active = 1
    `).get(req.user.username);

    res.json({
      success: true,
      team: membership ? { id: membership.team_id, name: membership.team_name } : null,
      quotas,
      usage: {
        storage_used_bytes: usage.total_bytes,
        storage_used_gb: Math.round((usage.total_bytes / (1024 * 1024 * 1024)) * 100) / 100,
        file_count: usage.file_count,
        share_count: shareCount.count
      }
    });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================
// ROUTES ADMIN - SÉCURITÉ / ANTIVIRUS
// ============================================

const { virusQuarantineDb } = require('./database');

// Liste des fichiers en quarantaine
app.get('/api/admin/security/quarantine', authenticateUser, requireAdmin, (req, res) => {
  try {
    const items = virusQuarantineDb.getAll();
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Détails d'un fichier en quarantaine
app.get('/api/admin/security/quarantine/:id', authenticateUser, requireAdmin, (req, res) => {
  try {
    const item = virusQuarantineDb.getById(parseInt(req.params.id));
    if (!item) return res.status(404).json({ success: false, error: 'Entrée non trouvée' });
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Supprimer un fichier en quarantaine
app.delete('/api/admin/security/quarantine/:id', authenticateUser, requireAdmin, (req, res) => {
  try {
    const item = virusQuarantineDb.getById(parseInt(req.params.id));
    if (!item) return res.status(404).json({ success: false, error: 'Entrée non trouvée' });

    // Supprimer le fichier physique en quarantaine
    if (item.quarantine_path) {
      try { fs.unlinkSync(item.quarantine_path); } catch(e) {}
    }

    virusQuarantineDb.delete(parseInt(req.params.id));
    res.json({ success: true, message: 'Fichier en quarantaine supprimé' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Marquer comme résolu
app.put('/api/admin/security/quarantine/:id/resolve', authenticateUser, requireAdmin, (req, res) => {
  try {
    const item = virusQuarantineDb.getById(parseInt(req.params.id));
    if (!item) return res.status(404).json({ success: false, error: 'Entrée non trouvée' });

    virusQuarantineDb.resolve(parseInt(req.params.id), req.user.username);
    res.json({ success: true, message: 'Marqué comme résolu' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Scan manuel d'un fichier existant
app.post('/api/admin/security/scan/:blobName', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { blobName } = req.params;
    const virusScanService = require('./ai/virusScanService');

    if (!virusScanService.isClamAvAvailable()) {
      return res.status(503).json({ success: false, error: 'ClamAV non disponible sur le serveur' });
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const exists = await blockBlobClient.exists();
    if (!exists) return res.status(404).json({ success: false, error: 'Fichier non trouvé' });

    const downloadResponse = await blockBlobClient.download();
    const buffer = await streamToBuffer(downloadResponse.readableStreamBody);

    const result = await virusScanService.scanBuffer(buffer, blobName);

    if (!result.clean) {
      virusScanService.quarantine(blobName, buffer, result.virus);
    }

    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Statistiques de scan
app.get('/api/admin/security/scan-stats', authenticateUser, requireAdmin, (req, res) => {
  try {
    const virusScanService = require('./ai/virusScanService');
    const stats = virusQuarantineDb.getStats();
    res.json({
      success: true,
      stats: {
        ...stats,
        clamAvAvailable: virusScanService.isClamAvAvailable(),
        scanEnabled: virusScanService.isEnabled(),
        quarantineDir: virusScanService.QUARANTINE_DIR
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================================================
// ROLES & PERMISSIONS API
// ============================================================================

const AVAILABLE_PERMISSIONS = [
  { key: 'canCreateGuests', label: 'Créer des comptes invités', description: 'Inviter des personnes externes à déposer des fichiers' },
  { key: 'canUseAI', label: 'Utiliser l\'IA', description: 'Analyse d\'images, vidéos, reconnaissance faciale, OCR' },
  { key: 'canCreateTeams', label: 'Créer des équipes', description: 'Créer et gérer des équipes' },
  { key: 'canShareFiles', label: 'Partager des fichiers', description: 'Créer des liens de partage' },
  { key: 'canUploadFiles', label: 'Uploader des fichiers', description: 'Déposer des fichiers dans son espace' },
  { key: 'canViewReports', label: 'Voir les rapports', description: 'Consulter les statistiques et rapports' },
  { key: 'canManageUsers', label: 'Gérer les utilisateurs', description: 'Créer, modifier, supprimer des comptes' },
  { key: 'canManageSettings', label: 'Gérer les paramètres', description: 'Modifier la configuration de l\'application' },
  { key: 'canAuditShares', label: 'Auditer les partages', description: 'Voir tous les partages en cours de tous les utilisateurs', category: 'Sécurité' },
  { key: 'canAuditFiles', label: 'Auditer les fichiers', description: 'Voir tous les fichiers partagés de tous les utilisateurs', category: 'Sécurité' },
  { key: 'canAuditActivity', label: 'Auditer l\'activité', description: 'Voir toute l\'activité (téléchargements, connexions, partages)', category: 'Sécurité' },
];

// List all roles with their permissions
app.get('/api/admin/roles', authenticateUser, requireAdmin, (req, res) => {
  try {
    const roles = {};
    const permissionLabels = {};
    for (const p of AVAILABLE_PERMISSIONS) {
      permissionLabels[p.key] = p.label;
    }
    for (const role of ['admin', 'com', 'user', 'viewer']) {
      roles[role] = rolePermissionsDb.getByRole(role);
    }
    res.json({ success: true, roles, permissionLabels });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Get permissions for a specific role
app.get('/api/admin/roles/:role/permissions', authenticateUser, requireAdmin, (req, res) => {
  try {
    const perms = rolePermissionsDb.getByRole(req.params.role);
    res.json({ success: true, permissions: perms });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Update permissions for a role
app.put('/api/admin/roles/:role/permissions', authenticateUser, requireAdmin, (req, res) => {
  try {
    const { role } = req.params;
    const { permissions } = req.body;
    const auditPermissions = ['canAuditShares', 'canAuditFiles', 'canAuditActivity'];
    if (role === 'admin') {
      // Allow modifying audit permissions for admin role
      const nonAudit = permissions.filter(p => !auditPermissions.includes(p.permission));
      if (nonAudit.length > 0) {
        return res.status(400).json({ success: false, error: 'Seules les permissions d\'audit peuvent être modifiées pour le rôle admin' });
      }
    }
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ success: false, error: 'permissions doit être un tableau' });
    }
    for (const p of permissions) {
      rolePermissionsDb.update(role, p.permission, p.enabled ? 1 : 0, req.user.username);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// List all available permissions
app.get('/api/admin/permissions', authenticateUser, requireAdmin, (req, res) => {
  res.json({ success: true, permissions: AVAILABLE_PERMISSIONS });
});

// Current user's effective permissions
app.get('/api/user/permissions', authenticateUser, (req, res) => {
  try {
    const perms = {};
    for (const p of AVAILABLE_PERMISSIONS) {
      perms[p.key] = rolePermissionsDb.hasPermission(req.user.role, p.key);
    }
    res.json({ success: true, role: req.user.role, permissions: perms });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// ENTRA ROLE MAPPINGS ADMIN ROUTES
// ============================================

// GET /api/admin/entra/role-mappings
app.get('/api/admin/entra/role-mappings', authenticateUser, requireRole('admin'), (req, res) => {
  try {
    const mappings = entraRoleMappingsDb.getAll();
    const syncEnabled = settingsDb.get('entraGroupSyncEnabled') !== 'false';
    const defaultRole = settingsDb.get('entraDefaultRole') || 'viewer';
    res.json({ success: true, mappings, syncEnabled, defaultRole });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/admin/entra/role-mappings/:role
app.put('/api/admin/entra/role-mappings/:role', authenticateUser, requireRole('admin'), (req, res) => {
  try {
    const { role } = req.params;
    const { entra_group_id, entra_group_name } = req.body;
    const mapping = entraRoleMappingsDb.getByRole(role);
    if (!mapping) {
      return res.status(404).json({ success: false, error: 'Rôle non trouvé' });
    }
    entraRoleMappingsDb.update(role, {
      entra_group_id: entra_group_id || null,
      entra_group_name: entra_group_name || null,
      updatedBy: req.user.username
    });
    res.json({ success: true, message: 'Mapping mis à jour' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/admin/entra/groups - list Entra ID groups via Graph API
app.get('/api/admin/entra/groups', authenticateUser, requireRole('admin'), async (req, res) => {
  try {
    const token = await getAppToken();
    if (!token) {
      return res.status(400).json({ success: false, error: 'Configuration Entra incomplète ou token impossible à obtenir' });
    }
    const result = await httpsRequest(
      'https://graph.microsoft.com/v1.0/groups?$select=id,displayName,description&$top=100',
      { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (result.status !== 200) {
      return res.status(result.status).json({ success: false, error: 'Erreur Graph API', details: result.data });
    }
    const groups = (result.data.value || []).map(g => ({
      id: g.id,
      displayName: g.displayName,
      description: g.description
    }));
    res.json({ success: true, groups });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/admin/entra/test-mapping - test role mapping for a user email
app.post('/api/admin/entra/test-mapping', authenticateUser, requireRole('admin'), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email requis' });

    const token = await getAppToken();
    if (!token) {
      return res.status(400).json({ success: false, error: 'Configuration Entra incomplète' });
    }

    // Get user's groups via Graph API
    const userResult = await httpsRequest(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/memberOf?$select=id,displayName,@odata.type`,
      { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (userResult.status !== 200) {
      return res.status(400).json({ success: false, error: 'Utilisateur non trouvé dans Entra ID', details: userResult.data });
    }

    const groups = (userResult.data.value || [])
      .filter(v => v['@odata.type'] === '#microsoft.graph.group')
      .map(g => ({ id: g.id, displayName: g.displayName }));

    const groupIds = groups.map(g => g.id);
    const mappedRole = entraRoleMappingsDb.getRoleForGroups(groupIds);

    res.json({
      success: true,
      email,
      groups,
      mappedRole,
      totalGroups: groups.length
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/admin/entra/sync-settings - update sync settings
app.put('/api/admin/entra/sync-settings', authenticateUser, requireRole('admin'), (req, res) => {
  try {
    const { syncEnabled, defaultRole } = req.body;
    if (syncEnabled !== undefined) settingsDb.update('entraGroupSyncEnabled', syncEnabled ? 'true' : 'false');
    if (defaultRole) settingsDb.update('entraDefaultRole', defaultRole);
    res.json({ success: true, message: 'Paramètres de synchronisation mis à jour' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// SECURITY AUDIT ROUTES
// ============================================

// GET /api/audit/shares — All active shares across all users
app.get('/api/audit/shares', authenticateUser, requirePermission('canAuditShares'), (req, res) => {
  try {
    const shares = db.prepare(`
      SELECT sl.*, u.username as created_by_username, u.full_name as created_by_name,
             u.email as created_by_email
      FROM share_links sl
      LEFT JOIN users u ON sl.created_by = u.username
      WHERE sl.is_active = 1
      ORDER BY sl.created_at DESC
    `).all();
    res.json({ success: true, shares, count: shares.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/audit/shares/expired — Recently expired shares
app.get('/api/audit/shares/expired', authenticateUser, requirePermission('canAuditShares'), (req, res) => {
  try {
    const shares = db.prepare(`
      SELECT sl.*, u.username as created_by_username, u.full_name as created_by_name
      FROM share_links sl
      LEFT JOIN users u ON sl.created_by = u.username
      WHERE sl.is_active = 0
      ORDER BY sl.expires_at DESC
      LIMIT 100
    `).all();
    res.json({ success: true, shares, count: shares.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/audit/shares/stats — Share statistics
app.get('/api/audit/shares/stats', authenticateUser, requirePermission('canAuditShares'), (req, res) => {
  try {
    const stats = {
      activeShares: db.prepare('SELECT COUNT(*) as c FROM share_links WHERE is_active = 1').get().c,
      expiredShares: db.prepare('SELECT COUNT(*) as c FROM share_links WHERE is_active = 0').get().c,
      totalDownloads: db.prepare('SELECT COALESCE(SUM(download_count), 0) as c FROM share_links').get().c,
      sharesWithPassword: db.prepare('SELECT COUNT(*) as c FROM share_links WHERE password_hash IS NOT NULL AND is_active = 1').get().c,
      sharesWithoutPassword: db.prepare('SELECT COUNT(*) as c FROM share_links WHERE password_hash IS NULL AND is_active = 1').get().c,
      topSharers: db.prepare(`
        SELECT created_by as username, COUNT(*) as share_count
        FROM share_links WHERE is_active = 1
        GROUP BY created_by ORDER BY share_count DESC LIMIT 10
      `).all(),
      recentDownloads: db.prepare(`
        SELECT dl.*, sl.original_name, sl.created_by
        FROM download_logs dl
        JOIN share_links sl ON dl.link_id = sl.link_id
        ORDER BY dl.downloaded_at DESC LIMIT 20
      `).all()
    };
    res.json({ success: true, stats });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/audit/shares/:linkId/revoke — Revoke a share
app.post('/api/audit/shares/:linkId/revoke', authenticateUser, requirePermission('canAuditShares'), (req, res) => {
  try {
    db.prepare('UPDATE share_links SET is_active = 0 WHERE link_id = ?').run(req.params.linkId);
    res.json({ success: true, message: 'Partage révoqué' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/audit/files — All files with ownership info
app.get('/api/audit/files', authenticateUser, requirePermission('canAuditFiles'), (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const files = db.prepare(`
      SELECT fo.*, u.username, u.full_name, u.email,
             (SELECT COUNT(*) FROM share_links sl WHERE sl.blob_name = fo.blob_name AND sl.is_active = 1) as active_shares
      FROM file_ownership fo
      LEFT JOIN users u ON fo.uploaded_by_user_id = u.id
      ORDER BY fo.uploaded_at DESC
      LIMIT ? OFFSET ?
    `).all(parseInt(limit), offset);
    const total = db.prepare('SELECT COUNT(*) as c FROM file_ownership').get().c;
    res.json({ success: true, files, total, page: parseInt(page), limit: parseInt(limit) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/audit/activity — All activity logs
app.get('/api/audit/activity', authenticateUser, requirePermission('canAuditActivity'), (req, res) => {
  try {
    const { page = 1, limit = 50, type } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let query = `SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    let params = [parseInt(limit), offset];
    if (type) {
      query = `SELECT * FROM activity_logs WHERE operation = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params = [type, parseInt(limit), offset];
    }
    let logs;
    try {
      logs = db.prepare(query).all(...params);
    } catch(e) {
      query = query.replace(/activity_logs/g, 'operation_logs');
      try { logs = db.prepare(query).all(...params); } catch(e2) { logs = []; }
    }
    res.json({ success: true, logs, page: parseInt(page), limit: parseInt(limit) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/audit/downloads — Download history across all shares
app.get('/api/audit/downloads', authenticateUser, requirePermission('canAuditShares'), (req, res) => {
  try {
    const downloads = db.prepare(`
      SELECT dl.*, sl.original_name, sl.created_by, sl.recipient_email
      FROM download_logs dl
      JOIN share_links sl ON dl.link_id = sl.link_id
      ORDER BY dl.downloaded_at DESC
      LIMIT 200
    `).all();
    res.json({ success: true, downloads, count: downloads.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// EMAIL CONFIGURATION ROUTES
// ============================================

app.get('/api/admin/email/config', authenticateUser, requireAdmin, (req, res) => {
  const emailService = require('./emailService');
  const config = emailService.getConfig();
  res.json({
    success: true,
    config: {
      ...config,
      password: config.password ? '••••••••' : '',
      mailjetSecretKey: config.mailjetSecretKey ? '••••••••' : ''
    }
  });
});

app.put('/api/admin/email/config', authenticateUser, requireAdmin, (req, res) => {
  const { host, port, secure, user, password, fromEmail, fromName, enabled, provider, mailjetApiKey, mailjetSecretKey } = req.body;
  const { settingsDb } = require('./database');
  
  if (provider !== undefined) settingsDb.update('emailProvider', provider);
  if (host !== undefined) settingsDb.update('smtpHost', host);
  if (port !== undefined) settingsDb.update('smtpPort', String(port));
  if (secure !== undefined) settingsDb.update('smtpSecure', String(secure));
  if (user !== undefined) settingsDb.update('smtpUser', user);
  if (password !== undefined && password !== '••••••••') settingsDb.update('smtpPassword', password);
  if (fromEmail !== undefined) settingsDb.update('smtpFromEmail', fromEmail);
  if (fromName !== undefined) settingsDb.update('smtpFromName', fromName);
  if (enabled !== undefined) settingsDb.update('emailEnabled', String(enabled));
  if (mailjetApiKey !== undefined) settingsDb.update('mailjetApiKey', mailjetApiKey);
  if (mailjetSecretKey !== undefined && mailjetSecretKey !== '••••••••') settingsDb.update('mailjetSecretKey', mailjetSecretKey);
  
  const emailService = require('./emailService');
  emailService.reload();
  
  res.json({ success: true, message: 'Configuration email mise à jour' });
});

app.post('/api/admin/email/test', authenticateUser, requireAdmin, async (req, res) => {
  const emailService = require('./emailService');
  const result = await emailService.testConnection();
  res.json(result);
});

app.post('/api/admin/email/send-test', authenticateUser, requireAdmin, async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ success: false, error: 'Adresse email requise' });
  
  try {
    const emailService = require('./emailService');
    const config = emailService.getConfig();
    
    console.log(`📧 Test email vers ${to} via ${config.provider} (host: ${config.host}, user: ${config.user}, from: ${config.fromEmail})`);
    
    if (!config.enabled) {
      return res.json({ success: false, error: 'Email désactivé dans les paramètres. Activez-le dans Paramètres > Général.' });
    }
    
    if (config.provider === 'mailjet') {
      if (!config.mailjetApiKey || !config.mailjetSecretKey) {
        return res.json({ success: false, error: 'Clés API Mailjet non configurées (API Key + Secret Key requises)' });
      }
    } else {
      if (!config.user || !config.password) {
        return res.json({ success: false, error: `Identifiants SMTP manquants (user: ${config.user ? '✅' : '❌'}, password: ${config.password ? '✅' : '❌'})` });
      }
      if (!config.host) {
        return res.json({ success: false, error: 'Hôte SMTP non configuré' });
      }
    }
    
    const result = await emailService.sendMail(
      to,
      '✅ Test ShareAzure — Email fonctionnel',
      `<div style="font-family:sans-serif;padding:20px;">
        <h1 style="color:#003C61;">✅ Test réussi</h1>
        <p>Si vous recevez cet email, la configuration ${config.provider === 'mailjet' ? 'Mailjet' : 'SMTP'} de ShareAzure fonctionne correctement.</p>
        <p style="color:#888;font-size:0.85rem;">Provider: ${config.provider} | Host: ${config.host || 'Mailjet API'} | From: ${config.fromEmail || config.user}</p>
        <p style="color:#666;font-size:0.85rem;">ShareAzure — Partage sécurisé</p>
      </div>`,
      'Test ShareAzure — La configuration email fonctionne.'
    );
    
    if (result.success) {
      console.log(`✅ Test email envoyé à ${to} (messageId: ${result.messageId})`);
      res.json({ success: true, message: `Email envoyé à ${to}`, messageId: result.messageId, provider: config.provider });
    } else {
      console.error(`❌ Test email échoué vers ${to}:`, result.error);
      res.json({ success: false, error: result.error, provider: config.provider, details: `Host: ${config.host || 'Mailjet'}, Port: ${config.port}, Secure: ${config.secure}, User: ${config.user}, From: ${config.fromEmail || config.user}` });
    }
  } catch (e) {
    console.error('❌ Test email exception:', e);
    res.json({ success: false, error: e.message, stack: e.stack?.split('\n')[1]?.trim() });
  }
});

// ============================================
// STATS API (cached 5 min)
// ============================================
let statsCache = null;
let statsCacheTime = 0;
const STATS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================
// Rapport HTML
// ============================================
const { generateReport } = require('./reportGenerator');
const { generateFinOpsReport, generateFinOpsHTML } = require('./finops');

// GET /api/admin/report - Générer un rapport HTML
app.get('/api/admin/report', authenticateUser, requireAdmin, (req, res) => {
  try {
    const period = req.query.period || '24h';
    const html = generateReport(db, { period, title: `Rapport ShareAzure — ${period}` });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/admin/report/send - Envoyer le rapport par email
app.post('/api/admin/report/send', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { email, period } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email requis' });
    
    const html = generateReport(db, { period: period || '24h', title: `Rapport ShareAzure — ${period || '24h'}` });
    
    const sent = await emailService.sendMail(
      email,
      `📊 Rapport ShareAzure — ${new Date().toLocaleDateString('fr-FR')}`,
      html
    );
    
    if (sent) {
      res.json({ success: true, message: 'Rapport envoyé par email' });
    } else {
      res.json({ success: false, error: 'Erreur envoi email (vérifiez la configuration SMTP)' });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/admin/report/download - Télécharger le rapport en fichier HTML
app.get('/api/admin/report/download', authenticateUser, requireAdmin, (req, res) => {
  try {
    const period = req.query.period || '24h';
    const html = generateReport(db, { period, title: `Rapport ShareAzure — ${period}` });
    const date = new Date().toISOString().substring(0, 10);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rapport-shareazure-${date}.html"`);
    res.send(html);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============================================
// FinOps Routes
// ============================================

// GET /api/admin/finops - Rapport FinOps JSON
app.get('/api/admin/finops', authenticateUser, requireAdmin, (req, res) => {
  try {
    const report = generateFinOpsReport(db);
    res.json({ success: true, ...report });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/admin/finops/html - Rapport FinOps HTML
app.get('/api/admin/finops/html', authenticateUser, requireAdmin, (req, res) => {
  try {
    const html = generateFinOpsHTML(db);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/admin/finops/send - Envoyer le rapport FinOps par email
app.post('/api/admin/finops/send', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email requis' });
    
    const html = generateFinOpsHTML(db);
    const sent = await emailService.sendMail(
      email,
      `💰 Rapport FinOps ShareAzure — ${new Date().toLocaleDateString('fr-FR')}`,
      html
    );
    
    res.json({ success: sent, message: sent ? 'Rapport FinOps envoyé' : 'Erreur envoi email' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/admin/finops/recalculate - Forcer le recalcul des coûts
app.post('/api/admin/finops/recalculate', authenticateUser, requireAdmin, async (req, res) => {
  try {
    await calculateAllMonthlyCosts();
    res.json({ success: true, message: 'Coûts recalculés' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/admin/stats', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const now = Date.now();
    if (statsCache && (now - statsCacheTime) < STATS_CACHE_TTL) {
      return res.json({ success: true, stats: statsCache });
    }

    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Blob listing
    let totalFiles = 0;
    let totalSize = 0;
    const storageByTier = { hot: { count: 0, size: 0 }, cool: { count: 0, size: 0 }, archive: { count: 0, size: 0 } };
    const allBlobs = [];

    for await (const blob of containerClient.listBlobsFlat({ includeMetadata: true })) {
      totalFiles++;
      const size = blob.properties.contentLength || 0;
      totalSize += size;
      const tier = (blob.properties.accessTier || 'Hot').toLowerCase();
      if (storageByTier[tier]) {
        storageByTier[tier].count++;
        storageByTier[tier].size += size;
      } else {
        storageByTier.hot.count++;
        storageByTier.hot.size += size;
      }
      allBlobs.push({
        name: blob.name,
        size,
        contentType: blob.properties.contentType,
        lastModified: blob.properties.lastModified,
        tier: blob.properties.accessTier || 'Hot',
        originalName: blob.metadata?.originalname || blob.metadata?.originalName || blob.name
      });
    }

    // Recent uploads (last 10)
    allBlobs.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    const recentUploads = allBlobs.slice(0, 10).map(b => ({
      name: b.originalName,
      size: b.size,
      date: b.lastModified,
      contentType: b.contentType
    }));

    // Top 10 biggest files
    const topFiles = [...allBlobs].sort((a, b) => b.size - a.size).slice(0, 10).map(b => ({
      name: b.originalName,
      blobName: b.name,
      size: b.size,
      contentType: b.contentType,
      tier: b.tier
    }));

    // Storage by file type
    const storageByType = { images: { count: 0, size: 0 }, videos: { count: 0, size: 0 }, documents: { count: 0, size: 0 }, other: { count: 0, size: 0 } };
    allBlobs.forEach(b => {
      const ct = (b.contentType || '').toLowerCase();
      let cat = 'other';
      if (ct.startsWith('image/')) cat = 'images';
      else if (ct.startsWith('video/')) cat = 'videos';
      else if (ct.includes('pdf') || ct.includes('document') || ct.includes('spreadsheet') || ct.includes('presentation') || ct.includes('text/') || ct.includes('msword') || ct.includes('officedocument')) cat = 'documents';
      storageByType[cat].count++;
      storageByType[cat].size += b.size;
    });

    // DB stats
    const totalShares = db.prepare('SELECT COUNT(*) as c FROM share_links').get().c;
    const activeShares = db.prepare("SELECT COUNT(*) as c FROM share_links WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))").get().c;
    const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const totalTeams = db.prepare('SELECT COUNT(*) as c FROM teams').get().c;
    let totalScans = 0;
    try { totalScans = db.prepare('SELECT COUNT(*) as c FROM ai_analyses').get().c; } catch (e) {}

    // Storage by team
    const storageByTeam = db.prepare(`
      SELECT t.name as team_name, t.id as team_id,
             COUNT(fo.id) as file_count,
             COALESCE(SUM(fo.file_size), 0) as total_size
      FROM teams t
      LEFT JOIN file_ownership fo ON fo.team_id = t.id
      GROUP BY t.id
      ORDER BY total_size DESC
    `).all();

    statsCache = {
      totalFiles, totalSize, totalShares, activeShares, totalUsers, totalTeams, totalScans,
      storageByTier, recentUploads, topFiles, storageByType, storageByTeam
    };
    statsCacheTime = now;

    res.json({ success: true, stats: statsCache });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, error: 'Erreur lors du calcul des statistiques' });
  }
});

// ============================================
// AUTO-TIERING
// ============================================

async function runAutoTiering(dryRun = false) {
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const globalPolicy = tieringPoliciesDb.getGlobal();
  const allPolicies = tieringPoliciesDb.getAll();
  const teamPolicies = {};
  for (const p of allPolicies) {
    if (p.team_id) teamPolicies[p.team_id] = p;
  }

  const results = [];
  const now = Date.now();

  for await (const blob of containerClient.listBlobsFlat({ includeMetadata: true })) {
    const tier = (blob.properties.accessTier || 'Hot');
    const lastModified = new Date(blob.properties.lastModified);
    const ageDays = Math.floor((now - lastModified.getTime()) / (1000 * 60 * 60 * 24));

    // Determine team
    let teamId = null;
    try {
      const ownership = fileOwnershipDb.getByBlobName ? fileOwnershipDb.getByBlobName(blob.name) : db.prepare('SELECT team_id FROM file_ownership WHERE blob_name = ?').get(blob.name);
      if (ownership) teamId = ownership.team_id;
    } catch (e) { /* ignore */ }

    // Get applicable policy
    const policy = (teamId && teamPolicies[teamId]) ? teamPolicies[teamId] : globalPolicy;
    if (!policy || !policy.enabled) continue;

    let newTier = null;
    if (tier === 'Hot' && ageDays > policy.hot_to_cool_days) {
      newTier = 'Cool';
    } else if (tier === 'Cool' && ageDays > policy.cool_to_archive_days) {
      newTier = 'Archive';
    }

    if (newTier) {
      results.push({
        fileName: blob.name,
        currentTier: tier,
        newTier,
        ageDays,
        teamId,
        teamName: teamId && teamPolicies[teamId] ? teamPolicies[teamId].team_name : null
      });

      if (!dryRun) {
        try {
          const blobClient = containerClient.getBlobClient(blob.name);
          await blobClient.setAccessTier(newTier);
          console.log(`📦 Tiering: ${blob.name} ${tier} → ${newTier} (${ageDays}j)`);
        } catch (err) {
          console.error(`❌ Tiering error for ${blob.name}:`, err.message);
        }
      }
    }
  }

  return results;
}

// Tiering API routes
app.get('/api/admin/tiering/policies', authenticateUser, requireAdmin, (req, res) => {
  try {
    const policies = tieringPoliciesDb.getAll();
    res.json({ success: true, policies });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/admin/tiering/global', authenticateUser, requireAdmin, (req, res) => {
  try {
    const { hotToCoolDays, coolToArchiveDays, enabled } = req.body;
    tieringPoliciesDb.upsertGlobal(hotToCoolDays || 30, coolToArchiveDays || 90, enabled);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/admin/tiering/team/:teamId', authenticateUser, requireAdmin, (req, res) => {
  try {
    const { hotToCoolDays, coolToArchiveDays, enabled } = req.body;
    tieringPoliciesDb.upsertTeam(parseInt(req.params.teamId), hotToCoolDays || 30, coolToArchiveDays || 90, enabled);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/tiering/team/:teamId', authenticateUser, requireAdmin, (req, res) => {
  try {
    const policy = tieringPoliciesDb.getByTeam(parseInt(req.params.teamId));
    if (!policy) return res.status(404).json({ success: false, error: 'Politique non trouvée' });
    tieringPoliciesDb.delete(policy.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/tiering/run', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const results = await runAutoTiering(false);
    res.json({ success: true, message: `${results.length} fichier(s) déplacé(s)`, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/admin/tiering/preview', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const results = await runAutoTiering(true);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// SYNC AZURE BLOBS → DB
// ============================================
app.post('/api/admin/sync-storage', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    let synced = 0, skipped = 0, errors = 0;
    const results = [];

    for await (const blob of containerClient.listBlobsFlat({ includeMetadata: true })) {
      // Skip directory markers
      if (blob.properties.contentType === 'application/x-directory' || blob.name.endsWith('/')) {
        skipped++;
        continue;
      }

      // Check if already in DB
      const existing = db.prepare('SELECT id FROM file_ownership WHERE blob_name = ?').get(blob.name);
      if (existing) {
        skipped++;
        continue;
      }

      try {
        // Determine team from path (e.g., "TeamName/file.pdf" → find team)
        const parts = blob.name.split('/');
        let teamId = null;
        let originalName = blob.name;

        if (parts.length > 1) {
          // First part could be a team name
          const teamName = parts[0];
          const team = db.prepare('SELECT id FROM teams WHERE name = ? COLLATE NOCASE').get(teamName);
          if (team) {
            teamId = team.id;
          }
          originalName = parts[parts.length - 1];
        }

        // Insert into file_ownership
        db.prepare(`
          INSERT INTO file_ownership (blob_name, original_name, content_type, file_size, uploaded_by_user_id, team_id, uploaded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          blob.name,
          originalName,
          blob.properties.contentType || 'application/octet-stream',
          blob.properties.contentLength || 0,
          req.user.id, // Assign to current admin
          teamId,
          blob.properties.lastModified ? new Date(blob.properties.lastModified).toISOString() : new Date().toISOString()
        );

        synced++;
        results.push({ name: blob.name, originalName, team: teamId ? parts[0] : null, size: blob.properties.contentLength });
      } catch (e) {
        errors++;
        console.error(`Sync error for ${blob.name}:`, e.message);
      }
    }

    res.json({
      success: true,
      message: `Synchronisation terminée : ${synced} importé(s), ${skipped} ignoré(s), ${errors} erreur(s)`,
      synced, skipped, errors, results
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST reset storage - delete all blobs and clean DB
app.post('/api/admin/reset-storage', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    let deletedBlobs = 0;
    let errors = 0;

    // Delete all blobs from Azure
    for await (const blob of containerClient.listBlobsFlat()) {
      try {
        await containerClient.getBlockBlobClient(blob.name).delete();
        deletedBlobs++;
      } catch (e) {
        errors++;
        console.error(`Reset: erreur suppression ${blob.name}:`, e.message);
      }
    }

    // Clean DB tables
    const deletedDbRecords = db.prepare('SELECT count(*) as c FROM file_ownership').get().c;
    db.prepare('DELETE FROM file_ownership').run();
    db.prepare('DELETE FROM share_links').run();
    db.prepare('DELETE FROM download_logs').run();
    db.prepare('DELETE FROM file_tiers').run();
    db.prepare('DELETE FROM virus_quarantine').run();
    db.prepare('DELETE FROM operation_logs').run();

    // Log activity
    if (activityLogsDb && activityLogsDb.log) {
      activityLogsDb.log('admin', req.user.id, 'reset_storage', `Reset complet: ${deletedBlobs} blobs supprimés, ${deletedDbRecords} enregistrements nettoyés`);
    }

    res.json({
      success: true,
      message: `Storage réinitialisé : ${deletedBlobs} blob(s) supprimé(s), ${deletedDbRecords} enregistrement(s) nettoyé(s)`,
      deletedBlobs,
      deletedDbRecords,
      errors
    });
  } catch (e) {
    console.error('Reset storage error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET storage structure (list all blobs with hierarchy)
app.get('/api/admin/storage/tree', authenticateUser, requireAdmin, async (req, res) => {
  try {
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobs = [];
    for await (const blob of containerClient.listBlobsFlat({ includeMetadata: true })) {
      blobs.push({
        name: blob.name,
        size: blob.properties.contentLength,
        contentType: blob.properties.contentType,
        lastModified: blob.properties.lastModified,
        tier: blob.properties.accessTier || 'Hot',
        inDb: !!db.prepare('SELECT 1 FROM file_ownership WHERE blob_name = ?').get(blob.name)
      });
    }
    res.json({ success: true, blobs, total: blobs.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Catch-all 404 pour les routes API non trouvées (retourne du JSON, pas du HTML)
app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'Route non trouvée' });
});

// Démarrer le serveur avec migration des utilisateurs
if (require.main === module) {
  (async () => {
    try {
      // Migrer les utilisateurs hardcodés vers la DB
      await migrateHardcodedUsers();

      // Tester la configuration email (optionnel, n'empêche pas le démarrage)
      await emailService.testConnection().catch(() => {
        console.warn('⚠️  Service email non configuré - les emails ne seront pas envoyés');
      });

      app.listen(PORT, '127.0.0.1', () => {
        console.log(`🚀 Serveur démarré sur 127.0.0.1:${PORT} (derrière Nginx)`);
        console.log(`📁 Conteneur Azure: ${containerName}`);
        console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);

        // Démarrer les tâches périodiques
        // Cleanup des comptes expirés toutes les minutes
        setInterval(() => {
          cleanupExpiredGuestAccounts().catch(err =>
            console.error('Erreur tâche cleanup:', err)
          );
        }, 60 * 1000);

        // Notifications d'expiration une fois par jour à 9h
        // Pour les tests, vous pouvez réduire l'intervalle
        setInterval(() => {
          const now = new Date();
          if (now.getHours() === 9 && now.getMinutes() < 1) {
            notifyExpiringGuestAccounts().catch(err =>
              console.error('Erreur tâche notification:', err)
            );
          }
        }, 60 * 1000);

        // Calcul des coûts une fois par jour à 2h du matin
        setInterval(() => {
          const now = new Date();
          if (now.getHours() === 2 && now.getMinutes() < 1) {
            calculateAllMonthlyCosts().catch(err =>
              console.error('Erreur tâche calcul coûts:', err)
            );
          }
        }, 60 * 1000);

        // Vérification des réhydratations toutes les heures
        setInterval(() => {
          checkRehydrationStatus().catch(err =>
            console.error('Erreur tâche réhydratation:', err)
          );
        }, 60 * 60 * 1000);

        // Scans IA planifiés (vérification toutes les 60 secondes)
        setInterval(() => {
          try {
            const scanService = require('./ai/scanService');
            scanService.checkScheduledScans(getBlobBufferHelper);
          } catch (err) {
            console.error('Erreur tâche scans IA:', err.message);
          }
        }, 60 * 1000);

        // Purge des partages expirés toutes les heures
        setInterval(() => {
          try {
            const result = db.prepare(`
              UPDATE share_links SET is_active = 0
              WHERE is_active = 1 AND expires_at < datetime('now')
            `).run();
            if (result.changes > 0) {
              console.log(`🧹 Purge: ${result.changes} partage(s) expiré(s) désactivé(s)`);
            }
          } catch (e) {
            console.error('Purge error:', e.message);
          }
        }, 60 * 60 * 1000);

        // Purge corbeille > 30 jours, quotidien à 4h du matin
        setInterval(() => {
          const now = new Date();
          if (now.getHours() === 4 && now.getMinutes() < 1) {
            (async () => {
              try {
                const trashedFiles = db.prepare(`
                  SELECT * FROM file_ownership
                  WHERE is_trashed = 1 AND trashed_at < datetime('now', '-30 days')
                `).all();
                if (trashedFiles.length === 0) return;
                const cClient = blobServiceClient.getContainerClient(containerName);
                let deleted = 0;
                for (const f of trashedFiles) {
                  try {
                    await cClient.getBlockBlobClient(f.blob_name).deleteIfExists();
                    fileOwnershipDb.delete(f.blob_name);
                    deleted++;
                  } catch (e) { console.error('Purge trash error:', f.blob_name, e.message); }
                }
                if (deleted > 0) {
                  console.log(`🗑️ Purge corbeille: ${deleted} fichier(s) supprimé(s) définitivement (>30j)`);
                  logOperation('trash_auto_purge', { count: deleted });
                }
              } catch (e) { console.error('Erreur purge corbeille:', e.message); }
            })();
          }
        }, 60 * 1000);

        // Auto-tiering quotidien à 3h du matin
        setInterval(() => {
          const now = new Date();
          if (now.getHours() === 3 && now.getMinutes() < 1) {
            runAutoTiering(false).then(results => {
              if (results.length > 0) console.log(`📦 Auto-tiering: ${results.length} fichier(s) déplacé(s)`);
            }).catch(err => console.error('Erreur tâche auto-tiering:', err));
          }
        }, 60 * 1000);

        console.log('✅ Tâches de nettoyage automatique activées');
        console.log('✅ Tâche de calcul des coûts activée (quotidienne à 2h)');
        console.log('✅ Tâche de vérification des réhydratations activée (horaire)');
        console.log('✅ Tâche de scans IA planifiés activée');
      });
    } catch (error) {
      console.error('❌ Erreur lors du démarrage:', error);
      process.exit(1);
    }
  })();
}

module.exports = app;
