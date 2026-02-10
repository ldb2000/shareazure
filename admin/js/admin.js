// Configuration
const API_URL = 'http://localhost:3000/api';

// État de l'application
let currentSection = 'dashboard';
let allFiles = [];
let allShares = [];
let allLogs = [];
let selectedFiles = [];
let currentPage = 1;
let itemsPerPage = 10;

// Charts instances
let uploadsChart = null;
let fileTypesChart = null;

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    initializeLogin();
    initializeNavigation();
    initializeEventListeners();
});

// ============================================
// Navigation
// ============================================

function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            switchSection(section);
        });
    });
}

function switchSection(section) {
    // Mettre à jour la navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-section="${section}"]`).classList.add('active');
    
    // Mettre à jour les sections
    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.remove('active');
    });
    document.getElementById(section).classList.add('active');
    
    // Mettre à jour le titre
    const titles = {
        dashboard: { title: 'Dashboard', subtitle: 'Vue d\'ensemble de l\'activité' },
        files: { title: 'Gestion des fichiers', subtitle: 'Tous les fichiers uploadés' },
        shares: { title: 'Gestion des partages', subtitle: 'Historique des liens de partage' },
        users: { title: 'Gestion des utilisateurs', subtitle: 'Administration des utilisateurs' },
        guests: { title: 'Gestion des invités', subtitle: 'Comptes temporaires pour partenaires' },
        logs: { title: 'Logs système', subtitle: 'Historique des opérations' },
        settings: { title: 'Paramètres', subtitle: 'Configuration de l\'application' }
    };
    
    document.getElementById('pageTitle').textContent = titles[section].title;
    document.getElementById('pageSubtitle').textContent = titles[section].subtitle;
    
    currentSection = section;
    
    // Charger les données de la section
    loadSectionData(section);
}

function loadSectionData(section) {
    switch(section) {
        case 'dashboard':
            loadDashboard();
            break;
        case 'files':
            loadFiles();
            break;
        case 'shares':
            loadShares();
            break;
        case 'guests':
            loadGuests();
            break;
        case 'logs':
            loadLogs();
            break;
        case 'settings':
            loadSettings();
            loadEmailDomains();
            break;
    }
}

// ============================================
// Authentication
// ============================================

function checkAuthStatus() {
    const token = localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken');
    if (token) {
        verifyToken(token).then(valid => {
            if (valid) {
                showAdminInterface();
            } else {
                showLoginScreen();
            }
        }).catch(() => {
            showLoginScreen();
        });
    } else {
        showLoginScreen();
    }
}

function showLoginScreen() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminInterface').style.display = 'none';
}

function showAdminInterface() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminInterface').style.display = 'block';
    loadDashboard();
    checkHealth();
}

function initializeLogin() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleLogin();
        });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

async function handleLogin() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('rememberMe').checked;
    const errorDiv = document.getElementById('loginError');
    const errorMessage = document.getElementById('loginErrorMessage');
    const loginForm = document.getElementById('loginForm');
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;

    // Réinitialiser les erreurs
    errorDiv.style.display = 'none';
    errorMessage.textContent = '';
    
    // Désactiver le bouton et afficher le chargement
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connexion...';

    try {
        const response = await fetch(`${API_URL}/admin/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success && data.token) {
            // Stocker le token
            if (rememberMe) {
                localStorage.setItem('adminToken', data.token);
                localStorage.setItem('adminUser', JSON.stringify(data.user));
            } else {
                sessionStorage.setItem('adminToken', data.token);
                sessionStorage.setItem('adminUser', JSON.stringify(data.user));
            }

            // Mettre à jour le nom d'utilisateur dans l'interface
            const userNameElement = document.getElementById('currentUserName');
            if (userNameElement) {
                userNameElement.textContent = data.user.name || data.user.username;
            }

            // Afficher l'interface admin
            showAdminInterface();
        } else {
            // Afficher l'erreur
            errorMessage.textContent = data.error || 'Erreur de connexion';
            errorDiv.style.display = 'flex';
            loginForm.querySelector('input[type="password"]').value = '';
        }
    } catch (error) {
        console.error('Erreur login:', error);
        errorMessage.textContent = 'Erreur de connexion au serveur';
        errorDiv.style.display = 'flex';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

async function verifyToken(token) {
    try {
        const response = await fetch(`${API_URL}/admin/verify`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        return data.success === true;
    } catch (error) {
        console.error('Erreur vérification token:', error);
        return false;
    }
}

function handleLogout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    sessionStorage.removeItem('adminToken');
    sessionStorage.removeItem('adminUser');
    showLoginScreen();
    
    // Réinitialiser le formulaire
    document.getElementById('loginForm').reset();
}

// Fonction helper pour ajouter le token aux requêtes API
function getAuthHeaders() {
    const token = localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// ============================================
// Event Listeners
// ============================================

function initializeEventListeners() {
    // Header buttons
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadSectionData(currentSection);
        showNotification('Données actualisées', 'success');
    });
    
    // Files section
    document.getElementById('fileSearchInput')?.addEventListener('input', filterFiles);
    document.getElementById('fileTypeFilter')?.addEventListener('change', filterFiles);
    document.getElementById('fileSortBy')?.addEventListener('change', sortFiles);
    document.getElementById('selectAllFiles')?.addEventListener('change', toggleSelectAllFiles);
    document.getElementById('deleteSelectedBtn')?.addEventListener('click', deleteSelectedFiles);
    
    // Shares section
    document.getElementById('shareSearchInput')?.addEventListener('input', filterShares);
    document.getElementById('shareStatusFilter')?.addEventListener('change', filterShares);
    document.getElementById('exportSharesBtn')?.addEventListener('click', exportSharesCSV);
    
    // Logs section
    document.getElementById('logLevelFilter')?.addEventListener('change', filterLogs);
    document.getElementById('logOperationFilter')?.addEventListener('change', filterLogs);
    document.getElementById('clearLogsBtn')?.addEventListener('click', clearLogs);
    document.getElementById('exportLogsBtn')?.addEventListener('click', exportLogs);
    
    // Settings
    document.getElementById('saveSettingsBtn')?.addEventListener('click', saveSettings);
    document.getElementById('resetSettingsBtn')?.addEventListener('click', resetSettings);
    document.getElementById('addEmailDomainBtn')?.addEventListener('click', addEmailDomain);
    document.getElementById('newEmailDomainInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addEmailDomain();
        }
    });
    
    // Modals
    document.getElementById('closeFileDetailsBtn')?.addEventListener('click', () => {
        document.getElementById('fileDetailsModal').style.display = 'none';
    });
    
    document.getElementById('confirmNoBtn')?.addEventListener('click', () => {
        document.getElementById('confirmModal').style.display = 'none';
    });
}

// ============================================
// Dashboard
// ============================================

async function loadDashboard() {
    try {
        // Charger les fichiers pour les stats
        const files = await fetchFiles();
        
        // Calculer les statistiques
        const stats = calculateStats(files);
        
        // Mettre à jour les cartes de stats
        document.getElementById('statTotalFiles').textContent = stats.totalFiles;
        document.getElementById('statTotalSize').textContent = formatBytes(stats.totalSize);
        document.getElementById('statActiveShares').textContent = stats.activeShares;
        document.getElementById('statDownloads').textContent = stats.downloads;
        
        // Créer les graphiques
        createUploadsChart(stats.uploadsByDay);
        createFileTypesChart(stats.filesByType);
        
        // Charger l'activité récente
        loadRecentActivity(files);
        
    } catch (error) {
        console.error('Erreur chargement dashboard:', error);
        showNotification('Erreur lors du chargement du dashboard', 'error');
    }
}

function calculateStats(files) {
    const now = new Date();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    
    // Stats globales
    const totalFiles = files.length;
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
    
    // Uploads par jour (7 derniers jours)
    const uploadsByDay = {};
    for (let i = 6; i >= 0; i--) {
        const date = new Date(now - i * 24 * 60 * 60 * 1000);
        const dateKey = date.toISOString().split('T')[0];
        uploadsByDay[dateKey] = 0;
    }
    
    files.forEach(file => {
        const fileDate = new Date(file.lastModified);
        const dateKey = fileDate.toISOString().split('T')[0];
        if (uploadsByDay.hasOwnProperty(dateKey)) {
            uploadsByDay[dateKey]++;
        }
    });
    
    // Types de fichiers
    const filesByType = {};
    files.forEach(file => {
        const type = getFileCategory(file.contentType);
        filesByType[type] = (filesByType[type] || 0) + 1;
    });
    
    return {
        totalFiles,
        totalSize,
        activeShares: Math.floor(Math.random() * 20), // Simulé pour l'instant
        downloads: Math.floor(Math.random() * 100), // Simulé pour l'instant
        uploadsByDay,
        filesByType
    };
}

function createUploadsChart(uploadsByDay) {
    const ctx = document.getElementById('uploadsChart');
    if (!ctx) return;
    
    // Détruire le graphique existant
    if (uploadsChart) {
        uploadsChart.destroy();
    }
    
    const labels = Object.keys(uploadsByDay).map(date => {
        const d = new Date(date);
        return d.toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' });
    });
    
    const data = Object.values(uploadsByDay);
    
    uploadsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Uploads',
                data: data,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

function createFileTypesChart(filesByType) {
    const ctx = document.getElementById('fileTypesChart');
    if (!ctx) return;
    
    // Détruire le graphique existant
    if (fileTypesChart) {
        fileTypesChart.destroy();
    }
    
    const colors = {
        'Images': '#10b981',
        'Documents': '#3b82f6',
        'PDF': '#ef4444',
        'Vidéos': '#f59e0b',
        'Audio': '#8b5cf6',
        'Autres': '#64748b'
    };
    
    fileTypesChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(filesByType),
            datasets: [{
                data: Object.values(filesByType),
                backgroundColor: Object.keys(filesByType).map(type => colors[type] || '#64748b')
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right'
                }
            }
        }
    });
}

function loadRecentActivity(files) {
    const container = document.getElementById('recentActivity');
    if (!container) return;
    
    // Prendre les 10 derniers fichiers
    const recentFiles = files
        .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))
        .slice(0, 10);
    
    if (recentFiles.length === 0) {
        container.innerHTML = '<p class="loading">Aucune activité récente</p>';
        return;
    }
    
    container.innerHTML = recentFiles.map(file => {
        const icon = getFileIcon(file.contentType);
        const time = formatTimeAgo(file.lastModified);
        
        return `
            <div class="activity-item">
                <div class="activity-icon">${icon}</div>
                <div class="activity-content">
                    <p class="activity-title">Fichier uploadé</p>
                    <p class="activity-details">${file.metadata?.originalName || file.name}</p>
                </div>
                <div class="activity-time">${time}</div>
            </div>
        `;
    }).join('');
}

// ============================================
// Files Management
// ============================================

async function loadFiles() {
    try {
        const files = await fetchFiles();
        allFiles = files;
        renderFilesTable(files);
    } catch (error) {
        console.error('Erreur chargement fichiers:', error);
        showNotification('Erreur lors du chargement des fichiers', 'error');
    }
}

async function fetchFiles() {
    const response = await fetch(`${API_URL}/files`);
    if (!response.ok) throw new Error('Erreur de chargement');
    const data = await response.json();
    return data.files || [];
}

function renderFilesTable(files) {
    const tbody = document.getElementById('filesTableBody');
    if (!tbody) return;
    
    if (files.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Aucun fichier</td></tr>';
        return;
    }
    
    tbody.innerHTML = files.map(file => {
        const icon = getFileIcon(file.contentType);
        const category = getFileCategory(file.contentType);
        const size = formatBytes(file.size);
        const date = new Date(file.lastModified).toLocaleString('fr-FR');
        
        return `
            <tr>
                <td><input type="checkbox" class="file-checkbox" data-blob-name="${file.name}"></td>
                <td>
                    <div class="file-name">
                        <span class="file-icon">${icon}</span>
                        <span class="file-name-text">${file.metadata?.originalName || file.name}</span>
                    </div>
                </td>
                <td>${category}</td>
                <td>${size}</td>
                <td>${date}</td>
                <td><span class="status-badge active">0 partages</span></td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-small btn-secondary" onclick="viewFileDetails('${file.name}')">
                            👁️ Voir
                        </button>
                        <button class="btn btn-small btn-danger" onclick="deleteFile('${file.name}')">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    // Ajouter les event listeners pour les checkboxes
    document.querySelectorAll('.file-checkbox').forEach(cb => {
        cb.addEventListener('change', updateSelectedFiles);
    });
}

function filterFiles() {
    const searchTerm = document.getElementById('fileSearchInput').value.toLowerCase();
    const typeFilter = document.getElementById('fileTypeFilter').value;
    
    let filtered = allFiles.filter(file => {
        const matchesSearch = (file.metadata?.originalName || file.name).toLowerCase().includes(searchTerm);
        const matchesType = !typeFilter || getFileCategory(file.contentType) === typeFilter;
        return matchesSearch && matchesType;
    });
    
    renderFilesTable(filtered);
}

function sortFiles() {
    const sortBy = document.getElementById('fileSortBy').value;
    
    let sorted = [...allFiles];
    
    switch(sortBy) {
        case 'date-desc':
            sorted.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
            break;
        case 'date-asc':
            sorted.sort((a, b) => new Date(a.lastModified) - new Date(b.lastModified));
            break;
        case 'size-desc':
            sorted.sort((a, b) => b.size - a.size);
            break;
        case 'size-asc':
            sorted.sort((a, b) => a.size - b.size);
            break;
        case 'name-asc':
            sorted.sort((a, b) => (a.metadata?.originalName || a.name).localeCompare(b.metadata?.originalName || b.name));
            break;
        case 'name-desc':
            sorted.sort((a, b) => (b.metadata?.originalName || b.name).localeCompare(a.metadata?.originalName || a.name));
            break;
    }
    
    renderFilesTable(sorted);
}

function toggleSelectAllFiles(e) {
    const checkboxes = document.querySelectorAll('.file-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
    updateSelectedFiles();
}

function updateSelectedFiles() {
    const checkboxes = document.querySelectorAll('.file-checkbox:checked');
    selectedFiles = Array.from(checkboxes).map(cb => cb.dataset.blobName);
    document.getElementById('deleteSelectedBtn').disabled = selectedFiles.length === 0;
}

async function deleteFile(blobName) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce fichier ?')) return;
    
    try {
        const response = await fetch(`${API_URL}/files/${blobName}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Erreur de suppression');
        
        showNotification('Fichier supprimé avec succès', 'success');
        loadFiles();
    } catch (error) {
        console.error('Erreur suppression:', error);
        showNotification('Erreur lors de la suppression', 'error');
    }
}

async function deleteSelectedFiles() {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${selectedFiles.length} fichier(s) ?`)) return;
    
    try {
        for (const blobName of selectedFiles) {
            await fetch(`${API_URL}/files/${blobName}`, { method: 'DELETE' });
        }
        
        showNotification(`${selectedFiles.length} fichier(s) supprimé(s)`, 'success');
        selectedFiles = [];
        loadFiles();
    } catch (error) {
        console.error('Erreur suppression multiple:', error);
        showNotification('Erreur lors de la suppression', 'error');
    }
}

function viewFileDetails(blobName) {
    const file = allFiles.find(f => f.name === blobName);
    if (!file) return;
    
    const modal = document.getElementById('fileDetailsModal');
    const body = document.getElementById('fileDetailsBody');
    
    const icon = getFileIcon(file.contentType);
    
    body.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <div style="font-size: 64px; margin-bottom: 20px;">${icon}</div>
            <h4 style="margin-bottom: 20px;">${file.metadata?.originalName || file.name}</h4>
            <div style="text-align: left; max-width: 500px; margin: 0 auto;">
                <p><strong>Nom du blob:</strong> ${file.name}</p>
                <p><strong>Type:</strong> ${file.contentType}</p>
                <p><strong>Taille:</strong> ${formatBytes(file.size)}</p>
                <p><strong>Uploadé le:</strong> ${new Date(file.lastModified).toLocaleString('fr-FR')}</p>
                <p><strong>Catégorie:</strong> ${getFileCategory(file.contentType)}</p>
            </div>
            <div style="margin-top: 30px; display: flex; gap: 12px; justify-content: center;">
                <button class="btn btn-primary" onclick="downloadFile('${file.name}')">
                    ⬇️ Télécharger
                </button>
                <button class="btn btn-secondary" onclick="previewFile('${file.name}')">
                    👁️ Aperçu
                </button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

async function downloadFile(blobName) {
    window.open(`${API_URL}/download/${blobName}`, '_blank');
}

async function previewFile(blobName) {
    window.open(`${API_URL}/preview/${blobName}`, '_blank');
}

// ============================================
// Shares Management
// ============================================

async function loadShares() {
    // Pour l'instant, on simule des données
    // TODO: Implémenter un endpoint backend pour récupérer l'historique
    allShares = generateMockShares();
    renderSharesTable(allShares);
}

function generateMockShares() {
    // Données simulées pour démonstration
    return allFiles.slice(0, 5).map((file, index) => ({
        id: `share-${index}`,
        fileName: file.metadata?.originalName || file.name,
        blobName: file.name,
        createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + Math.random() * 7 * 24 * 60 * 60 * 1000),
        downloads: Math.floor(Math.random() * 20),
        status: Math.random() > 0.5 ? 'active' : 'expired'
    }));
}

function renderSharesTable(shares) {
    const tbody = document.getElementById('sharesTableBody');
    if (!tbody) return;
    
    if (shares.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">Aucun partage</td></tr>';
        return;
    }
    
    tbody.innerHTML = shares.map(share => {
        const createdDate = new Date(share.createdAt).toLocaleString('fr-FR');
        const expiresDate = new Date(share.expiresAt).toLocaleString('fr-FR');
        const statusClass = share.status === 'active' ? 'active' : 'expired';
        const statusText = share.status === 'active' ? 'Actif' : 'Expiré';
        
        return `
            <tr>
                <td>${share.fileName}</td>
                <td>${createdDate}</td>
                <td>${expiresDate}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${share.downloads}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-small btn-secondary" onclick="copyShareLink('${share.id}')">
                            📋 Copier
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function filterShares() {
    const searchTerm = document.getElementById('shareSearchInput').value.toLowerCase();
    const statusFilter = document.getElementById('shareStatusFilter').value;
    
    let filtered = allShares.filter(share => {
        const matchesSearch = share.fileName.toLowerCase().includes(searchTerm);
        const matchesStatus = !statusFilter || share.status === statusFilter;
        return matchesSearch && matchesStatus;
    });
    
    renderSharesTable(filtered);
}

function exportSharesCSV() {
    const headers = ['Fichier', 'Créé le', 'Expire le', 'Statut', 'Téléchargements'];
    const rows = allShares.map(share => [
        share.fileName,
        new Date(share.createdAt).toISOString(),
        new Date(share.expiresAt).toISOString(),
        share.status,
        share.downloads
    ]);
    
    const csv = [headers, ...rows]
        .map(row => row.join(','))
        .join('\n');
    
    downloadCSV(csv, 'partages.csv');
}

function copyShareLink(shareId) {
    // Simulé pour l'instant
    showNotification('Lien copié dans le presse-papiers', 'success');
}

// ============================================
// Logs Management
// ============================================

async function loadLogs() {
    // Générer des logs simulés
    allLogs = generateMockLogs();
    renderLogs(allLogs);
}

function generateMockLogs() {
    const operations = ['upload', 'download', 'delete', 'share'];
    const levels = ['info', 'warning', 'error'];
    
    return Array.from({ length: 50 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 60 * 1000),
        level: levels[Math.floor(Math.random() * levels.length)],
        operation: operations[Math.floor(Math.random() * operations.length)],
        message: `Operation ${operations[Math.floor(Math.random() * operations.length)]} completed`,
        details: { user: 'admin', ip: '192.168.1.1' }
    }));
}

function renderLogs(logs) {
    const container = document.getElementById('logsContainer');
    if (!container) return;
    
    if (logs.length === 0) {
        container.innerHTML = '<p class="loading">Aucun log</p>';
        return;
    }
    
    container.innerHTML = logs.map(log => {
        const time = new Date(log.timestamp).toLocaleString('fr-FR');
        return `
            <div class="log-entry ${log.level}">
                <span class="log-timestamp">${time}</span>
                <span class="log-level">${log.level}</span>
                <span class="log-message">${log.operation}: ${log.message}</span>
            </div>
        `;
    }).join('');
}

function filterLogs() {
    const levelFilter = document.getElementById('logLevelFilter').value;
    const operationFilter = document.getElementById('logOperationFilter').value;
    
    let filtered = allLogs.filter(log => {
        const matchesLevel = !levelFilter || log.level === levelFilter;
        const matchesOperation = !operationFilter || log.operation === operationFilter;
        return matchesLevel && matchesOperation;
    });
    
    renderLogs(filtered);
}

function clearLogs() {
    if (!confirm('Êtes-vous sûr de vouloir effacer tous les logs ?')) return;
    allLogs = [];
    renderLogs(allLogs);
    showNotification('Logs effacés', 'success');
}

function exportLogs() {
    const logsText = allLogs.map(log => 
        `[${new Date(log.timestamp).toISOString()}] ${log.level.toUpperCase()} - ${log.operation}: ${log.message}`
    ).join('\n');
    
    downloadText(logsText, 'logs.txt');
}

// ============================================
// Settings
// ============================================

async function loadSettings() {
    try {
        const response = await fetch(`${API_URL}/settings`);
        const data = await response.json();
        
        if (data.success) {
            const settings = data.settings;
            
            // Remplir les champs du formulaire
            if (settings.maxFileSizeMB) document.getElementById('maxFileSizeMB').value = settings.maxFileSizeMB.value;
            if (settings.containerName) document.getElementById('containerName').value = settings.containerName.value;
            if (settings.storageQuota) document.getElementById('storageQuota').value = settings.storageQuota.value;
            if (settings.maxShareDays) document.getElementById('maxShareDays').value = settings.maxShareDays.value;
            if (settings.defaultShareMinutes) document.getElementById('defaultShareMinutes').value = settings.defaultShareMinutes.value;
            if (settings.requirePassword) document.getElementById('requirePassword').checked = settings.requirePassword.value === 'true';
            if (settings.rateLimit) document.getElementById('rateLimit').value = settings.rateLimit.value;
            if (settings.enableLogs) document.getElementById('enableLogs').checked = settings.enableLogs.value === 'true';
            if (settings.enableAudit) document.getElementById('enableAudit').checked = settings.enableAudit.value === 'true';
            if (settings.notifyUploads) document.getElementById('notifyUploads').checked = settings.notifyUploads.value === 'true';
            if (settings.notifyShares) document.getElementById('notifyShares').checked = settings.notifyShares.value === 'true';
            if (settings.notifyQuota) document.getElementById('notifyQuota').checked = settings.notifyQuota.value === 'true';
        }
    } catch (error) {
        console.error('Erreur lors du chargement des paramètres:', error);
        showNotification('Erreur lors du chargement des paramètres', 'error');
    }
}

async function saveSettings() {
    // Récupérer les valeurs
    const settings = {
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
    };
    
    try {
        const response = await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Paramètres enregistrés avec succès', 'success');
        } else {
            showNotification(`Erreur: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des paramètres:', error);
        showNotification('Erreur lors de la sauvegarde des paramètres', 'error');
    }
}

async function resetSettings() {
    if (!confirm('Êtes-vous sûr de vouloir réinitialiser tous les paramètres ?')) return;
    
    try {
        const response = await fetch(`${API_URL}/settings/reset`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Recharger les paramètres depuis le serveur
            await loadSettings();
            showNotification('Paramètres réinitialisés', 'success');
        } else {
            showNotification(`Erreur: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Erreur lors de la réinitialisation:', error);
        showNotification('Erreur lors de la réinitialisation des paramètres', 'error');
    }
}

// ============================================
// Email Domains Management
// ============================================

async function loadEmailDomains() {
    try {
        const response = await fetch(`${API_URL}/admin/email-domains`, {
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderEmailDomains(data.domains || []);
        } else {
            document.getElementById('emailDomainsList').innerHTML = '<p style="color: #ef4444;">Erreur lors du chargement</p>';
        }
    } catch (error) {
        console.error('Erreur lors du chargement des domaines:', error);
        document.getElementById('emailDomainsList').innerHTML = '<p style="color: #ef4444;">Erreur lors du chargement</p>';
    }
}

function renderEmailDomains(domains) {
    const container = document.getElementById('emailDomainsList');
    
    if (domains.length === 0) {
        container.innerHTML = '<p style="color: #666; font-style: italic;">Aucun domaine autorisé. Ajoutez-en un pour permettre les partages.</p>';
        return;
    }
    
    container.innerHTML = domains.map(domain => `
        <div class="email-domain-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background: #f5f5f5; border-radius: 6px; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: 600; color: #003C61;">${escapeHtml(domain.domain)}</span>
                ${domain.is_active === 1 ? 
                    '<span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem;">Actif</span>' : 
                    '<span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem;">Inactif</span>'
                }
                <span style="color: #666; font-size: 0.875rem;">Ajouté le ${new Date(domain.created_at).toLocaleDateString('fr-FR')}</span>
            </div>
            <div style="display: flex; gap: 5px;">
                ${domain.is_active === 1 ? 
                    `<button class="btn btn-secondary btn-small" onclick="deactivateEmailDomain('${domain.domain}')" title="Désactiver">
                        <i class="fas fa-ban"></i>
                    </button>` :
                    `<button class="btn btn-primary btn-small" onclick="activateEmailDomain('${domain.domain}')" title="Activer">
                        <i class="fas fa-check"></i>
                    </button>`
                }
                <button class="btn btn-danger btn-small" onclick="deleteEmailDomain('${domain.domain}')" title="Supprimer">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function addEmailDomain() {
    const domainInput = document.getElementById('newEmailDomainInput');
    const domain = domainInput.value.trim();
    
    if (!domain) {
        showNotification('Veuillez entrer un domaine', 'error');
        return;
    }
    
    // Validation basique du domaine
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
        showNotification('Format de domaine invalide', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/admin/email-domains`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify({ domain })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Domaine ajouté avec succès', 'success');
            domainInput.value = '';
            loadEmailDomains();
        } else {
            showNotification(`Erreur: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Erreur lors de l\'ajout du domaine:', error);
        showNotification('Erreur lors de l\'ajout du domaine', 'error');
    }
}

async function deleteEmailDomain(domain) {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le domaine "${domain}" ?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/admin/email-domains/${encodeURIComponent(domain)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Domaine supprimé avec succès', 'success');
            loadEmailDomains();
        } else {
            showNotification(`Erreur: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Erreur lors de la suppression du domaine:', error);
        showNotification('Erreur lors de la suppression du domaine', 'error');
    }
}

async function activateEmailDomain(domain) {
    try {
        const response = await fetch(`${API_URL}/admin/email-domains/${encodeURIComponent(domain)}/activate`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Domaine activé avec succès', 'success');
            loadEmailDomains();
        } else {
            showNotification(`Erreur: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Erreur lors de l\'activation du domaine:', error);
        showNotification('Erreur lors de l\'activation du domaine', 'error');
    }
}

async function deactivateEmailDomain(domain) {
    try {
        const response = await fetch(`${API_URL}/admin/email-domains/${encodeURIComponent(domain)}/deactivate`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Domaine désactivé avec succès', 'success');
            loadEmailDomains();
        } else {
            showNotification(`Erreur: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Erreur lors de la désactivation du domaine:', error);
        showNotification('Erreur lors de la désactivation du domaine', 'error');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Fonction helper pour obtenir le token
function getAuthToken() {
    return localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken');
}

// ============================================
// Utility Functions
// ============================================

async function checkHealth() {
    try {
        const response = await fetch(`${API_URL}/health`);
        if (response.ok) {
            console.log('✅ API Health OK');
        }
    } catch (error) {
        console.error('❌ API Health Error:', error);
    }
}

function getFileIcon(contentType) {
    if (!contentType) return '📄';
    
    if (contentType.startsWith('image/')) return '🖼️';
    if (contentType.startsWith('video/')) return '🎬';
    if (contentType.startsWith('audio/')) return '🎵';
    if (contentType === 'application/pdf') return '📕';
    if (contentType.includes('word') || contentType.includes('document')) return '📝';
    if (contentType.includes('excel') || contentType.includes('spreadsheet')) return '📊';
    if (contentType.includes('powerpoint') || contentType.includes('presentation')) return '📊';
    if (contentType.includes('zip') || contentType.includes('compressed')) return '📦';
    
    return '📄';
}

function getFileCategory(contentType) {
    if (!contentType) return 'Autres';
    
    if (contentType.startsWith('image/')) return 'Images';
    if (contentType.startsWith('video/')) return 'Vidéos';
    if (contentType.startsWith('audio/')) return 'Audio';
    if (contentType === 'application/pdf') return 'PDF';
    if (contentType.includes('word') || contentType.includes('document') || 
        contentType.includes('text') || contentType.includes('excel') || 
        contentType.includes('powerpoint')) return 'Documents';
    
    return 'Autres';
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    const intervals = {
        'an': 31536000,
        'mois': 2592000,
        'jour': 86400,
        'heure': 3600,
        'minute': 60,
        'seconde': 1
    };
    
    for (const [name, secondsInInterval] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInInterval);
        
        if (interval >= 1) {
            return `Il y a ${interval} ${name}${interval > 1 ? 's' : ''}`;
        }
    }
    
    return 'À l\'instant';
}

function showNotification(message, type = 'info') {
    // Créer une notification temporaire
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 16px 24px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}

function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Styles pour les animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// ============================================
// GUEST MANAGEMENT
// ============================================

let allGuests = [];

// Charger les invités
async function loadGuests() {
    try {
        const response = await fetch(`${API_URL}/admin/guest-accounts`, {
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            allGuests = data.guests || [];
            updateGuestsStats(data.stats || {});
            renderGuestsTable(allGuests);
        } else {
            showNotification('Erreur lors du chargement des invités', 'error');
        }
    } catch (error) {
        console.error('Erreur lors du chargement des invités:', error);
        showNotification('Erreur de connexion au serveur', 'error');
    }
}

// Mettre à jour les statistiques
function updateGuestsStats(stats) {
    document.getElementById('totalGuestsCount').textContent = stats.total || 0;
    document.getElementById('activeGuestsCount').textContent = stats.active || 0;
    
    // Calculer les invités expirant bientôt (< 24h)
    const expiringSoon = allGuests.filter(g => {
        if (!g.is_active || g.isExpired) return false;
        return g.hoursRemaining > 0 && g.hoursRemaining <= 24;
    }).length;
    
    document.getElementById('expiringSoonCount').textContent = expiringSoon;
    document.getElementById('disabledGuestsCount').textContent = stats.disabled || 0;
}

// Afficher la table des invités
function renderGuestsTable(guests) {
    const tbody = document.getElementById('guestsTableBody');
    
    if (guests.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="table-empty">
                    <i class="fas fa-user-clock" style="font-size: 3rem; opacity: 0.3;"></i>
                    <p>Aucun invité trouvé</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = guests.map(guest => {
        const statusBadge = getGuestStatusBadge(guest);
        const timeRemaining = formatTimeRemaining(guest);
        
        return `
            <tr>
                <td>
                    <strong>${escapeHtml(guest.email)}</strong>
                    ${guest.code_used === 1 ? '<span class="badge badge-success">Code utilisé</span>' : '<span class="badge badge-warning">En attente</span>'}
                </td>
                <td>${escapeHtml(guest.creator_username || 'N/A')}</td>
                <td>
                    <span class="badge badge-info">${guest.file_count || 0} fichier(s)</span>
                </td>
                <td>${formatDate(guest.created_at)}</td>
                <td>${formatDate(guest.account_expires_at)}</td>
                <td>${timeRemaining}</td>
                <td>${statusBadge}</td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn btn-icon btn-small" onclick="viewGuestDetails('${guest.guest_id}')" title="Détails">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${guest.is_active === 1 ? 
                            `<button class="btn btn-icon btn-small btn-warning" onclick="disableGuest('${guest.guest_id}', '${escapeHtml(guest.email)}')" title="Désactiver">
                                <i class="fas fa-ban"></i>
                            </button>` : ''
                        }
                        <button class="btn btn-icon btn-small btn-danger" onclick="deleteGuest('${guest.guest_id}', '${escapeHtml(guest.email)}')" title="Supprimer">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Obtenir le badge de statut
function getGuestStatusBadge(guest) {
    if (!guest.is_active) {
        return '<span class="badge badge-danger">Désactivé</span>';
    }
    if (guest.isExpired) {
        return '<span class="badge badge-danger">Expiré</span>';
    }
    if (guest.hoursRemaining <= 24) {
        return '<span class="badge badge-warning">Expire bientôt</span>';
    }
    return '<span class="badge badge-success">Actif</span>';
}

// Formater le temps restant
function formatTimeRemaining(guest) {
    if (!guest.is_active) {
        return '<span style="color: #ef4444;">Désactivé</span>';
    }
    if (guest.isExpired) {
        return '<span style="color: #ef4444;">Expiré</span>';
    }
    
    const days = guest.daysRemaining;
    const hours = guest.hoursRemaining;
    
    if (days > 0) {
        return `<span style="color: ${days <= 1 ? '#f59e0b' : '#10b981'};">${days} jour(s)</span>`;
    }
    if (hours > 0) {
        return `<span style="color: #f59e0b;">${hours}h restantes</span>`;
    }
    return '<span style="color: #ef4444;">Expire bientôt</span>';
}

// Créer un invité
async function createGuest() {
    const email = document.getElementById('guestEmail').value.trim();
    
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        showCreateGuestError('Email invalide');
        return;
    }
    
    const btn = document.getElementById('submitCreateGuestBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Création...';
    
    try {
        const response = await fetch(`${API_URL}/admin/guest-accounts`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (data.success) {
            closeModal('createGuestModal');
            showNotification(data.message, 'success');
            
            // Afficher le code si l'email n'a pas été envoyé
            if (!data.guest.emailSent && data.message.includes('Code:')) {
                const code = data.message.split('Code: ')[1];
                showNotification(`Code de vérification : ${code} (copié dans le presse-papier)`, 'info', 10000);
                navigator.clipboard.writeText(code).catch(() => {});
            }
            
            loadGuests();
        } else {
            showCreateGuestError(data.error || 'Erreur lors de la création');
        }
    } catch (error) {
        console.error('Erreur création invité:', error);
        showCreateGuestError('Erreur de connexion au serveur');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Afficher erreur de création
function showCreateGuestError(message) {
    const errorEl = document.getElementById('createGuestError');
    const messageEl = document.getElementById('createGuestErrorMessage');
    messageEl.textContent = message;
    errorEl.style.display = 'block';
    
    setTimeout(() => {
        errorEl.style.display = 'none';
    }, 5000);
}

// Désactiver un invité
async function disableGuest(guestId, email) {
    const confirmed = await showConfirmDialog(
        'Désactiver l\'invité',
        `Êtes-vous sûr de vouloir désactiver le compte de ${email} ?`
    );
    
    if (!confirmed) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/guest-accounts/${guestId}/disable`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Invité désactivé avec succès', 'success');
            loadGuests();
        } else {
            showNotification(data.error || 'Erreur lors de la désactivation', 'error');
        }
    } catch (error) {
        console.error('Erreur désactivation invité:', error);
        showNotification('Erreur de connexion au serveur', 'error');
    }
}

// Supprimer un invité
async function deleteGuest(guestId, email) {
    const confirmed = await showConfirmDialog(
        'Supprimer l\'invité',
        `Êtes-vous sûr de vouloir supprimer définitivement le compte de ${email} et tous ses fichiers ?`
    );
    
    if (!confirmed) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/guest-accounts/${guestId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getAuthToken()}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`Invité supprimé (${data.stats.filesDeleted} fichier(s) supprimé(s))`, 'success');
            loadGuests();
        } else {
            showNotification(data.error || 'Erreur lors de la suppression', 'error');
        }
    } catch (error) {
        console.error('Erreur suppression invité:', error);
        showNotification('Erreur de connexion au serveur', 'error');
    }
}

// Voir les détails d'un invité
function viewGuestDetails(guestId) {
    const guest = allGuests.find(g => g.guest_id === guestId);
    if (!guest) return;
    
    const detailsBody = document.getElementById('guestDetailsBody');
    detailsBody.innerHTML = `
        <div style="display: grid; gap: 1.5rem;">
            <div class="detail-section">
                <h4 style="margin: 0 0 1rem 0; color: #003C61;">
                    <i class="fas fa-info-circle"></i> Informations générales
                </h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <label>Email</label>
                        <span>${escapeHtml(guest.email)}</span>
                    </div>
                    <div class="detail-item">
                        <label>Guest ID</label>
                        <span style="font-family: monospace; font-size: 0.9rem;">${guest.guest_id}</span>
                    </div>
                    <div class="detail-item">
                        <label>Créé par</label>
                        <span>${escapeHtml(guest.creator_username || 'N/A')}</span>
                    </div>
                    <div class="detail-item">
                        <label>Date de création</label>
                        <span>${formatDate(guest.created_at)}</span>
                    </div>
                </div>
            </div>
            
            <div class="detail-section">
                <h4 style="margin: 0 0 1rem 0; color: #003C61;">
                    <i class="fas fa-clock"></i> Expiration
                </h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <label>Expire le</label>
                        <span>${formatDate(guest.account_expires_at)}</span>
                    </div>
                    <div class="detail-item">
                        <label>Temps restant</label>
                        <span>${formatTimeRemaining(guest)}</span>
                    </div>
                    <div class="detail-item">
                        <label>Code utilisé</label>
                        <span>${guest.code_used === 1 ? '✅ Oui' : '❌ Non'}</span>
                    </div>
                    <div class="detail-item">
                        <label>Statut</label>
                        <span>${getGuestStatusBadge(guest)}</span>
                    </div>
                </div>
            </div>
            
            <div class="detail-section">
                <h4 style="margin: 0 0 1rem 0; color: #003C61;">
                    <i class="fas fa-file"></i> Fichiers
                </h4>
                <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
                    <div class="stat-card stat-info">
                        <div class="stat-icon">
                            <i class="fas fa-file-upload"></i>
                        </div>
                        <div class="stat-details">
                            <p class="stat-label">Fichiers uploadés</p>
                            <p class="stat-value">${guest.file_count || 0}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    showModal('guestDetailsModal');
}

// Filtrer les invités
function filterGuests() {
    const statusFilter = document.getElementById('guestStatusFilter').value;
    const searchTerm = document.getElementById('guestSearch').value.toLowerCase();
    
    let filtered = allGuests;
    
    // Filtrer par statut
    if (statusFilter) {
        filtered = filtered.filter(guest => {
            switch(statusFilter) {
                case 'active':
                    return guest.is_active === 1 && !guest.isExpired;
                case 'expired':
                    return guest.isExpired;
                case 'disabled':
                    return guest.is_active === 0;
                default:
                    return true;
            }
        });
    }
    
    // Filtrer par recherche
    if (searchTerm) {
        filtered = filtered.filter(guest =>
            guest.email.toLowerCase().includes(searchTerm) ||
            (guest.creator_username || '').toLowerCase().includes(searchTerm)
        );
    }
    
    renderGuestsTable(filtered);
}

// Event listeners pour les invités
document.addEventListener('DOMContentLoaded', () => {
    // Bouton créer invité
    const createGuestBtn = document.getElementById('createGuestBtn');
    if (createGuestBtn) {
        createGuestBtn.addEventListener('click', () => {
            document.getElementById('guestEmail').value = '';
            document.getElementById('createGuestError').style.display = 'none';
            showModal('createGuestModal');
        });
    }
    
    // Bouton soumettre création
    const submitCreateGuestBtn = document.getElementById('submitCreateGuestBtn');
    if (submitCreateGuestBtn) {
        submitCreateGuestBtn.addEventListener('click', createGuest);
    }
    
    // Enter key dans le formulaire
    const guestEmailInput = document.getElementById('guestEmail');
    if (guestEmailInput) {
        guestEmailInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                createGuest();
            }
        });
    }
    
    // Boutons fermer modal
    ['closeCreateGuestBtn', 'cancelCreateGuestBtn'].forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', () => closeModal('createGuestModal'));
        }
    });
    
    const closeGuestDetailsBtn = document.getElementById('closeGuestDetailsBtn');
    if (closeGuestDetailsBtn) {
        closeGuestDetailsBtn.addEventListener('click', () => closeModal('guestDetailsModal'));
    }
    
    // Filtres
    const guestStatusFilter = document.getElementById('guestStatusFilter');
    if (guestStatusFilter) {
        guestStatusFilter.addEventListener('change', filterGuests);
    }
    
    const guestSearch = document.getElementById('guestSearch');
    if (guestSearch) {
        guestSearch.addEventListener('input', filterGuests);
    }
});

// ============================================
// MODAL HELPERS
// ============================================

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

function showConfirmDialog(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const titleEl = document.getElementById('confirmTitle');
        const messageEl = document.getElementById('confirmMessage');
        const yesBtn = document.getElementById('confirmYesBtn');
        const noBtn = document.getElementById('confirmNoBtn');
        
        titleEl.textContent = title;
        messageEl.textContent = message;
        
        const handleYes = () => {
            cleanup();
            resolve(true);
        };
        
        const handleNo = () => {
            cleanup();
            resolve(false);
        };
        
        const cleanup = () => {
            yesBtn.removeEventListener('click', handleYes);
            noBtn.removeEventListener('click', handleNo);
            modal.style.display = 'none';
        };
        
        yesBtn.addEventListener('click', handleYes);
        noBtn.addEventListener('click', handleNo);
        
        modal.style.display = 'flex';
    });
}
