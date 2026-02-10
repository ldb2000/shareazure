// Configuration
const API_BASE_URL = 'http://localhost:3000/api';
let authToken = null;
let currentUser = null;

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initNavigation();
    initModals();
    initEventListeners();
});

// ============================================================================
// AUTHENTICATION
// ============================================================================

function checkAuth() {
    authToken = localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken');
    const username = localStorage.getItem('adminUsername') || sessionStorage.getItem('adminUsername');

    if (!authToken || !username) {
        window.location.href = '../login.html';
        return;
    }

    currentUser = { username };
    document.getElementById('currentUser').textContent = username;
    loadDashboard();
}

document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUsername');
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('adminUsername');
    window.location.href = '../login.html';
});

// ============================================================================
// NAVIGATION
// ============================================================================

function initNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            switchTab(tab);
        });
    });
}

function switchTab(tab) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tab);
    });

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tab}-tab`);
    });

    // Load tab data
    loadTabData(tab);
}

function loadTabData(tab) {
    switch(tab) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'teams':
            loadTeams();
            break;
        case 'costs':
            loadCosts();
            break;
        case 'files':
            loadFiles();
            break;
        case 'users':
            loadUsers();
            break;
        case 'guests':
            loadGuests();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

// ============================================================================
// DASHBOARD
// ============================================================================

async function loadDashboard() {
    try {
        // Load teams count
        const teamsRes = await apiRequest('/teams');
        if (teamsRes.success) {
            document.getElementById('totalTeams').textContent = teamsRes.teams.length;
        }

        // Load files count (estimate)
        const filesRes = await apiRequest('/files');
        if (filesRes.success) {
            document.getElementById('totalFiles').textContent = filesRes.count || 0;
        }

        // Load costs
        const costsRes = await apiRequest('/admin/costs');
        if (costsRes.success) {
            const totalCost = costsRes.totals.overall || 0;
            document.getElementById('totalCosts').textContent = `$${totalCost.toFixed(2)}`;
        }

        // Show placeholder for users count
        document.getElementById('totalUsers').textContent = '3'; // Placeholder

        // Recent activity
        document.getElementById('recentActivity').innerHTML = '<p>Système opérationnel</p>';

    } catch (error) {
        console.error('Error loading dashboard:', error);
        showNotification('Erreur lors du chargement du dashboard', 'error');
    }
}

// ============================================================================
// TEAMS
// ============================================================================

async function loadTeams() {
    const container = document.getElementById('teamsList');
    container.innerHTML = '<p class="loading">Chargement...</p>';

    try {
        const res = await apiRequest('/teams');
        if (!res.success) throw new Error(res.error);

        if (res.teams.length === 0) {
            container.innerHTML = '<p>Aucune équipe créée</p>';
            return;
        }

        const html = `
            <table>
                <thead>
                    <tr>
                        <th>Nom</th>
                        <th>Nom affiché</th>
                        <th>Membres</th>
                        <th>Fichiers</th>
                        <th>Taille</th>
                        <th>Créée le</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${res.teams.map(team => `
                        <tr>
                            <td><strong>${team.name}</strong></td>
                            <td>${team.display_name}</td>
                            <td>${team.stats.memberCount}</td>
                            <td>${team.stats.fileCount}</td>
                            <td>${formatBytes(team.stats.totalSize)}</td>
                            <td>${formatDate(team.created_at)}</td>
                            <td>
                                <button class="btn-sm btn-primary" onclick="viewTeam(${team.id})">
                                    <i class="fas fa-eye"></i> Voir
                                </button>
                                <button class="btn-sm btn-danger" onclick="deleteTeam(${team.id})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading teams:', error);
        container.innerHTML = '<p class="error">Erreur lors du chargement des équipes</p>';
        showNotification('Erreur lors du chargement des équipes', 'error');
    }
}

window.viewTeam = async (teamId) => {
    try {
        const res = await apiRequest(`/teams/${teamId}`);
        if (!res.success) throw new Error(res.error);

        const team = res.team;
        alert(`Équipe: ${team.display_name}\nMembres: ${team.members.length}\nFichiers: ${team.stats.fileCount}`);
    } catch (error) {
        showNotification('Erreur lors du chargement de l\'équipe', 'error');
    }
};

window.deleteTeam = async (teamId) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette équipe ?')) return;

    try {
        const res = await apiRequest(`/teams/${teamId}`, 'DELETE');
        if (!res.success) throw new Error(res.error);

        showNotification('Équipe supprimée avec succès', 'success');
        loadTeams();
    } catch (error) {
        showNotification('Erreur lors de la suppression', 'error');
    }
};

// ============================================================================
// COSTS
// ============================================================================

async function loadCosts() {
    try {
        const period = document.getElementById('costsPeriod').value;
        let periodParam = '';

        if (period === 'last') {
            const lastMonth = new Date();
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            periodParam = `?period=${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
        } else if (period === 'year') {
            periodParam = `?period=${new Date().getFullYear()}`;
        }

        const res = await apiRequest(`/admin/costs${periodParam}`);
        if (!res.success) throw new Error(res.error);

        // Update summary cards
        document.getElementById('costsUsers').textContent = `$${(res.totals.users || 0).toFixed(2)}`;
        document.getElementById('costsTeams').textContent = `$${(res.totals.teams || 0).toFixed(2)}`;
        document.getElementById('costsGuests').textContent = `$${(res.totals.guests || 0).toFixed(2)}`;
        document.getElementById('costsTotal').textContent = `$${(res.totals.overall || 0).toFixed(2)}`;

        // Build details table
        const allCosts = [
            ...res.summary.users.map(c => ({...c, type: 'user'})),
            ...res.summary.teams.map(c => ({...c, type: 'team'})),
            ...res.summary.guests.map(c => ({...c, type: 'guest'}))
        ].sort((a, b) => b.total_cost - a.total_cost);

        const detailsContainer = document.getElementById('costsDetails');
        if (allCosts.length === 0) {
            detailsContainer.innerHTML = '<p>Aucune donnée de coûts disponible</p>';
            return;
        }

        const html = `
            <table>
                <thead>
                    <tr>
                        <th>Type</th>
                        <th>ID</th>
                        <th>Stockage</th>
                        <th>Opérations</th>
                        <th>Bande passante</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${allCosts.map(cost => `
                        <tr>
                            <td><span class="badge badge-info">${cost.type}</span></td>
                            <td>${cost.entity_id}</td>
                            <td>$${(cost.storage_cost || 0).toFixed(2)}</td>
                            <td>$${(cost.operations_cost || 0).toFixed(2)}</td>
                            <td>$${(cost.bandwidth_cost || 0).toFixed(2)}</td>
                            <td><strong>$${(cost.total_cost || 0).toFixed(2)}</strong></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        detailsContainer.innerHTML = html;

    } catch (error) {
        console.error('Error loading costs:', error);
        showNotification('Erreur lors du chargement des coûts', 'error');
    }
}

// ============================================================================
// FILES
// ============================================================================

async function loadFiles() {
    const container = document.getElementById('filesList');
    container.innerHTML = '<p class="loading">Chargement...</p>';

    try {
        const res = await apiRequest('/files');
        if (!res.success) throw new Error(res.error);

        if (res.files.length === 0) {
            container.innerHTML = '<p>Aucun fichier</p>';
            return;
        }

        const html = `
            <table>
                <thead>
                    <tr>
                        <th>Nom</th>
                        <th>Taille</th>
                        <th>Type</th>
                        <th>Propriétaire</th>
                        <th>Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${res.files.map(file => `
                        <tr>
                            <td>${file.originalName || file.name}</td>
                            <td>${formatBytes(file.size)}</td>
                            <td>${file.contentType}</td>
                            <td>
                                <span class="badge badge-info">${file.ownerType}</span>
                                ${file.uploadedBy || '-'}
                            </td>
                            <td>${formatDate(file.uploadedAt)}</td>
                            <td>
                                <button class="btn-sm btn-danger" onclick="deleteFile('${encodeURIComponent(file.name)}')">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading files:', error);
        container.innerHTML = '<p class="error">Erreur lors du chargement des fichiers</p>';
        showNotification('Erreur lors du chargement des fichiers', 'error');
    }
}

window.deleteFile = async (fileName) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce fichier ?')) return;

    try {
        const res = await apiRequest(`/files/${fileName}`, 'DELETE');
        if (!res.success) throw new Error(res.error);

        showNotification('Fichier supprimé avec succès', 'success');
        loadFiles();
    } catch (error) {
        showNotification('Erreur lors de la suppression', 'error');
    }
};

// ============================================================================
// USERS & GUESTS
// ============================================================================

async function loadUsers() {
    document.getElementById('usersList').innerHTML = '<p>Fonctionnalité en cours de développement</p>';
}

async function loadGuests() {
    document.getElementById('guestsList').innerHTML = '<p>Fonctionnalité en cours de développement</p>';
}

// ============================================================================
// SETTINGS
// ============================================================================

async function loadSettings() {
    try {
        const res = await apiRequest('/settings');
        if (!res.success) throw new Error(res.error);

        const settings = res.settings;
        document.getElementById('maxFileSizeMB').value = settings.maxFileSizeMB?.value || 100;
        document.getElementById('storageQuota').value = settings.storageQuota?.value || 100;
        document.getElementById('maxShareDays').value = settings.maxShareDays?.value || 30;
        document.getElementById('defaultShareMinutes').value = settings.defaultShareMinutes?.value || 60;

    } catch (error) {
        console.error('Error loading settings:', error);
        showNotification('Erreur lors du chargement des paramètres', 'error');
    }
}

// ============================================================================
// MODALS
// ============================================================================

function initModals() {
    // Create Team Modal
    document.getElementById('createTeamBtn').addEventListener('click', () => {
        openModal('createTeamModal');
    });

    document.getElementById('submitCreateTeam').addEventListener('click', createTeam);

    // Close modals
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            closeAllModals();
        });
    });

    // Close on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeAllModals();
            }
        });
    });
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
}

async function createTeam() {
    const name = document.getElementById('teamName').value.trim();
    const displayName = document.getElementById('teamDisplayName').value.trim();
    const description = document.getElementById('teamDescription').value.trim();

    if (!name || !displayName) {
        showNotification('Veuillez remplir tous les champs obligatoires', 'error');
        return;
    }

    try {
        const res = await apiRequest('/teams', 'POST', {
            name,
            displayName,
            description
        });

        if (!res.success) throw new Error(res.error);

        showNotification('Équipe créée avec succès', 'success');
        closeAllModals();
        loadTeams();

        // Reset form
        document.getElementById('teamName').value = '';
        document.getElementById('teamDisplayName').value = '';
        document.getElementById('teamDescription').value = '';

    } catch (error) {
        showNotification(error.message || 'Erreur lors de la création', 'error');
    }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function initEventListeners() {
    // Refresh costs
    document.getElementById('refreshCostsBtn').addEventListener('click', loadCosts);

    // Costs period change
    document.getElementById('costsPeriod').addEventListener('change', loadCosts);

    // Save settings
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

    // Search files
    document.getElementById('searchFiles').addEventListener('input', (e) => {
        // TODO: Implement search
    });

    // Filter files
    document.getElementById('filterOwner').addEventListener('change', (e) => {
        // TODO: Implement filter
    });
}

async function saveSettings() {
    try {
        const settings = {
            maxFileSizeMB: document.getElementById('maxFileSizeMB').value,
            storageQuota: document.getElementById('storageQuota').value,
            maxShareDays: document.getElementById('maxShareDays').value,
            defaultShareMinutes: document.getElementById('defaultShareMinutes').value
        };

        const res = await apiRequest('/settings', 'PUT', settings);
        if (!res.success) throw new Error(res.error);

        showNotification('Paramètres enregistrés avec succès', 'success');

    } catch (error) {
        showNotification('Erreur lors de l\'enregistrement', 'error');
    }
}

// ============================================================================
// API HELPERS
// ============================================================================

async function apiRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Erreur serveur');
    }

    return data;
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR') + ' ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function showNotification(message, type = 'info') {
    const container = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    const icon = type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle';

    notification.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;

    container.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 5000);
}
