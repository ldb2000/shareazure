/**
 * Report Generator - Génère des rapports HTML formatés
 * Données: actions, corbeille, tiering, coûts
 */

const path = require('path');

function generateReport(db, options = {}) {
  const { period = '24h', title = 'Rapport ShareAzure' } = options;
  
  // Calculer la période
  let sinceClause;
  switch (period) {
    case '7d': sinceClause = "datetime('now', '-7 days')"; break;
    case '30d': sinceClause = "datetime('now', '-30 days')"; break;
    case '24h': default: sinceClause = "datetime('now', '-24 hours')"; break;
  }

  // 1. Actions récentes (activity_logs)
  let actions = [];
  try {
    actions = db.prepare(`
      SELECT *, timestamp as created_at FROM activity_logs 
      WHERE timestamp >= ${sinceClause}
      ORDER BY timestamp DESC
      LIMIT 100
    `).all();
  } catch (e) { console.error('Report: actions error', e.message); }

  // 2. Fichiers mis en corbeille
  let trashedFiles = [];
  try {
    trashedFiles = db.prepare(`
      SELECT fo.*, u.username as trashed_by_name
      FROM file_ownership fo
      LEFT JOIN users u ON fo.trashed_by = u.id
      WHERE fo.is_trashed = 1 AND fo.trashed_at >= ${sinceClause}
      ORDER BY fo.trashed_at DESC
    `).all();
  } catch (e) { console.error('Report: trash error', e.message); }

  // 3. Fichiers actuellement en corbeille
  let allTrashed = [];
  try {
    allTrashed = db.prepare(`
      SELECT fo.*, u.username as trashed_by_name,
        CAST((julianday('now') - julianday(fo.trashed_at)) AS INTEGER) as days_in_trash
      FROM file_ownership fo
      LEFT JOIN users u ON fo.trashed_by = u.id
      WHERE fo.is_trashed = 1
      ORDER BY fo.trashed_at ASC
    `).all();
  } catch (e) { console.error('Report: all trash error', e.message); }

  // 4. Changements de tiering
  let tierChanges = [];
  try {
    tierChanges = db.prepare(`
      SELECT * FROM file_tiers
      WHERE updated_at >= ${sinceClause}
      ORDER BY updated_at DESC
    `).all();
  } catch (e) { console.error('Report: tiers error', e.message); }

  // 5. Coûts
  let costs = [];
  try {
    costs = db.prepare(`
      SELECT * FROM cost_tracking
      ORDER BY period_start DESC
      LIMIT 12
    `).all();
  } catch (e) { console.error('Report: costs error', e.message); }

  // 6. Stats stockage
  let storageStats = {};
  try {
    const total = db.prepare(`SELECT COUNT(*) as count, SUM(file_size) as total_size FROM file_ownership WHERE is_trashed = 0 OR is_trashed IS NULL`).get();
    const trashed = db.prepare(`SELECT COUNT(*) as count, SUM(file_size) as total_size FROM file_ownership WHERE is_trashed = 1`).get();
    const teams = db.prepare(`SELECT t.name, COUNT(fo.id) as file_count, SUM(fo.file_size) as total_size
      FROM teams t LEFT JOIN file_ownership fo ON fo.team_id = t.id AND (fo.is_trashed = 0 OR fo.is_trashed IS NULL)
      GROUP BY t.id`).all();
    storageStats = { total, trashed, teams };
  } catch (e) { console.error('Report: storage error', e.message); }

  // 7. Activité invités
  let guestStats = {};
  try {
    const total = db.prepare(`SELECT COUNT(*) as count FROM guest_accounts`).get();
    const active = db.prepare(`SELECT COUNT(*) as count FROM guest_accounts WHERE is_active = 1 AND pending_approval = 0`).get();
    const pending = db.prepare(`SELECT COUNT(*) as count FROM guest_accounts WHERE pending_approval = 1`).get();
    guestStats = { total: total.count, active: active.count, pending: pending.count };
  } catch (e) { console.error('Report: guests error', e.message); }

  // 8. Partages actifs
  let shareStats = {};
  try {
    const active = db.prepare(`SELECT COUNT(*) as count FROM share_links WHERE is_active = 1`).get();
    const expired = db.prepare(`SELECT COUNT(*) as count FROM share_links WHERE is_active = 0`).get();
    const downloads = db.prepare(`SELECT COUNT(*) as count FROM download_logs WHERE downloaded_at >= ${sinceClause}`).get();
    shareStats = { active: active.count, expired: expired.count, recentDownloads: downloads.count };
  } catch (e) { console.error('Report: shares error', e.message); }

  // Générer le HTML
  return buildHTML({
    title,
    period,
    generatedAt: new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
    actions,
    trashedFiles,
    allTrashed,
    tierChanges,
    costs,
    storageStats,
    guestStats,
    shareStats
  });
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 o';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('fr-FR', { 
    timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getActionLabel(type) {
  const labels = {
    file_trashed: '🗑️ Corbeille', file_restored: '♻️ Restauré', trash_emptied: '🧹 Corbeille vidée',
    trash_auto_purge: '🧹 Purge auto', guest_account_created: '👤 Invité créé',
    guest_approved: '✅ Invité approuvé', auth_login: '🔐 Connexion',
    file_uploaded: '📤 Upload', file_downloaded: '📥 Téléchargement',
    share_created: '🔗 Partage créé', share_accessed: '🔗 Partage accédé',
    admin_login: '🔐 Admin', user_login: '🔐 User', tier_changed: '📦 Tier changé',
    reset_storage: '⚠️ Reset stockage'
  };
  return labels[type] || `📌 ${type}`;
}

function getTierBadge(tier) {
  const colors = { Hot: '#ef4444', Cool: '#3b82f6', Archive: '#6b7280' };
  const color = colors[tier] || '#888';
  return `<span style="background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">${tier || '?'}</span>`;
}

function buildHTML(data) {
  const periodLabel = { '24h': 'dernières 24h', '7d': '7 derniers jours', '30d': '30 derniers jours' }[data.period] || data.period;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(data.title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0f2f5; color: #1a1a2e; line-height: 1.6; }
  .container { max-width: 800px; margin: 0 auto; padding: 20px; }
  .header { background: linear-gradient(135deg, #0a1628 0%, #1a365d 100%); color: #fff; padding: 32px; border-radius: 16px 16px 0 0; text-align: center; }
  .header h1 { font-size: 1.8rem; margin-bottom: 4px; }
  .header .subtitle { color: #94a3b8; font-size: 0.9rem; }
  .header .logo { font-size: 2.5rem; margin-bottom: 8px; }
  .body-wrap { background: #fff; padding: 0; border-radius: 0 0 16px 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden; }
  .section { padding: 24px 32px; border-bottom: 1px solid #e5e7eb; }
  .section:last-child { border-bottom: none; }
  .section-title { font-size: 1.1rem; font-weight: 700; color: #0a1628; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
  .section-title .icon { font-size: 1.3rem; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; text-align: center; }
  .stat-value { font-size: 1.8rem; font-weight: 800; color: #0a1628; }
  .stat-label { font-size: 0.8rem; color: #64748b; margin-top: 2px; }
  .stat-card.blue { border-left: 4px solid #3b82f6; }
  .stat-card.green { border-left: 4px solid #10b981; }
  .stat-card.orange { border-left: 4px solid #f59e0b; }
  .stat-card.red { border-left: 4px solid #ef4444; }
  .stat-card.purple { border-left: 4px solid #8b5cf6; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th { background: #f1f5f9; color: #475569; font-weight: 600; padding: 10px 12px; text-align: left; border-bottom: 2px solid #e2e8f0; }
  td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  tr:hover td { background: #f8fafc; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
  .badge-green { background: #d1fae5; color: #065f46; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-orange { background: #fff7ed; color: #9a3412; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-gray { background: #f3f4f6; color: #374151; }
  .progress-bar { background: #e5e7eb; border-radius: 4px; height: 8px; overflow: hidden; margin-top: 4px; }
  .progress-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .empty-state { text-align: center; padding: 24px; color: #94a3b8; font-style: italic; }
  .cost-trend { display: flex; align-items: center; gap: 4px; }
  .cost-up { color: #ef4444; }
  .cost-down { color: #10b981; }
  .footer { text-align: center; padding: 20px; color: #94a3b8; font-size: 0.8rem; }
  .footer a { color: #3b82f6; text-decoration: none; }
  @media (max-width: 600px) {
    .container { padding: 8px; }
    .section { padding: 16px; }
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .header { padding: 20px; }
    .header h1 { font-size: 1.3rem; }
  }
</style>
</head>
<body>
<div class="container">

<!-- Header -->
<div class="header">
  <div class="logo">📊</div>
  <h1>${escapeHtml(data.title)}</h1>
  <div class="subtitle">Période : ${periodLabel} · Généré le ${data.generatedAt}</div>
</div>

<div class="body-wrap">

<!-- Vue d'ensemble -->
<div class="section">
  <div class="section-title"><span class="icon">📈</span> Vue d'ensemble</div>
  <div class="stats-grid">
    <div class="stat-card blue">
      <div class="stat-value">${data.storageStats.total ? data.storageStats.total.count : 0}</div>
      <div class="stat-label">Fichiers actifs</div>
    </div>
    <div class="stat-card green">
      <div class="stat-value">${data.storageStats.total ? formatSize(data.storageStats.total.total_size || 0) : '0'}</div>
      <div class="stat-label">Stockage utilisé</div>
    </div>
    <div class="stat-card orange">
      <div class="stat-value">${data.storageStats.trashed ? data.storageStats.trashed.count : 0}</div>
      <div class="stat-label">En corbeille</div>
    </div>
    <div class="stat-card red">
      <div class="stat-value">${data.shareStats.active || 0}</div>
      <div class="stat-label">Partages actifs</div>
    </div>
    <div class="stat-card purple">
      <div class="stat-value">${data.guestStats.active || 0}</div>
      <div class="stat-label">Invités actifs</div>
    </div>
  </div>
</div>

<!-- Actions récentes -->
<div class="section">
  <div class="section-title"><span class="icon">⚡</span> Actions récentes (${data.actions.length})</div>
  ${data.actions.length > 0 ? `
  <table>
    <thead><tr><th>Action</th><th>Utilisateur</th><th>Détails</th><th>Date</th></tr></thead>
    <tbody>
      ${data.actions.slice(0, 30).map(a => {
        const op = a.operation || a.operation_type || a.type || '';
        const user = a.username || '—';
        const msg = a.message && a.message !== op ? a.message : '';
        let details = '';
        try { 
          const d = JSON.parse(a.details || '{}');
          if (!msg) details = Object.entries(d).filter(([k]) => !['username'].includes(k)).map(([k,v]) => `${k}: ${v}`).join(', ');
        } catch(e) { details = a.details || ''; }
        return `<tr>
          <td><span class="badge badge-blue">${getActionLabel(op)}</span></td>
          <td><strong>${escapeHtml(user)}</strong></td>
          <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(msg || details).substring(0, 100)}</td>
          <td style="white-space:nowrap;">${formatDate(a.created_at)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
  ${data.actions.length > 30 ? `<p style="text-align:center;color:#94a3b8;margin-top:8px;">... et ${data.actions.length - 30} autres actions</p>` : ''}
  ` : '<div class="empty-state">Aucune action sur cette période</div>'}
</div>

<!-- Corbeille -->
<div class="section">
  <div class="section-title"><span class="icon">🗑️</span> Corbeille</div>
  
  ${data.trashedFiles.length > 0 ? `
  <h4 style="font-size:0.9rem;color:#475569;margin-bottom:10px;">Fichiers mis en corbeille récemment</h4>
  <table>
    <thead><tr><th>Fichier</th><th>Taille</th><th>Par</th><th>Date</th></tr></thead>
    <tbody>
      ${data.trashedFiles.map(f => `<tr>
        <td>${escapeHtml(f.original_name || f.blob_name)}</td>
        <td>${formatSize(f.file_size)}</td>
        <td>${escapeHtml(f.trashed_by_name || '—')}</td>
        <td style="white-space:nowrap;">${formatDate(f.trashed_at)}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : '<p style="color:#94a3b8;margin-bottom:12px;">Aucun fichier mis en corbeille sur cette période</p>'}

  ${data.allTrashed.length > 0 ? `
  <h4 style="font-size:0.9rem;color:#475569;margin:16px 0 10px;">Fichiers en corbeille (${data.allTrashed.length})</h4>
  <table>
    <thead><tr><th>Fichier</th><th>Taille</th><th>Jours restants</th><th>Suppression auto</th></tr></thead>
    <tbody>
      ${data.allTrashed.map(f => {
        const daysLeft = Math.max(0, 30 - (f.days_in_trash || 0));
        const pct = Math.min(100, ((f.days_in_trash || 0) / 30) * 100);
        const barColor = daysLeft <= 5 ? '#ef4444' : daysLeft <= 15 ? '#f59e0b' : '#10b981';
        return `<tr>
          <td>${escapeHtml(f.original_name || f.blob_name)}</td>
          <td>${formatSize(f.file_size)}</td>
          <td>
            <strong style="color:${barColor};">${daysLeft}j</strong>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${barColor};"></div></div>
          </td>
          <td style="white-space:nowrap;">${daysLeft <= 0 ? '<span class="badge badge-red">Imminent</span>' : formatDate(new Date(new Date(f.trashed_at).getTime() + 30*24*60*60*1000).toISOString())}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>` : ''}
</div>

<!-- Tiering -->
<div class="section">
  <div class="section-title"><span class="icon">📦</span> Changements de tiering</div>
  ${data.tierChanges.length > 0 ? `
  <table>
    <thead><tr><th>Fichier</th><th>Tier</th><th>Mis à jour</th></tr></thead>
    <tbody>
      ${data.tierChanges.map(t => `<tr>
        <td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(t.blob_name)}</td>
        <td>${getTierBadge(t.current_tier)}</td>
        <td style="white-space:nowrap;">${formatDate(t.updated_at)}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : '<div class="empty-state">Aucun changement de tiering sur cette période</div>'}
</div>

<!-- Coûts -->
<div class="section">
  <div class="section-title"><span class="icon">💰</span> Évolution des coûts</div>
  ${data.costs.length > 0 ? `
  <table>
    <thead><tr><th>Période</th><th>Type</th><th>Entité</th><th>Opérations</th><th>Stockage</th><th>Total</th><th>Tendance</th></tr></thead>
    <tbody>
      ${data.costs.map((c, i) => {
        const prev = data.costs[i + 1];
        const total = (c.operation_cost || 0) + (c.storage_cost || 0);
        const prevTotal = prev ? (prev.operation_cost || 0) + (prev.storage_cost || 0) : total;
        const trend = total > prevTotal ? '📈' : total < prevTotal ? '📉' : '➡️';
        const trendClass = total > prevTotal ? 'cost-up' : total < prevTotal ? 'cost-down' : '';
        const pctChange = prevTotal > 0 ? (((total - prevTotal) / prevTotal) * 100).toFixed(1) : '0';
        return `<tr>
          <td style="white-space:nowrap;">${c.period_start ? c.period_start.substring(0, 10) : '—'}</td>
          <td><span class="badge badge-gray">${c.entity_type || '—'}</span></td>
          <td>${c.entity_id || '—'}</td>
          <td>${(c.operation_cost || 0).toFixed(4)} €</td>
          <td>${(c.storage_cost || 0).toFixed(4)} €</td>
          <td><strong>${total.toFixed(4)} €</strong></td>
          <td class="cost-trend ${trendClass}">${trend} ${pctChange}%</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>` : '<div class="empty-state">Aucune donnée de coûts disponible</div>'}
</div>

<!-- Stockage par équipe -->
<div class="section">
  <div class="section-title"><span class="icon">👥</span> Stockage par équipe</div>
  ${data.storageStats.teams && data.storageStats.teams.length > 0 ? `
  <table>
    <thead><tr><th>Équipe</th><th>Fichiers</th><th>Taille</th></tr></thead>
    <tbody>
      ${data.storageStats.teams.map(t => `<tr>
        <td><strong>${escapeHtml(t.name)}</strong></td>
        <td>${t.file_count || 0}</td>
        <td>${formatSize(t.total_size || 0)}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : '<div class="empty-state">Aucune donnée d\'équipe</div>'}
</div>

<!-- Invités -->
<div class="section">
  <div class="section-title"><span class="icon">👤</span> Invités</div>
  <div class="stats-grid">
    <div class="stat-card green">
      <div class="stat-value">${data.guestStats.active || 0}</div>
      <div class="stat-label">Actifs</div>
    </div>
    <div class="stat-card orange">
      <div class="stat-value">${data.guestStats.pending || 0}</div>
      <div class="stat-label">En attente d'approbation</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-value">${data.guestStats.total || 0}</div>
      <div class="stat-label">Total</div>
    </div>
  </div>
</div>

<!-- Partages -->
<div class="section">
  <div class="section-title"><span class="icon">🔗</span> Partages</div>
  <div class="stats-grid">
    <div class="stat-card green">
      <div class="stat-value">${data.shareStats.active || 0}</div>
      <div class="stat-label">Liens actifs</div>
    </div>
    <div class="stat-card gray">
      <div class="stat-value">${data.shareStats.expired || 0}</div>
      <div class="stat-label">Expirés</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-value">${data.shareStats.recentDownloads || 0}</div>
      <div class="stat-label">Téléchargements récents</div>
    </div>
  </div>
</div>

</div>

<div class="footer">
  <p>ShareAzure · <a href="https://shareazure.deberti.fr">shareazure.deberti.fr</a></p>
  <p style="margin-top:4px;">Rapport généré automatiquement par Le Claude 🤖</p>
</div>

</div>
</body>
</html>`;
}

module.exports = { generateReport };
