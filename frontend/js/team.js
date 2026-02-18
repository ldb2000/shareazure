// Configuration
const API_URL = window.location.origin + '/api';

// State
let currentSection = 'team-dashboard';
let currentTeam = null;
let userTeams = [];
let userData = null;
let myFiles = [];
let teamFiles = [];
let allGuests = [];
let uploadTarget = 'my'; // 'my' or 'team'

// ============================================
// AUTH
// ============================================

function getAuthToken() {
    return localStorage.getItem('authToken') || sessionStorage.getItem('authToken') ||
           localStorage.getItem('userToken') || sessionStorage.getItem('userToken');
}

function getAuthHeaders() {
    const token = getAuthToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function checkAuth() {
    const token = getAuthToken();
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }

    try {
        const response = await fetch(`${API_URL}/user/verify`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        if (!data.success) {
            window.location.href = 'login.html';
            return false;
        }

        userData = data.user;

        // Check if user is team leader
        if (!data.user.isTeamLeader) {
            window.location.href = 'user.html';
            return false;
        }

        userTeams = data.user.teams || [];
        if (userTeams.length === 0) {
            window.location.href = 'user.html';
            return false;
        }

        // Set up user display
        const userNameEl = document.getElementById('currentUserName');
        if (userNameEl) {
            userNameEl.textContent = data.user.name || data.user.username;
        }
        const avatarEl = document.querySelector('.user-avatar');
        if (avatarEl) {
            const name = encodeURIComponent(data.user.name || data.user.username);
            avatarEl.src = `https://ui-avatars.com/api/?name=${name}&background=003C61&color=fff`;
        }

        return true;
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = 'login.html';
        return false;
    }
}

function handleLogout() {
    ['authToken', 'adminToken', 'adminUser', 'adminUsername', 'userToken', 'userData'].forEach(key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    });
    window.location.href = 'login.html';
}

// ============================================
// INIT
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    const authed = await checkAuth();
    if (!authed) return;

    setupTeamSelector();
    initializeNavigation();
    initializeEventListeners();
    loadTeamDashboard();
});

function setupTeamSelector() {
    if (userTeams.length > 1) {
        const selector = document.getElementById('teamSelector');
        const select = document.getElementById('teamSelect');
        selector.style.display = 'block';
        select.innerHTML = userTeams.map(t =>
            `<option value="${t.teamId}">${escapeHtml(t.displayName || t.name)}</option>`
        ).join('');
        select.addEventListener('change', () => {
            currentTeam = userTeams.find(t => t.teamId === parseInt(select.value));
            loadSectionData(currentSection);
            if (typeof loadTeamLogo === 'function') loadTeamLogo();
        });
    }

    // Select first team with owner role, or first team
    const ownerTeam = userTeams.find(t => t.role === 'owner');
    currentTeam = ownerTeam || userTeams[0];

    if (userTeams.length > 1) {
        document.getElementById('teamSelect').value = currentTeam.teamId;
    }
    // Load team logo
    setTimeout(() => { if (typeof loadTeamLogo === 'function') loadTeamLogo(); }, 100);
}

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
        'team-dashboard': { title: 'Tableau de bord', subtitle: 'Vue d\'ensemble de l\'equipe' },
        'my-files': { title: 'Mes Fichiers', subtitle: 'Gestion de vos fichiers personnels' },
        'team-files': { title: 'Fichiers d\'equipe', subtitle: 'Fichiers partages avec l\'equipe' },
        'members': { title: 'Membres', subtitle: 'Gestion des membres de l\'equipe' },
        'team-guests': { title: 'Invites', subtitle: 'Comptes temporaires de l\'equipe' },
        'team-settings': { title: 'Parametres', subtitle: 'Configuration de l\'equipe' }
    };

    const t = titles[section] || { title: section, subtitle: '' };
    document.getElementById('pageTitle').textContent = t.title;
    document.getElementById('pageSubtitle').textContent = t.subtitle;

    currentSection = section;
    loadSectionData(section);
}

function loadSectionData(section) {
    switch (section) {
        case 'team-dashboard': loadTeamDashboard(); break;
        case 'my-files': loadMyFiles(); break;
        case 'team-files': loadTeamFiles(); break;
        case 'members': loadMembers(); break;
        case 'team-guests': loadGuests(); break;
        case 'team-settings': loadTeamSettings(); break;
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

    // My Files
    document.getElementById('myFilesSearch')?.addEventListener('input', filterMyFiles);
    document.getElementById('uploadMyFileBtn')?.addEventListener('click', () => {
        uploadTarget = 'my';
        showModal('uploadModal');
    });

    // Team Files
    document.getElementById('teamFilesSearch')?.addEventListener('input', filterTeamFiles);
    document.getElementById('uploadTeamFileBtn')?.addEventListener('click', () => {
        uploadTarget = 'team';
        showModal('uploadModal');
    });

    // Members
    document.getElementById('addMemberBtn')?.addEventListener('click', () => showModal('addMemberModal'));
    document.getElementById('submitAddMember')?.addEventListener('click', addMember);
    document.getElementById('closeAddMemberBtn')?.addEventListener('click', () => closeModal('addMemberModal'));
    document.getElementById('cancelAddMemberBtn')?.addEventListener('click', () => closeModal('addMemberModal'));

    // Guests
    document.getElementById('createGuestBtn')?.addEventListener('click', () => {
        document.getElementById('guestEmail').value = '';
        document.getElementById('createGuestError').style.display = 'none';
        showModal('createGuestModal');
    });
    document.getElementById('submitCreateGuest')?.addEventListener('click', createGuest);
    document.getElementById('closeCreateGuestBtn')?.addEventListener('click', () => closeModal('createGuestModal'));
    document.getElementById('cancelCreateGuestBtn')?.addEventListener('click', () => closeModal('createGuestModal'));
    document.getElementById('guestEmail')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); createGuest(); }
    });

    // Settings
    document.getElementById('saveTeamSettingsBtn')?.addEventListener('click', saveTeamSettings);

    // Upload
    document.getElementById('closeUploadBtn')?.addEventListener('click', () => closeModal('uploadModal'));
    document.getElementById('fileInput')?.addEventListener('change', handleFileSelect);
    setupDragAndDrop();

    // Confirm modal
    document.getElementById('confirmNoBtn')?.addEventListener('click', () => closeModal('confirmModal'));
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
// TEAM DASHBOARD
// ============================================

async function loadTeamDashboard() {
    if (!currentTeam) return;
    try {
        const res = await apiRequest(`/teams/${currentTeam.teamId}`);
        if (!res.success) return;
        const team = res.team;

        document.getElementById('statTeamFiles').textContent = team.stats?.fileCount || 0;
        document.getElementById('statTeamStorage').textContent = formatBytes(team.stats?.totalSize || 0);
        document.getElementById('statTeamMembers').textContent = team.members?.length || 0;

        // My files count
        try {
            const filesRes = await apiRequest('/files');
            const files = filesRes.files || [];
            document.getElementById('statMyFiles').textContent = files.length;
        } catch (e) {
            document.getElementById('statMyFiles').textContent = '-';
        }

        document.getElementById('dashboardTeamName').textContent = team.display_name || team.name;
        document.getElementById('dashboardTeamDescription').textContent = team.description || 'Aucune description';
        document.getElementById('dashboardTeamCreated').textContent = formatDate(team.created_at);

        const myRole = currentTeam.role || 'member';
        const roleLabels = { owner: 'Proprietaire', member: 'Membre', viewer: 'Lecteur' };
        document.getElementById('dashboardUserRole').textContent = roleLabels[myRole] || myRole;

    } catch (error) {
        console.error('Dashboard error:', error);
    }
}

// ============================================
// MY FILES
// ============================================

async function loadMyFiles() {
    try {
        const res = await apiRequest('/files');
        myFiles = res.files || [];
        renderMyFilesTable(myFiles);
    } catch (error) {
        console.error('My files error:', error);
        document.getElementById('myFilesTableBody').innerHTML = '<tr><td colspan="5" class="loading">Erreur chargement</td></tr>';
    }
}

function renderMyFilesTable(files) {
    const tbody = document.getElementById('myFilesTableBody');
    if (!tbody) return;
    if (files.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">Aucun fichier</td></tr>';
        return;
    }
    tbody.innerHTML = files.map(file => `
        <tr>
            <td><span class="file-icon">${getFileIcon(file.contentType)}</span> ${escapeHtml(file.metadata?.originalName || file.name)}</td>
            <td>${getFileCategory(file.contentType)}</td>
            <td>${formatBytes(file.size)}</td>
            <td>${formatDate(file.lastModified)}</td>
            <td><div class="table-actions">
                <button class="btn btn-small btn-primary" onclick="downloadFile('${file.name}')"><i class="fas fa-download"></i></button>
                <button class="btn btn-small btn-danger" onclick="deleteFile('${file.name}', 'my')"><i class="fas fa-trash"></i></button>
            </div></td>
        </tr>
    `).join('');
}

function filterMyFiles() {
    const search = document.getElementById('myFilesSearch').value.toLowerCase();
    renderMyFilesTable(myFiles.filter(f => {
        const name = (f.metadata?.originalName || f.name).toLowerCase();
        return !search || name.includes(search);
    }));
}

// ============================================
// TEAM FILES
// ============================================

async function loadTeamFiles() {
    if (!currentTeam) return;
    try {
        const res = await apiRequest(`/files?teamId=${currentTeam.teamId}`);
        teamFiles = res.files || [];
        renderTeamFilesTable(teamFiles);
    } catch (error) {
        console.error('Team files error:', error);
        document.getElementById('teamFilesTableBody').innerHTML = '<tr><td colspan="6" class="loading">Erreur chargement</td></tr>';
    }
}

function renderTeamFilesTable(files) {
    const tbody = document.getElementById('teamFilesTableBody');
    if (!tbody) return;
    if (files.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Aucun fichier</td></tr>';
        return;
    }
    const isOwner = currentTeam && currentTeam.role === 'owner';
    tbody.innerHTML = files.map(file => `
        <tr>
            <td><span class="file-icon">${getFileIcon(file.contentType)}</span> ${escapeHtml(file.metadata?.originalName || file.name)}</td>
            <td>${getFileCategory(file.contentType)}</td>
            <td>${formatBytes(file.size)}</td>
            <td>${escapeHtml(file.metadata?.uploadedBy || '-')}</td>
            <td>${formatDate(file.lastModified)}</td>
            <td><div class="table-actions">
                <button class="btn btn-small btn-primary" onclick="downloadFile('${file.name}')"><i class="fas fa-download"></i></button>
                ${isOwner ? `<button class="btn btn-small btn-danger" onclick="deleteFile('${file.name}', 'team')"><i class="fas fa-trash"></i></button>` : ''}
            </div></td>
        </tr>
    `).join('');
}

function filterTeamFiles() {
    const search = document.getElementById('teamFilesSearch').value.toLowerCase();
    renderTeamFilesTable(teamFiles.filter(f => {
        const name = (f.metadata?.originalName || f.name).toLowerCase();
        return !search || name.includes(search);
    }));
}

// ============================================
// FILE OPERATIONS
// ============================================

window.downloadFile = (blobName) => {
    window.open(`${API_URL}/download/${blobName}`, '_blank');
};

window.deleteFile = async (blobName, source) => {
    if (!await showConfirmDialog('Supprimer le fichier', 'Supprimer ce fichier ?')) return;
    try {
        await fetch(`${API_URL}/files/${blobName}`, { method: 'DELETE', headers: getAuthHeaders() });
        showNotification('Fichier supprime', 'success');
        if (source === 'team') loadTeamFiles();
        else loadMyFiles();
    } catch (e) {
        showNotification('Erreur suppression', 'error');
    }
};

// ============================================
// UPLOAD
// ============================================

function setupDragAndDrop() {
    const zone = document.getElementById('uploadZone');
    if (!zone) return;

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => {
        zone.classList.remove('dragover');
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) uploadFiles(files);
    });

    zone.addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });
}

function handleFileSelect(e) {
    if (e.target.files.length > 0) uploadFiles(e.target.files);
}

async function uploadFiles(fileList) {
    const progress = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    progress.style.display = 'block';

    for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const pct = Math.round(((i) / fileList.length) * 100);
        progressFill.style.width = pct + '%';
        progressText.textContent = `Upload ${i + 1}/${fileList.length}...`;

        const formData = new FormData();
        formData.append('file', file);
        if (uploadTarget === 'team' && currentTeam) {
            formData.append('teamId', currentTeam.teamId);
        }

        try {
            const token = getAuthToken();
            await fetch(`${API_URL}/upload`, {
                method: 'POST',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                body: formData
            });
        } catch (e) {
            showNotification(`Erreur upload: ${file.name}`, 'error');
        }
    }

    progressFill.style.width = '100%';
    progressText.textContent = 'Termine !';
    setTimeout(() => {
        progress.style.display = 'none';
        progressFill.style.width = '0%';
        closeModal('uploadModal');
        if (uploadTarget === 'team') loadTeamFiles();
        else loadMyFiles();
        showNotification(`${fileList.length} fichier(s) uploade(s)`, 'success');
    }, 1000);

    document.getElementById('fileInput').value = '';
}

// ============================================
// MEMBERS
// ============================================

async function loadMembers() {
    if (!currentTeam) return;
    const tbody = document.getElementById('membersTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Chargement...</td></tr>';

    try {
        const res = await apiRequest(`/teams/${currentTeam.teamId}`);
        if (!res.success) throw new Error(res.error);
        const members = res.team.members || [];
        if (members.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="loading">Aucun membre</td></tr>';
            return;
        }

        const isOwner = currentTeam.role === 'owner';
        const roleLabels = { owner: 'Proprietaire', member: 'Membre', viewer: 'Lecteur' };

        tbody.innerHTML = members.map(m => `
            <tr>
                <td><strong>${escapeHtml(m.full_name || m.username)}</strong></td>
                <td>${escapeHtml(m.username)}</td>
                <td>${escapeHtml(m.email || '-')}</td>
                <td><span class="badge-info">${roleLabels[m.role] || m.role}</span></td>
                <td>${formatDate(m.joined_at)}</td>
                <td><div class="table-actions">
                    ${isOwner && m.role !== 'owner' ? `
                        <select class="filter-select btn-small" onchange="changeMemberRole(${m.user_id}, this.value)" style="padding: 4px 8px;">
                            <option value="member" ${m.role === 'member' ? 'selected' : ''}>Membre</option>
                            <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>Lecteur</option>
                        </select>
                        <button class="btn btn-small btn-danger" onclick="removeMember(${m.user_id}, '${escapeHtml(m.username)}')"><i class="fas fa-trash"></i></button>
                    ` : '<span style="color: var(--text-tertiary);">-</span>'}
                </div></td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading" style="color: var(--danger-color);">Erreur chargement</td></tr>';
    }
}

async function addMember() {
    if (!currentTeam) return;
    const username = document.getElementById('memberUsername').value.trim();
    const role = document.getElementById('memberRole').value;
    if (!username) {
        showNotification('Entrez un nom d\'utilisateur', 'error');
        return;
    }
    try {
        await apiRequest(`/teams/${currentTeam.teamId}/members`, 'POST', { username, role });
        showNotification('Membre ajoute', 'success');
        closeModal('addMemberModal');
        document.getElementById('memberUsername').value = '';
        loadMembers();
    } catch (e) {
        showNotification(e.message || 'Erreur ajout', 'error');
    }
}

window.changeMemberRole = async (userId, newRole) => {
    if (!currentTeam) return;
    try {
        await apiRequest(`/teams/${currentTeam.teamId}/members/${userId}`, 'PUT', { role: newRole });
        showNotification('Role mis a jour', 'success');
    } catch (e) {
        showNotification(e.message || 'Erreur', 'error');
        loadMembers(); // Refresh to revert UI
    }
};

window.removeMember = async (userId, username) => {
    if (!await showConfirmDialog('Retirer de l\'equipe', `Retirer ${username} de l'equipe ?`)) return;
    if (!currentTeam) return;
    try {
        await apiRequest(`/teams/${currentTeam.teamId}/members/${userId}`, 'DELETE');
        showNotification('Membre retire', 'success');
        loadMembers();
    } catch (e) {
        showNotification(e.message || 'Erreur', 'error');
    }
};

// ============================================
// GUESTS
// ============================================

async function loadGuests() {
    try {
        const res = await apiRequest('/admin/guest-accounts');
        if (res.success) {
            allGuests = res.guests || [];
            document.getElementById('guestsTotalCount').textContent = res.stats?.total || allGuests.length;
            document.getElementById('guestsActiveCount').textContent = res.stats?.active || 0;
            renderGuestsTable(allGuests);
        }
    } catch (e) {
        console.error('Guests error:', e);
        document.getElementById('guestsTableBody').innerHTML = '<tr><td colspan="6" class="loading">Erreur chargement</td></tr>';
    }
}

function renderGuestsTable(guests) {
    const tbody = document.getElementById('guestsTableBody');
    if (guests.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Aucun invite</td></tr>';
        return;
    }
    tbody.innerHTML = guests.map(g => {
        const isExpired = g.isExpired || new Date() > new Date(g.account_expires_at);
        const isActive = g.is_active === 1 && !isExpired;
        return `<tr>
            <td><strong>${escapeHtml(g.email)}</strong></td>
            <td><span class="badge-info">${g.file_count || 0}</span></td>
            <td>${formatDate(g.created_at)}</td>
            <td>${formatDate(g.account_expires_at)}</td>
            <td>${g.pending_approval ? '<span class="badge-warning">⏳ Approbation</span>' : isActive ? '<span class="badge-success">Actif</span>' : '<span class="badge-danger">Expiré</span>'}${g.is_unlimited ? ' <span class="badge-info">♾️</span>' : ''}</td>
            <td><div class="table-actions">
                ${g.pending_approval ? `<button class="btn btn-small btn-success" onclick="approveGuest('${g.guest_id}', '${escapeHtml(g.email)}')"><i class="fas fa-check"></i> Approuver</button>` : ''}
                ${isActive && !g.pending_approval ? `<button class="btn btn-small btn-warning" onclick="disableGuest('${g.guest_id}', '${escapeHtml(g.email)}')"><i class="fas fa-ban"></i></button>` : ''}
                <button class="btn btn-small btn-danger" onclick="deleteGuest('${g.guest_id}', '${escapeHtml(g.email)}')"><i class="fas fa-trash"></i></button>
            </div></td>
        </tr>`;
    }).join('');
}

async function createGuest() {
    const email = document.getElementById('guestEmail').value.trim();
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        showCreateGuestError('Email invalide');
        return;
    }
    const btn = document.getElementById('submitCreateGuest');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creation...';
    try {
        const durationEl = document.getElementById('guestDuration');
        const durationDays = durationEl ? parseInt(durationEl.value) : 15;
        const res = await apiRequest('/admin/guest-accounts', 'POST', { email, durationDays });
        if (res.success) {
            closeModal('createGuestModal');
            showNotification(res.message || 'Invite cree', 'success');
            loadGuests();
        } else {
            showCreateGuestError(res.error || 'Erreur');
        }
    } catch (e) {
        showCreateGuestError(e.message || 'Erreur');
    } finally {
        btn.disabled = false;
        btn.innerHTML = orig;
    }
}

function showCreateGuestError(msg) {
    const el = document.getElementById('createGuestError');
    document.getElementById('createGuestErrorMessage').textContent = msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 5000);
}

window.approveGuest = async (guestId, email) => {
    if (!await showConfirmDialog('Approuver l\'invité', `Approuver l'accès illimité pour ${email} ?`)) return;
    try {
        await apiRequest(`/admin/guest-accounts/${guestId}/approve`, 'PUT');
        showNotification('Invité approuvé — accès illimité activé', 'success');
        loadGuests();
    } catch (e) { showNotification('Erreur: ' + (e.message || 'Erreur'), 'error'); }
};

window.disableGuest = async (guestId, email) => {
    if (!await showConfirmDialog('Desactiver l\'invite', `Desactiver ${email} ?`)) return;
    try {
        await apiRequest(`/admin/guest-accounts/${guestId}/disable`, 'PUT');
        showNotification('Invite desactive', 'success');
        loadGuests();
    } catch (e) { showNotification('Erreur', 'error'); }
};

window.deleteGuest = async (guestId, email) => {
    if (!await showConfirmDialog('Supprimer l\'invite', `Supprimer ${email} et ses fichiers ?`)) return;
    try {
        const res = await apiRequest(`/admin/guest-accounts/${guestId}`, 'DELETE');
        showNotification(`Invite supprime (${res.stats?.filesDeleted || 0} fichier(s))`, 'success');
        loadGuests();
    } catch (e) { showNotification('Erreur', 'error'); }
};

// ============================================
// TEAM SETTINGS
// ============================================

async function loadTeamSettings() {
    if (!currentTeam) return;
    try {
        const res = await apiRequest(`/teams/${currentTeam.teamId}`);
        if (!res.success) return;
        const team = res.team;
        document.getElementById('settingsTeamName').value = team.name;
        document.getElementById('settingsDisplayName').value = team.display_name || '';
        document.getElementById('settingsDescription').value = team.description || '';
    } catch (e) {
        console.error('Settings error:', e);
    }
}

async function saveTeamSettings() {
    if (!currentTeam) return;
    const displayName = document.getElementById('settingsDisplayName').value.trim();
    const description = document.getElementById('settingsDescription').value.trim();
    if (!displayName) {
        showNotification('Le nom affiche est requis', 'error');
        return;
    }
    try {
        await apiRequest(`/teams/${currentTeam.teamId}`, 'PUT', { displayName, description });
        showNotification('Parametres sauvegardes', 'success');
        // Update local data
        currentTeam.displayName = displayName;
    } catch (e) {
        showNotification(e.message || 'Erreur sauvegarde', 'error');
    }
}

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

// Animation styles
const style = document.createElement('style');
style.textContent = `@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`;
document.head.appendChild(style);

// ============================================================================
// LOGO ÉQUIPE
// ============================================================================

function loadTeamLogo() {
    if (!currentTeam) return;
    const img = document.getElementById('teamLogoImg');
    if (!img) return;
    const testImg = new Image();
    testImg.onload = () => { img.src = testImg.src; img.style.display = 'block'; };
    testImg.onerror = () => { img.style.display = 'none'; };
    testImg.src = `${API_URL}/teams/${currentTeam.teamId}/logo?t=${Date.now()}`;
    
    // Update subtitle with team name
    const subtitle = document.getElementById('teamSubtitle');
    if (subtitle) subtitle.textContent = currentTeam.displayName || currentTeam.name || 'Gestion d\'équipe';
    
    // Only allow click to change if owner
    img.style.cursor = (currentTeam.role === 'owner' || currentTeam.role === 'admin') ? 'pointer' : 'default';
    img.title = (currentTeam.role === 'owner' || currentTeam.role === 'admin') ? 'Cliquez pour changer le logo' : currentTeam.displayName || '';
}

window.changeTeamLogoFromSidebar = () => {
    if (!currentTeam) return;
    if (currentTeam.role !== 'owner' && currentTeam.role !== 'admin') {
        showToast('Seul le propriétaire peut modifier le logo', 'error');
        return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.svg,image/svg+xml';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.includes('svg') && !file.name.endsWith('.svg')) {
            showToast('Format SVG uniquement', 'error');
            return;
        }
        try {
            const svgText = await file.text();
            const res = await fetch(`${API_URL}/teams/${currentTeam.teamId}/logo`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'image/svg+xml' },
                body: svgText
            });
            const data = await res.json();
            if (data.success) {
                showToast('Logo mis à jour !', 'success');
                loadTeamLogo();
            } else {
                showToast(data.error || 'Erreur', 'error');
            }
        } catch (err) {
            showToast('Erreur: ' + err.message, 'error');
        }
    };
    input.click();
};

// Hook into team loading
const _origLoadTeamDashboard = typeof loadTeamDashboard === 'function' ? loadTeamDashboard : null;
