/**
 * FinOps Agent — Suivi détaillé des coûts Azure Storage
 * 
 * Tarifs Azure Blob Storage (France Central, LRS) — février 2026:
 * - Hot:     0.0184 €/Go/mois   | Écriture: 0.05€/10k | Lecture: 0.004€/10k
 * - Cool:    0.01 €/Go/mois     | Écriture: 0.10€/10k | Lecture: 0.01€/10k  | Accès: 0.01€/Go
 * - Archive: 0.00099 €/Go/mois  | Écriture: 0.10€/10k | Lecture: 5.00€/10k  | Réhydratation: 0.022€/Go
 * - Bande passante sortante: 0.074€/Go (5 premiers Go gratuits)
 * - Liste/Containers: 0.05€/10k opérations
 */

const PRICING = {
  storage: {
    hot:     0.0184,   // €/Go/mois
    cool:    0.01,     // €/Go/mois
    archive: 0.00099   // €/Go/mois
  },
  operations: {
    hot:     { write: 0.05 / 10000, read: 0.004 / 10000, list: 0.05 / 10000, other: 0.004 / 10000 },
    cool:    { write: 0.10 / 10000, read: 0.01 / 10000,  list: 0.05 / 10000, other: 0.01 / 10000 },
    archive: { write: 0.10 / 10000, read: 5.00 / 10000,  list: 0.05 / 10000, other: 5.00 / 10000 }
  },
  dataAccess: {
    cool: 0.01,     // €/Go lu
    archive: 0.022  // €/Go réhydraté
  },
  bandwidth: {
    egress: 0.074,      // €/Go sortant
    freeEgressGb: 5     // 5 Go gratuits/mois
  }
};

/**
 * Génère un rapport FinOps complet
 */
function generateFinOpsReport(db) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // 1. Stockage actuel par tier
  const storageByTier = getStorageByTier(db);
  
  // 2. Opérations du mois
  const monthOps = getMonthlyOperations(db, currentMonth);
  
  // 3. Coûts calculés
  const costs = calculateCosts(storageByTier, monthOps);
  
  // 4. Coûts par utilisateur
  const costsByUser = getCostsByUser(db, currentMonth);
  
  // 5. Coûts par équipe
  const costsByTeam = getCostsByTeam(db, currentMonth);
  
  // 6. Top fichiers les plus coûteux
  const topFiles = getTopCostlyFiles(db);
  
  // 7. Historique des coûts (6 derniers mois)
  const history = getCostHistory(db);
  
  // 8. Prévisions
  const forecast = forecastCosts(costs, now);

  return {
    generatedAt: now.toISOString(),
    month: currentMonth,
    pricing: PRICING,
    storage: storageByTier,
    operations: monthOps,
    costs,
    costsByUser,
    costsByTeam,
    topFiles,
    history,
    forecast
  };
}

function getStorageByTier(db) {
  // Depuis file_ownership + file_tiers
  let hot = 0, cool = 0, archive = 0, trashed = 0;
  let hotCount = 0, coolCount = 0, archiveCount = 0, trashedCount = 0;
  
  try {
    const files = db.prepare(`
      SELECT fo.blob_name, fo.file_size, fo.is_trashed,
             COALESCE(ft.current_tier, 'Hot') as tier
      FROM file_ownership fo
      LEFT JOIN file_tiers ft ON fo.blob_name = ft.blob_name
    `).all();
    
    for (const f of files) {
      const sizeGb = (f.file_size || 0) / (1024 * 1024 * 1024);
      if (f.is_trashed) {
        trashed += sizeGb; trashedCount++;
      } else {
        switch ((f.tier || 'Hot').toLowerCase()) {
          case 'cool': cool += sizeGb; coolCount++; break;
          case 'archive': archive += sizeGb; archiveCount++; break;
          default: hot += sizeGb; hotCount++; break;
        }
      }
    }
  } catch (e) { console.error('FinOps storage error:', e.message); }

  return {
    hot: { sizeGb: hot, count: hotCount, costPerMonth: hot * PRICING.storage.hot },
    cool: { sizeGb: cool, count: coolCount, costPerMonth: cool * PRICING.storage.cool },
    archive: { sizeGb: archive, count: archiveCount, costPerMonth: archive * PRICING.storage.archive },
    trashed: { sizeGb: trashed, count: trashedCount, costPerMonth: trashed * PRICING.storage.archive }, // trashed = archive tier
    total: {
      sizeGb: hot + cool + archive + trashed,
      count: hotCount + coolCount + archiveCount + trashedCount,
      costPerMonth: hot * PRICING.storage.hot + cool * PRICING.storage.cool + (archive + trashed) * PRICING.storage.archive
    }
  };
}

function getMonthlyOperations(db, month) {
  let ops = { write: 0, read: 0, list: 0, other: 0, bytesUploaded: 0, bytesDownloaded: 0 };
  try {
    const rows = db.prepare(`
      SELECT operation_type, SUM(operation_count) as count, SUM(bytes_transferred) as bytes
      FROM operation_logs WHERE period_month = ?
      GROUP BY operation_type
    `).all(month);
    
    for (const r of rows) {
      switch (r.operation_type) {
        case 'write': ops.write += r.count; ops.bytesUploaded += r.bytes; break;
        case 'read': ops.read += r.count; ops.bytesDownloaded += r.bytes; break;
        case 'list': ops.list += r.count; break;
        default: ops.other += r.count; break;
      }
    }
  } catch (e) { console.error('FinOps ops error:', e.message); }
  
  // Aussi compter les downloads depuis download_logs
  try {
    const dl = db.prepare(`
      SELECT COUNT(*) as count FROM download_logs 
      WHERE strftime('%Y-%m', downloaded_at) = ?
    `).get(month);
    ops.read += (dl?.count || 0);
  } catch (e) {}
  
  // Compter les activity_logs pour plus de précision
  try {
    const uploads = db.prepare(`SELECT COUNT(*) as c FROM activity_logs WHERE operation = 'file_uploaded' AND strftime('%Y-%m', timestamp) = ?`).get(month);
    const downloads = db.prepare(`SELECT COUNT(*) as c FROM activity_logs WHERE operation = 'file_downloaded' AND strftime('%Y-%m', timestamp) = ?`).get(month);
    const previews = db.prepare(`SELECT COUNT(*) as c FROM activity_logs WHERE operation = 'file_previewed' AND strftime('%Y-%m', timestamp) = ?`).get(month);
    // Ensure minimums
    ops.write = Math.max(ops.write, uploads?.c || 0);
    ops.read = Math.max(ops.read, (downloads?.c || 0) + (previews?.c || 0));
  } catch (e) {}

  return ops;
}

function calculateCosts(storage, ops) {
  // Opérations (on assume Hot tier pour simplifier)
  const opsCost = {
    write: ops.write * PRICING.operations.hot.write,
    read: ops.read * PRICING.operations.hot.read,
    list: ops.list * PRICING.operations.hot.list,
    other: ops.other * PRICING.operations.hot.other,
    total: 0
  };
  opsCost.total = opsCost.write + opsCost.read + opsCost.list + opsCost.other;

  // Bande passante
  const egressGb = ops.bytesDownloaded / (1024 * 1024 * 1024);
  const billableEgress = Math.max(0, egressGb - PRICING.bandwidth.freeEgressGb);
  const bandwidthCost = billableEgress * PRICING.bandwidth.egress;

  // Total
  const storageCost = storage.total.costPerMonth;
  const totalCost = storageCost + opsCost.total + bandwidthCost;

  return {
    storage: storageCost,
    operations: opsCost,
    bandwidth: { egressGb, billableEgress, cost: bandwidthCost },
    total: totalCost,
    breakdown: {
      storagePct: totalCost > 0 ? (storageCost / totalCost * 100) : 0,
      operationsPct: totalCost > 0 ? (opsCost.total / totalCost * 100) : 0,
      bandwidthPct: totalCost > 0 ? (bandwidthCost / totalCost * 100) : 0
    }
  };
}

function getCostsByUser(db, month) {
  const users = [];
  try {
    const rows = db.prepare(`
      SELECT ct.entity_id, u.username, u.full_name, ct.total_cost, ct.storage_cost, ct.operations_cost,
             ct.storage_hot_gb, ct.storage_cool_gb, ct.storage_archive_gb,
             ct.operations_write, ct.operations_read, ct.operations_list
      FROM cost_tracking ct
      LEFT JOIN users u ON ct.entity_id = u.id
      WHERE ct.entity_type = 'user' AND ct.period_month = ?
      ORDER BY ct.total_cost DESC
    `).all(month);
    users.push(...rows);
  } catch (e) {}
  return users;
}

function getCostsByTeam(db, month) {
  const teams = [];
  try {
    const rows = db.prepare(`
      SELECT ct.entity_id, t.name as team_name, ct.total_cost, ct.storage_cost, ct.operations_cost,
             ct.storage_hot_gb, ct.storage_cool_gb, ct.storage_archive_gb,
             ct.operations_write, ct.operations_read, ct.operations_list
      FROM cost_tracking ct
      LEFT JOIN teams t ON ct.entity_id = t.id
      WHERE ct.entity_type = 'team' AND ct.period_month = ?
      ORDER BY ct.total_cost DESC
    `).all(month);
    teams.push(...rows);
  } catch (e) {}
  return teams;
}

function getTopCostlyFiles(db) {
  const files = [];
  try {
    const rows = db.prepare(`
      SELECT fo.blob_name, fo.original_name, fo.file_size, fo.content_type,
             COALESCE(ft.current_tier, 'Hot') as tier,
             u.username as owner,
             t.name as team_name
      FROM file_ownership fo
      LEFT JOIN file_tiers ft ON fo.blob_name = ft.blob_name
      LEFT JOIN users u ON fo.uploaded_by_user_id = u.id
      LEFT JOIN teams t ON fo.team_id = t.id
      WHERE fo.is_trashed = 0 OR fo.is_trashed IS NULL
      ORDER BY fo.file_size DESC
      LIMIT 10
    `).all();
    
    for (const f of rows) {
      const sizeGb = (f.file_size || 0) / (1024 * 1024 * 1024);
      const tier = (f.tier || 'Hot').toLowerCase();
      const rate = PRICING.storage[tier] || PRICING.storage.hot;
      files.push({
        ...f,
        sizeGb,
        monthlyCost: sizeGb * rate
      });
    }
  } catch (e) {}
  return files;
}

function getCostHistory(db) {
  try {
    return db.prepare(`
      SELECT period_month,
             SUM(total_cost) as total,
             SUM(storage_cost) as storage,
             SUM(operations_cost) as operations,
             SUM(bandwidth_cost) as bandwidth
      FROM cost_tracking
      GROUP BY period_month
      ORDER BY period_month DESC
      LIMIT 6
    `).all();
  } catch (e) { return []; }
}

function forecastCosts(currentCosts, now) {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const ratio = daysInMonth / dayOfMonth;
  
  return {
    projectedTotal: currentCosts.total * ratio,
    projectedStorage: currentCosts.storage, // Storage is fixed rate
    projectedOperations: currentCosts.operations.total * ratio,
    projectedBandwidth: currentCosts.bandwidth.cost * ratio,
    daysRemaining: daysInMonth - dayOfMonth,
    confidence: dayOfMonth >= 15 ? 'high' : dayOfMonth >= 7 ? 'medium' : 'low'
  };
}

/**
 * Génère le rapport HTML FinOps
 */
function generateFinOpsHTML(db) {
  const data = generateFinOpsReport(db);
  
  const fmt = (n, d = 6) => (n || 0).toFixed(d);
  const fmtEur = (n) => {
    if (!n || n === 0) return '0.00 €';
    if (n < 0.01) return (n * 100).toFixed(4) + ' c€';
    return n.toFixed(4) + ' €';
  };
  const fmtSize = (gb) => {
    if (!gb || gb === 0) return '0';
    if (gb < 0.001) return (gb * 1024 * 1024).toFixed(1) + ' Ko';
    if (gb < 1) return (gb * 1024).toFixed(2) + ' Mo';
    return gb.toFixed(3) + ' Go';
  };

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FinOps ShareAzure — ${data.month}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#f0f2f5; color:#1a1a2e; line-height:1.6; }
  .container { max-width:850px; margin:0 auto; padding:20px; }
  .header { background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#0d9488 100%); color:#fff; padding:32px; border-radius:16px 16px 0 0; text-align:center; }
  .header h1 { font-size:1.8rem; margin-bottom:4px; }
  .header .subtitle { color:#94a3b8; font-size:0.9rem; }
  .body-wrap { background:#fff; border-radius:0 0 16px 16px; box-shadow:0 4px 24px rgba(0,0,0,0.08); overflow:hidden; }
  .section { padding:24px 32px; border-bottom:1px solid #e5e7eb; }
  .section:last-child { border-bottom:none; }
  .section-title { font-size:1.1rem; font-weight:700; color:#0a1628; margin-bottom:16px; }
  .cost-hero { display:flex; justify-content:center; align-items:center; gap:32px; flex-wrap:wrap; margin:16px 0; }
  .cost-big { text-align:center; }
  .cost-big .value { font-size:2.5rem; font-weight:800; color:#0d9488; }
  .cost-big .label { font-size:0.85rem; color:#64748b; }
  .stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; }
  .stat-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px; }
  .stat-card .value { font-size:1.4rem; font-weight:700; color:#0a1628; }
  .stat-card .label { font-size:0.8rem; color:#64748b; }
  .stat-card.hot { border-left:4px solid #ef4444; }
  .stat-card.cool { border-left:4px solid #3b82f6; }
  .stat-card.archive { border-left:4px solid #6b7280; }
  .stat-card.green { border-left:4px solid #10b981; }
  .stat-card.orange { border-left:4px solid #f59e0b; }
  table { width:100%; border-collapse:collapse; font-size:0.85rem; margin-top:8px; }
  th { background:#f1f5f9; color:#475569; font-weight:600; padding:10px 12px; text-align:left; }
  td { padding:10px 12px; border-bottom:1px solid #f1f5f9; }
  tr:hover td { background:#f8fafc; }
  .badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:0.75rem; font-weight:600; color:#fff; }
  .badge-hot { background:#ef4444; }
  .badge-cool { background:#3b82f6; }
  .badge-archive { background:#6b7280; }
  .bar { background:#e5e7eb; border-radius:4px; height:20px; overflow:hidden; position:relative; }
  .bar-fill { height:100%; border-radius:4px; display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.7rem; font-weight:600; min-width:2px; }
  .bar-hot { background:#ef4444; }
  .bar-cool { background:#3b82f6; }
  .bar-archive { background:#6b7280; }
  .pricing-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
  .pricing-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; text-align:center; }
  .pricing-card h4 { margin-bottom:8px; font-size:0.9rem; }
  .pricing-card .price { font-size:1.1rem; font-weight:700; }
  .forecast { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:16px; margin-top:12px; }
  .forecast .value { font-size:1.3rem; font-weight:700; color:#15803d; }
  .footer { text-align:center; padding:20px; color:#94a3b8; font-size:0.8rem; }
  @media(max-width:600px) { .container{padding:8px;} .section{padding:16px;} .cost-hero{gap:16px;} .pricing-grid{grid-template-columns:1fr;} }
</style>
</head>
<body>
<div class="container">

<div class="header">
  <div style="font-size:2.5rem;margin-bottom:8px;">💰</div>
  <h1>Rapport FinOps ShareAzure</h1>
  <div class="subtitle">Période : ${data.month} · Généré le ${new Date(data.generatedAt).toLocaleString('fr-FR', {timeZone:'Europe/Paris'})}</div>
</div>

<div class="body-wrap">

<!-- Coût total -->
<div class="section">
  <div class="cost-hero">
    <div class="cost-big">
      <div class="value">${fmtEur(data.costs.total)}</div>
      <div class="label">Coût total ce mois</div>
    </div>
    <div class="cost-big">
      <div class="value" style="color:#f59e0b;">${fmtEur(data.forecast.projectedTotal)}</div>
      <div class="label">Projection fin de mois (${data.forecast.confidence})</div>
    </div>
  </div>
  
  <!-- Breakdown bar -->
  <div style="margin-top:16px;">
    <div class="bar" style="height:28px;">
      <div style="display:flex;height:100%;">
        <div class="bar-fill" style="width:${data.costs.breakdown.storagePct}%;background:#3b82f6;" title="Stockage">${data.costs.breakdown.storagePct > 15 ? 'Stockage' : ''}</div>
        <div class="bar-fill" style="width:${data.costs.breakdown.operationsPct}%;background:#f59e0b;" title="Opérations">${data.costs.breakdown.operationsPct > 15 ? 'Opérations' : ''}</div>
        <div class="bar-fill" style="width:${data.costs.breakdown.bandwidthPct}%;background:#8b5cf6;" title="Bande passante">${data.costs.breakdown.bandwidthPct > 15 ? 'BP' : ''}</div>
      </div>
    </div>
    <div style="display:flex;gap:16px;margin-top:6px;font-size:0.8rem;color:#64748b;">
      <span>🔵 Stockage: ${fmtEur(data.costs.storage)}</span>
      <span>🟡 Opérations: ${fmtEur(data.costs.operations.total)}</span>
      <span>🟣 Bande passante: ${fmtEur(data.costs.bandwidth.cost)}</span>
    </div>
  </div>
</div>

<!-- Stockage par tier -->
<div class="section">
  <div class="section-title">📦 Stockage par tier</div>
  <div class="stats-grid">
    <div class="stat-card hot">
      <div class="value">${fmtSize(data.storage.hot.sizeGb)}</div>
      <div class="label">🔴 Hot (${data.storage.hot.count} fichiers)</div>
      <div style="font-size:0.85rem;color:#ef4444;font-weight:600;margin-top:4px;">${fmtEur(data.storage.hot.costPerMonth)}/mois</div>
    </div>
    <div class="stat-card cool">
      <div class="value">${fmtSize(data.storage.cool.sizeGb)}</div>
      <div class="label">🔵 Cool (${data.storage.cool.count} fichiers)</div>
      <div style="font-size:0.85rem;color:#3b82f6;font-weight:600;margin-top:4px;">${fmtEur(data.storage.cool.costPerMonth)}/mois</div>
    </div>
    <div class="stat-card archive">
      <div class="value">${fmtSize(data.storage.archive.sizeGb)}</div>
      <div class="label">⚫ Archive (${data.storage.archive.count} fichiers)</div>
      <div style="font-size:0.85rem;color:#6b7280;font-weight:600;margin-top:4px;">${fmtEur(data.storage.archive.costPerMonth)}/mois</div>
    </div>
    <div class="stat-card orange">
      <div class="value">${fmtSize(data.storage.trashed.sizeGb)}</div>
      <div class="label">🗑️ Corbeille (${data.storage.trashed.count} fichiers)</div>
      <div style="font-size:0.85rem;color:#f59e0b;font-weight:600;margin-top:4px;">${fmtEur(data.storage.trashed.costPerMonth)}/mois</div>
    </div>
  </div>
</div>

<!-- Opérations du mois -->
<div class="section">
  <div class="section-title">⚡ Opérations du mois</div>
  <div class="stats-grid">
    <div class="stat-card green">
      <div class="value">${data.operations.write}</div>
      <div class="label">📤 Écritures (uploads)</div>
      <div style="font-size:0.8rem;color:#64748b;">${fmtEur(data.costs.operations.write)}</div>
    </div>
    <div class="stat-card green">
      <div class="value">${data.operations.read}</div>
      <div class="label">📥 Lectures (downloads + previews)</div>
      <div style="font-size:0.8rem;color:#64748b;">${fmtEur(data.costs.operations.read)}</div>
    </div>
    <div class="stat-card green">
      <div class="value">${data.operations.list}</div>
      <div class="label">📋 Listings</div>
      <div style="font-size:0.8rem;color:#64748b;">${fmtEur(data.costs.operations.list)}</div>
    </div>
  </div>
  <div style="margin-top:12px;font-size:0.85rem;color:#64748b;">
    📤 Upload: ${fmtSize(data.operations.bytesUploaded / (1024*1024*1024))} · 
    📥 Download: ${fmtSize(data.operations.bytesDownloaded / (1024*1024*1024))}
  </div>
</div>

<!-- Coûts par utilisateur -->
<div class="section">
  <div class="section-title">👤 Coûts par utilisateur</div>
  ${data.costsByUser.length > 0 ? `
  <table>
    <thead><tr><th>Utilisateur</th><th>Stockage</th><th>Hot</th><th>Cool</th><th>Archive</th><th>Opérations</th><th>Total</th></tr></thead>
    <tbody>
      ${data.costsByUser.map(u => `<tr>
        <td><strong>${u.username || u.full_name || 'User #' + u.entity_id}</strong></td>
        <td>${fmtEur(u.storage_cost)}</td>
        <td>${fmtSize(u.storage_hot_gb)}</td>
        <td>${fmtSize(u.storage_cool_gb)}</td>
        <td>${fmtSize(u.storage_archive_gb)}</td>
        <td>${fmtEur(u.operations_cost)} <span style="color:#94a3b8;font-size:0.75rem;">(W:${u.operations_write||0} R:${u.operations_read||0} L:${u.operations_list||0})</span></td>
        <td><strong>${fmtEur(u.total_cost)}</strong></td>
      </tr>`).join('')}
    </tbody>
  </table>` : '<p style="color:#94a3b8;text-align:center;">Aucune donnée</p>'}
</div>

<!-- Coûts par équipe -->
<div class="section">
  <div class="section-title">👥 Coûts par équipe</div>
  ${data.costsByTeam.length > 0 ? `
  <table>
    <thead><tr><th>Équipe</th><th>Stockage</th><th>Hot</th><th>Cool</th><th>Opérations</th><th>Total</th></tr></thead>
    <tbody>
      ${data.costsByTeam.map(t => `<tr>
        <td><strong>${t.team_name || 'Team #' + t.entity_id}</strong></td>
        <td>${fmtEur(t.storage_cost)}</td>
        <td>${fmtSize(t.storage_hot_gb)}</td>
        <td>${fmtSize(t.storage_cool_gb)}</td>
        <td>${fmtEur(t.operations_cost)}</td>
        <td><strong>${fmtEur(t.total_cost)}</strong></td>
      </tr>`).join('')}
    </tbody>
  </table>` : '<p style="color:#94a3b8;text-align:center;">Aucune donnée</p>'}
</div>

<!-- Top fichiers coûteux -->
<div class="section">
  <div class="section-title">📊 Top 10 fichiers les plus coûteux</div>
  ${data.topFiles.length > 0 ? `
  <table>
    <thead><tr><th>Fichier</th><th>Propriétaire</th><th>Taille</th><th>Tier</th><th>Coût/mois</th></tr></thead>
    <tbody>
      ${data.topFiles.map(f => `<tr>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">${f.original_name || f.blob_name}</td>
        <td>${f.owner || '—'}${f.team_name ? ` <span style="color:#3b82f6;">(${f.team_name})</span>` : ''}</td>
        <td>${fmtSize(f.sizeGb)}</td>
        <td><span class="badge badge-${(f.tier||'hot').toLowerCase()}">${f.tier || 'Hot'}</span></td>
        <td>${fmtEur(f.monthlyCost)}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : '<p style="color:#94a3b8;text-align:center;">Aucun fichier</p>'}
</div>

<!-- Grille tarifaire Azure -->
<div class="section">
  <div class="section-title">💶 Grille tarifaire Azure (France Central, LRS)</div>
  <div class="pricing-grid">
    <div class="pricing-card" style="border-top:3px solid #ef4444;">
      <h4>🔴 Hot</h4>
      <div class="price">${PRICING.storage.hot} €/Go/mois</div>
      <div style="font-size:0.8rem;color:#64748b;margin-top:4px;">Write: ${(PRICING.operations.hot.write*10000).toFixed(2)}€/10k<br>Read: ${(PRICING.operations.hot.read*10000).toFixed(3)}€/10k</div>
    </div>
    <div class="pricing-card" style="border-top:3px solid #3b82f6;">
      <h4>🔵 Cool</h4>
      <div class="price">${PRICING.storage.cool} €/Go/mois</div>
      <div style="font-size:0.8rem;color:#64748b;margin-top:4px;">Write: ${(PRICING.operations.cool.write*10000).toFixed(2)}€/10k<br>Read: ${(PRICING.operations.cool.read*10000).toFixed(2)}€/10k<br>Accès: ${PRICING.dataAccess.cool}€/Go</div>
    </div>
    <div class="pricing-card" style="border-top:3px solid #6b7280;">
      <h4>⚫ Archive</h4>
      <div class="price">${PRICING.storage.archive} €/Go/mois</div>
      <div style="font-size:0.8rem;color:#64748b;margin-top:4px;">Write: ${(PRICING.operations.archive.write*10000).toFixed(2)}€/10k<br>Read: ${(PRICING.operations.archive.read*10000).toFixed(2)}€/10k<br>Réhydratation: ${PRICING.dataAccess.archive}€/Go</div>
    </div>
  </div>
</div>

<!-- Prévision -->
<div class="section">
  <div class="section-title">🔮 Prévision fin de mois</div>
  <div class="forecast">
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;">
      <div>
        <div class="value">${fmtEur(data.forecast.projectedTotal)}</div>
        <div style="font-size:0.85rem;color:#15803d;">Coût estimé fin ${data.month}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:0.9rem;">📅 ${data.forecast.daysRemaining} jours restants</div>
        <div style="font-size:0.8rem;color:#64748b;">Confiance: ${data.forecast.confidence === 'high' ? '🟢 Haute' : data.forecast.confidence === 'medium' ? '🟡 Moyenne' : '🔴 Basse'}</div>
      </div>
    </div>
    <div style="margin-top:12px;font-size:0.85rem;color:#64748b;">
      Stockage: ${fmtEur(data.forecast.projectedStorage)} · 
      Opérations: ${fmtEur(data.forecast.projectedOperations)} · 
      Bande passante: ${fmtEur(data.forecast.projectedBandwidth)}
    </div>
  </div>
</div>

</div>

<div class="footer">
  <p>ShareAzure FinOps · <a href="https://shareazure.deberti.fr" style="color:#0d9488;text-decoration:none;">shareazure.deberti.fr</a></p>
  <p style="margin-top:4px;">Agent FinOps par Le Claude 🤖</p>
</div>

</div>
</body>
</html>`;
}

module.exports = { generateFinOpsReport, generateFinOpsHTML, PRICING };
