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
const { db, shareLinksDb, downloadLogsDb, settingsDb, allowedEmailDomainsDb, usersDb, guestAccountsDb, fileOwnershipDb, teamsDb, teamMembersDb, costTrackingDb, operationLogsDb, fileTiersDb } = require('./database');
const { migrateHardcodedUsers } = require('./migrateUsers');
const emailService = require('./emailService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de sécurité
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limite chaque IP à 100 requêtes par fenêtre
});
app.use('/api/', limiter);

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
const logOperation = (operation, details) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    operation,
    ...details
  };
  console.log(JSON.stringify(logEntry));
  // Ici vous pouvez envoyer vers Application Insights si configuré
};

// ============================================
// MIDDLEWARES D'AUTHENTIFICATION
// ============================================

/**
 * Middleware pour authentifier un utilisateur (admin, april_user, user)
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
      // Upload guest
      const guestPrefix = `guests/${req.guest.id}/`;
      folderPath = guestPrefix + (folderPath || '');
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
      uploadedBy: uploaderInfo
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
        WHERE fo.team_id = ?
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
      } else if (req.user.role === 'april_user') {
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
app.get('/api/preview/:blobName', async (req, res) => {
  try {
    const { blobName } = req.params;
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
    } else if (req.user.role === 'april_user') {
      // April_user peut supprimer ses fichiers + fichiers de ses invités
      if (fileOwnership.uploaded_by_user_id === req.user.id) {
        canDelete = true;
      } else if (fileOwnership.uploaded_by_guest_id) {
        // Vérifier si l'invité a été créé par cet april_user
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
      originalOwner: fileOwnership.user_owner || fileOwnership.guest_owner
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
    const { blobName, expiresInMinutes = 60, permissions = 'r', password, recipientEmail } = req.body;

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

    // Hasher le mot de passe si fourni
    let passwordHash = null;
    if (password && password.trim()) {
      passwordHash = await bcrypt.hash(password.trim(), 10);
    }

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
      shareUrl: passwordHash ? protectedUrl : sasUrl, // URL protégée si mot de passe
      passwordHash,
      recipientEmail: emailList.join(','), // Stocker tous les emails séparés par des virgules
      expiresAt: expiresOn.toISOString(),
      expiresInMinutes,
      createdBy: username || null
    });

    // Générer le QR Code
    const qrCodeDataUrl = await QRCode.toDataURL(passwordHash ? protectedUrl : sasUrl);

    logOperation('share_link_generated', {
      linkId,
      blobName,
      expiresInMinutes,
      expiresAt: expiresOn.toISOString(),
      hasPassword: !!passwordHash
    });

    res.json({
      success: true,
      linkId,
      shareLink: passwordHash ? protectedUrl : sasUrl,
      directLink: sasUrl, // Lien SAS direct (pour usage interne)
      expiresAt: expiresOn.toISOString(),
      expiresInMinutes,
      qrCode: qrCodeDataUrl,
      hasPassword: !!passwordHash,
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

    // Envoyer le fichier
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
      logOperation('email_domain_added', { domain: domain.trim(), addedBy: username });
      
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

    logOperation('email_domain_deleted', { domain });
    
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

    logOperation('email_domain_activated', { domain });
    
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

    logOperation('email_domain_deactivated', { domain });
    
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
    // L'authentification est déjà faite par le middleware
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
app.post('/api/admin/guest-accounts', authenticateUser, requireRole('admin', 'april_user'), async (req, res) => {
  try {
    const { email } = req.body;

    // Validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Email invalide'
      });
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
    const accountExpirationDays = parseInt(settingsDb.get('guestAccountExpirationDays') || '3');

    const now = new Date();
    const codeExpiresAt = new Date(now.getTime() + codeExpirationHours * 60 * 60 * 1000);
    const accountExpiresAt = new Date(now.getTime() + accountExpirationDays * 24 * 60 * 60 * 1000);

    // Créer l'invité
    const guestId = uuidv4();
    const result = guestAccountsDb.create({
      guestId: guestId,
      email: email,
      verificationCode: verificationCode, // Stocké temporairement, sera supprimé après usage
      codeHash: codeHash,
      codeExpiresAt: codeExpiresAt.toISOString(),
      accountExpiresAt: accountExpiresAt.toISOString(),
      createdByUserId: req.user.id
    });

    // Envoyer l'email avec le code
    const emailSent = await emailService.sendGuestCode(email, verificationCode, codeExpirationHours);

    logOperation('guest_account_created', {
      guestId,
      email,
      createdBy: req.user.username,
      emailSent
    });

    res.json({
      success: true,
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
app.get('/api/admin/guest-accounts', authenticateUser, requireRole('admin', 'april_user'), (req, res) => {
  try {
    let guests;

    // Admin voit tous les invités, april_user voit uniquement les siens
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

// Route PUT /api/admin/guest-accounts/:guestId/disable - Désactiver un invité
app.put('/api/admin/guest-accounts/:guestId/disable', authenticateUser, requireRole('admin', 'april_user'), (req, res) => {
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

    // Vérifier les permissions (april_user ne peut désactiver que ses propres invités)
    if (req.user.role === 'april_user' && guest.created_by_user_id !== req.user.id) {
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
app.delete('/api/admin/guest-accounts/:guestId', authenticateUser, requireRole('admin', 'april_user'), async (req, res) => {
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

    // Vérifier les permissions (april_user ne peut supprimer que ses propres invités)
    if (req.user.role === 'april_user' && guest.created_by_user_id !== req.user.id) {
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
    const pathParts = oldPath.split('/');
    pathParts[pathParts.length - 1] = newName;
    const newPath = pathParts.join('/');
    
    if (oldPath.endsWith('/')) {
      // C'est un dossier
      const oldFolderPath = oldPath;
      const newFolderPath = newPath + '/';
      
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
// API ÉQUIPES (TEAMS)
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

    if (!tier || !['Cool', 'Archive'].includes(tier)) {
      return res.status(400).json({
        success: false,
        error: 'Tier invalide. Valeurs possibles: Cool, Archive'
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

// Démarrer le serveur avec migration des utilisateurs
if (require.main === module) {
  (async () => {
    try {
      // Migrer les utilisateurs hardcodés vers la DB
      await migrateHardcodedUsers();

      // Tester la configuration email (optionnel, n'empêche pas le démarrage)
      await emailService.testEmailConfiguration().catch(() => {
        console.warn('⚠️  Service email non configuré - les emails ne seront pas envoyés');
      });

      app.listen(PORT, () => {
        console.log(`🚀 Serveur démarré sur le port ${PORT}`);
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

        console.log('✅ Tâches de nettoyage automatique activées');
        console.log('✅ Tâche de calcul des coûts activée (quotidienne à 2h)');
        console.log('✅ Tâche de vérification des réhydratations activée (horaire)');
      });
    } catch (error) {
      console.error('❌ Erreur lors du démarrage:', error);
      process.exit(1);
    }
  })();
}

module.exports = app;
