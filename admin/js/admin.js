// Configuration
const API_URL = window.location.origin + '/api';

// State
let currentSection = 'dashboard';
let allFiles = [];
let allShares = [];
let allLogs = [];
let allGuests = [];
let selectedFiles = [];
let uploadsChart = null;
let fileTypesChart = null;

// ============================================
// AUTH
// ============================================

function getAuthToken() {
    return localStorage.getItem('authToken') || sessionStorage.getItem('authToken') ||
           localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken');
}

function getAuthHeaders() {
    const token = getAuthToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function checkAuth() {
    const token = getAuthToken();
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/admin/verify`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        if (!data.success) {
            window.location.href = '/login.html';
            return;
        }
        const userNameEl = document.getElementById('currentUserName');
        if (userNameEl) {
            userNameEl.textContent = data.user.name || data.user.username;
        }
        const avatarEl = document.querySelector('.user-avatar');
        if (avatarEl) {
            const name = encodeURIComponent(data.user.name || data.user.username);
            avatarEl.src = `https://ui-avatars.com/api/?name=${name}&background=003C61&color=fff`;
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
    }
}

function handleLogout() {
    ['authToken', 'adminToken', 'adminUser', 'adminUsername', 'userToken', 'userData'].forEach(key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    });
    window.location.href = '/login.html';
}

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
    initializeNavigation();
    initializeEventListeners();
    loadDashboard();

    // Fermer les menus kebab quand on clique ailleurs
    document.addEventListener('click', () => closeAllKebabs());

    // Mobile sidebar toggle
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (mobileMenuBtn && sidebar) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            sidebarOverlay?.classList.toggle('active');
        });
        sidebarOverlay?.addEventListener('click', () => {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
        });
        // Fermer la sidebar quand on clique sur un lien nav (mobile)
        sidebar.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                if (window.innerWidth <= 1024) {
                    sidebar.classList.remove('open');
                    sidebarOverlay?.classList.remove('active');
                }
            });
        });
    }
});

// ============================================
// NAVIGATION
// ============================================

function initializeNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchSection(item.dataset.section);
        });
    });
}

function switchSection(section) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.section === section);
    });
    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.toggle('active', sec.id === section);
    });

    const titles = {
        dashboard: { title: 'Dashboard', subtitle: 'Vue d\'ensemble de l\'activite' },
        files: { title: 'Gestion des fichiers', subtitle: 'Tous les fichiers uploades' },
        shares: { title: 'Gestion des partages', subtitle: 'Historique des liens de partage' },
        teams: { title: 'Gestion des equipes', subtitle: 'Equipes et membres' },
        costs: { title: 'Suivi des couts', subtitle: 'Couts par entite et periode' },
        users: { title: 'Gestion des utilisateurs', subtitle: 'Tous les comptes utilisateurs' },
        guests: { title: 'Gestion des invites', subtitle: 'Comptes temporaires' },
        logs: { title: 'Logs systeme', subtitle: 'Historique des operations' },
        settings: { title: 'Parametres', subtitle: 'Configuration de l\'application' },
        ai: { title: 'Intelligence Artificielle', subtitle: 'Configuration et pilotage de l\'IA' },
        faces: { title: 'Reconnaissance faciale', subtitle: 'Profils et identification des visages' },
        storage: { title: 'Stockage', subtitle: 'Utilisation et répartition du stockage Azure' }
    };

    const t = titles[section] || { title: section, subtitle: '' };
    document.getElementById('pageTitle').textContent = t.title;
    document.getElementById('pageSubtitle').textContent = t.subtitle;

    currentSection = section;
    loadSectionData(section);
}

function loadSectionData(section) {
    switch (section) {
        case 'dashboard': loadDashboard(); break;
        case 'files': loadFiles(); break;
        case 'shares': loadShares(); break;
        case 'teams': loadTeams(); break;
        case 'costs': loadFinOps(); break;
        case 'users': loadUsers(); break;
        case 'guests': loadGuests(); break;
        case 'logs': loadLogs(); break;
        case 'settings': loadSettings(); loadEmailDomains(); loadAuthSettings(); loadEntraMappings(); loadQuotas(); loadVirusScan(); loadPermissions(); loadEmailConfig(); loadTieringSettings(); break;
        case 'ai': loadAI(); break;
        case 'faces': loadFacesSection(); break;
        case 'storage': loadStorage(); break;
        case 'audit': loadAuditDashboard(); break;
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function initializeEventListeners() {
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // User menu dropdown toggle
    const userMenuToggle = document.getElementById('userMenuToggle');
    const userDropdown = document.getElementById('userDropdown');
    if (userMenuToggle && userDropdown) {
        userMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.style.display = userDropdown.style.display === 'none' ? 'block' : 'none';
        });
        document.addEventListener('click', () => { userDropdown.style.display = 'none'; });
    }

    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadSectionData(currentSection);
        showNotification('Donnees actualisees', 'success');
    });

    // Files
    document.getElementById('fileSearchInput')?.addEventListener('input', filterFiles);
    document.getElementById('fileTypeFilter')?.addEventListener('change', filterFiles);
    document.getElementById('fileSortBy')?.addEventListener('change', sortFiles);
    document.getElementById('selectAllFiles')?.addEventListener('change', toggleSelectAllFiles);
    document.getElementById('deleteSelectedBtn')?.addEventListener('click', deleteSelectedFiles);

    // Shares
    document.getElementById('shareSearchInput')?.addEventListener('input', filterShares);
    document.getElementById('shareStatusFilter')?.addEventListener('change', filterShares);
    document.getElementById('exportSharesBtn')?.addEventListener('click', exportSharesCSV);

    // Logs
    document.getElementById('logLevelFilter')?.addEventListener('change', () => { logsPage = 1; loadLogs(); });
    document.getElementById('logCategoryFilter')?.addEventListener('change', () => { logsPage = 1; loadLogs(); });
    document.getElementById('logSearchInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') { logsPage = 1; loadLogs(); } });
    document.getElementById('clearLogsBtn')?.addEventListener('click', clearLogs);
    document.getElementById('exportLogsBtn')?.addEventListener('click', exportLogs);
    document.getElementById('logsPrevBtn')?.addEventListener('click', () => window.changeLogsPage(-1));
    document.getElementById('logsNextBtn')?.addEventListener('click', () => window.changeLogsPage(1));

    // Settings
    document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettings);
    document.getElementById('resetSettingsBtn')?.addEventListener('click', resetSettings);
    document.getElementById('saveAuthSettingsBtn')?.addEventListener('click', saveAuthSettings);
    document.getElementById('testEntraBtn')?.addEventListener('click', testEntraConnection);
    document.querySelectorAll('input[name="authMode"]').forEach(radio => {
        radio.addEventListener('change', toggleEntraConfig);
    });
    document.getElementById('saveEntraSyncSettingsBtn')?.addEventListener('click', saveEntraSyncSettings);
    document.getElementById('fetchEntraGroupsBtn')?.addEventListener('click', fetchEntraGroups);
    document.getElementById('testMappingBtn')?.addEventListener('click', testEntraMapping);
    document.getElementById('testMappingEmail')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') testEntraMapping(); });
    document.getElementById('addEmailDomainBtn')?.addEventListener('click', addEmailDomain);
    document.getElementById('domainsPrevBtn')?.addEventListener('click', () => window.changeDomainsPage(-1));
    document.getElementById('domainsNextBtn')?.addEventListener('click', () => window.changeDomainsPage(1));
    document.getElementById('newEmailDomainInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addEmailDomain();
    });

    // Modals close
    document.getElementById('closeFileDetailsBtn')?.addEventListener('click', () => closeModal('fileDetailsModal'));
    document.getElementById('confirmNoBtn')?.addEventListener('click', () => closeModal('confirmModal'));

    // Teams
    document.getElementById('createTeamBtn')?.addEventListener('click', () => showModal('createTeamModal'));
    document.getElementById('submitCreateTeam')?.addEventListener('click', createTeam);
    document.getElementById('closeCreateTeamBtn')?.addEventListener('click', () => closeModal('createTeamModal'));
    document.getElementById('cancelCreateTeamBtn')?.addEventListener('click', () => closeModal('createTeamModal'));

    // Costs
    // FinOps buttons are inline onclick
    document.getElementById('costsPeriod')?.addEventListener('change', loadCosts);

    // Users
    document.getElementById('createUserBtn')?.addEventListener('click', () => showModal('createUserModal'));
    document.getElementById('submitCreateUser')?.addEventListener('click', createUser);
    document.getElementById('closeCreateUserBtn')?.addEventListener('click', () => closeModal('createUserModal'));
    document.getElementById('cancelCreateUserBtn')?.addEventListener('click', () => closeModal('createUserModal'));

    // Edit User modal
    document.getElementById('submitEditUser')?.addEventListener('click', () => window.saveEditUser());
    document.getElementById('closeEditUserBtn')?.addEventListener('click', () => closeModal('editUserModal'));
    document.getElementById('cancelEditUserBtn')?.addEventListener('click', () => closeModal('editUserModal'));

    // Reset Password modal
    document.getElementById('submitResetPassword')?.addEventListener('click', () => window.submitResetPassword());
    document.getElementById('closeResetPasswordBtn')?.addEventListener('click', () => closeModal('resetPasswordModal'));
    document.getElementById('cancelResetPasswordBtn')?.addEventListener('click', () => closeModal('resetPasswordModal'));

    // User Teams modal
    document.getElementById('closeUserTeamsBtn')?.addEventListener('click', () => closeModal('userTeamsModal'));
    document.getElementById('cancelUserTeamsBtn')?.addEventListener('click', () => closeModal('userTeamsModal'));

    // Team Detail modal
    document.getElementById('closeTeamDetailBtn')?.addEventListener('click', () => closeModal('teamDetailModal'));
    document.getElementById('cancelTeamDetailBtn')?.addEventListener('click', () => closeModal('teamDetailModal'));

    // Guests
    document.getElementById('createGuestBtn')?.addEventListener('click', () => {
        document.getElementById('guestEmail').value = '';
        document.getElementById('createGuestError').style.display = 'none';
        showModal('createGuestModal');
    });
    document.getElementById('submitCreateGuestBtn')?.addEventListener('click', createGuest);
    document.getElementById('closeCreateGuestBtn')?.addEventListener('click', () => closeModal('createGuestModal'));
    document.getElementById('cancelCreateGuestBtn')?.addEventListener('click', () => closeModal('createGuestModal'));
    document.getElementById('closeGuestDetailsBtn')?.addEventListener('click', () => closeModal('guestDetailsModal'));
    document.getElementById('guestStatusFilter')?.addEventListener('change', filterGuests);
    document.getElementById('guestSearch')?.addEventListener('input', filterGuests);
    document.getElementById('guestEmail')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); createGuest(); }
    });
}

// ============================================
// API HELPER
// ============================================

async function apiRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
        }
    };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${API_URL}${endpoint}`, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erreur serveur');
    return data;
}

// ============================================
// DASHBOARD
// ============================================

async function loadDashboard() {
    try {
        // Use stats API instead of fetching all files
        let stats = null;
        try {
            const statsRes = await apiRequest('/admin/stats');
            if (statsRes.success) stats = statsRes.stats;
        } catch (e) { console.warn('Stats API unavailable, falling back', e); }

        if (stats) {
            document.getElementById('statTotalFiles').textContent = stats.totalFiles || 0;
            document.getElementById('statTotalTeams').textContent = stats.totalTeams || 0;
            document.getElementById('statTotalUsers').textContent = stats.totalUsers || 0;

            // Empty states
            if (stats.totalFiles === 0) {
                document.getElementById('statTotalFiles').innerHTML = '0 <small style="font-size:0.5em;color:#9ca3af;">Uploadez votre premier fichier</small>';
            }
        } else {
            // Fallback
            const files = await fetchFiles();
            document.getElementById('statTotalFiles').textContent = files.length;
            try {
                const teamsRes = await apiRequest('/teams');
                document.getElementById('statTotalTeams').textContent = teamsRes.success ? teamsRes.teams.length : 0;
            } catch (e) { document.getElementById('statTotalTeams').textContent = '0'; }
            try {
                const usersRes = await apiRequest('/admin/users');
                document.getElementById('statTotalUsers').textContent = usersRes.success ? (usersRes.users || []).length : '-';
            } catch (e) { document.getElementById('statTotalUsers').textContent = '-'; }
        }

        // Costs
        try {
            const costsRes = await apiRequest('/admin/costs');
            document.getElementById('statTotalCosts').textContent = costsRes.success ? `$${(costsRes.totals.overall || 0).toFixed(2)}` : '$0.00';
        } catch (e) { document.getElementById('statTotalCosts').textContent = '$0.00'; }

        // Charts - use files for uploads chart
        const files = await fetchFiles();
        const chartStats = calculateStats(files);
        createUploadsChart(chartStats.uploadsByDay);
        createFileTypesChart(chartStats.filesByType);

        // Recent activity from stats API
        if (stats && stats.recentUploads && stats.recentUploads.length > 0) {
            const container = document.getElementById('recentActivity');
            const recent = stats.recentUploads.slice(0, 5);
            container.innerHTML = recent.map(f => `
                <div class="activity-item">
                    <div class="activity-icon">${getFileIcon(f.contentType)}</div>
                    <div class="activity-content">
                        <p class="activity-title">Fichier uploadé</p>
                        <p class="activity-details">${f.name} — ${formatBytes(f.size)}</p>
                    </div>
                    <div class="activity-time">${formatTimeAgo(f.date)}</div>
                </div>
            `).join('');
        } else if (stats && stats.totalFiles === 0) {
            document.getElementById('recentActivity').innerHTML = '<p style="color:#9ca3af;text-align:center;padding:24px;">Aucune activité — Uploadez votre premier fichier pour commencer</p>';
        } else {
            loadRecentActivity(files);
        }

        // Storage usage mini bar
        if (stats && stats.totalSize > 0) {
            const card = document.getElementById('dashStorageCard');
            card.style.display = '';
            const tiers = stats.storageByTier;
            const total = stats.totalSize;
            const bar = document.getElementById('dashStorageBar');
            const hotPct = (tiers.hot.size / total * 100).toFixed(1);
            const coolPct = (tiers.cool.size / total * 100).toFixed(1);
            const archPct = (tiers.archive.size / total * 100).toFixed(1);
            bar.innerHTML = `
                <div style="width:${hotPct}%;background:#ef4444;" title="Hot: ${formatBytes(tiers.hot.size)}"></div>
                <div style="width:${coolPct}%;background:#3b82f6;" title="Cool: ${formatBytes(tiers.cool.size)}"></div>
                <div style="width:${archPct}%;background:#6b7280;" title="Archive: ${formatBytes(tiers.archive.size)}"></div>
            `;
            document.getElementById('dashStorageLabel').textContent = formatBytes(total);
            document.getElementById('dashStorageLegend').innerHTML = `
                <span>🔴 Hot: ${formatBytes(tiers.hot.size)}</span>
                <span>🔵 Cool: ${formatBytes(tiers.cool.size)}</span>
                <span>⚫ Archive: ${formatBytes(tiers.archive.size)}</span>
            `;
        }

    } catch (error) {
        console.error('Dashboard error:', error);
    }
}

function calculateStats(files) {
    const now = new Date();
    const uploadsByDay = {};
    for (let i = 6; i >= 0; i--) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000);
        uploadsByDay[date.toISOString().split('T')[0]] = 0;
    }
    files.forEach(file => {
        const dateKey = new Date(file.lastModified).toISOString().split('T')[0];
        if (uploadsByDay.hasOwnProperty(dateKey)) uploadsByDay[dateKey]++;
    });
    const filesByType = {};
    files.forEach(file => {
        const type = getFileCategory(file.contentType);
        filesByType[type] = (filesByType[type] || 0) + 1;
    });
    return { uploadsByDay, filesByType };
}

function createUploadsChart(uploadsByDay) {
    const ctx = document.getElementById('uploadsChart');
    if (!ctx) return;
    if (uploadsChart) uploadsChart.destroy();
    uploadsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Object.keys(uploadsByDay).map(d => new Date(d).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })),
            datasets: [{ label: 'Uploads', data: Object.values(uploadsByDay), borderColor: '#003C61', backgroundColor: 'rgba(0, 60, 97, 0.1)', tension: 0.4, fill: true }]
        },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
}

function createFileTypesChart(filesByType) {
    const ctx = document.getElementById('fileTypesChart');
    if (!ctx) return;
    if (fileTypesChart) fileTypesChart.destroy();
    const colors = { 'Images': '#639E30', 'Documents': '#003C61', 'PDF': '#DC2626', 'Videos': '#F8AA36', 'Audio': '#8b5cf6', 'Autres': '#64748b' };
    fileTypesChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(filesByType),
            datasets: [{ data: Object.values(filesByType), backgroundColor: Object.keys(filesByType).map(t => colors[t] || '#64748b') }]
        },
        options: { responsive: true, plugins: { legend: { position: 'right' } } }
    });
}

function loadRecentActivity(files) {
    const container = document.getElementById('recentActivity');
    if (!container) return;
    const recent = files.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified)).slice(0, 10);
    if (recent.length === 0) { container.innerHTML = '<p class="loading">Aucune activite recente</p>'; return; }
    container.innerHTML = recent.map(file => `
        <div class="activity-item">
            <div class="activity-icon">${getFileIcon(file.contentType)}</div>
            <div class="activity-content">
                <p class="activity-title">Fichier uploade</p>
                <p class="activity-details">${file.metadata?.originalName || file.name}</p>
            </div>
            <div class="activity-time">${formatTimeAgo(file.lastModified)}</div>
        </div>
    `).join('');
}

// ============================================
// STORAGE
// ============================================

async function previewSync() {
    const resultDiv = document.getElementById('syncResult');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<span style="color:#666;">⏳ Scan du blob storage Azure...</span>';
    try {
        const res = await fetch(`${API_URL}/admin/storage/tree`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.success) { resultDiv.innerHTML = `<span style="color:#c62828;">❌ ${data.error}</span>`; return; }
        const notInDb = data.blobs.filter(b => !b.inDb && b.contentType !== 'application/x-directory');
        const inDb = data.blobs.filter(b => b.inDb);
        resultDiv.innerHTML = `
            <div style="background:#fff;border-radius:6px;padding:12px;">
                <p><strong>${data.total}</strong> blob(s) dans Azure • <strong>${inDb.length}</strong> déjà en DB • <strong style="color:#e65100;">${notInDb.length}</strong> à importer</p>
                ${notInDb.length > 0 ? '<table class="data-table" style="margin-top:8px;"><thead><tr><th>Fichier</th><th>Taille</th><th>Type</th><th>Tier</th></tr></thead><tbody>' +
                    notInDb.map(b => `<tr><td>${escapeHtml(b.name)}</td><td>${formatBytes(b.size)}</td><td>${b.contentType}</td><td>${b.tier}</td></tr>`).join('') +
                    '</tbody></table>' : '<p style="color:#2e7d32;">✅ Tous les fichiers sont déjà synchronisés</p>'}
            </div>`;
    } catch(e) { resultDiv.innerHTML = `<span style="color:#c62828;">❌ ${e.message}</span>`; }
}

async function runSync() {
    if (!confirm('Importer tous les fichiers Azure non référencés dans la base de données ?')) return;
    const resultDiv = document.getElementById('syncResult');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<span style="color:#666;">⏳ Synchronisation en cours...</span>';
    try {
        const res = await fetch(`${API_URL}/admin/sync-storage`, { method: 'POST', headers: getAuthHeaders() });
        const data = await res.json();
        if (!data.success) { resultDiv.innerHTML = `<span style="color:#c62828;">❌ ${data.error}</span>`; return; }
        resultDiv.innerHTML = `<div style="background:#e8f5e9;padding:12px;border-radius:6px;">
            <p style="color:#2e7d32;"><strong>✅ ${data.message}</strong></p>
            ${data.results.length > 0 ? '<ul style="margin:8px 0;padding-left:20px;">' + data.results.map(r =>
                `<li>${escapeHtml(r.originalName)} (${formatBytes(r.size)})${r.team ? ' → Équipe: ' + escapeHtml(r.team) : ''}</li>`
            ).join('') + '</ul>' : ''}
        </div>`;
        // Refresh storage and dashboard
        loadStorage();
        showNotification(data.message, 'success');
    } catch(e) { resultDiv.innerHTML = `<span style="color:#c62828;">❌ ${e.message}</span>`; }
}

async function confirmResetStorage() {
    // Step 1: First confirmation
    const countRes = await fetch(`${API_URL}/files`, { headers: getAuthHeaders() });
    const countData = await countRes.json();
    const fileCount = countData.count || 0;

    if (!confirm(`⚠️ ATTENTION: Vous êtes sur le point de supprimer TOUS les fichiers du Blob Storage Azure.\n\n${fileCount} fichier(s) seront définitivement supprimés.\n\nCette action est IRRÉVERSIBLE.\n\nVoulez-vous continuer ?`)) return;

    // Step 2: Second confirmation
    if (!confirm(`🔴 DERNIÈRE CONFIRMATION\n\nTous les fichiers, partages, et données associées seront supprimés.\n\nÊtes-vous absolument sûr ?`)) return;

    const resultDiv = document.getElementById('syncResult');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<span style="color:#c62828;">⏳ Suppression en cours... Ne fermez pas cette page.</span>';

    try {
        const res = await fetch(`${API_URL}/admin/reset-storage`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (!data.success) {
            resultDiv.innerHTML = `<span style="color:#c62828;">❌ ${data.error}</span>`;
            return;
        }
        resultDiv.innerHTML = `<div style="background:#ffebee;padding:12px;border-radius:6px;">
            <p style="color:#2e7d32;"><strong>✅ ${data.message}</strong></p>
            <p style="color:#555;margin-top:6px;">Blobs supprimés: ${data.deletedBlobs} | Fichiers DB nettoyés: ${data.deletedDbRecords}</p>
        </div>`;
        loadStorage();
        loadFiles();
        showNotification('Storage réinitialisé', 'success');
    } catch(e) {
        resultDiv.innerHTML = `<span style="color:#c62828;">❌ ${e.message}</span>`;
    }
}

async function loadStorage() {
    try {
        const statsRes = await apiRequest('/admin/stats');
        if (!statsRes.success) throw new Error('Erreur stats');
        const s = statsRes.stats;

        // Stats cards
        document.getElementById('storTotalSize').textContent = formatBytes(s.totalSize);
        document.getElementById('storTotalFiles').textContent = s.totalFiles;
        document.getElementById('storHot').textContent = `${s.storageByTier.hot.count} (${formatBytes(s.storageByTier.hot.size)})`;
        document.getElementById('storCool').textContent = `${s.storageByTier.cool.count} (${formatBytes(s.storageByTier.cool.size)})`;
        document.getElementById('storArchive').textContent = `${s.storageByTier.archive.count} (${formatBytes(s.storageByTier.archive.size)})`;

        // Tier bar
        const total = s.totalSize || 1;
        const bar = document.getElementById('storageTierBar');
        const hotPct = (s.storageByTier.hot.size / total * 100);
        const coolPct = (s.storageByTier.cool.size / total * 100);
        const archPct = (s.storageByTier.archive.size / total * 100);
        bar.innerHTML = `
            <div style="width:${hotPct}%;background:#ef4444;min-width:${s.storageByTier.hot.size?2:0}px;" title="Hot"></div>
            <div style="width:${coolPct}%;background:#3b82f6;min-width:${s.storageByTier.cool.size?2:0}px;" title="Cool"></div>
            <div style="width:${archPct}%;background:#6b7280;min-width:${s.storageByTier.archive.size?2:0}px;" title="Archive"></div>
        `;
        document.getElementById('storageTierLegend').innerHTML = `
            <span><span style="display:inline-block;width:12px;height:12px;background:#ef4444;border-radius:3px;"></span> Hot: ${formatBytes(s.storageByTier.hot.size)} (${hotPct.toFixed(1)}%)</span>
            <span><span style="display:inline-block;width:12px;height:12px;background:#3b82f6;border-radius:3px;"></span> Cool: ${formatBytes(s.storageByTier.cool.size)} (${coolPct.toFixed(1)}%)</span>
            <span><span style="display:inline-block;width:12px;height:12px;background:#6b7280;border-radius:3px;"></span> Archive: ${formatBytes(s.storageByTier.archive.size)} (${archPct.toFixed(1)}%)</span>
        `;

        // Storage by file type
        const typeContainer = document.getElementById('storageByTypeContent');
        const typeLabels = { images: '🖼️ Images', videos: '🎬 Vidéos', documents: '📄 Documents', other: '📦 Autres' };
        const typeColors = { images: '#639E30', videos: '#F8AA36', documents: '#003C61', other: '#64748b' };
        const maxTypeSize = Math.max(...Object.values(s.storageByType).map(t => t.size), 1);
        typeContainer.innerHTML = Object.entries(s.storageByType).map(([key, val]) => `
            <div style="margin:12px 0;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:0.9rem;">
                    <span>${typeLabels[key] || key}</span>
                    <span>${val.count} fichiers — ${formatBytes(val.size)}</span>
                </div>
                <div style="height:20px;background:#e5e7eb;border-radius:10px;overflow:hidden;">
                    <div style="height:100%;width:${(val.size/maxTypeSize*100).toFixed(1)}%;background:${typeColors[key]};border-radius:10px;transition:width 0.3s;"></div>
                </div>
            </div>
        `).join('');

        // Top 10 biggest files
        const topBody = document.getElementById('storTopFilesBody');
        if (s.topFiles && s.topFiles.length > 0) {
            topBody.innerHTML = s.topFiles.map(f => `
                <tr>
                    <td title="${f.blobName}">${f.name}</td>
                    <td>${formatBytes(f.size)}</td>
                    <td>${f.contentType || '—'}</td>
                    <td><span class="badge badge-${f.tier === 'Hot' ? 'danger' : f.tier === 'Cool' ? 'info' : 'secondary'}">${f.tier}</span></td>
                </tr>
            `).join('');
        } else {
            topBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:24px;">Aucun fichier</td></tr>';
        }

        // Storage by team
        const teamBody = document.getElementById('storByTeamBody');
        if (s.storageByTeam && s.storageByTeam.length > 0) {
            teamBody.innerHTML = s.storageByTeam.map(t => `
                <tr>
                    <td>${t.team_name}</td>
                    <td>${t.file_count}</td>
                    <td>${formatBytes(t.total_size)}</td>
                    <td>${total > 0 ? (t.total_size / total * 100).toFixed(1) + '%' : '0%'}</td>
                </tr>
            `).join('');
        } else {
            teamBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:24px;">Aucune équipe</td></tr>';
        }

    } catch (error) {
        console.error('Storage error:', error);
        // Show error in the tables instead of silent fail
        const topBody = document.getElementById('storTopFilesBody');
        if (topBody) topBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#c62828;padding:16px;">❌ Erreur de chargement : ' + (error.message || error) + '</td></tr>';
        const teamBody = document.getElementById('storByTeamBody');
        if (teamBody) teamBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#c62828;padding:16px;">❌ Erreur de chargement : ' + (error.message || error) + '</td></tr>';
    }
}

// ============================================
// FILES
// ============================================

async function fetchFiles() {
    const response = await fetch(`${API_URL}/files`, { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Erreur');
    const data = await response.json();
    return data.files || [];
}

async function loadFiles() {
    try {
        allFiles = await fetchFiles();
        renderFilesTable(allFiles);
    } catch (error) {
        console.error('Files error:', error);
    }
}

function renderFilesTable(files) {
    const tbody = document.getElementById('filesTableBody');
    if (!tbody) return;
    if (files.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="loading">Aucun fichier</td></tr>'; return; }
    tbody.innerHTML = files.map((file, idx) => {
        const tier = file.metadata?.accessTier || file.tier || 'Hot';
        const tierBadge = tier === 'Hot' ? 'badge-danger' : tier === 'Cool' ? 'badge-info' : 'badge-secondary';
        const safeName = file.name.replace(/'/g, "\\'");
        return `<tr>
            <td><input type="checkbox" class="file-checkbox" data-blob-name="${file.name}"></td>
            <td><div class="file-name"><span class="file-icon">${getFileIcon(file.contentType)}</span> <span class="file-name-text">${escapeHtml(file.metadata?.originalName || file.originalName || file.name)}</span></div></td>
            <td>${file.teamName ? `<span class="status-badge badge-info" style="font-size:0.8rem;">${escapeHtml(file.teamName)}</span>` : '<span style="color:#aaa;font-size:0.85rem;">Personnel</span>'}</td>
            <td>${getFileCategory(file.contentType)}</td>
            <td>${formatBytes(file.size)}</td>
            <td>${new Date(file.lastModified || file.uploadedAt).toLocaleString('fr-FR')}</td>
            <td><span class="status-badge ${tierBadge}" style="font-size:0.8rem;">${tier}</span></td>
            <td style="position:relative;">
                <button onclick="toggleFileMenu(event, ${idx})" style="border:none;background:none;font-size:1.2rem;cursor:pointer;padding:4px 8px;" title="Actions">⋯</button>
                <div id="fileMenu-${idx}" class="file-context-menu" style="display:none;position:absolute;right:0;top:100%;background:#fff;border:1px solid #e0e0e0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:100;min-width:220px;overflow:hidden;">
                    <div onclick="viewFileDetails('${safeName}')" style="padding:10px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:0.9rem;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='#fff'">
                        <i class="fas fa-eye" style="color:#1565C0;width:16px;"></i> Voir les détails
                    </div>
                    <div style="border-top:1px solid #eee;padding:6px 16px;font-size:0.75rem;color:#888;font-weight:600;">CHANGER LE TIER</div>
                    ${tier !== 'Hot' ? `<div onclick="changeFileTier('${safeName}', 'Hot')" style="padding:10px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:0.9rem;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='#fff'">
                        <i class="fas fa-fire" style="color:#ef4444;width:16px;"></i> Passer en Hot <span style="color:#888;font-size:0.8rem;">(accès rapide)</span>
                    </div>` : ''}
                    ${tier !== 'Cool' ? `<div onclick="changeFileTier('${safeName}', 'Cool')" style="padding:10px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:0.9rem;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='#fff'">
                        <i class="fas fa-snowflake" style="color:#3b82f6;width:16px;"></i> Passer en Cool <span style="color:#888;font-size:0.8rem;">(économique)</span>
                    </div>` : ''}
                    ${tier !== 'Archive' ? `<div onclick="changeFileTier('${safeName}', 'Archive')" style="padding:10px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:0.9rem;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='#fff'">
                        <i class="fas fa-box-archive" style="color:#6b7280;width:16px;"></i> Passer en Archive <span style="color:#888;font-size:0.8rem;">(froid)</span>
                    </div>` : ''}
                    <div style="border-top:1px solid #eee;"></div>
                    <div onclick="deleteFile('${safeName}')" style="padding:10px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:0.9rem;color:#c62828;" onmouseover="this.style.background='#fce4ec'" onmouseout="this.style.background='#fff'">
                        <i class="fas fa-trash" style="width:16px;"></i> Supprimer
                    </div>
                </div>
            </td>
        </tr>`;
    }).join('');
    document.querySelectorAll('.file-checkbox').forEach(cb => cb.addEventListener('change', updateSelectedFiles));
}

function filterFiles() {
    const search = document.getElementById('fileSearchInput').value.toLowerCase();
    const type = document.getElementById('fileTypeFilter').value;
    renderFilesTable(allFiles.filter(f => {
        const name = (f.metadata?.originalName || f.name).toLowerCase();
        return (!search || name.includes(search)) && (!type || getFileCategory(f.contentType) === type);
    }));
}

function sortFiles() {
    const sortBy = document.getElementById('fileSortBy').value;
    let sorted = [...allFiles];
    switch (sortBy) {
        case 'date-desc': sorted.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified)); break;
        case 'date-asc': sorted.sort((a, b) => new Date(a.lastModified) - new Date(b.lastModified)); break;
        case 'size-desc': sorted.sort((a, b) => b.size - a.size); break;
        case 'size-asc': sorted.sort((a, b) => a.size - b.size); break;
        case 'name-asc': sorted.sort((a, b) => (a.metadata?.originalName || a.name).localeCompare(b.metadata?.originalName || b.name)); break;
        case 'name-desc': sorted.sort((a, b) => (b.metadata?.originalName || b.name).localeCompare(a.metadata?.originalName || a.name)); break;
    }
    renderFilesTable(sorted);
}

function toggleSelectAllFiles(e) {
    document.querySelectorAll('.file-checkbox').forEach(cb => cb.checked = e.target.checked);
    updateSelectedFiles();
}

function updateSelectedFiles() {
    selectedFiles = Array.from(document.querySelectorAll('.file-checkbox:checked')).map(cb => cb.dataset.blobName);
    document.getElementById('deleteSelectedBtn').disabled = selectedFiles.length === 0;
}

// File context menu
window.toggleFileMenu = (event, idx) => {
    event.stopPropagation();
    document.querySelectorAll('.file-context-menu').forEach(m => {
        if (m.id !== `fileMenu-${idx}`) m.style.display = 'none';
    });
    const menu = document.getElementById(`fileMenu-${idx}`);
    if (menu.style.display === 'none' || !menu.style.display) {
        const btn = event.currentTarget;
        const rect = btn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = (rect.bottom + 4) + 'px';
        menu.style.left = 'auto';
        menu.style.right = (window.innerWidth - rect.right) + 'px';
        menu.style.display = 'block';
        // Si le menu dépasse en bas, l'afficher au-dessus
        requestAnimationFrame(() => {
            const menuRect = menu.getBoundingClientRect();
            if (menuRect.bottom > window.innerHeight) {
                menu.style.top = (rect.top - menuRect.height - 4) + 'px';
            }
        });
    } else {
        menu.style.display = 'none';
    }
};

document.addEventListener('click', () => {
    document.querySelectorAll('.file-context-menu, .team-context-menu').forEach(m => m.style.display = 'none');
});
document.addEventListener('scroll', () => {
    document.querySelectorAll('.file-context-menu, .team-context-menu').forEach(m => m.style.display = 'none');
}, true);

// Change file tier (Hot/Cool/Archive)
window.changeFileTier = async (blobName, targetTier) => {
    document.querySelectorAll('.file-context-menu').forEach(m => m.style.display = 'none');
    const tierLabels = { Hot: '🔥 Hot', Cool: '❄️ Cool', Archive: '🧊 Archive' };
    if (!confirm(`Changer le tier de ce fichier vers ${tierLabels[targetTier]} ?`)) return;
    try {
        const res = await fetch(`${API_URL}/files/${encodeURIComponent(blobName)}/archive`, {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ tier: targetTier, reason: 'Manuel depuis admin' })
        });
        const data = await res.json();
        if (data.success) {
            showNotification(`Tier changé vers ${tierLabels[targetTier]}`, 'success');
            loadFiles();
        } else {
            showNotification('Erreur: ' + (data.error || 'Échec'), 'error');
        }
    } catch (e) { showNotification('Erreur: ' + e.message, 'error'); }
};

window.deleteFile = async (blobName) => {
    if (!await showConfirmDialog('Supprimer le fichier', 'Supprimer ce fichier ?')) return;
    try {
        await fetch(`${API_URL}/files/${blobName}`, { method: 'DELETE', headers: getAuthHeaders() });
        showNotification('Fichier supprime', 'success');
        loadFiles();
    } catch (e) { showNotification('Erreur suppression', 'error'); }
};

async function deleteSelectedFiles() {
    if (!await showConfirmDialog('Supprimer les fichiers', `Supprimer ${selectedFiles.length} fichier(s) ?`)) return;
    for (const name of selectedFiles) {
        await fetch(`${API_URL}/files/${name}`, { method: 'DELETE', headers: getAuthHeaders() });
    }
    showNotification(`${selectedFiles.length} fichier(s) supprime(s)`, 'success');
    selectedFiles = [];
    loadFiles();
}

window.viewFileDetails = (blobName) => {
    const file = allFiles.find(f => f.name === blobName);
    if (!file) return;
    document.getElementById('fileDetailsBody').innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <div style="font-size: 64px; margin-bottom: 20px;">${getFileIcon(file.contentType)}</div>
            <h4>${escapeHtml(file.metadata?.originalName || file.name)}</h4>
            <div style="text-align: left; max-width: 500px; margin: 20px auto;">
                <p><strong>Blob:</strong> ${file.name}</p>
                <p><strong>Type:</strong> ${file.contentType}</p>
                <p><strong>Taille:</strong> ${formatBytes(file.size)}</p>
                <p><strong>Date:</strong> ${new Date(file.lastModified).toLocaleString('fr-FR')}</p>
            </div>
            <div style="margin-top: 20px; display: flex; gap: 12px; justify-content: center;">
                <button class="btn btn-primary" onclick="window.open('${API_URL}/download/${file.name}', '_blank')"><i class="fas fa-download"></i> Telecharger</button>
                <button class="btn btn-secondary" onclick="window.open('${API_URL}/preview/${file.name}', '_blank')"><i class="fas fa-eye"></i> Apercu</button>
            </div>
        </div>`;
    showModal('fileDetailsModal');
};

// ============================================
// SHARES
// ============================================

async function loadShares() {
    try {
        const res = await apiRequest('/share/history');
        allShares = res.success ? (res.shares || []) : [];
    } catch (e) {
        allShares = [];
    }
    renderSharesTable(allShares);
}

function renderSharesTable(shares) {
    const tbody = document.getElementById('sharesTableBody');
    if (!tbody) return;
    if (shares.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="loading">Aucun partage</td></tr>'; return; }
    tbody.innerHTML = shares.map(s => {
        const isExpired = new Date() > new Date(s.expires_at);
        const isActive = s.is_active === 1 && !isExpired;
        return `<tr>
            <td>${escapeHtml(s.original_name || s.blob_name)}</td>
            <td>${formatDate(s.created_at)}</td>
            <td>${formatDate(s.expires_at)}</td>
            <td><span class="status-badge ${isActive ? 'active' : 'expired'}">${isActive ? 'Actif' : 'Expire'}</span></td>
            <td>${s.download_count || 0}</td>
            <td><button class="btn btn-small btn-secondary" onclick="navigator.clipboard.writeText('${s.share_url || ''}'); showNotification('Lien copie', 'success')"><i class="fas fa-copy"></i></button></td>
        </tr>`;
    }).join('');
}

function filterShares() {
    const search = document.getElementById('shareSearchInput').value.toLowerCase();
    const status = document.getElementById('shareStatusFilter').value;
    renderSharesTable(allShares.filter(s => {
        const name = (s.original_name || s.blob_name || '').toLowerCase();
        const isExpired = new Date() > new Date(s.expires_at);
        const isActive = s.is_active === 1 && !isExpired;
        const matchStatus = !status || (status === 'active' && isActive) || (status === 'expired' && !isActive);
        return (!search || name.includes(search)) && matchStatus;
    }));
}

function exportSharesCSV() {
    const rows = [['Fichier', 'Cree le', 'Expire le', 'Statut', 'Telechargements']];
    allShares.forEach(s => {
        const isActive = s.is_active === 1 && new Date() <= new Date(s.expires_at);
        rows.push([s.original_name || s.blob_name, s.created_at, s.expires_at, isActive ? 'Actif' : 'Expire', s.download_count || 0]);
    });
    downloadCSV(rows.map(r => r.join(',')).join('\n'), 'partages.csv');
}

// ============================================
// TEAMS
// ============================================

async function loadTeams() {
    const container = document.getElementById('teamsList');
    container.innerHTML = '<p class="loading">Chargement...</p>';
    try {
        const res = await apiRequest('/teams');
        if (!res.success || res.teams.length === 0) {
            container.innerHTML = '<p class="loading">Aucune equipe</p>';
            return;
        }
        container.innerHTML = `<table class="data-table">
            <thead><tr><th>Nom</th><th>Nom affiché</th><th>Membres</th><th>Fichiers</th><th>Taille</th><th>Créée le</th><th style="width:50px;"></th></tr></thead>
            <tbody>${res.teams.map(t => `<tr>
                <td><strong>${escapeHtml(t.name)}</strong></td>
                <td>${escapeHtml(t.display_name)}</td>
                <td><span class="badge-info">${t.stats?.memberCount || 0}</span></td>
                <td>${t.stats?.fileCount || 0}</td>
                <td>${formatBytes(t.stats?.totalSize || 0)}</td>
                <td>${formatDate(t.created_at)}</td>
                <td style="position:relative;">
                    <button class="btn btn-small btn-secondary" onclick="toggleTeamMenu(event, ${t.id})" style="border:none;background:none;font-size:1.2rem;cursor:pointer;padding:4px 8px;" title="Actions">⋯</button>
                    <div id="teamMenu-${t.id}" class="team-context-menu" style="display:none;position:absolute;right:0;top:100%;background:#fff;border:1px solid #e0e0e0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:100;min-width:200px;overflow:hidden;">
                        <div onclick="viewTeam(${t.id})" class="ctx-item" style="padding:10px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:0.9rem;transition:background 0.15s;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='#fff'">
                            <i class="fas fa-eye" style="color:#1565C0;width:16px;"></i> Voir les détails
                        </div>
                        <div onclick="openAddMember(${t.id}, '${escapeHtml(t.display_name || t.name)}')" class="ctx-item" style="padding:10px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:0.9rem;transition:background 0.15s;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='#fff'">
                            <i class="fas fa-user-plus" style="color:#2e7d32;width:16px;"></i> Ajouter un membre
                        </div>
                        <div onclick="editTeam(${t.id}, '${escapeHtml(t.name)}', '${escapeHtml(t.display_name || '')}', '${escapeHtml(t.description || '')}')" class="ctx-item" style="padding:10px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:0.9rem;transition:background 0.15s;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='#fff'">
                            <i class="fas fa-pen" style="color:#e65100;width:16px;"></i> Modifier l'équipe
                        </div>
                        <div onclick="manageTeamFiles(${t.id}, '${escapeHtml(t.display_name || t.name)}')" class="ctx-item" style="padding:10px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:0.9rem;transition:background 0.15s;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='#fff'">
                            <i class="fas fa-folder-open" style="color:#6a1b9a;width:16px;"></i> Voir les fichiers
                        </div>
                        <div style="border-top:1px solid #eee;"></div>
                        <div onclick="deleteTeam(${t.id})" class="ctx-item" style="padding:10px 16px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:0.9rem;color:#c62828;transition:background 0.15s;" onmouseover="this.style.background='#fce4ec'" onmouseout="this.style.background='#fff'">
                            <i class="fas fa-trash" style="width:16px;"></i> Supprimer l'équipe
                        </div>
                    </div>
                </td>
            </tr>`).join('')}</tbody></table>`;
    } catch (e) {
        container.innerHTML = '<p class="loading" style="color: var(--danger-color);">Erreur chargement</p>';
    }
}

// Toggle team context menu
window.toggleTeamMenu = (event, teamId) => {
    event.stopPropagation();
    document.querySelectorAll('.team-context-menu').forEach(m => {
        if (m.id !== `teamMenu-${teamId}`) m.style.display = 'none';
    });
    const menu = document.getElementById(`teamMenu-${teamId}`);
    if (menu.style.display === 'none' || !menu.style.display) {
        const btn = event.currentTarget;
        const rect = btn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = (rect.bottom + 4) + 'px';
        menu.style.left = 'auto';
        menu.style.right = (window.innerWidth - rect.right) + 'px';
        menu.style.display = 'block';
        requestAnimationFrame(() => {
            const menuRect = menu.getBoundingClientRect();
            if (menuRect.bottom > window.innerHeight) {
                menu.style.top = (rect.top - menuRect.height - 4) + 'px';
            }
        });
    } else {
        menu.style.display = 'none';
    }
};

// Close menus on click outside
document.addEventListener('click', () => {
    document.querySelectorAll('.team-context-menu').forEach(m => m.style.display = 'none');
});

// Add member to team
window.openAddMember = async (teamId, teamName) => {
    document.querySelectorAll('.team-context-menu').forEach(m => m.style.display = 'none');
    try {
        const usersRes = await apiRequest('/admin/users');
        const teamRes = await apiRequest(`/teams/${teamId}`);
        const existingIds = (teamRes.team?.members || []).map(m => m.id || m.user_id);
        const available = (usersRes.users || []).filter(u => !existingIds.includes(u.id) && u.is_active !== 0);
        
        if (available.length === 0) {
            showNotification('Tous les utilisateurs sont déjà membres de cette équipe', 'info');
            return;
        }
        
        const html = `
            <div style="padding:8px 0;">
                <p style="margin-bottom:12px;">Ajouter un membre à <strong>${escapeHtml(teamName)}</strong></p>
                <select id="addMemberSelect" class="form-input" style="width:100%;margin-bottom:12px;">
                    ${available.map(u => `<option value="${u.id}">${escapeHtml(u.username)} — ${escapeHtml(u.name || u.full_name || '')}</option>`).join('')}
                </select>
                <select id="addMemberRole" class="form-input" style="width:100%;margin-bottom:16px;">
                    <option value="member">Membre</option>
                    <option value="admin">Admin équipe</option>
                </select>
                <button class="btn btn-primary" onclick="confirmAddMember(${teamId})" style="width:100%;">
                    <i class="fas fa-user-plus"></i> Ajouter
                </button>
            </div>`;
        document.getElementById('teamDetailTitle').textContent = `Ajouter un membre`;
        document.getElementById('teamDetailBody').innerHTML = html;
        showModal('teamDetailModal');
    } catch (e) { showNotification('Erreur: ' + e.message, 'error'); }
};

window.confirmAddMember = async (teamId) => {
    const userId = document.getElementById('addMemberSelect').value;
    const role = document.getElementById('addMemberRole').value;
    try {
        await apiRequest(`/teams/${teamId}/members`, 'POST', { userId: parseInt(userId), role });
        showNotification('Membre ajouté', 'success');
        closeModal('teamDetailModal');
        loadTeams();
    } catch (e) { showNotification('Erreur: ' + e.message, 'error'); }
};

// Edit team
window.editTeam = (teamId, name, displayName, description) => {
    document.querySelectorAll('.team-context-menu').forEach(m => m.style.display = 'none');
    const html = `
        <div style="padding:8px 0;">
            <label style="font-weight:600;display:block;margin-bottom:4px;">Nom</label>
            <input type="text" id="editTeamName" class="form-input" value="${escapeHtml(name)}" style="width:100%;margin-bottom:12px;">
            <label style="font-weight:600;display:block;margin-bottom:4px;">Nom affiché</label>
            <input type="text" id="editTeamDisplay" class="form-input" value="${escapeHtml(displayName)}" style="width:100%;margin-bottom:12px;">
            <label style="font-weight:600;display:block;margin-bottom:4px;">Description</label>
            <textarea id="editTeamDesc" class="form-input" rows="3" style="width:100%;margin-bottom:16px;">${escapeHtml(description)}</textarea>
            <button class="btn btn-primary" onclick="confirmEditTeam(${teamId})" style="width:100%;">
                <i class="fas fa-save"></i> Enregistrer
            </button>
        </div>`;
    document.getElementById('teamDetailTitle').textContent = 'Modifier l\'équipe';
    document.getElementById('teamDetailBody').innerHTML = html;
    showModal('teamDetailModal');
};

window.confirmEditTeam = async (teamId) => {
    const name = document.getElementById('editTeamName').value.trim();
    const displayName = document.getElementById('editTeamDisplay').value.trim();
    const description = document.getElementById('editTeamDesc').value.trim();
    try {
        await apiRequest(`/teams/${teamId}`, 'PUT', { name, display_name: displayName, description });
        showNotification('Équipe modifiée', 'success');
        closeModal('teamDetailModal');
        loadTeams();
    } catch (e) { showNotification('Erreur: ' + e.message, 'error'); }
};

// View team files
window.manageTeamFiles = async (teamId, teamName) => {
    document.querySelectorAll('.team-context-menu').forEach(m => m.style.display = 'none');
    try {
        const res = await fetch(`${API_URL}/files?teamId=${teamId}`, { headers: getAuthHeaders() });
        const data = await res.json();
        const files = data.files || [];
        const html = `
            <div style="padding:8px 0;">
                <p style="margin-bottom:12px;"><strong>${files.length}</strong> fichier(s) dans <strong>${escapeHtml(teamName)}</strong></p>
                ${files.length > 0 ? `<table class="data-table">
                    <thead><tr><th>Fichier</th><th>Taille</th><th>Type</th><th>Uploadé le</th></tr></thead>
                    <tbody>${files.map(f => `<tr>
                        <td>${escapeHtml(f.originalName || f.name)}</td>
                        <td>${formatBytes(f.size)}</td>
                        <td>${f.contentType || '—'}</td>
                        <td>${formatDate(f.uploadedAt)}</td>
                    </tr>`).join('')}</tbody>
                </table>` : '<p style="color:#888;text-align:center;padding:20px;">Aucun fichier dans cette équipe</p>'}
            </div>`;
        document.getElementById('teamDetailTitle').textContent = `Fichiers — ${escapeHtml(teamName)}`;
        document.getElementById('teamDetailBody').innerHTML = html;
        showModal('teamDetailModal');
    } catch (e) { showNotification('Erreur: ' + e.message, 'error'); }
};

window.viewTeam = async (teamId) => {
    try {
        const res = await apiRequest(`/teams/${teamId}`);
        if (!res.success) throw new Error(res.error);
        const t = res.team;
        document.getElementById('teamDetailTitle').textContent = `Equipe : ${t.display_name || t.name}`;
        const members = t.members || [];
        document.getElementById('teamDetailBody').innerHTML = `
            <div style="margin-bottom: 16px;">
                <p><strong>Nom :</strong> ${escapeHtml(t.name)}</p>
                <p><strong>Nom affiche :</strong> ${escapeHtml(t.display_name || '-')}</p>
                <p><strong>Description :</strong> ${escapeHtml(t.description || '-')}</p>
                <p><strong>Creee le :</strong> ${formatDate(t.created_at)}</p>
                <p><strong>Fichiers :</strong> ${t.stats?.fileCount || 0} (${formatBytes(t.stats?.totalSize || 0)})</p>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <h4 style="margin:0;">Membres (${members.length})</h4>
                <button class="btn btn-small btn-primary" onclick="closeModal('teamDetailModal');openAddMember(${teamId}, '${escapeHtml(t.display_name || t.name)}')">
                    <i class="fas fa-user-plus"></i> Ajouter
                </button>
            </div>
            ${members.length > 0 ? `<table class="data-table">
                <thead><tr><th>Username</th><th>Nom</th><th>Email</th><th>Rôle</th><th>Rejoint le</th><th></th></tr></thead>
                <tbody>${members.map(m => `<tr>
                    <td><strong>${escapeHtml(m.username)}</strong></td>
                    <td>${escapeHtml(m.full_name || '-')}</td>
                    <td>${escapeHtml(m.email || '-')}</td>
                    <td><span class="badge-info">${m.role}</span></td>
                    <td>${formatDate(m.joined_at)}</td>
                    <td><button class="btn btn-small btn-danger" onclick="removeMember(${teamId}, ${m.id || m.user_id})" title="Retirer"><i class="fas fa-user-minus"></i></button></td>
                </tr>`).join('')}</tbody></table>` : '<p style="color:#888;text-align:center;padding:16px;">Aucun membre — cliquez sur "Ajouter" pour commencer</p>'}`;
        showModal('teamDetailModal');
    } catch (e) { showNotification('Erreur chargement equipe', 'error'); }
};

window.removeMember = async (teamId, userId) => {
    if (!confirm('Retirer ce membre de l\'équipe ?')) return;
    try {
        await apiRequest(`/teams/${teamId}/members/${userId}`, 'DELETE');
        showNotification('Membre retiré', 'success');
        viewTeam(teamId); // Refresh the modal
        loadTeams();
    } catch (e) { showNotification('Erreur: ' + e.message, 'error'); }
};

window.deleteTeam = async (teamId) => {
    if (!await showConfirmDialog('Supprimer l\'equipe', 'Supprimer cette equipe ?')) return;
    try {
        await apiRequest(`/teams/${teamId}`, 'DELETE');
        showNotification('Equipe supprimee', 'success');
        loadTeams();
    } catch (e) { showNotification('Erreur suppression', 'error'); }
};

async function createTeam() {
    const name = document.getElementById('teamName').value.trim();
    const displayName = document.getElementById('teamDisplayName').value.trim();
    const description = document.getElementById('teamDescription').value.trim();
    if (!name || !displayName) { showNotification('Remplissez les champs obligatoires', 'error'); return; }
    try {
        await apiRequest('/teams', 'POST', { name, displayName, description });
        showNotification('Equipe creee', 'success');
        closeModal('createTeamModal');
        document.getElementById('teamName').value = '';
        document.getElementById('teamDisplayName').value = '';
        document.getElementById('teamDescription').value = '';
        loadTeams();
    } catch (e) { showNotification(e.message || 'Erreur creation', 'error'); }
}

// ============================================
// COSTS
// ============================================

async function loadFinOps() {
    try {
        const res = await apiRequest('/admin/finops');
        if (!res.success) throw new Error(res.error);

        const fmtEur = (n) => { if (!n || n === 0) return '0.00 €'; if (n < 0.01) return (n * 100).toFixed(4) + ' c€'; return n.toFixed(4) + ' €'; };
        const fmtSize = (gb) => { if (!gb || gb === 0) return '0'; if (gb < 0.001) return (gb * 1024 * 1024).toFixed(1) + ' Ko'; if (gb < 1) return (gb * 1024).toFixed(2) + ' Mo'; return gb.toFixed(3) + ' Go'; };

        // Hero
        document.getElementById('finopsTotalCost').textContent = fmtEur(res.costs.total);
        document.getElementById('finopsForecast').textContent = fmtEur(res.forecast.projectedTotal);

        // Breakdown bar
        const s = res.costs.breakdown;
        document.getElementById('finopsBar').innerHTML = `
            <div style="width:${Math.max(s.storagePct,2)}%;background:#3b82f6;display:flex;align-items:center;justify-content:center;color:#fff;font-size:0.7rem;font-weight:600;">${s.storagePct > 15 ? 'Stockage' : ''}</div>
            <div style="width:${Math.max(s.operationsPct,2)}%;background:#f59e0b;display:flex;align-items:center;justify-content:center;color:#fff;font-size:0.7rem;font-weight:600;">${s.operationsPct > 15 ? 'Opérations' : ''}</div>
            <div style="width:${Math.max(s.bandwidthPct,2)}%;background:#8b5cf6;display:flex;align-items:center;justify-content:center;color:#fff;font-size:0.7rem;font-weight:600;">${s.bandwidthPct > 15 ? 'BP' : ''}</div>`;
        document.getElementById('finopsBarLegend').innerHTML = `
            <span>🔵 Stockage: ${fmtEur(res.costs.storage)}</span>
            <span>🟡 Opérations: ${fmtEur(res.costs.operations.total)}</span>
            <span>🟣 Bande passante: ${fmtEur(res.costs.bandwidth.cost)}</span>`;

        // Tier cards
        const st = res.storage;
        document.getElementById('finopsTierCards').innerHTML = `
            <div class="stat-card" style="border-left:4px solid #ef4444;">
                <h3 class="stat-value">${fmtSize(st.hot.sizeGb)}</h3><p class="stat-label">🔴 Hot (${st.hot.count} fichiers)</p>
                <div style="color:#ef4444;font-weight:600;font-size:0.85rem;">${fmtEur(st.hot.costPerMonth)}/mois</div></div>
            <div class="stat-card" style="border-left:4px solid #3b82f6;">
                <h3 class="stat-value">${fmtSize(st.cool.sizeGb)}</h3><p class="stat-label">🔵 Cool (${st.cool.count} fichiers)</p>
                <div style="color:#3b82f6;font-weight:600;font-size:0.85rem;">${fmtEur(st.cool.costPerMonth)}/mois</div></div>
            <div class="stat-card" style="border-left:4px solid #6b7280;">
                <h3 class="stat-value">${fmtSize(st.archive.sizeGb)}</h3><p class="stat-label">⚫ Archive (${st.archive.count} fichiers)</p>
                <div style="color:#6b7280;font-weight:600;font-size:0.85rem;">${fmtEur(st.archive.costPerMonth)}/mois</div></div>
            <div class="stat-card" style="border-left:4px solid #f59e0b;">
                <h3 class="stat-value">${fmtSize(st.trashed.sizeGb)}</h3><p class="stat-label">🗑️ Corbeille (${st.trashed.count} fichiers)</p>
                <div style="color:#f59e0b;font-weight:600;font-size:0.85rem;">${fmtEur(st.trashed.costPerMonth)}/mois</div></div>`;

        // Operations cards
        const ops = res.operations;
        document.getElementById('finopsOpsCards').innerHTML = `
            <div class="stat-card" style="border-left:4px solid #10b981;">
                <h3 class="stat-value">${ops.write}</h3><p class="stat-label">📤 Écritures</p>
                <div style="font-size:0.8rem;color:#666;">${fmtEur(res.costs.operations.write)}</div></div>
            <div class="stat-card" style="border-left:4px solid #10b981;">
                <h3 class="stat-value">${ops.read}</h3><p class="stat-label">📥 Lectures</p>
                <div style="font-size:0.8rem;color:#666;">${fmtEur(res.costs.operations.read)}</div></div>
            <div class="stat-card" style="border-left:4px solid #10b981;">
                <h3 class="stat-value">${ops.list}</h3><p class="stat-label">📋 Listings</p>
                <div style="font-size:0.8rem;color:#666;">${fmtEur(res.costs.operations.list)}</div></div>
            <div class="stat-card" style="border-left:4px solid #8b5cf6;">
                <h3 class="stat-value">${fmtSize(ops.bytesDownloaded / (1024*1024*1024))}</h3><p class="stat-label">📥 Bande passante sortante</p>
                <div style="font-size:0.8rem;color:#666;">${fmtEur(res.costs.bandwidth.cost)}</div></div>`;

        // Users table
        document.getElementById('finopsUsersTable').innerHTML = res.costsByUser.length > 0 ? res.costsByUser.map(u => `<tr>
            <td><strong>${escapeHtml(u.username || u.full_name || 'User #' + u.entity_id)}</strong></td>
            <td>${fmtEur(u.storage_cost)}</td><td>${fmtSize(u.storage_hot_gb)}</td><td>${fmtSize(u.storage_cool_gb)}</td><td>${fmtSize(u.storage_archive_gb)}</td>
            <td>${fmtEur(u.operations_cost)} <span style="color:#94a3b8;font-size:0.75rem;">(W:${u.operations_write||0} R:${u.operations_read||0} L:${u.operations_list||0})</span></td>
            <td><strong>${fmtEur(u.total_cost)}</strong></td></tr>`).join('') : '<tr><td colspan="7" class="loading">Aucune donnée</td></tr>';

        // Teams table
        document.getElementById('finopsTeamsTable').innerHTML = res.costsByTeam.length > 0 ? res.costsByTeam.map(t => `<tr>
            <td><strong>${escapeHtml(t.team_name || 'Team #' + t.entity_id)}</strong></td>
            <td>${fmtEur(t.storage_cost)}</td><td>${fmtSize(t.storage_hot_gb)}</td><td>${fmtSize(t.storage_cool_gb)}</td>
            <td>${fmtEur(t.operations_cost)}</td><td><strong>${fmtEur(t.total_cost)}</strong></td></tr>`).join('') : '<tr><td colspan="6" class="loading">Aucune donnée</td></tr>';

        // Top files
        document.getElementById('finopsFilesTable').innerHTML = res.topFiles.length > 0 ? res.topFiles.map(f => {
            const tierColor = {hot:'#ef4444',cool:'#3b82f6',archive:'#6b7280'}[(f.tier||'Hot').toLowerCase()] || '#666';
            return `<tr>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(f.original_name || f.blob_name)}</td>
                <td>${escapeHtml(f.owner || '—')}${f.team_name ? ` <span style="color:#3b82f6;">(${escapeHtml(f.team_name)})</span>` : ''}</td>
                <td>${fmtSize(f.sizeGb)}</td>
                <td><span style="background:${tierColor};color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;">${f.tier||'Hot'}</span></td>
                <td>${fmtEur(f.monthlyCost)}</td></tr>`;
        }).join('') : '<tr><td colspan="5" class="loading">Aucun fichier</td></tr>';

    } catch (e) {
        console.error('FinOps error:', e);
        showNotification('Erreur chargement FinOps', 'error');
    }
}

async function recalculateFinOps() {
    showNotification('Recalcul en cours...', 'info');
    try {
        await apiRequest('/admin/finops/recalculate', 'POST');
        showNotification('Coûts recalculés', 'success');
        loadFinOps();
    } catch (e) { showNotification('Erreur: ' + e.message, 'error'); }
}

async function sendFinOpsReport() {
    const email = prompt('Envoyer le rapport FinOps à :', 'laurent.deberti@gmail.com');
    if (!email) return;
    try {
        const res = await apiRequest('/admin/finops/send', 'POST', { email });
        if (res.success) showNotification('Rapport FinOps envoyé à ' + email, 'success');
        else showNotification(res.error || 'Erreur envoi', 'error');
    } catch (e) { showNotification('Erreur: ' + e.message, 'error'); }
}

// ============================================
// USERS
// ============================================

async function loadUsers() {
    const container = document.getElementById('usersList');
    container.innerHTML = '<p class="loading">Chargement...</p>';
    try {
        const res = await apiRequest('/admin/users');
        const users = res.success ? (res.users || []) : [];
        if (users.length === 0) { container.innerHTML = '<p class="loading">Aucun utilisateur</p>'; return; }

        const roleBadge = (role) => {
            const colors = { admin: 'background:rgba(239,68,68,0.1);color:#ef4444;', com: 'background:rgba(245,158,11,0.1);color:#f59e0b;', user: 'background:rgba(59,130,246,0.1);color:#3b82f6;', viewer: 'background:rgba(107,114,128,0.1);color:#6b7280;' };
            const labels = { admin: 'Admin', com: 'COM', user: 'Utilisateur', viewer: 'Lecteur' };
            return `<span class="status-badge" style="${colors[role] || colors.user}">${labels[role] || role}</span>`;
        };

        const statusBadge = (isActive) => isActive ?
            '<span class="status-badge active">Actif</span>' :
            '<span class="status-badge expired">Inactif</span>';

        container.innerHTML = `<table class="data-table">
            <thead><tr><th>Username</th><th>Nom</th><th>Email</th><th>Role</th><th>Statut</th><th>Equipes</th><th>Derniere connexion</th><th style="width:50px;"></th></tr></thead>
            <tbody>${users.map(u => {
                const esc = escapeHtml(u.username);
                return `<tr style="${u.is_active ? '' : 'opacity: 0.55;'}">
                <td><strong>${esc}</strong></td>
                <td>${escapeHtml(u.full_name || '-')}</td>
                <td>${escapeHtml(u.email || '-')}</td>
                <td>${roleBadge(u.role)}</td>
                <td>${statusBadge(u.is_active)}</td>
                <td>${(u.teams && u.teams.length > 0) ? u.teams.map(t => `<span class="badge-info" style="margin-right:4px;">${escapeHtml(t.displayName || t.name)} (${t.role})</span>`).join('') : '<span style="color:#888;">-</span>'}</td>
                <td>${u.last_login_at ? formatDate(u.last_login_at) : 'Jamais'}</td>
                <td>
                    <div class="kebab-menu">
                        <button class="kebab-btn" data-kebab="${u.id}"><i class="fas fa-ellipsis-vertical"></i></button>
                        <div class="kebab-dropdown" id="kebab-user-${u.id}">
                            <button class="kebab-dropdown-item" data-action="editUser" data-id="${u.id}"><i class="fas fa-pen"></i> Modifier</button>
                            <button class="kebab-dropdown-item" data-action="resetPassword" data-id="${u.id}" data-name="${esc}"><i class="fas fa-key"></i> Mot de passe</button>
                            <button class="kebab-dropdown-item" data-action="editTeams" data-id="${u.id}" data-name="${esc}"><i class="fas fa-users-gear"></i> Gerer les equipes</button>
                            <div class="kebab-divider"></div>
                            ${u.is_active ?
                                `<button class="kebab-dropdown-item danger" data-action="deactivateUser" data-id="${u.id}" data-name="${esc}"><i class="fas fa-ban"></i> Desactiver</button>` :
                                `<button class="kebab-dropdown-item success" data-action="activateUser" data-id="${u.id}" data-name="${esc}"><i class="fas fa-check"></i> Reactiver</button>`}
                            <button class="kebab-dropdown-item danger" data-action="deleteUser" data-id="${u.id}" data-name="${esc}"><i class="fas fa-trash"></i> Supprimer</button>
                        </div>
                    </div>
                </td>
            </tr>`;
            }).join('')}</tbody></table>`;

        // Bind kebab menu events
        container.querySelectorAll('[data-kebab]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.kebab;
                const dropdown = document.getElementById(`kebab-user-${id}`);
                const wasOpen = dropdown.classList.contains('open');
                closeAllKebabs();
                if (!wasOpen) dropdown.classList.add('open');
            });
        });

        container.querySelectorAll('[data-action]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                closeAllKebabs();
                const { action, id, name } = item.dataset;
                const uid = parseInt(id);
                switch (action) {
                    case 'editUser': openEditUser(uid); break;
                    case 'resetPassword': openResetPassword(uid, name); break;
                    case 'editTeams': editUserTeams(uid, name); break;
                    case 'deactivateUser': deactivateUser(uid, name); break;
                    case 'activateUser': activateUser(uid, name); break;
                    case 'deleteUser': deleteUser(uid, name); break;
                }
            });
        });
    } catch (e) {
        container.innerHTML = '<p class="loading">Erreur de chargement</p>';
    }
}

function closeAllKebabs() {
    document.querySelectorAll('.kebab-dropdown.open').forEach(d => d.classList.remove('open'));
}

async function createUser() {
    const username = document.getElementById('newUserUsername').value.trim();
    const fullName = document.getElementById('newUserFullName').value.trim();
    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    const role = document.getElementById('newUserRole').value;
    if (!username || !password) { showNotification('Username et mot de passe requis', 'error'); return; }
    try {
        await apiRequest('/admin/users', 'POST', { username, fullName, email, password, role });
        showNotification('Utilisateur cree', 'success');
        closeModal('createUserModal');
        document.getElementById('newUserUsername').value = '';
        document.getElementById('newUserFullName').value = '';
        document.getElementById('newUserEmail').value = '';
        document.getElementById('newUserPassword').value = '';
        loadUsers();
    } catch (e) { showNotification(e.message || 'Erreur creation', 'error'); }
}

window.editUserTeams = async (userId, username) => {
    document.getElementById('userTeamsTitle').textContent = `Equipes de ${username}`;
    document.getElementById('userTeamsBody').innerHTML = '<p class="loading">Chargement...</p>';
    showModal('userTeamsModal');
    try {
        const [usersRes, teamsRes] = await Promise.all([
            apiRequest('/admin/users'),
            apiRequest('/teams')
        ]);
        const user = (usersRes.users || []).find(u => u.id === userId);
        const userTeams = user?.teams || [];
        const allTeams = teamsRes.success ? (teamsRes.teams || []) : [];
        const availableTeams = allTeams.filter(t => !userTeams.some(ut => ut.teamId === t.id));

        document.getElementById('userTeamsBody').innerHTML = `
            <h4>Equipes actuelles</h4>
            ${userTeams.length > 0 ? `<table class="data-table">
                <thead><tr><th>Equipe</th><th>Role</th><th>Actions</th></tr></thead>
                <tbody>${userTeams.map(t => `<tr>
                    <td><strong>${escapeHtml(t.displayName || t.name)}</strong></td>
                    <td><span class="badge-info">${t.role}</span></td>
                    <td><button class="btn btn-small btn-danger" onclick="removeUserFromTeam(${userId}, ${t.teamId}, '${escapeHtml(username)}')"><i class="fas fa-times"></i> Retirer</button></td>
                </tr>`).join('')}</tbody></table>` : '<p style="color:#888;">Aucune equipe</p>'}
            <hr style="margin: 16px 0;">
            <h4>Ajouter a une equipe</h4>
            ${availableTeams.length > 0 ? `<div style="display:flex;gap:8px;align-items:flex-end;">
                <div class="form-group" style="flex:2;margin-bottom:0;">
                    <label>Equipe</label>
                    <select id="addTeamSelect" class="filter-select" style="width:100%;">
                        ${availableTeams.map(t => `<option value="${t.id}">${escapeHtml(t.display_name || t.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group" style="flex:1;margin-bottom:0;">
                    <label>Role</label>
                    <select id="addTeamRoleSelect" class="filter-select" style="width:100%;">
                        <option value="member">Membre</option>
                        <option value="owner">Owner</option>
                    </select>
                </div>
                <button class="btn btn-primary btn-small" onclick="addUserToTeam(${userId}, '${escapeHtml(username)}')"><i class="fas fa-plus"></i> Ajouter</button>
            </div>` : '<p style="color:#888;">Toutes les equipes sont deja assignees</p>'}`;
    } catch (e) {
        document.getElementById('userTeamsBody').innerHTML = '<p style="color:var(--danger-color);">Erreur chargement</p>';
    }
};

window.addUserToTeam = async (userId, username) => {
    const teamId = document.getElementById('addTeamSelect').value;
    const role = document.getElementById('addTeamRoleSelect').value;
    try {
        await apiRequest(`/teams/${teamId}/members`, 'POST', { userId, role });
        showNotification('Utilisateur ajoute a l\'equipe', 'success');
        editUserTeams(userId, username);
        loadUsers();
    } catch (e) { showNotification(e.message || 'Erreur ajout', 'error'); }
};

window.removeUserFromTeam = async (userId, teamId, username) => {
    if (!await showConfirmDialog('Retirer de l\'equipe', `Retirer ${username} de l'equipe ?`)) return;
    try {
        await apiRequest(`/teams/${teamId}/members/${userId}`, 'DELETE');
        showNotification('Utilisateur retire de l\'equipe', 'success');
        editUserTeams(userId, username);
        loadUsers();
    } catch (e) { showNotification(e.message || 'Erreur suppression', 'error'); }
};

window.deactivateUser = async (userId, username) => {
    if (!await showConfirmDialog('Desactiver l\'utilisateur', `Desactiver l'utilisateur "${username}" ?`)) return;
    try {
        await apiRequest(`/admin/users/${userId}`, 'DELETE');
        showNotification('Utilisateur desactive', 'success');
        loadUsers();
    } catch (e) { showNotification(e.message || 'Erreur', 'error'); }
};

window.activateUser = async (userId, username) => {
    try {
        await apiRequest(`/admin/users/${userId}/activate`, 'PUT');
        showNotification(`Utilisateur "${username}" reactive`, 'success');
        loadUsers();
    } catch (e) { showNotification(e.message || 'Erreur', 'error'); }
};

window.deleteUser = async (userId, username) => {
    if (!await showConfirmDialog('Supprimer definitivement', `Supprimer definitivement l'utilisateur "${username}" ?\n\nCette action est irreversible.`)) return;
    try {
        await apiRequest(`/admin/users/${userId}/permanent`, 'DELETE');
        showNotification(`Utilisateur "${username}" supprime`, 'success');
        loadUsers();
    } catch (e) { showNotification(e.message || 'Erreur', 'error'); }
};

window.openEditUser = async (userId) => {
    try {
        const res = await apiRequest('/admin/users');
        const user = (res.users || []).find(u => u.id === userId);
        if (!user) { showNotification('Utilisateur non trouve', 'error'); return; }
        document.getElementById('editUserId').value = user.id;
        document.getElementById('editUserUsername').value = user.username;
        document.getElementById('editUserFullName').value = user.full_name || '';
        document.getElementById('editUserEmail').value = user.email || '';
        document.getElementById('editUserRole').value = user.role;
        showModal('editUserModal');
    } catch (e) { showNotification('Erreur', 'error'); }
};

window.saveEditUser = async () => {
    const userId = document.getElementById('editUserId').value;
    const role = document.getElementById('editUserRole').value;
    const fullName = document.getElementById('editUserFullName').value.trim();
    try {
        await apiRequest(`/admin/users/${userId}`, 'PUT', { role, fullName });
        showNotification('Utilisateur modifie', 'success');
        closeModal('editUserModal');
        loadUsers();
    } catch (e) { showNotification(e.message || 'Erreur', 'error'); }
};

window.openResetPassword = (userId, username) => {
    document.getElementById('resetPasswordUserId').value = userId;
    document.getElementById('resetPasswordUsername').textContent = username;
    document.getElementById('resetPasswordInput').value = '';
    showModal('resetPasswordModal');
};

window.submitResetPassword = async () => {
    const userId = document.getElementById('resetPasswordUserId').value;
    const password = document.getElementById('resetPasswordInput').value;
    if (!password || password.length < 4) { showNotification('Mot de passe trop court (min. 4)', 'error'); return; }
    try {
        await apiRequest(`/admin/users/${userId}/password`, 'PUT', { password });
        showNotification('Mot de passe reinitialise', 'success');
        closeModal('resetPasswordModal');
    } catch (e) { showNotification(e.message || 'Erreur', 'error'); }
};

// ============================================
// GUESTS
// ============================================

async function loadGuests() {
    try {
        const res = await apiRequest('/admin/guest-accounts');
        if (res.success) {
            allGuests = res.guests || [];
            updateGuestsStats(res.stats || {});
            renderGuestsTable(allGuests);
        }
    } catch (e) { console.error('Guests error:', e); }
}

function updateGuestsStats(stats) {
    document.getElementById('totalGuestsCount').textContent = stats.total || 0;
    document.getElementById('activeGuestsCount').textContent = stats.active || 0;
    const expiring = allGuests.filter(g => g.is_active && !g.isExpired && g.hoursRemaining > 0 && g.hoursRemaining <= 24).length;
    document.getElementById('expiringSoonCount').textContent = expiring;
    document.getElementById('disabledGuestsCount').textContent = stats.disabled || 0;
}

function renderGuestsTable(guests) {
    const tbody = document.getElementById('guestsTableBody');
    if (guests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">Aucun invite</td></tr>';
        return;
    }
    tbody.innerHTML = guests.map(g => `<tr>
        <td><strong>${escapeHtml(g.email)}</strong> ${g.code_used === 1 ? '<span class="badge-success">Utilise</span>' : '<span class="badge-warning">En attente</span>'}</td>
        <td>${escapeHtml(g.creator_username || 'N/A')}</td>
        <td><span class="badge-info">${g.file_count || 0}</span></td>
        <td>${formatDate(g.created_at)}</td>
        <td>${formatDate(g.account_expires_at)}</td>
        <td>${formatTimeRemaining(g)}</td>
        <td>${getGuestStatusBadge(g)}</td>
        <td><div class="table-actions">
            <button class="btn btn-icon btn-small" onclick="viewGuestDetails('${g.guest_id}')"><i class="fas fa-eye"></i></button>
            ${g.pending_approval ? `<button class="btn btn-small btn-success" onclick="approveGuest('${g.guest_id}', '${escapeHtml(g.email)}')"><i class="fas fa-check"></i> Approuver</button>` : ''}
            ${g.is_active === 1 && !g.pending_approval ? `<button class="btn btn-icon btn-small btn-warning" onclick="disableGuest('${g.guest_id}', '${escapeHtml(g.email)}')"><i class="fas fa-ban"></i></button>` : ''}
            <button class="btn btn-icon btn-small btn-danger" onclick="deleteGuest('${g.guest_id}', '${escapeHtml(g.email)}')"><i class="fas fa-trash"></i></button>
        </div></td>
    </tr>`).join('');
}

function getGuestStatusBadge(g) {
    if (g.pending_approval) return '<span class="badge-warning">⏳ Approbation</span>';
    if (!g.is_active) return '<span class="badge-danger">Désactivé</span>';
    if (g.isExpired) return '<span class="badge-danger">Expiré</span>';
    if (g.hoursRemaining <= 24) return '<span class="badge-warning">Expire bientôt</span>';
    return '<span class="badge-success">Actif</span>' + (g.is_unlimited ? ' <span class="badge-info">♾️</span>' : '');
}

function formatTimeRemaining(g) {
    if (!g.is_active) return '<span style="color: #ef4444;">Desactive</span>';
    if (g.isExpired) return '<span style="color: #ef4444;">Expire</span>';
    if (g.daysRemaining > 0) return `<span style="color: ${g.daysRemaining <= 1 ? '#f59e0b' : '#10b981'};">${g.daysRemaining} jour(s)</span>`;
    if (g.hoursRemaining > 0) return `<span style="color: #f59e0b;">${g.hoursRemaining}h</span>`;
    return '<span style="color: #ef4444;">Bientot</span>';
}

async function createGuest() {
    const email = document.getElementById('guestEmail').value.trim();
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        showCreateGuestError('Email invalide');
        return;
    }
    const btn = document.getElementById('submitCreateGuestBtn');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creation...';
    try {
        const res = await apiRequest('/admin/guest-accounts', 'POST', { email });
        if (res.success) {
            closeModal('createGuestModal');
            showNotification(res.message || 'Invite cree', 'success');
            loadGuests();
        } else { showCreateGuestError(res.error || 'Erreur'); }
    } catch (e) { showCreateGuestError(e.message || 'Erreur'); }
    finally { btn.disabled = false; btn.innerHTML = orig; }
}

function showCreateGuestError(msg) {
    const el = document.getElementById('createGuestError');
    document.getElementById('createGuestErrorMessage').textContent = msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 5000);
}

window.viewGuestDetails = (guestId) => {
    const g = allGuests.find(x => x.guest_id === guestId);
    if (!g) return;
    document.getElementById('guestDetailsBody').innerHTML = `
        <div style="display: grid; gap: 1.5rem;">
            <div><h4 style="margin-bottom: 1rem;"><i class="fas fa-info-circle"></i> Informations</h4>
                <p><strong>Email:</strong> ${escapeHtml(g.email)}</p>
                <p><strong>ID:</strong> <code>${g.guest_id}</code></p>
                <p><strong>Cree par:</strong> ${escapeHtml(g.creator_username || 'N/A')}</p>
                <p><strong>Date:</strong> ${formatDate(g.created_at)}</p>
            </div>
            <div><h4 style="margin-bottom: 1rem;"><i class="fas fa-clock"></i> Expiration</h4>
                <p><strong>Expire le:</strong> ${formatDate(g.account_expires_at)}</p>
                <p><strong>Temps restant:</strong> ${formatTimeRemaining(g)}</p>
                <p><strong>Code utilise:</strong> ${g.code_used === 1 ? 'Oui' : 'Non'}</p>
                <p><strong>Statut:</strong> ${getGuestStatusBadge(g)}</p>
            </div>
            <div><h4 style="margin-bottom: 1rem;"><i class="fas fa-file"></i> Fichiers: ${g.file_count || 0}</h4></div>
        </div>`;
    showModal('guestDetailsModal');
};

window.approveGuest = async (guestId, email) => {
    if (!confirm(`Approuver l'accès illimité pour ${email} ?`)) return;
    try {
        const res = await apiRequest(`/admin/guest-accounts/${guestId}/approve`, 'PUT');
        if (res.success) {
            showNotification('Invité approuvé — accès illimité activé', 'success');
            loadGuests();
        } else {
            showNotification(res.error || 'Erreur', 'error');
        }
    } catch (e) { showNotification('Erreur: ' + e.message, 'error'); }
};

window.disableGuest = async (guestId, email) => {
    const ok = await showConfirmDialog('Desactiver l\'invite', `Desactiver ${email} ?`);
    if (!ok) return;
    try {
        await apiRequest(`/admin/guest-accounts/${guestId}/disable`, 'PUT');
        showNotification('Invite desactive', 'success');
        loadGuests();
    } catch (e) { showNotification('Erreur', 'error'); }
};

window.deleteGuest = async (guestId, email) => {
    const ok = await showConfirmDialog('Supprimer l\'invite', `Supprimer ${email} et ses fichiers ?`);
    if (!ok) return;
    try {
        const res = await apiRequest(`/admin/guest-accounts/${guestId}`, 'DELETE');
        showNotification(`Invite supprime (${res.stats?.filesDeleted || 0} fichier(s))`, 'success');
        loadGuests();
    } catch (e) { showNotification('Erreur', 'error'); }
};

function filterGuests() {
    const status = document.getElementById('guestStatusFilter').value;
    const search = document.getElementById('guestSearch').value.toLowerCase();
    renderGuestsTable(allGuests.filter(g => {
        let matchStatus = true;
        if (status === 'active') matchStatus = g.is_active === 1 && !g.isExpired;
        else if (status === 'expired') matchStatus = g.isExpired;
        else if (status === 'disabled') matchStatus = g.is_active === 0;
        const matchSearch = !search || g.email.toLowerCase().includes(search) || (g.creator_username || '').toLowerCase().includes(search);
        return matchStatus && matchSearch;
    }));
}

// ============================================
// LOGS
// ============================================

let logsPage = 1;
let logsTotal = 0;
const LOGS_PER_PAGE = 50;

const LEVEL_ICONS = { info: 'fa-info-circle', success: 'fa-check-circle', warning: 'fa-exclamation-triangle', error: 'fa-times-circle' };
const LEVEL_LABELS = { info: 'Info', success: 'Succes', warning: 'Warning', error: 'Erreur' };
const CATEGORY_ICONS = { file: 'fa-file', share: 'fa-share-alt', domain: 'fa-globe', user: 'fa-user', auth: 'fa-key', system: 'fa-cog' };
const CATEGORY_LABELS = { file: 'Fichier', share: 'Partage', domain: 'Domaine', user: 'Utilisateur', auth: 'Auth', system: 'Systeme' };

async function loadLogs() {
    const level = document.getElementById('logLevelFilter')?.value || '';
    const category = document.getElementById('logCategoryFilter')?.value || '';
    const search = document.getElementById('logSearchInput')?.value?.trim() || '';

    let query = `/admin/logs?page=${logsPage}&limit=${LOGS_PER_PAGE}`;
    if (level) query += `&level=${encodeURIComponent(level)}`;
    if (category) query += `&category=${encodeURIComponent(category)}`;
    if (search) query += `&search=${encodeURIComponent(search)}`;

    try {
        const res = await apiRequest(query);
        if (res.success) {
            allLogs = res.logs || [];
            logsTotal = res.total || 0;
            renderLogs();
        }
    } catch (e) {
        document.getElementById('logsTableBody').innerHTML = '<tr><td colspan="5" style="color: var(--danger-color);">Erreur de chargement des logs</td></tr>';
        document.getElementById('logsPagination').style.display = 'none';
    }
}

function renderLogs() {
    const tbody = document.getElementById('logsTableBody');
    const pagination = document.getElementById('logsPagination');
    if (!tbody) return;

    if (allLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="color: var(--text-secondary); font-style: italic; text-align: center; padding: 40px;">Aucun log trouve</td></tr>';
        pagination.style.display = 'none';
        return;
    }

    tbody.innerHTML = allLogs.map(l => {
        const time = new Date(l.timestamp).toLocaleString('fr-FR');
        const lvl = l.level || 'info';
        const cat = l.category || 'system';
        const levelIcon = LEVEL_ICONS[lvl] || 'fa-info-circle';
        const levelLabel = LEVEL_LABELS[lvl] || lvl;
        const catIcon = CATEGORY_ICONS[cat] || 'fa-cog';
        const catLabel = CATEGORY_LABELS[cat] || cat;
        return `<tr>
            <td style="white-space: nowrap; color: var(--text-secondary); font-size: 13px;">${time}</td>
            <td><span class="log-level-badge ${lvl}"><i class="fas ${levelIcon}"></i> ${levelLabel}</span></td>
            <td><span class="log-category-badge"><i class="fas ${catIcon}"></i> ${catLabel}</span></td>
            <td>${escapeHtml(l.message || l.operation || '')}</td>
            <td style="color: var(--text-secondary);">${escapeHtml(l.username || '-')}</td>
        </tr>`;
    }).join('');

    const totalPages = Math.ceil(logsTotal / LOGS_PER_PAGE);
    pagination.style.display = 'flex';
    document.getElementById('logsCount').textContent = `${logsTotal} log${logsTotal > 1 ? 's' : ''}`;
    if (totalPages > 1) {
        document.getElementById('logsPageInfo').textContent = `Page ${logsPage} / ${totalPages}`;
        document.getElementById('logsPrevBtn').style.display = '';
        document.getElementById('logsNextBtn').style.display = '';
        document.getElementById('logsPrevBtn').disabled = logsPage <= 1;
        document.getElementById('logsNextBtn').disabled = logsPage >= totalPages;
    } else {
        document.getElementById('logsPageInfo').textContent = '';
        document.getElementById('logsPrevBtn').style.display = 'none';
        document.getElementById('logsNextBtn').style.display = 'none';
    }
}

window.changeLogsPage = function(delta) {
    const totalPages = Math.ceil(logsTotal / LOGS_PER_PAGE);
    const newPage = logsPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        logsPage = newPage;
        loadLogs();
    }
};

async function clearLogs() {
    if (!await showConfirmDialog('Effacer les logs', 'Effacer tous les logs ?')) return;
    try {
        await apiRequest('/admin/logs', 'DELETE');
        showNotification('Logs effaces', 'success');
        logsPage = 1;
        loadLogs();
    } catch (e) { showNotification('Erreur', 'error'); }
}

async function exportLogs() {
    try {
        const res = await apiRequest(`/admin/logs?limit=10000`);
        const logs = res.logs || [];
        const text = logs.map(l => `[${l.timestamp}] ${(l.level || 'info').toUpperCase()} [${l.category || 'system'}] ${l.message || l.operation} ${l.username ? '(' + l.username + ')' : ''}`).join('\n');
        downloadText(text, `logs-${new Date().toISOString().slice(0,10)}.txt`);
    } catch (e) { showNotification('Erreur export', 'error'); }
}

// ============================================
// SETTINGS
// ============================================

async function loadSettings() {
    try {
        const res = await apiRequest('/settings');
        if (!res.success) return;
        const s = res.settings;
        if (s.maxFileSizeMB) document.getElementById('maxFileSizeMB').value = s.maxFileSizeMB.value;
        if (s.containerName) document.getElementById('containerName').value = s.containerName.value;
        if (s.storageQuota) document.getElementById('storageQuota').value = s.storageQuota.value;
        if (s.maxShareDays) document.getElementById('maxShareDays').value = s.maxShareDays.value;
        if (s.defaultShareMinutes) document.getElementById('defaultShareMinutes').value = s.defaultShareMinutes.value;
        if (s.requirePassword) document.getElementById('requirePassword').checked = s.requirePassword.value === 'true';
        if (s.rateLimit) document.getElementById('rateLimit').value = s.rateLimit.value;
        if (s.enableLogs) document.getElementById('enableLogs').checked = s.enableLogs.value === 'true';
        if (s.enableAudit) document.getElementById('enableAudit').checked = s.enableAudit.value === 'true';
        if (s.notifyUploads) document.getElementById('notifyUploads').checked = s.notifyUploads.value === 'true';
        if (s.notifyShares) document.getElementById('notifyShares').checked = s.notifyShares.value === 'true';
        if (s.notifyQuota) document.getElementById('notifyQuota').checked = s.notifyQuota.value === 'true';
        if (s.virusScanEnabled) document.getElementById('virusScanEnabled').checked = s.virusScanEnabled.value === 'true';
        if (s.virusScanOnUpload) document.getElementById('virusScanOnUpload').checked = s.virusScanOnUpload.value === 'true';
        if (s.virusQuarantineNotifyAdmin) document.getElementById('virusQuarantineNotifyAdmin').checked = s.virusQuarantineNotifyAdmin.value === 'true';
    } catch (e) { console.error('Settings error:', e); }
}

async function saveSettings() {
    try {
        await apiRequest('/settings', 'PUT', {
            maxFileSizeMB: document.getElementById('maxFileSizeMB').value,
            containerName: document.getElementById('containerName').value,
            storageQuota: document.getElementById('storageQuota').value,
            maxShareDays: document.getElementById('maxShareDays').value,
            defaultShareMinutes: document.getElementById('defaultShareMinutes').value,
            requirePassword: document.getElementById('requirePassword').checked.toString(),
            rateLimit: document.getElementById('rateLimit').value,
            enableLogs: document.getElementById('enableLogs').checked.toString(),
            enableAudit: document.getElementById('enableAudit').checked.toString(),
            notifyUploads: document.getElementById('notifyUploads').checked.toString(),
            notifyShares: document.getElementById('notifyShares').checked.toString(),
            notifyQuota: document.getElementById('notifyQuota').checked.toString(),
            virusScanEnabled: document.getElementById('virusScanEnabled').checked.toString(),
            virusScanOnUpload: document.getElementById('virusScanOnUpload').checked.toString(),
            virusQuarantineNotifyAdmin: document.getElementById('virusQuarantineNotifyAdmin').checked.toString()
        });
        showNotification('Parametres enregistres', 'success');
    } catch (e) { showNotification('Erreur sauvegarde', 'error'); }
}

async function resetSettings() {
    if (!await showConfirmDialog('Reinitialiser', 'Reinitialiser les parametres par defaut ?')) return;
    try {
        await apiRequest('/settings/reset', 'POST');
        await loadSettings();
        showNotification('Parametres reinitialises', 'success');
    } catch (e) { showNotification('Erreur', 'error'); }
}

// ============================================
// AUTH SETTINGS
// ============================================

function toggleEntraConfig() {
    const mode = document.querySelector('input[name="authMode"]:checked')?.value || 'local';
    const section = document.getElementById('entraConfigSection');
    if (section) {
        section.style.display = (mode === 'entra' || mode === 'hybrid') ? 'block' : 'none';
    }
}

// ============================================
// EMAIL CONFIGURATION
// ============================================

// Provider presets
const EMAIL_PROVIDER_PRESETS = {
    smtp: { host: '', port: 587, secure: false },
    ovh: { host: 'ssl0.ovh.net', port: 465, secure: true },
    ionos: { host: 'smtp.ionos.fr', port: 465, secure: true },
    gandi: { host: 'mail.gandi.net', port: 465, secure: true },
    infomaniak: { host: 'mail.infomaniak.com', port: 465, secure: true },
    gmail: { host: 'smtp.gmail.com', port: 587, secure: false },
    yahoo: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
    outlook: { host: 'smtp.office365.com', port: 587, secure: false },
    zoho: { host: 'smtp.zoho.eu', port: 465, secure: true },
    protonmail: { host: '127.0.0.1', port: 1025, secure: false },
    free: { host: 'smtp.free.fr', port: 465, secure: true },
    orange: { host: 'smtp.orange.fr', port: 465, secure: true },
    sfr: { host: 'smtp.sfr.fr', port: 465, secure: true },
    laposte: { host: 'smtp.laposte.net', port: 465, secure: true },
    sendgrid: { host: 'smtp.sendgrid.net', port: 587, secure: false },
    brevo: { host: 'smtp-relay.brevo.com', port: 587, secure: false },
    ses: { host: 'email-smtp.eu-west-3.amazonaws.com', port: 587, secure: false },
    mailjet: { host: 'in-v3.mailjet.com', port: 587, secure: false },
    postmark: { host: 'smtp.postmarkapp.com', port: 587, secure: false },
    sparkpost: { host: 'smtp.sparkpostmail.com', port: 587, secure: false },
    mailgun: { host: 'smtp.mailgun.org', port: 587, secure: false }
};

function onEmailProviderChange() {
    const provider = document.getElementById('emailProvider').value;
    const preset = EMAIL_PROVIDER_PRESETS[provider];
    if (preset && provider !== 'mailjet') {
        if (preset.host) document.getElementById('smtpHost').value = preset.host;
        if (preset.port) document.getElementById('smtpPort').value = preset.port;
        document.getElementById('smtpSecure').checked = preset.secure;
    }
    // Show/hide mailjet tab based on provider
    if (provider === 'mailjet') {
        showEmailTab('mailjet');
    } else {
        showEmailTab('smtp');
    }
}

function showEmailTab(tab) {
    document.getElementById('emailPanelSmtp').style.display = tab === 'smtp' ? '' : 'none';
    document.getElementById('emailPanelMailjet').style.display = tab === 'mailjet' ? '' : 'none';
    document.querySelectorAll('.emailTab').forEach(b => b.classList.remove('btn-primary'));
    document.querySelectorAll('.emailTab').forEach(b => b.classList.add('btn-secondary'));
    const activeBtn = document.getElementById('emailTab' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (activeBtn) { activeBtn.classList.remove('btn-secondary'); activeBtn.classList.add('btn-primary'); }
}

async function loadEmailConfig() {
    try {
        const res = await fetch(`${API_URL}/admin/email/config`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
            document.getElementById('emailProvider').value = data.config.provider || 'smtp';
            document.getElementById('smtpHost').value = data.config.host || '';
            document.getElementById('smtpPort').value = data.config.port || '';
            document.getElementById('smtpUser').value = data.config.user || '';
            document.getElementById('smtpPassword').value = data.config.password || '';
            document.getElementById('smtpFromEmail').value = data.config.fromEmail || '';
            document.getElementById('smtpFromName').value = data.config.fromName || '';
            document.getElementById('smtpSecure').checked = data.config.secure;
            document.getElementById('emailEnabled').checked = data.config.enabled;
            // Mailjet fields
            document.getElementById('mailjetApiKey').value = data.config.mailjetApiKey || '';
            document.getElementById('mailjetSecretKey').value = data.config.mailjetSecretKey || '';
            document.getElementById('mailjetFromEmail').value = data.config.fromEmail || '';
            document.getElementById('mailjetFromName').value = data.config.fromName || '';
            document.getElementById('mailjetEnabled').checked = data.config.enabled;
            // Show correct tab
            if (data.config.provider === 'mailjet') showEmailTab('mailjet');
            else showEmailTab('smtp');
        }
    } catch(e) { console.error('Email config load error:', e); }
}

async function saveEmailConfig() {
    const provider = document.getElementById('emailProvider').value;
    const config = {
        provider,
        host: document.getElementById('smtpHost').value,
        port: parseInt(document.getElementById('smtpPort').value),
        secure: document.getElementById('smtpSecure').checked,
        user: document.getElementById('smtpUser').value,
        password: document.getElementById('smtpPassword').value,
        fromEmail: document.getElementById('smtpFromEmail').value,
        fromName: document.getElementById('smtpFromName').value,
        enabled: document.getElementById('emailEnabled').checked
    };
    await fetch(`${API_URL}/admin/email/config`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });
    showNotification('Configuration email SMTP enregistrée', 'success');
}

async function saveMailjetConfig() {
    const config = {
        provider: 'mailjet',
        mailjetApiKey: document.getElementById('mailjetApiKey').value,
        mailjetSecretKey: document.getElementById('mailjetSecretKey').value,
        fromEmail: document.getElementById('mailjetFromEmail').value,
        fromName: document.getElementById('mailjetFromName').value,
        enabled: document.getElementById('mailjetEnabled').checked
    };
    document.getElementById('emailProvider').value = 'mailjet';
    await fetch(`${API_URL}/admin/email/config`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });
    showNotification('Configuration Mailjet enregistrée', 'success');
}

async function testEmailConnection() {
    const resultDiv = document.getElementById('emailTestResult');
    resultDiv.innerHTML = '<span style="color:#666;">⏳ Test en cours...</span>';
    const res = await fetch(`${API_URL}/admin/email/test`, { method: 'POST', headers: getAuthHeaders() });
    const data = await res.json();
    resultDiv.innerHTML = data.success 
        ? '<span style="color:#2e7d32;">✅ Connexion SMTP réussie</span>'
        : `<span style="color:#c62828;">❌ Échec : ${data.error}</span>`;
}

async function testMailjetConnection() {
    // Save first so the server has latest keys
    await saveMailjetConfig();
    const resultDiv = document.getElementById('mailjetTestResult');
    resultDiv.innerHTML = '<span style="color:#666;">⏳ Test en cours...</span>';
    const res = await fetch(`${API_URL}/admin/email/test`, { method: 'POST', headers: getAuthHeaders() });
    const data = await res.json();
    resultDiv.innerHTML = data.success 
        ? `<span style="color:#2e7d32;">✅ ${data.message || 'Connexion Mailjet réussie'}</span>`
        : `<span style="color:#c62828;">❌ Échec : ${data.error}</span>`;
}

async function sendTestEmail() {
    const to = prompt('Adresse email de test :');
    if (!to) return;
    const provider = document.getElementById('emailProvider').value;
    const resultDiv = document.getElementById(provider === 'mailjet' ? 'mailjetTestResult' : 'emailTestResult');
    resultDiv.innerHTML = '<span style="color:#666;">📤 Envoi en cours...</span>';
    const res = await fetch(`${API_URL}/admin/email/send-test`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ to })
    });
    const data = await res.json();
    if (data.success) {
        resultDiv.innerHTML = `<div style="background:#e8f5e9;padding:12px;border-radius:6px;margin-top:8px;">
            <span style="color:#2e7d32;">✅ Email envoyé à <strong>${escapeHtml(to)}</strong></span>
            ${data.messageId ? `<br><small style="color:#666;">Message ID: ${escapeHtml(String(data.messageId))}</small>` : ''}
            ${data.provider ? `<br><small style="color:#666;">Provider: ${escapeHtml(data.provider)}</small>` : ''}
        </div>`;
    } else {
        resultDiv.innerHTML = `<div style="background:#ffebee;padding:12px;border-radius:6px;margin-top:8px;">
            <span style="color:#c62828;">❌ <strong>Échec de l'envoi</strong></span>
            <br><span style="color:#c62828;">${escapeHtml(data.error || 'Erreur inconnue')}</span>
            ${data.details ? `<br><small style="color:#888;margin-top:6px;display:block;word-break:break-all;">${escapeHtml(data.details)}</small>` : ''}
            ${data.provider ? `<br><small style="color:#888;">Provider: ${escapeHtml(data.provider)}</small>` : ''}
        </div>`;
    }
}

async function loadAuthSettings() {
    try {
        const res = await apiRequest('/settings/auth');
        if (!res.success) return;
        const auth = res.auth;

        // Set radio
        const radio = document.getElementById(`authMode${auth.authMode === 'entra' ? 'Entra' : auth.authMode === 'hybrid' ? 'Hybrid' : 'Local'}`);
        if (radio) radio.checked = true;

        if (auth.entraTenantId) document.getElementById('entraTenantId').value = auth.entraTenantId;
        if (auth.entraClientId) document.getElementById('entraClientId').value = auth.entraClientId;
        if (auth.entraRedirectUri) document.getElementById('entraRedirectUri').value = auth.entraRedirectUri;
        else document.getElementById('entraRedirectUri').value = window.location.origin + '/api/auth/callback';

        // Secret placeholder
        if (auth.entraClientSecretSet) {
            document.getElementById('entraClientSecret').placeholder = '••••••• (deja configure)';
        }

        toggleEntraConfig();
    } catch (e) { console.error('Auth settings error:', e); }
}

async function saveAuthSettings() {
    const mode = document.querySelector('input[name="authMode"]:checked')?.value || 'local';
    const payload = {
        authMode: mode,
        entraTenantId: document.getElementById('entraTenantId').value.trim(),
        entraClientId: document.getElementById('entraClientId').value.trim(),
        entraClientSecret: document.getElementById('entraClientSecret').value.trim(),
        entraRedirectUri: document.getElementById('entraRedirectUri').value.trim()
    };
    try {
        await apiRequest('/settings/auth', 'PUT', payload);
        showNotification('Configuration authentification enregistree', 'success');
        loadAuthSettings();
    } catch (e) { showNotification(e.message || 'Erreur sauvegarde auth', 'error'); }
}

async function testEntraConnection() {
    const resultEl = document.getElementById('entraTestResult');
    resultEl.style.display = 'block';
    resultEl.style.background = '#f0f0f0';
    resultEl.style.color = '#333';
    resultEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Test en cours...';

    try {
        const res = await apiRequest('/settings/auth/test', 'POST', {
            entraTenantId: document.getElementById('entraTenantId').value.trim(),
            entraClientId: document.getElementById('entraClientId').value.trim(),
            entraClientSecret: document.getElementById('entraClientSecret').value.trim()
        });
        if (res.success) {
            resultEl.style.background = '#d4edda';
            resultEl.style.color = '#155724';
            resultEl.innerHTML = '<i class="fas fa-check-circle"></i> ' + (res.message || 'Connexion reussie !');
        } else {
            resultEl.style.background = '#f8d7da';
            resultEl.style.color = '#721c24';
            resultEl.innerHTML = '<i class="fas fa-times-circle"></i> ' + (res.error || 'Echec');
        }
    } catch (e) {
        resultEl.style.background = '#f8d7da';
        resultEl.style.color = '#721c24';
        resultEl.innerHTML = '<i class="fas fa-times-circle"></i> ' + (e.message || 'Erreur de connexion');
    }
}

// ============================================
// ENTRA ROLE MAPPINGS
// ============================================

async function loadEntraMappings() {
    try {
        const res = await apiRequest('/admin/entra/role-mappings');
        if (!res.success) return;

        // Update sync settings UI
        const syncCheckbox = document.getElementById('entraGroupSyncEnabled');
        if (syncCheckbox) syncCheckbox.checked = res.syncEnabled !== false;
        const defaultRoleSelect = document.getElementById('entraDefaultRole');
        if (defaultRoleSelect) defaultRoleSelect.value = res.defaultRole || 'viewer';

        const tbody = document.getElementById('entraMappingsBody');
        if (!tbody) return;

        const roleLabels = { admin: 'Administrateur', com: 'COM', user: 'Utilisateur', viewer: 'Lecteur' };
        const roleColors = { admin: '#ef4444', com: '#f59e0b', user: '#3b82f6', viewer: '#6b7280' };

        tbody.innerHTML = res.mappings.map(m => `
            <tr>
                <td><span class="status-badge" style="background:${roleColors[m.role]}20;color:${roleColors[m.role]};">${roleLabels[m.role] || m.role}</span></td>
                <td><input type="text" id="entraGroupId_${m.role}" value="${escapeHtml(m.entra_group_id || '')}" placeholder="xxxxxxxx-xxxx-..." style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:0.85rem;font-family:monospace;"></td>
                <td><input type="text" id="entraGroupName_${m.role}" value="${escapeHtml(m.entra_group_name || '')}" placeholder="Nom du groupe" style="width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:0.85rem;"></td>
                <td style="text-align:center;font-weight:600;color:#666;">${m.priority}</td>
                <td><button class="btn btn-primary btn-small" onclick="saveEntraMapping('${m.role}')"><i class="fas fa-save"></i></button></td>
            </tr>
        `).join('');
    } catch (e) {
        console.error('Entra mappings error:', e);
    }
}

window.saveEntraMapping = async (role) => {
    const groupId = document.getElementById(`entraGroupId_${role}`)?.value.trim() || '';
    const groupName = document.getElementById(`entraGroupName_${role}`)?.value.trim() || '';
    try {
        await apiRequest(`/admin/entra/role-mappings/${role}`, 'PUT', {
            entra_group_id: groupId,
            entra_group_name: groupName
        });
        showNotification(`Mapping "${role}" mis à jour`, 'success');
    } catch (e) {
        showNotification(e.message || 'Erreur sauvegarde mapping', 'error');
    }
};

async function saveEntraSyncSettings() {
    const syncEnabled = document.getElementById('entraGroupSyncEnabled')?.checked ?? true;
    const defaultRole = document.getElementById('entraDefaultRole')?.value || 'viewer';
    try {
        await apiRequest('/admin/entra/sync-settings', 'PUT', { syncEnabled, defaultRole });
        showNotification('Paramètres de synchronisation enregistrés', 'success');
    } catch (e) {
        showNotification(e.message || 'Erreur', 'error');
    }
}

async function fetchEntraGroups() {
    const container = document.getElementById('entraGroupsList');
    if (!container) return;
    container.style.display = 'block';
    container.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Chargement des groupes...';
    try {
        const res = await apiRequest('/admin/entra/groups');
        if (!res.success) {
            container.innerHTML = `<span style="color:#ef4444;"><i class="fas fa-times-circle"></i> ${escapeHtml(res.error || 'Erreur')}</span>`;
            return;
        }
        if (res.groups.length === 0) {
            container.innerHTML = '<span style="color:#888;">Aucun groupe trouvé</span>';
            return;
        }
        container.innerHTML = '<strong>Groupes Entra ID disponibles :</strong><br>' +
            res.groups.map(g => `<div style="margin:4px 0;padding:4px 8px;background:white;border-radius:4px;display:flex;justify-content:space-between;align-items:center;">
                <span><strong>${escapeHtml(g.displayName)}</strong> <code style="font-size:0.8rem;color:#666;">${g.id}</code></span>
                <button class="btn btn-secondary" style="padding:2px 8px;font-size:0.75rem;" onclick="navigator.clipboard.writeText('${g.id}');showNotification('ID copié','success')"><i class="fas fa-copy"></i></button>
            </div>`).join('');
    } catch (e) {
        container.innerHTML = `<span style="color:#ef4444;"><i class="fas fa-times-circle"></i> ${escapeHtml(e.message)}</span>`;
    }
}

async function testEntraMapping() {
    const email = document.getElementById('testMappingEmail')?.value.trim();
    const resultEl = document.getElementById('testMappingResult');
    if (!email || !resultEl) return;
    resultEl.style.display = 'block';
    resultEl.style.background = '#f0f0f0';
    resultEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Test en cours...';
    try {
        const res = await apiRequest('/admin/entra/test-mapping', 'POST', { email });
        if (!res.success) {
            resultEl.style.background = '#f8d7da'; resultEl.style.color = '#721c24';
            resultEl.innerHTML = `<i class="fas fa-times-circle"></i> ${escapeHtml(res.error || 'Erreur')}`;
            return;
        }
        const roleLabels = { admin: 'Administrateur', com: 'COM', user: 'Utilisateur', viewer: 'Lecteur' };
        resultEl.style.background = '#d4edda'; resultEl.style.color = '#155724';
        resultEl.innerHTML = `<i class="fas fa-check-circle"></i> <strong>${escapeHtml(email)}</strong> → Rôle : <strong>${roleLabels[res.mappedRole] || res.mappedRole}</strong> (${res.totalGroups} groupe(s) trouvé(s))`;
    } catch (e) {
        resultEl.style.background = '#f8d7da'; resultEl.style.color = '#721c24';
        resultEl.innerHTML = `<i class="fas fa-times-circle"></i> ${escapeHtml(e.message)}`;
    }
}

// ============================================
// EMAIL DOMAINS
// ============================================

let allDomains = [];
let domainsPage = 1;
const DOMAINS_PER_PAGE = 10;

async function loadEmailDomains() {
    try {
        const res = await apiRequest('/admin/email-domains');
        if (res.success) {
            allDomains = res.domains || [];
            domainsPage = 1;
            renderEmailDomains();
        }
    } catch (e) {
        document.getElementById('emailDomainsTableBody').innerHTML = '<tr><td colspan="4" style="color: var(--danger-color);">Erreur de chargement</td></tr>';
        document.getElementById('emailDomainsPagination').style.display = 'none';
    }
}

function formatCreationDate(d) {
    if (!d.creation_date) return '—';
    const date = new Date(d.creation_date);
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const dateStr = date.toLocaleDateString('fr-FR');
    if (date > sixMonthsAgo) {
        return `<span style="background: #EF4444; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem;" title="Créé le ${dateStr}">⚠ Domaine récent</span>`;
    }
    return `<span style="color: #10B981; font-size: 0.85rem;">${dateStr}</span>`;
}

function formatDmarcStatus(d) {
    if (d.has_dmarc === 1) return '<i class="fas fa-shield-alt" style="color: #10B981;" title="DMARC configuré"></i>';
    if (d.has_dmarc === 0) return '<i class="fas fa-exclamation-triangle" style="color: #F59E0B;" title="Pas de DMARC — risque de phishing"></i>';
    return '<i class="fas fa-question-circle" style="color: #9CA3AF;" title="Non vérifié"></i>';
}

function getDomainLogo(d) {
    // BIMI logo (Verified Mark Certificate) en priorité, sinon favicon Google
    const logoUrl = d.bimi_logo || `https://icons.duckduckgo.com/ip3/${encodeURIComponent(d.domain)}.ico`;
    const title = d.bimi_logo ? 'Logo vérifié (BIMI/VMC)' : 'Favicon du domaine';
    const badge = d.bimi_logo ? '<span style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:#10B981;border:2px solid white;display:flex;align-items:center;justify-content:center;" title="Certificat VMC vérifié"><i class="fas fa-check" style="font-size:6px;color:white;"></i></span>' : '';
    return `<span style="position:relative;display:inline-flex;margin-right:8px;vertical-align:middle;"><img src="${logoUrl}" alt="" style="width:24px;height:24px;border-radius:4px;vertical-align:middle;" onerror="this.style.display='none'" title="${title}">${badge}</span>`;
}

function renderEmailDomains() {
    const tbody = document.getElementById('emailDomainsTableBody');
    const pagination = document.getElementById('emailDomainsPagination');

    if (allDomains.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="color: var(--text-secondary); font-style: italic;">Aucun domaine configure</td></tr>';
        pagination.style.display = 'none';
        return;
    }

    const totalPages = Math.ceil(allDomains.length / DOMAINS_PER_PAGE);
    if (domainsPage > totalPages) domainsPage = totalPages;
    const start = (domainsPage - 1) * DOMAINS_PER_PAGE;
    const pageDomains = allDomains.slice(start, start + DOMAINS_PER_PAGE);

    tbody.innerHTML = pageDomains.map(d => `
        <tr>
            <td>${getDomainLogo(d)}<strong style="color: var(--primary-color);">${escapeHtml(d.domain)}</strong></td>
            <td>${formatCreationDate(d)}</td>
            <td>${formatDmarcStatus(d)}</td>
            <td>${d.is_active === 1 ? '<span class="status-badge active">Actif</span>' : '<span class="status-badge expired">Inactif</span>'}</td>
            <td>${d.created_at ? new Date(d.created_at).toLocaleDateString('fr-FR') : '-'}</td>
            <td><div class="table-actions">
                <button class="btn btn-secondary btn-small" onclick="recheckEmailDomain(${d.id})" title="Revérifier"><i class="fas fa-sync-alt"></i></button>
                ${d.is_active === 1 ?
                    `<button class="btn btn-secondary btn-small" onclick="deactivateEmailDomain('${escapeHtml(d.domain)}')" title="Desactiver"><i class="fas fa-ban"></i></button>` :
                    `<button class="btn btn-primary btn-small" onclick="activateEmailDomain('${escapeHtml(d.domain)}')" title="Activer"><i class="fas fa-check"></i></button>`}
                <button class="btn btn-danger btn-small" onclick="deleteEmailDomain('${escapeHtml(d.domain)}')" title="Supprimer"><i class="fas fa-trash"></i></button>
            </div></td>
        </tr>
    `).join('');

    pagination.style.display = 'flex';
    document.getElementById('domainsCount').textContent = `${allDomains.length} domaine${allDomains.length > 1 ? 's' : ''}`;
    if (totalPages > 1) {
        document.getElementById('domainsPageInfo').textContent = `Page ${domainsPage} / ${totalPages}`;
        document.getElementById('domainsPrevBtn').style.display = '';
        document.getElementById('domainsNextBtn').style.display = '';
        document.getElementById('domainsPrevBtn').disabled = domainsPage <= 1;
        document.getElementById('domainsNextBtn').disabled = domainsPage >= totalPages;
    } else {
        document.getElementById('domainsPageInfo').textContent = '';
        document.getElementById('domainsPrevBtn').style.display = 'none';
        document.getElementById('domainsNextBtn').style.display = 'none';
    }
}

window.changeDomainsPage = function(delta) {
    const totalPages = Math.ceil(allDomains.length / DOMAINS_PER_PAGE);
    const newPage = domainsPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        domainsPage = newPage;
        renderEmailDomains();
    }
};

async function addEmailDomain() {
    const input = document.getElementById('newEmailDomainInput');
    const domain = input.value.trim();
    if (!domain) { showNotification('Entrez un domaine', 'error'); return; }
    try {
        await apiRequest('/admin/email-domains', 'POST', { domain });
        showNotification('Domaine ajoute', 'success');
        input.value = '';
        loadEmailDomains();
    } catch (e) { showNotification(e.message || 'Erreur', 'error'); }
}

window.deleteEmailDomain = async (domain) => {
    if (!await showConfirmDialog('Supprimer le domaine', `Supprimer le domaine "${domain}" ?`)) return;
    try { await apiRequest(`/admin/email-domains/${encodeURIComponent(domain)}`, 'DELETE'); showNotification('Supprime', 'success'); loadEmailDomains(); }
    catch (e) { showNotification('Erreur', 'error'); }
};

window.activateEmailDomain = async (domain) => {
    try { await apiRequest(`/admin/email-domains/${encodeURIComponent(domain)}/activate`, 'PUT'); showNotification('Active', 'success'); loadEmailDomains(); }
    catch (e) { showNotification('Erreur', 'error'); }
};

window.deactivateEmailDomain = async (domain) => {
    try { await apiRequest(`/admin/email-domains/${encodeURIComponent(domain)}/deactivate`, 'PUT'); showNotification('Desactive', 'success'); loadEmailDomains(); }
    catch (e) { showNotification('Erreur', 'error'); }
};

window.recheckEmailDomain = async (id) => {
    try {
        showNotification('Vérification en cours...', 'info');
        await apiRequest(`/admin/email-domains/${id}/recheck`, 'POST');
        showNotification('Vérification terminée', 'success');
        loadEmailDomains();
    } catch (e) { showNotification('Erreur vérification', 'error'); }
};

function initImportDomains() {
    const btn = document.getElementById('importEmailDomainsBtn');
    const fileInput = document.getElementById('importEmailDomainsFile');
    if (!btn || !fileInput) return;

    btn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        fileInput.value = '';

        const text = await file.text();
        const lines = text.split(/\r?\n/);
        const domains = lines
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('#'));

        if (domains.length === 0) {
            showNotification('Aucun domaine trouvé dans le fichier', 'error');
            return;
        }
        if (domains.length > 100) {
            showNotification('Maximum 100 domaines par import', 'error');
            return;
        }

        try {
            const res = await apiRequest('/admin/email-domains/bulk', 'POST', { domains });
            showNotification(`${res.imported} domaine(s) importé(s), ${res.skipped} ignoré(s) (doublons)`, 'success');
            loadEmailDomains();
        } catch (e) { showNotification(e.message || 'Erreur import', 'error'); }
    });
}
initImportDomains();

// ============================================
// MODALS
// ============================================

function showModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function showConfirmDialog(title, message) {
    return new Promise(resolve => {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        const yes = document.getElementById('confirmYesBtn');
        const no = document.getElementById('confirmNoBtn');
        const cleanup = () => { yes.removeEventListener('click', onYes); no.removeEventListener('click', onNo); closeModal('confirmModal'); };
        const onYes = () => { cleanup(); resolve(true); };
        const onNo = () => { cleanup(); resolve(false); };
        yes.addEventListener('click', onYes);
        no.addEventListener('click', onNo);
        showModal('confirmModal');
    });
}

// ============================================
// UTILITIES
// ============================================

function getFileIcon(ct) {
    if (!ct) return '<i class="fas fa-file"></i>';
    if (ct.startsWith('image/')) return '<i class="fas fa-file-image" style="color: #639E30;"></i>';
    if (ct.startsWith('video/')) return '<i class="fas fa-file-video" style="color: #F8AA36;"></i>';
    if (ct.startsWith('audio/')) return '<i class="fas fa-file-audio" style="color: #8b5cf6;"></i>';
    if (ct === 'application/pdf') return '<i class="fas fa-file-pdf" style="color: #DC2626;"></i>';
    if (ct.includes('word') || ct.includes('document')) return '<i class="fas fa-file-word" style="color: #003C61;"></i>';
    if (ct.includes('excel') || ct.includes('spreadsheet')) return '<i class="fas fa-file-excel" style="color: #639E30;"></i>';
    return '<i class="fas fa-file"></i>';
}

function getFileCategory(ct) {
    if (!ct) return 'Autres';
    if (ct.startsWith('image/')) return 'Images';
    if (ct.startsWith('video/')) return 'Videos';
    if (ct.startsWith('audio/')) return 'Audio';
    if (ct === 'application/pdf') return 'PDF';
    if (ct.includes('word') || ct.includes('document') || ct.includes('text') || ct.includes('excel') || ct.includes('powerpoint')) return 'Documents';
    return 'Autres';
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

function formatDate(d) {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('fr-FR') + ' ' + new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatTimeAgo(date) {
    const secs = Math.floor((new Date() - new Date(date)) / 1000);
    const intervals = { 'an': 31536000, 'mois': 2592000, 'jour': 86400, 'heure': 3600, 'minute': 60 };
    for (const [name, val] of Object.entries(intervals)) {
        const n = Math.floor(secs / val);
        if (n >= 1) return `Il y a ${n} ${name}${n > 1 ? 's' : ''}`;
    }
    return 'A l\'instant';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    const el = document.createElement('div');
    el.style.cssText = `position: fixed; top: 20px; right: 20px; padding: 16px 24px; background: ${type === 'success' ? '#639E30' : type === 'error' ? '#DC2626' : '#003C61'}; color: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 10000; animation: slideIn 0.3s ease; display: flex; align-items: center; gap: 8px;`;
    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';
    el.innerHTML = `<i class="fas fa-${icon}"></i> ${message}`;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 3000);
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

// Animation styles
const style = document.createElement('style');
style.textContent = `@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
document.head.appendChild(style);

// ============================================
// AI SECTION
// ============================================

let aiMapInstance = null;

function loadAI() {
    initAITabs();
    loadAIDashboard();
}

function initAITabs() {
    document.querySelectorAll('.ai-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.ai-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.ai-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.aiTab;
            document.getElementById(target).classList.add('active');

            switch (target) {
                case 'ai-dashboard': loadAIDashboard(); break;
                case 'ai-services': loadAIServices(); break;
                case 'ai-params': loadAISettings(); break;
                case 'ai-scans': loadAIScans(); break;
                case 'ai-map': loadAIMap(); break;
            }
        });
    });

    // Service save button
    document.getElementById('saveAIServicesBtn')?.addEventListener('click', saveAIServices);
    // Params save button
    document.getElementById('saveAIParamsBtn')?.addEventListener('click', saveAIParams);
    // Reindex button
    document.getElementById('reindexBtn')?.addEventListener('click', async () => {
        try {
            const resp = await fetch(`${API_URL}/admin/ai/reindex`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            const data = await resp.json();
            if (data.success) {
                showNotification('Index de recherche reconstruit', 'success');
            } else {
                showNotification(data.error || 'Erreur', 'error');
            }
        } catch (e) {
            showNotification('Erreur de connexion', 'error');
        }
    });
}

async function loadAIDashboard() {
    try {
        const resp = await fetch(`${API_URL}/admin/ai/dashboard`, {
            headers: getAuthHeaders()
        });
        const data = await resp.json();

        if (!data.success) return;
        const d = data.dashboard;

        document.getElementById('aiAnalysisCount').textContent = d.analysis ? d.analysis.total : '0';
        document.getElementById('aiMonthlyCost').textContent = `$${(d.costs.monthlyTotal || 0).toFixed(2)}`;
        document.getElementById('aiBudgetUsed').textContent = `${d.costs.budgetUsedPercent || 0}%`;
        document.getElementById('aiQueueSize').textContent = d.queue ? (d.queue.pending || 0) : '0';

        // Top tags
        const tagsEl = document.getElementById('aiTopTags');
        if (d.tags && d.tags.length > 0) {
            tagsEl.innerHTML = d.tags.map(t =>
                `<span class="tag">${t.tag || t.name || t}<span class="count">${t.count || ''}</span></span>`
            ).join('');
        } else {
            tagsEl.innerHTML = '<em>Aucun tag</em>';
        }

        // Cost by service
        const costEl = document.getElementById('aiCostByService');
        if (d.costs.topOperations && d.costs.topOperations.length > 0) {
            costEl.innerHTML = `<ul class="cost-service-list">${d.costs.topOperations.map(op =>
                `<li><span class="service-name">${op.operation}</span><span class="service-cost">$${(op.total_cost || 0).toFixed(4)}</span></li>`
            ).join('')}</ul>`;
        } else {
            costEl.innerHTML = '<em>Aucune donnee de cout</em>';
        }
    } catch (e) {
        console.error('AI dashboard error:', e);
    }
}

async function loadAIServices() {
    try {
        const resp = await fetch(`${API_URL}/admin/settings`, {
            headers: getAuthHeaders()
        });
        const data = await resp.json();
        if (!data.success) return;

        const settings = data.settings;
        const toggleKeys = [
            'aiEnabled', 'openaiEnabled', 'azureVisionEnabled', 'transcriptionEnabled',
            'faceRecognitionEnabled', 'geolocationEnabled', 'searchEnabled',
            'smartAlbumsEnabled', 'videoTimelineEnabled', 'autoAnalyzeOnUpload',
            'reverseGeocodingEnabled'
        ];

        for (const key of toggleKeys) {
            const el = document.getElementById(`aiSvc_${key}`);
            if (el && settings[key]) {
                el.checked = settings[key].value === 'true';
            }
        }
    } catch (e) {
        console.error('Load AI services error:', e);
    }
}

async function saveAIServices() {
    const toggleKeys = [
        'aiEnabled', 'openaiEnabled', 'azureVisionEnabled', 'transcriptionEnabled',
        'faceRecognitionEnabled', 'geolocationEnabled', 'searchEnabled',
        'smartAlbumsEnabled', 'videoTimelineEnabled', 'autoAnalyzeOnUpload',
        'reverseGeocodingEnabled'
    ];

    const payload = {};
    for (const key of toggleKeys) {
        const el = document.getElementById(`aiSvc_${key}`);
        if (el) {
            payload[key] = el.checked ? 'true' : 'false';
        }
    }

    try {
        const resp = await fetch(`${API_URL}/admin/ai/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify(payload)
        });
        const data = await resp.json();
        if (data.success) {
            showNotification('Services IA mis a jour', 'success');
        } else {
            showNotification(data.error || 'Erreur', 'error');
        }
    } catch (e) {
        showNotification('Erreur de connexion', 'error');
    }
}

async function loadAISettings() {
    try {
        const resp = await fetch(`${API_URL}/admin/settings`, {
            headers: getAuthHeaders()
        });
        const data = await resp.json();
        if (!data.success) return;

        const settings = data.settings;
        const paramKeys = [
            'openaiModel', 'whisperModel', 'whisperLanguage',
            'faceMinConfidence', 'videoFrameInterval',
            'thumbnailSize', 'thumbnailQuality', 'maxConcurrentAnalysis',
            'aiMonthlyBudget', 'aiCostAlertThreshold'
        ];

        for (const key of paramKeys) {
            const el = document.getElementById(`aiParam_${key}`);
            if (el && settings[key]) {
                el.value = settings[key].value;
            }
        }
    } catch (e) {
        console.error('Load AI settings error:', e);
    }
}

async function saveAIParams() {
    const paramKeys = [
        'openaiModel', 'whisperModel', 'whisperLanguage',
        'faceMinConfidence', 'videoFrameInterval',
        'thumbnailSize', 'thumbnailQuality', 'maxConcurrentAnalysis',
        'aiMonthlyBudget', 'aiCostAlertThreshold'
    ];

    const payload = {};
    for (const key of paramKeys) {
        const el = document.getElementById(`aiParam_${key}`);
        if (el) {
            payload[key] = el.value;
        }
    }

    try {
        const resp = await fetch(`${API_URL}/admin/ai/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify(payload)
        });
        const data = await resp.json();
        if (data.success) {
            showNotification('Parametres IA enregistres', 'success');
        } else {
            showNotification(data.error || 'Erreur', 'error');
        }
    } catch (e) {
        showNotification('Erreur de connexion', 'error');
    }
}

const SCAN_TYPE_LABELS = {
    face_recognition: 'Reconnaissance faciale',
    auto_tagging: 'Tagging automatique',
    geolocation_extraction: 'Extraction geolocalisation',
    full_analysis: 'Analyse complete'
};

async function loadAIScans() {
    try {
        const resp = await fetch(`${API_URL}/admin/ai/scans`, {
            headers: getAuthHeaders()
        });
        const data = await resp.json();
        if (!data.success) return;

        const tbody = document.getElementById('aiScansTableBody');
        if (!data.scans || data.scans.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7">Aucun scan configure</td></tr>';
            return;
        }

        tbody.innerHTML = data.scans.map(scan => `
            <tr>
                <td><span class="scan-type-label ${scan.scan_type}">${SCAN_TYPE_LABELS[scan.scan_type] || scan.scan_type}</span></td>
                <td>
                    <select onchange="updateScanSchedule(${scan.id}, this.value)" class="form-select-small">
                        ${['manual', 'hourly', 'daily', 'weekly'].map(s =>
                            `<option value="${s}" ${scan.schedule === s ? 'selected' : ''}>${s}</option>`
                        ).join('')}
                    </select>
                </td>
                <td>
                    <label class="toggle-switch">
                        <input type="checkbox" ${scan.is_enabled ? 'checked' : ''} onchange="updateScanEnabled(${scan.id}, this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </td>
                <td>${scan.last_run_at ? new Date(scan.last_run_at).toLocaleString('fr-FR') : '-'}</td>
                <td>${scan.last_run_status ? `<span class="scan-status ${scan.last_run_status}">${scan.last_run_status}</span>` : '-'}</td>
                <td>${scan.last_run_files_processed || '-'}</td>
                <td>
                    <button class="btn btn-primary btn-small" onclick="runScanNow(${scan.id})">
                        <i class="fas fa-play"></i> Lancer
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        console.error('Load scans error:', e);
    }
}

async function updateScanSchedule(scanId, schedule) {
    try {
        const resp = await fetch(`${API_URL}/admin/ai/scans/${scanId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify({ schedule })
        });
        const data = await resp.json();
        if (data.success) {
            showNotification('Planification mise a jour', 'success');
        } else {
            showNotification(data.error || 'Erreur', 'error');
        }
    } catch (e) {
        showNotification('Erreur de connexion', 'error');
    }
}

async function updateScanEnabled(scanId, enabled) {
    try {
        const resp = await fetch(`${API_URL}/admin/ai/scans/${scanId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify({ isEnabled: enabled })
        });
        const data = await resp.json();
        if (data.success) {
            showNotification(`Scan ${enabled ? 'active' : 'desactive'}`, 'success');
        } else {
            showNotification(data.error || 'Erreur', 'error');
        }
    } catch (e) {
        showNotification('Erreur de connexion', 'error');
    }
}

async function runScanNow(scanId) {
    try {
        showNotification('Scan en cours de lancement...', 'info');
        const resp = await fetch(`${API_URL}/admin/ai/scans/${scanId}/run`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await resp.json();
        if (data.success) {
            showNotification(`Scan termine: ${data.result.filesProcessed} fichiers traites`, 'success');
            loadAIScans();
        } else {
            showNotification(data.error || 'Erreur', 'error');
        }
    } catch (e) {
        showNotification('Erreur de connexion', 'error');
    }
}

async function loadAIMap() {
    const container = document.getElementById('ai-map-container');

    // Initialize map if not already done
    if (!aiMapInstance) {
        aiMapInstance = L.map('ai-map-container').setView([46.603354, 1.888334], 6); // France center
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(aiMapInstance);

        // Try to center on user position
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                aiMapInstance.setView([pos.coords.latitude, pos.coords.longitude], 10);
            }, () => { /* keep default */ });
        }
    }

    // Invalidate size (needed when map is in a hidden tab)
    setTimeout(() => aiMapInstance.invalidateSize(), 100);

    // Load geotagged files
    try {
        const resp = await fetch(`${API_URL}/ai/map`, {
            headers: getAuthHeaders()
        });
        const data = await resp.json();
        if (!data.success) return;

        // Clear existing markers
        if (aiMapInstance._markerCluster) {
            aiMapInstance.removeLayer(aiMapInstance._markerCluster);
        }

        const markers = L.markerClusterGroup();

        for (const file of data.files) {
            const marker = L.marker([file.latitude, file.longitude]);
            const popupContent = `
                <div style="min-width: 150px;">
                    <strong>${file.blobName}</strong><br>
                    ${file.city ? `<em>${file.city}</em><br>` : ''}
                    ${file.country ? file.country : ''}
                    <br><small>${file.latitude.toFixed(4)}, ${file.longitude.toFixed(4)}</small>
                </div>
            `;
            marker.bindPopup(popupContent);
            markers.addLayer(marker);
        }

        aiMapInstance._markerCluster = markers;
        aiMapInstance.addLayer(markers);

        if (data.files.length > 0) {
            const bounds = markers.getBounds();
            if (bounds.isValid()) {
                aiMapInstance.fitBounds(bounds, { padding: [20, 20] });
            }
        }
    } catch (e) {
        console.error('Load AI map error:', e);
    }
}

// ============================================
// FACES MANAGEMENT
// ============================================
let currentProfileId = null;
let facesProfiles = [];

async function loadFacesSection() { await loadProfiles(); }

async function loadProfiles() {
    try {
        const res = await fetch(`${API_URL}/admin/faces/profiles`, { headers: getAuthHeaders() });
        facesProfiles = await res.json();
        renderProfiles();
    } catch(e) {
        document.getElementById('profilesGrid').innerHTML = '<p class="empty-state">Erreur de chargement</p>';
    }
}

function renderProfiles() {
    const grid = document.getElementById('profilesGrid');
    if (!facesProfiles.length) {
        grid.innerHTML = '<p class="empty-state">Aucun profil cree. Les visages detectes apparaitront dans "Non identifies".</p>';
        return;
    }
    grid.innerHTML = facesProfiles.map(p => `
        <div class="face-card" onclick="openProfileDetail(${p.id})">
            <div class="face-thumbnail">👤</div>
            <div class="face-name">${escapeHtml(p.name)}</div>
            <div class="face-count">${p.photo_count || 0} photo(s)</div>
        </div>
    `).join('');
}

async function openProfileDetail(id) {
    currentProfileId = id;
    const profile = facesProfiles.find(p => p.id === id);
    document.getElementById('profileDetailName').textContent = profile?.name || 'Profil';
    document.getElementById('profileNameInput').value = profile?.name || '';
    document.getElementById('profileDetailModal').style.display = 'flex';
    try {
        const res = await fetch(`${API_URL}/admin/faces/profiles/${id}/files`, { headers: getAuthHeaders() });
        const files = await res.json();
        document.getElementById('profilePhotoCount').textContent = files.length;
        const photosGrid = document.getElementById('profilePhotosGrid');
        if (!files.length) {
            photosGrid.innerHTML = '<p>Aucune photo associee</p>';
        } else {
            photosGrid.innerHTML = files.map(f =>
                `<img src="${API_URL.replace('/api','')}/api/files/preview/${encodeURIComponent(f.blob_name)}" alt="${escapeHtml(f.blob_name)}" title="${escapeHtml(f.blob_name)}">`
            ).join('');
        }
    } catch(e) {
        document.getElementById('profilePhotosGrid').innerHTML = '<p>Erreur</p>';
    }
}

function closeProfileDetail() {
    document.getElementById('profileDetailModal').style.display = 'none';
    currentProfileId = null;
}

async function saveProfileName() {
    if (!currentProfileId) return;
    const name = document.getElementById('profileNameInput').value.trim();
    if (!name) return;
    await fetch(`${API_URL}/admin/faces/profiles/${currentProfileId}`, {
        method: 'PUT', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    await loadProfiles();
    document.getElementById('profileDetailName').textContent = name;
}

async function loadUnassigned() {
    try {
        const res = await fetch(`${API_URL}/admin/faces/occurrences/unassigned`, { headers: getAuthHeaders() });
        const occurrences = await res.json();
        const grid = document.getElementById('unassignedGrid');
        if (!occurrences.length) {
            grid.innerHTML = '<p class="empty-state">🎉 Tous les visages detectes ont ete identifies !</p>';
            return;
        }
        const profileOptions = facesProfiles.map(p =>
            `<option value="${p.id}">${escapeHtml(p.name)}</option>`
        ).join('');
        grid.innerHTML = occurrences.map(o => `
            <div class="face-occurrence-card">
                <img src="${API_URL.replace('/api','')}/api/files/preview/${encodeURIComponent(o.blob_name)}" alt="Visage detecte">
                <div style="font-size:0.8rem;color:#666;margin-bottom:4px;">Confiance: ${Math.round((o.confidence || 0) * 100)}%</div>
                <select onchange="assignFace(${o.id}, this.value)">
                    <option value="">— Assigner a —</option>
                    <option value="new">+ Nouveau profil</option>
                    ${profileOptions}
                </select>
            </div>
        `).join('');
    } catch(e) {
        document.getElementById('unassignedGrid').innerHTML = '<p class="empty-state">Erreur de chargement</p>';
    }
}

async function assignFace(occurrenceId, value) {
    if (!value) return;
    let profileId = value;
    if (value === 'new') {
        const name = prompt('Nom de la personne :');
        if (!name) return;
        const res = await fetch(`${API_URL}/admin/faces/profiles`, {
            method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const profile = await res.json();
        profileId = profile.id;
        await loadProfiles();
    }
    await fetch(`${API_URL}/admin/faces/occurrences/${occurrenceId}/assign`, {
        method: 'PUT', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: parseInt(profileId) })
    });
    await loadUnassigned();
}

function switchFaceTab(tab) {
    document.getElementById('tabProfiles').classList.toggle('active', tab === 'profiles');
    document.getElementById('tabUnassigned').classList.toggle('active', tab === 'unassigned');
    document.getElementById('facesProfilesView').style.display = tab === 'profiles' ? 'block' : 'none';
    document.getElementById('facesUnassignedView').style.display = tab === 'unassigned' ? 'block' : 'none';
    if (tab === 'unassigned') loadUnassigned();
    if (tab === 'profiles') loadProfiles();
}

document.getElementById('createProfileBtn')?.addEventListener('click', async () => {
    const name = prompt('Nom de la personne :');
    if (!name) return;
    await fetch(`${API_URL}/admin/faces/profiles`, {
        method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    await loadProfiles();
});

// ============================================
// QUOTAS
// ============================================

async function loadQuotas() {
    try {
        // Load defaults
        const defRes = await fetch(`${API_URL}/admin/quotas/defaults`, { headers: getAuthHeaders() });
        const defData = await defRes.json();
        if (defData.success) {
            document.getElementById('defaultMaxStorageGb').value = defData.defaults.max_storage_gb;
            document.getElementById('defaultMaxFiles').value = defData.defaults.max_files;
            document.getElementById('defaultMaxFileSizeMb').value = defData.defaults.max_file_size_mb;
            document.getElementById('defaultMaxSharesPerUser').value = defData.defaults.max_shares_per_user;
            document.getElementById('defaultMaxShareDurationDays').value = defData.defaults.max_share_duration_days;
        }

        // Load team quotas with usage
        const usageRes = await fetch(`${API_URL}/admin/quotas/usage`, { headers: getAuthHeaders() });
        const usageData = await usageRes.json();

        const container = document.getElementById('teamQuotasTable');
        if (!usageData.success || usageData.usage.length === 0) {
            container.innerHTML = '<p style="color:#666;">Aucune équipe créée.</p>';
            return;
        }

        let html = `<table class="data-table" style="width:100%;">
            <thead><tr>
                <th>Équipe</th>
                <th>Stockage</th>
                <th>Fichiers</th>
                <th>Partages</th>
                <th>Taille max fichier</th>
                <th>Durée max partage</th>
                <th>Actions</th>
            </tr></thead><tbody>`;

        usageData.usage.forEach(u => {
            const q = u.quota;
            const storagePct = q.max_storage_gb ? Math.round((u.storage_used_gb / q.max_storage_gb) * 100) : 0;
            const filesPct = q.max_files ? Math.round((u.file_count / q.max_files) * 100) : 0;
            const barColor = (pct) => pct > 90 ? '#e74c3c' : pct > 70 ? '#f39c12' : '#639E30';

            html += `<tr>
                <td><strong>${u.team_display_name || u.team_name}</strong><br><small style="color:#888;">${u.member_count} membre(s)</small></td>
                <td>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <div style="flex:1;height:8px;background:#eee;border-radius:4px;overflow:hidden;">
                            <div style="width:${Math.min(storagePct,100)}%;height:100%;background:${barColor(storagePct)};border-radius:4px;"></div>
                        </div>
                        <small>${u.storage_used_gb}/${q.max_storage_gb} Go</small>
                    </div>
                </td>
                <td>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <div style="flex:1;height:8px;background:#eee;border-radius:4px;overflow:hidden;">
                            <div style="width:${Math.min(filesPct,100)}%;height:100%;background:${barColor(filesPct)};border-radius:4px;"></div>
                        </div>
                        <small>${u.file_count}/${q.max_files}</small>
                    </div>
                </td>
                <td>${u.share_count}/${q.max_shares_per_user}</td>
                <td>${q.max_file_size_mb} Mo</td>
                <td>${q.max_share_duration_days} j</td>
                <td>
                    <button class="btn btn-secondary" style="padding:4px 10px;font-size:0.8rem;" onclick="openQuotaModal(${u.team_id}, '${(u.team_display_name || u.team_name).replace(/'/g,"\\'")}', ${JSON.stringify(q).replace(/"/g,'&quot;')})">
                        <i class="fas fa-edit"></i>
                    </button>
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (e) {
        console.error('Erreur chargement quotas:', e);
    }
}

async function saveDefaultQuotas() {
    try {
        const body = {
            max_storage_gb: parseFloat(document.getElementById('defaultMaxStorageGb').value),
            max_files: parseInt(document.getElementById('defaultMaxFiles').value),
            max_file_size_mb: parseFloat(document.getElementById('defaultMaxFileSizeMb').value),
            max_shares_per_user: parseInt(document.getElementById('defaultMaxSharesPerUser').value),
            max_share_duration_days: parseInt(document.getElementById('defaultMaxShareDurationDays').value)
        };
        const res = await fetch(`${API_URL}/admin/quotas/defaults`, {
            method: 'PUT',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
            showNotification('Quotas par défaut enregistrés', 'success');
        } else {
            showNotification(data.error || 'Erreur', 'error');
        }
    } catch (e) {
        showNotification('Erreur: ' + e.message, 'error');
    }
}

function openQuotaModal(teamId, teamName, quota) {
    document.getElementById('editQuotaTeamId').value = teamId;
    document.getElementById('editQuotaTeamName').textContent = teamName;
    document.getElementById('editMaxStorageGb').value = quota.max_storage_gb;
    document.getElementById('editMaxFiles').value = quota.max_files;
    document.getElementById('editMaxFileSizeMb').value = quota.max_file_size_mb;
    document.getElementById('editMaxSharesPerUser').value = quota.max_shares_per_user;
    document.getElementById('editMaxShareDurationDays').value = quota.max_share_duration_days;
    document.getElementById('editQuotaModal').style.display = 'flex';
}

function closeQuotaModal() {
    document.getElementById('editQuotaModal').style.display = 'none';
}

async function saveTeamQuota() {
    try {
        const teamId = document.getElementById('editQuotaTeamId').value;
        const body = {
            max_storage_gb: parseFloat(document.getElementById('editMaxStorageGb').value),
            max_files: parseInt(document.getElementById('editMaxFiles').value),
            max_file_size_mb: parseFloat(document.getElementById('editMaxFileSizeMb').value),
            max_shares_per_user: parseInt(document.getElementById('editMaxSharesPerUser').value),
            max_share_duration_days: parseInt(document.getElementById('editMaxShareDurationDays').value)
        };
        const res = await fetch(`${API_URL}/admin/quotas/team/${teamId}`, {
            method: 'PUT',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
            showNotification('Quotas de l\'équipe enregistrés', 'success');
            closeQuotaModal();
            loadQuotas();
        } else {
            showNotification(data.error || 'Erreur', 'error');
        }
    } catch (e) {
        showNotification('Erreur: ' + e.message, 'error');
    }
}

// ============================================
// ANTIVIRUS / QUARANTAINE
// ============================================

async function loadVirusScan() {
    try {
        const res = await apiRequest('/admin/security/scan-stats');
        if (res.success) {
            const s = res.stats;
            document.getElementById('clamAvStatus').innerHTML = s.clamAvAvailable
                ? '<span style="color:#22c55e;">✅ ClamAV actif</span>'
                : '<span style="color:#ef4444;">❌ ClamAV non disponible</span>';
            document.getElementById('virusThreatsCount').textContent = s.total || 0;
            document.getElementById('virusPendingCount').textContent = s.pending || 0;
        }
    } catch (e) {
        document.getElementById('clamAvStatus').textContent = 'Erreur de chargement';
    }

    // Charger la liste de quarantaine
    try {
        const res = await apiRequest('/admin/security/quarantine');
        if (res.success) {
            renderQuarantineList(res.items);
        }
    } catch (e) {
        document.getElementById('quarantineList').innerHTML = '<p style="color:#ef4444;">Erreur de chargement</p>';
    }
}

function renderQuarantineList(items) {
    const container = document.getElementById('quarantineList');
    if (!items || items.length === 0) {
        container.innerHTML = '<p style="color:#22c55e; font-size: 0.9rem;">🎉 Aucune menace en quarantaine</p>';
        return;
    }

    let html = '<table style="width:100%; font-size:0.85rem; border-collapse:collapse;">';
    html += '<tr style="background:var(--bg-tertiary,#f0f0f5);"><th style="padding:6px;text-align:left;">Fichier</th><th style="padding:6px;">Menace</th><th style="padding:6px;">Date</th><th style="padding:6px;">Statut</th><th style="padding:6px;">Actions</th></tr>';

    for (const item of items) {
        const status = item.resolved
            ? '<span style="color:#22c55e;">Résolu</span>'
            : '<span style="color:#ef4444;">En attente</span>';
        const date = item.detected_at ? new Date(item.detected_at + 'Z').toLocaleString('fr-FR') : '-';
        html += `<tr style="border-bottom:1px solid #eee;">
            <td style="padding:6px;" title="${item.blob_name}">${(item.blob_name || '').substring(0, 30)}</td>
            <td style="padding:6px;color:#ef4444;font-weight:600;">${item.virus_name || '-'}</td>
            <td style="padding:6px;">${date}</td>
            <td style="padding:6px;">${status}</td>
            <td style="padding:6px;">
                ${!item.resolved ? `<button class="btn btn-sm" onclick="resolveQuarantine(${item.id})" title="Résoudre" style="padding:2px 8px;font-size:0.8rem;">✅</button>` : ''}
                <button class="btn btn-sm btn-danger" onclick="deleteQuarantine(${item.id})" title="Supprimer" style="padding:2px 8px;font-size:0.8rem;">🗑️</button>
            </td>
        </tr>`;
    }
    html += '</table>';
    container.innerHTML = html;
}

async function resolveQuarantine(id) {
    try {
        await apiRequest(`/admin/security/quarantine/${id}/resolve`, 'PUT');
        showNotification('Menace marquée comme résolue', 'success');
        loadVirusScan();
    } catch (e) {
        showNotification('Erreur: ' + e.message, 'error');
    }
}

async function deleteQuarantine(id) {
    if (!confirm('Supprimer ce fichier en quarantaine ?')) return;
    try {
        await apiRequest(`/admin/security/quarantine/${id}`, 'DELETE');
        showNotification('Fichier en quarantaine supprimé', 'success');
        loadVirusScan();
    } catch (e) {
        showNotification('Erreur: ' + e.message, 'error');
    }
}

// ============================================================================
// ROLES & PERMISSIONS
// ============================================================================

const ROLE_LABELS = { admin: 'Admin', com: 'COM', user: 'Utilisateur', viewer: 'Lecteur' };
const ROLES_LIST = ['admin', 'com', 'user', 'viewer'];

async function loadPermissions() {
    try {
        const res = await fetch(`${API_URL}/admin/roles`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) renderPermissionsMatrix(data);
    } catch (e) {
        console.error('Erreur chargement permissions:', e);
    }
}

function renderPermissionsMatrix(rolesData) {
    const tbody = document.getElementById('permissionsMatrixBody');
    if (!tbody) return;
    
    const allPerms = new Set();
    for (const role of Object.values(rolesData.roles || {})) {
        for (const p of role) allPerms.add(p.permission);
    }
    
    tbody.innerHTML = '';
    for (const perm of allPerms) {
        const tr = document.createElement('tr');
        const labelTd = document.createElement('td');
        labelTd.textContent = rolesData.permissionLabels?.[perm] || perm;
        labelTd.style.fontWeight = '500';
        tr.appendChild(labelTd);
        
        for (const role of ROLES_LIST) {
            const td = document.createElement('td');
            td.style.textAlign = 'center';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.role = role;
            checkbox.dataset.permission = perm;
            const rolePerms = (rolesData.roles || {})[role] || [];
            const permObj = rolePerms.find(p => p.permission === perm);
            checkbox.checked = permObj ? permObj.enabled === 1 : false;
            if (role === 'admin') { checkbox.checked = true; checkbox.disabled = true; }
            td.appendChild(checkbox);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
}

async function savePermissions() {
    const checkboxes = document.querySelectorAll('#permissionsMatrixBody input[type="checkbox"]:not(:disabled)');
    const updates = {};
    for (const cb of checkboxes) {
        const role = cb.dataset.role;
        if (!updates[role]) updates[role] = [];
        updates[role].push({ permission: cb.dataset.permission, enabled: cb.checked });
    }
    
    for (const [role, permissions] of Object.entries(updates)) {
        await fetch(`${API_URL}/admin/roles/${role}/permissions`, {
            method: 'PUT',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissions })
        });
    }
    showNotification('Permissions enregistrées', 'success');
}

// ============================================
// SECURITY AUDIT FUNCTIONS
// ============================================

async function loadAuditDashboard() {
    try {
        const res = await fetch(`${API_URL}/audit/shares/stats`, { headers: getAuthHeaders() });
        if (res.status === 403) {
            document.getElementById('audit').innerHTML = '<div class="empty-state"><i class="fas fa-lock" style="font-size:3rem;color:#ccc;"></i><h3>Accès restreint</h3><p>Vous n\'avez pas la permission d\'audit sécurité.<br>Demandez à un administrateur d\'activer cette permission pour votre rôle.</p></div>';
            return;
        }
        const data = await res.json();
        if (data.success) {
            document.getElementById('auditActiveShares').textContent = data.stats.activeShares;
            document.getElementById('auditTotalDownloads').textContent = data.stats.totalDownloads;
            document.getElementById('auditNoPassword').textContent = data.stats.sharesWithoutPassword;
            document.getElementById('auditExpired').textContent = data.stats.expiredShares;
            
            // Show empty state banner if everything is zero
            const total = data.stats.activeShares + data.stats.totalDownloads + data.stats.expiredShares;
            const banner = document.getElementById('auditEmptyBanner');
            if (banner) banner.style.display = total === 0 ? 'block' : 'none';
        }
        await loadAuditShares();
    } catch(e) { console.error('Audit load error:', e); }
}

async function loadAuditShares() {
    const res = await fetch(`${API_URL}/audit/shares`, { headers: getAuthHeaders() });
    const data = await res.json();
    const tbody = document.getElementById('auditSharesBody');
    if (!data.shares?.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Aucun partage actif</td></tr>'; return; }
    tbody.innerHTML = data.shares.map(s => `<tr>
        <td title="${escapeHtml(s.blob_name)}">${escapeHtml(s.original_name || s.blob_name)}</td>
        <td>${escapeHtml(s.created_by_name || s.created_by || '—')}</td>
        <td>${escapeHtml(s.recipient_email || '—')}</td>
        <td>${new Date(s.expires_at).toLocaleString('fr-FR')}</td>
        <td>${s.download_count || 0}</td>
        <td>${s.password_hash ? '✅' : '⚠️'}</td>
        <td><button class="btn btn-danger btn-sm" onclick="revokeShare('${s.link_id}')"><i class="fas fa-ban"></i> Révoquer</button></td>
    </tr>`).join('');
}

async function loadAuditDownloads() {
    const res = await fetch(`${API_URL}/audit/downloads`, { headers: getAuthHeaders() });
    const data = await res.json();
    const tbody = document.getElementById('auditDownloadsBody');
    if (!data.downloads?.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Aucun téléchargement</td></tr>'; return; }
    tbody.innerHTML = data.downloads.map(d => `<tr>
        <td>${escapeHtml(d.original_name || d.blob_name)}</td>
        <td>${escapeHtml(d.created_by || '—')}</td>
        <td>${escapeHtml(d.recipient_email || '—')}</td>
        <td>${new Date(d.downloaded_at).toLocaleString('fr-FR')}</td>
        <td>${escapeHtml(d.ip_address || '—')}</td>
    </tr>`).join('');
}

async function loadAuditFiles() {
    const res = await fetch(`${API_URL}/audit/files`, { headers: getAuthHeaders() });
    const data = await res.json();
    const tbody = document.getElementById('auditFilesBody');
    if (!data.files?.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Aucun fichier</td></tr>'; return; }
    tbody.innerHTML = data.files.map(f => `<tr>
        <td>${escapeHtml(f.original_name || f.blob_name)}</td>
        <td>${escapeHtml(f.full_name || f.username || '—')}</td>
        <td>${f.file_size ? (f.file_size / 1024 / 1024).toFixed(1) + ' Mo' : '—'}</td>
        <td>${new Date(f.uploaded_at).toLocaleString('fr-FR')}</td>
        <td>${f.active_shares > 0 ? '<span style="color:#c62828;font-weight:600;">' + f.active_shares + '</span>' : '0'}</td>
    </tr>`).join('');
}

function switchAuditTab(tab) {
    ['shares', 'downloads', 'files'].forEach(t => {
        document.getElementById(`auditTab${t.charAt(0).toUpperCase()+t.slice(1)}`).classList.toggle('active', t === tab);
        document.getElementById(`audit${t.charAt(0).toUpperCase()+t.slice(1)}View`).style.display = t === tab ? 'block' : 'none';
    });
    if (tab === 'shares') loadAuditShares();
    if (tab === 'downloads') loadAuditDownloads();
    if (tab === 'files') loadAuditFiles();
}

async function revokeShare(linkId) {
    if (!confirm('Révoquer ce partage ? Le lien ne fonctionnera plus.')) return;
    await fetch(`${API_URL}/audit/shares/${linkId}/revoke`, { method: 'POST', headers: getAuthHeaders() });
    showNotification('Partage révoqué', 'success');
    await loadAuditShares();
    await loadAuditDashboard();
}

// ============================================
// TIERING AUTOMATIQUE
// ============================================

async function loadTieringSettings() {
  try {
    const res = await fetch(`${API_URL}/admin/tiering/policies`, { headers: getAuthHeaders() });
    const data = await res.json();
    if (!data.success) return;

    const globalPolicy = data.policies.find(p => !p.team_id);
    if (globalPolicy) {
      document.getElementById('tieringHotToCool').value = globalPolicy.hot_to_cool_days;
      document.getElementById('tieringCoolToArchive').value = globalPolicy.cool_to_archive_days;
      document.getElementById('tieringEnabled').checked = !!globalPolicy.enabled;
    }

    const teamPolicies = data.policies.filter(p => p.team_id);
    const container = document.getElementById('tieringTeamOverrides');
    if (teamPolicies.length === 0) {
      container.innerHTML = '<p style="color:#999;font-style:italic;">Aucune surcharge — Politique globale appliquée pour toutes les équipes</p>';
    } else {
      container.innerHTML = `<table class="data-table" style="width:100%;"><thead><tr>
        <th>Équipe</th><th>Hot → Cool (jours)</th><th>Cool → Archive (jours)</th><th>Actif</th><th>Actions</th>
      </tr></thead><tbody>${teamPolicies.map(p => `<tr>
        <td>${p.team_name || 'Équipe #' + p.team_id}</td>
        <td><input type="number" value="${p.hot_to_cool_days}" min="1" id="tieringTeamHot_${p.team_id}" style="width:80px;"></td>
        <td><input type="number" value="${p.cool_to_archive_days}" min="1" id="tieringTeamCool_${p.team_id}" style="width:80px;"></td>
        <td><input type="checkbox" ${p.enabled ? 'checked' : ''} id="tieringTeamEnabled_${p.team_id}"></td>
        <td>
          <button class="btn btn-primary btn-small" onclick="saveTieringTeam(${p.team_id})"><i class="fas fa-save"></i></button>
          <button class="btn btn-danger btn-small" onclick="deleteTieringTeam(${p.team_id})"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`).join('')}</tbody></table>`;
    }

    // Load teams for dropdown
    try {
      const teamsRes = await fetch(`${API_URL}/admin/teams`, { headers: getAuthHeaders() });
      const teamsData = await teamsRes.json();
      const select = document.getElementById('tieringTeamSelect');
      const existingTeamIds = teamPolicies.map(p => p.team_id);
      select.innerHTML = '<option value="">-- Choisir une équipe --</option>';
      (teamsData.teams || teamsData || []).forEach(t => {
        if (!existingTeamIds.includes(t.id)) {
          select.innerHTML += `<option value="${t.id}">${t.name}</option>`;
        }
      });
    } catch (e) { /* teams endpoint may not exist */ }
  } catch (error) {
    console.error('Erreur chargement tiering:', error);
  }
}

async function saveTieringGlobal() {
  try {
    const res = await fetch(`${API_URL}/admin/tiering/global`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hotToCoolDays: parseInt(document.getElementById('tieringHotToCool').value),
        coolToArchiveDays: parseInt(document.getElementById('tieringCoolToArchive').value),
        enabled: document.getElementById('tieringEnabled').checked
      })
    });
    const data = await res.json();
    if (data.success) showNotification('Politique de tiering globale enregistrée', 'success');
    else showNotification('Erreur: ' + data.error, 'error');
  } catch (error) {
    showNotification('Erreur: ' + error.message, 'error');
  }
}

async function saveTieringTeam(teamId) {
  try {
    const res = await fetch(`${API_URL}/admin/tiering/team/${teamId}`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hotToCoolDays: parseInt(document.getElementById(`tieringTeamHot_${teamId}`).value),
        coolToArchiveDays: parseInt(document.getElementById(`tieringTeamCool_${teamId}`).value),
        enabled: document.getElementById(`tieringTeamEnabled_${teamId}`).checked
      })
    });
    const data = await res.json();
    if (data.success) showNotification('Politique équipe enregistrée', 'success');
    else showNotification('Erreur: ' + data.error, 'error');
  } catch (error) {
    showNotification('Erreur: ' + error.message, 'error');
  }
}

async function deleteTieringTeam(teamId) {
  if (!confirm('Supprimer cette surcharge ? La politique globale sera appliquée.')) return;
  try {
    const res = await fetch(`${API_URL}/admin/tiering/team/${teamId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      showNotification('Surcharge supprimée', 'success');
      loadTieringSettings();
    } else showNotification('Erreur: ' + data.error, 'error');
  } catch (error) {
    showNotification('Erreur: ' + error.message, 'error');
  }
}

function addTieringTeamOverride() {
  const select = document.getElementById('tieringTeamSelect');
  const teamId = select.value;
  if (!teamId) return showNotification('Sélectionnez une équipe', 'warning');
  saveTieringTeamNew(parseInt(teamId));
}

async function saveTieringTeamNew(teamId) {
  try {
    const res = await fetch(`${API_URL}/admin/tiering/team/${teamId}`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ hotToCoolDays: 30, coolToArchiveDays: 90, enabled: true })
    });
    const data = await res.json();
    if (data.success) {
      showNotification('Surcharge ajoutée', 'success');
      loadTieringSettings();
    } else showNotification('Erreur: ' + data.error, 'error');
  } catch (error) {
    showNotification('Erreur: ' + error.message, 'error');
  }
}

async function previewTiering() {
  const card = document.getElementById('tieringPreviewCard');
  const content = document.getElementById('tieringPreviewContent');
  card.style.display = 'block';
  content.innerHTML = '<p>Chargement...</p>';
  try {
    const res = await fetch(`${API_URL}/admin/tiering/preview`, { headers: getAuthHeaders() });
    const data = await res.json();
    if (!data.success) { content.innerHTML = '<p style="color:red;">Erreur: ' + data.error + '</p>'; return; }
    if (data.results.length === 0) {
      content.innerHTML = '<p style="color:#4CAF50;">✅ Aucun fichier à déplacer</p>';
      return;
    }
    content.innerHTML = `<table class="data-table" style="width:100%;"><thead><tr>
      <th>Fichier</th><th>Tier actuel</th><th>Nouveau tier</th><th>Âge (jours)</th><th>Équipe</th>
    </tr></thead><tbody>${data.results.map(r => `<tr>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;">${r.fileName}</td>
      <td><span class="badge">${r.currentTier}</span></td>
      <td><span class="badge" style="background:#4CAF50;color:#fff;">${r.newTier}</span></td>
      <td>${r.ageDays}</td>
      <td>${r.teamName || 'Global'}</td>
    </tr>`).join('')}</tbody></table>`;
  } catch (error) {
    content.innerHTML = '<p style="color:red;">Erreur: ' + error.message + '</p>';
  }
}

async function runTiering() {
  if (!confirm('Exécuter le tiering maintenant ? Les fichiers seront déplacés entre les niveaux de stockage.')) return;
  try {
    showNotification('Tiering en cours...', 'info');
    const res = await fetch(`${API_URL}/admin/tiering/run`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      showNotification(data.message, 'success');
      previewTiering();
    } else showNotification('Erreur: ' + data.error, 'error');
  } catch (error) {
    showNotification('Erreur: ' + error.message, 'error');
  }
}
