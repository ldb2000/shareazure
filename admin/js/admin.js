// Configuration
const API_URL = 'http://localhost:3000/api';

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
        settings: { title: 'Parametres', subtitle: 'Configuration de l\'application' }
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
        case 'costs': loadCosts(); break;
        case 'users': loadUsers(); break;
        case 'guests': loadGuests(); break;
        case 'logs': loadLogs(); break;
        case 'settings': loadSettings(); loadEmailDomains(); break;
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function initializeEventListeners() {
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
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
    document.getElementById('refreshCostsBtn')?.addEventListener('click', loadCosts);
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
        const files = await fetchFiles();

        // Stats
        document.getElementById('statTotalFiles').textContent = files.length;

        // Teams count
        try {
            const teamsRes = await apiRequest('/teams');
            document.getElementById('statTotalTeams').textContent = teamsRes.success ? teamsRes.teams.length : 0;
        } catch (e) { document.getElementById('statTotalTeams').textContent = '0'; }

        // Users count
        try {
            const usersRes = await apiRequest('/admin/users');
            document.getElementById('statTotalUsers').textContent = usersRes.success ? (usersRes.users || []).length : '-';
        } catch (e) { document.getElementById('statTotalUsers').textContent = '-'; }

        // Costs
        try {
            const costsRes = await apiRequest('/admin/costs');
            document.getElementById('statTotalCosts').textContent = costsRes.success ? `$${(costsRes.totals.overall || 0).toFixed(2)}` : '$0.00';
        } catch (e) { document.getElementById('statTotalCosts').textContent = '$0.00'; }

        // Charts
        const stats = calculateStats(files);
        createUploadsChart(stats.uploadsByDay);
        createFileTypesChart(stats.filesByType);
        loadRecentActivity(files);

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
    tbody.innerHTML = files.map(file => `
        <tr>
            <td><input type="checkbox" class="file-checkbox" data-blob-name="${file.name}"></td>
            <td><div class="file-name"><span class="file-icon">${getFileIcon(file.contentType)}</span> <span class="file-name-text">${escapeHtml(file.metadata?.originalName || file.name)}</span></div></td>
            <td>${getFileCategory(file.contentType)}</td>
            <td>${formatBytes(file.size)}</td>
            <td>${new Date(file.lastModified).toLocaleString('fr-FR')}</td>
            <td><span class="status-badge active">0</span></td>
            <td><div class="table-actions">
                <button class="btn btn-small btn-secondary" onclick="viewFileDetails('${file.name}')"><i class="fas fa-eye"></i></button>
                <button class="btn btn-small btn-danger" onclick="deleteFile('${file.name}')"><i class="fas fa-trash"></i></button>
            </div></td>
        </tr>
    `).join('');
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
            <thead><tr><th>Nom</th><th>Nom affiche</th><th>Membres</th><th>Fichiers</th><th>Taille</th><th>Creee le</th><th>Actions</th></tr></thead>
            <tbody>${res.teams.map(t => `<tr>
                <td><strong>${escapeHtml(t.name)}</strong></td>
                <td>${escapeHtml(t.display_name)}</td>
                <td>${t.stats?.memberCount || 0}</td>
                <td>${t.stats?.fileCount || 0}</td>
                <td>${formatBytes(t.stats?.totalSize || 0)}</td>
                <td>${formatDate(t.created_at)}</td>
                <td><div class="table-actions">
                    <button class="btn btn-small btn-secondary" onclick="viewTeam(${t.id})"><i class="fas fa-eye"></i></button>
                    <button class="btn btn-small btn-danger" onclick="deleteTeam(${t.id})"><i class="fas fa-trash"></i></button>
                </div></td>
            </tr>`).join('')}</tbody></table>`;
    } catch (e) {
        container.innerHTML = '<p class="loading" style="color: var(--danger-color);">Erreur chargement</p>';
    }
}

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
            <h4>Membres (${members.length})</h4>
            ${members.length > 0 ? `<table class="data-table">
                <thead><tr><th>Username</th><th>Nom</th><th>Email</th><th>Role</th><th>Rejoint le</th></tr></thead>
                <tbody>${members.map(m => `<tr>
                    <td><strong>${escapeHtml(m.username)}</strong></td>
                    <td>${escapeHtml(m.full_name || '-')}</td>
                    <td>${escapeHtml(m.email || '-')}</td>
                    <td><span class="badge-info">${m.role}</span></td>
                    <td>${formatDate(m.joined_at)}</td>
                </tr>`).join('')}</tbody></table>` : '<p style="color:#888;">Aucun membre</p>'}`;
        showModal('teamDetailModal');
    } catch (e) { showNotification('Erreur chargement equipe', 'error'); }
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

async function loadCosts() {
    try {
        const period = document.getElementById('costsPeriod').value;
        let param = '';
        if (period === 'last') {
            const d = new Date(); d.setMonth(d.getMonth() - 1);
            param = `?period=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        } else if (period === 'year') {
            param = `?period=${new Date().getFullYear()}`;
        }
        const res = await apiRequest(`/admin/costs${param}`);
        if (!res.success) throw new Error(res.error);

        document.getElementById('costsUsers').textContent = `$${(res.totals.users || 0).toFixed(2)}`;
        document.getElementById('costsTeams').textContent = `$${(res.totals.teams || 0).toFixed(2)}`;
        document.getElementById('costsGuests').textContent = `$${(res.totals.guests || 0).toFixed(2)}`;
        document.getElementById('costsTotal').textContent = `$${(res.totals.overall || 0).toFixed(2)}`;

        const allCosts = [
            ...(res.summary?.users || []).map(c => ({ ...c, type: 'user' })),
            ...(res.summary?.teams || []).map(c => ({ ...c, type: 'team' })),
            ...(res.summary?.guests || []).map(c => ({ ...c, type: 'guest' }))
        ].sort((a, b) => (b.total_cost || 0) - (a.total_cost || 0));

        const container = document.getElementById('costsDetails');
        if (allCosts.length === 0) { container.innerHTML = '<p class="loading">Aucune donnee</p>'; return; }
        container.innerHTML = `<table class="data-table">
            <thead><tr><th>Type</th><th>ID</th><th>Stockage</th><th>Operations</th><th>Bande passante</th><th>Total</th></tr></thead>
            <tbody>${allCosts.map(c => `<tr>
                <td><span class="badge-info">${c.type}</span></td>
                <td>${c.entity_id}</td>
                <td>$${(c.storage_cost || 0).toFixed(2)}</td>
                <td>$${(c.operations_cost || 0).toFixed(2)}</td>
                <td>$${(c.bandwidth_cost || 0).toFixed(2)}</td>
                <td><strong>$${(c.total_cost || 0).toFixed(2)}</strong></td>
            </tr>`).join('')}</tbody></table>`;
    } catch (e) {
        console.error('Costs error:', e);
        showNotification('Erreur chargement couts', 'error');
    }
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
            const colors = { admin: 'background:rgba(239,68,68,0.1);color:#ef4444;', april_user: 'background:rgba(245,158,11,0.1);color:#f59e0b;', user: 'background:rgba(59,130,246,0.1);color:#3b82f6;' };
            const labels = { admin: 'Admin', april_user: 'Responsable', user: 'Utilisateur' };
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
            ${g.is_active === 1 ? `<button class="btn btn-icon btn-small btn-warning" onclick="disableGuest('${g.guest_id}', '${escapeHtml(g.email)}')"><i class="fas fa-ban"></i></button>` : ''}
            <button class="btn btn-icon btn-small btn-danger" onclick="deleteGuest('${g.guest_id}', '${escapeHtml(g.email)}')"><i class="fas fa-trash"></i></button>
        </div></td>
    </tr>`).join('');
}

function getGuestStatusBadge(g) {
    if (!g.is_active) return '<span class="badge-danger">Desactive</span>';
    if (g.isExpired) return '<span class="badge-danger">Expire</span>';
    if (g.hoursRemaining <= 24) return '<span class="badge-warning">Expire bientot</span>';
    return '<span class="badge-success">Actif</span>';
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
            notifyQuota: document.getElementById('notifyQuota').checked.toString()
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

function renderEmailDomains() {
    const tbody = document.getElementById('emailDomainsTableBody');
    const pagination = document.getElementById('emailDomainsPagination');

    if (allDomains.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="color: var(--text-secondary); font-style: italic;">Aucun domaine configure</td></tr>';
        pagination.style.display = 'none';
        return;
    }

    const totalPages = Math.ceil(allDomains.length / DOMAINS_PER_PAGE);
    if (domainsPage > totalPages) domainsPage = totalPages;
    const start = (domainsPage - 1) * DOMAINS_PER_PAGE;
    const pageDomains = allDomains.slice(start, start + DOMAINS_PER_PAGE);

    tbody.innerHTML = pageDomains.map(d => `
        <tr>
            <td><strong style="color: var(--primary-color);">${escapeHtml(d.domain)}</strong></td>
            <td>${d.is_active === 1 ? '<span class="status-badge active">Actif</span>' : '<span class="status-badge expired">Inactif</span>'}</td>
            <td>${d.created_at ? new Date(d.created_at).toLocaleDateString('fr-FR') : '-'}</td>
            <td><div class="table-actions">
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
