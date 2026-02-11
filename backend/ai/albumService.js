const { smartAlbumsDb, mediaAnalysisDb, settingsDb, db } = require('../database');

function createAlbum(data) {
  const result = smartAlbumsDb.create(data);
  return smartAlbumsDb.getById(result.lastInsertRowid);
}

function getAllAlbums() {
  return smartAlbumsDb.getAll();
}

function getAlbum(id) {
  return smartAlbumsDb.getById(id);
}

function updateAlbum(id, data) {
  smartAlbumsDb.update(id, data);
  return smartAlbumsDb.getById(id);
}

function deleteAlbum(id) {
  return smartAlbumsDb.delete(id);
}

function addItem(albumId, blobName, addedBy) {
  return smartAlbumsDb.addItem(albumId, blobName, addedBy);
}

function removeItem(albumId, blobName) {
  return smartAlbumsDb.removeItem(albumId, blobName);
}

function getItems(albumId) {
  return smartAlbumsDb.getItems(albumId);
}

function populateAutoAlbum(albumId) {
  const album = smartAlbumsDb.getById(albumId);
  if (!album || album.type !== 'auto' || !album.rules) return [];

  let rules;
  try {
    rules = typeof album.rules === 'string' ? JSON.parse(album.rules) : album.rules;
  } catch (e) {
    return [];
  }

  // Build query based on rules
  let conditions = [];
  let params = [];

  if (rules.tags && rules.tags.length > 0) {
    const tagConditions = rules.tags.map(tag => {
      params.push(`%${tag}%`);
      return `ma.tags LIKE ?`;
    });
    conditions.push(`(${tagConditions.join(' OR ')})`);
  }

  if (rules.analysisType) {
    conditions.push(`ma.analysis_type = ?`);
    params.push(rules.analysisType);
  }

  if (rules.dateFrom) {
    conditions.push(`ma.created_at >= ?`);
    params.push(rules.dateFrom);
  }

  if (rules.dateTo) {
    conditions.push(`ma.created_at <= ?`);
    params.push(rules.dateTo);
  }

  if (rules.minConfidence) {
    conditions.push(`ma.confidence >= ?`);
    params.push(rules.minConfidence);
  }

  if (rules.faceProfileId) {
    conditions.push(`EXISTS (
      SELECT 1 FROM face_occurrences fo
      WHERE fo.blob_name = ma.blob_name AND fo.face_profile_id = ?
    )`);
    params.push(rules.faceProfileId);
  }

  if (conditions.length === 0) return [];

  const query = `
    SELECT ma.blob_name
    FROM media_analysis ma
    WHERE ma.status = 'completed' AND ${conditions.join(' AND ')}
  `;

  const results = db.prepare(query).all(...params);

  // Add items to the album
  for (const row of results) {
    try {
      smartAlbumsDb.addItem(albumId, row.blob_name, 'auto');
    } catch (e) { /* ignore duplicate */ }
  }

  return results.map(r => r.blob_name);
}

function isEnabled() {
  const aiEnabled = settingsDb.get('aiEnabled');
  const albumsEnabled = settingsDb.get('smartAlbumsEnabled');
  return aiEnabled !== 'false' && albumsEnabled !== 'false';
}

module.exports = {
  createAlbum,
  getAllAlbums,
  getAlbum,
  updateAlbum,
  deleteAlbum,
  addItem,
  removeItem,
  getItems,
  populateAutoAlbum,
  isEnabled
};
