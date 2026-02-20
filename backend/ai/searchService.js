const { searchIndexDb, mediaAnalysisDb, db, settingsDb } = require('../database');

function search(query, options = {}) {
  const { type, dateFrom, dateTo, tags, faceProfileId, limit = 50 } = options;

  // Use FTS5 search
  let ftsResults;
  try {
    ftsResults = searchIndexDb.search(query, limit);
  } catch (e) {
    // Fallback to LIKE search if FTS fails
    ftsResults = fallbackSearch(query, limit);
  }

  // Apply additional filters
  let results = ftsResults;

  if (type || dateFrom || dateTo || tags || faceProfileId) {
    const blobNames = results.map(r => r.blob_name);
    if (blobNames.length === 0) return [];

    let conditions = [`ma.blob_name IN (${blobNames.map(() => '?').join(',')})`];
    let params = [...blobNames];

    if (type) {
      conditions.push(`ma.analysis_type = ?`);
      params.push(type);
    }

    if (dateFrom) {
      conditions.push(`ma.created_at >= ?`);
      params.push(dateFrom);
    }

    if (dateTo) {
      conditions.push(`ma.created_at <= ?`);
      params.push(dateTo);
    }

    if (tags && tags.length > 0) {
      const tagConditions = tags.map(t => {
        params.push(`%${t}%`);
        return `ma.tags LIKE ?`;
      });
      conditions.push(`(${tagConditions.join(' OR ')})`);
    }

    if (faceProfileId) {
      conditions.push(`EXISTS (
        SELECT 1 FROM face_occurrences fo
        WHERE fo.blob_name = ma.blob_name AND fo.face_profile_id = ?
      )`);
      params.push(faceProfileId);
    }

    const query = `
      SELECT ma.* FROM media_analysis ma
      WHERE ${conditions.join(' AND ')}
      ORDER BY ma.created_at DESC
    `;

    results = db.prepare(query).all(...params);
  }

  return results;
}

function fallbackSearch(query, limit) {
  const pattern = `%${query}%`;
  const stmt = db.prepare(`
    SELECT blob_name FROM media_analysis
    WHERE tags LIKE ? OR description LIKE ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(pattern, pattern, limit);
}

function getSuggestions(prefix) {
  if (!prefix || prefix.length < 2) return [];

  // Get tag suggestions
  const tagSuggestions = new Set();

  const analyses = db.prepare(`
    SELECT tags FROM media_analysis WHERE tags IS NOT NULL AND status = 'completed'
  `).all();

  for (const analysis of analyses) {
    try {
      const tags = JSON.parse(analysis.tags);
      if (Array.isArray(tags)) {
        for (const tag of tags) {
          if (typeof tag === 'string' && tag.toLowerCase().startsWith(prefix.toLowerCase())) {
            tagSuggestions.add(tag.toLowerCase());
          }
        }
      }
    } catch (e) { /* ignore */ }
  }

  return Array.from(tagSuggestions).slice(0, 10);
}

function getAllTags() {
  const tagCounts = {};

  // Tags from AI analysis
  const analyses = db.prepare(`
    SELECT tags FROM media_analysis WHERE tags IS NOT NULL AND status = 'completed'
  `).all();

  for (const analysis of analyses) {
    try {
      const tags = JSON.parse(analysis.tags);
      if (Array.isArray(tags)) {
        for (const tag of tags) {
          const normalizedTag = typeof tag === 'string' ? tag.toLowerCase() : String(tag).toLowerCase();
          tagCounts[normalizedTag] = (tagCounts[normalizedTag] || 0) + 1;
        }
      }
    } catch (e) { /* ignore */ }
  }

  // Tags from manual file_tags table
  try {
    const manualTags = db.prepare(`
      SELECT tag, COUNT(*) as count FROM file_tags GROUP BY tag
    `).all();
    for (const row of manualTags) {
      const normalizedTag = row.tag.toLowerCase();
      tagCounts[normalizedTag] = (tagCounts[normalizedTag] || 0) + row.count;
    }
  } catch (e) { /* file_tags table may not exist */ }

  return Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

function getFilesByTag(tag) {
  const results = [];
  const seenBlobs = new Set();

  // AI analysis tags
  const pattern = `%"${tag}"%`;
  const aiResults = db.prepare(`
    SELECT * FROM media_analysis
    WHERE tags LIKE ? AND status = 'completed'
    ORDER BY created_at DESC
  `).all(pattern);
  for (const r of aiResults) {
    seenBlobs.add(r.blob_name);
    results.push(r);
  }

  // Manual file_tags
  try {
    const manualResults = db.prepare(`
      SELECT ft.blob_name, fo.original_name, fo.content_type, fo.size, fo.uploaded_at as created_at
      FROM file_tags ft
      LEFT JOIN file_ownership fo ON ft.blob_name = fo.blob_name
      WHERE LOWER(ft.tag) = LOWER(?)
      ORDER BY fo.uploaded_at DESC
    `).all(tag);
    for (const r of manualResults) {
      if (!seenBlobs.has(r.blob_name)) {
        seenBlobs.add(r.blob_name);
        results.push(r);
      }
    }
  } catch (e) { /* file_tags table may not exist */ }

  return results;
}

function updateIndex(blobName, data) {
  return searchIndexDb.upsert({
    blobName,
    tags: data.tags || '',
    description: data.description || '',
    transcription: data.transcription || '',
    ocrText: data.ocrText || '',
    faces: data.faces || ''
  });
}

function removeFromIndex(blobName) {
  return searchIndexDb.delete(blobName);
}

function rebuildIndex() {
  return searchIndexDb.rebuild();
}

function isEnabled() {
  const aiEnabled = settingsDb.get('aiEnabled');
  const searchEnabled = settingsDb.get('searchEnabled');
  return aiEnabled !== 'false' && searchEnabled !== 'false';
}

module.exports = {
  search,
  getSuggestions,
  getAllTags,
  getFilesByTag,
  updateIndex,
  removeFromIndex,
  rebuildIndex,
  isEnabled
};
