// Configuration
const API_URL = window.location.origin + '/api';

// État de l'application
let currentView = 'grid';
let allFiles = [];
let filteredFiles = [];
let currentPath = '';
let imageFiles = [];
let currentImageIndex = 0;
let userTeamFiles = [];
let discoverMapInstance = null;
let discoverCurrentTab = 'tags';
let discoverSuggestionTimeout = null;

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initializeEventListeners();
    loadFiles();
    loadTeamFilesSection();
});

// ============================================
// Authentication
// ============================================

function showSuccess(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#28a745;color:#fff;padding:12px 24px;border-radius:8px;z-index:10001;font-size:0.9rem;box-shadow:0 4px 12px rgba(0,0,0,0.2);';
    toast.innerHTML = '<i class="fas fa-check-circle"></i> ' + msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showError(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#dc3545;color:#fff;padding:12px 24px;border-radius:8px;z-index:10001;font-size:0.9rem;box-shadow:0 4px 12px rgba(0,0,0,0.2);';
    toast.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function getAuthToken() {
    return localStorage.getItem('authToken') || sessionStorage.getItem('authToken') ||
           localStorage.getItem('userToken') || sessionStorage.getItem('userToken');
}

function checkAuth() {
    const token = getAuthToken();
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Afficher le nom d'utilisateur
    const userData = localStorage.getItem('userData') || sessionStorage.getItem('userData');
    if (userData) {
        const user = JSON.parse(userData);
        document.getElementById('userName').textContent = user.name || user.username;
    }
}

// ============================================
// Event Listeners
// ============================================

function initializeEventListeners() {
    // Header buttons
    document.getElementById('uploadBtn').addEventListener('click', () => {
        document.getElementById('uploadModal').style.display = 'flex';
    });

    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadFiles(currentPath);
    });

    document.getElementById('createFolderBtn')?.addEventListener('click', showCreateFolderModal);
    document.getElementById('guestsBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const dd = document.getElementById('guestsDropdown');
        dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', () => { document.getElementById('guestsDropdown').style.display = 'none'; });
    document.getElementById('closeCreateGuestBtn')?.addEventListener('click', () => { document.getElementById('createGuestModal').style.display = 'none'; });
    document.getElementById('cancelCreateGuestBtn')?.addEventListener('click', () => { document.getElementById('createGuestModal').style.display = 'none'; });
    document.getElementById('closeMyGuestsBtn')?.addEventListener('click', () => { document.getElementById('myGuestsModal').style.display = 'none'; });
    document.getElementById('shareLinksBtn')?.addEventListener('click', showShareLinksSection);
    document.getElementById('closeShareLinksBtn')?.addEventListener('click', hideShareLinksSection);
    document.getElementById('discoverBtn')?.addEventListener('click', showDiscoverSection);
    document.getElementById('closeDiscoverBtn')?.addEventListener('click', hideDiscoverSection);
    document.querySelectorAll('.discover-tab').forEach(tab => {
        tab.addEventListener('click', () => switchDiscoverTab(tab.dataset.tab));
    });
    document.getElementById('discoverSearchBtn')?.addEventListener('click', handleDiscoverSearch);
    document.getElementById('discoverSearchInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleDiscoverSearch();
    });
    document.getElementById('discoverSearchInput')?.addEventListener('input', (e) => {
        clearTimeout(discoverSuggestionTimeout);
        const query = e.target.value.trim();
        if (query.length >= 2) {
            discoverSuggestionTimeout = setTimeout(() => loadDiscoverSuggestions(query), 300);
        } else {
            document.getElementById('discoverSuggestions').style.display = 'none';
        }
    });
    document.getElementById('discoverBackToTags')?.addEventListener('click', () => {
        document.getElementById('discoverTagResults').style.display = 'none';
        document.getElementById('discoverTagCloud').style.display = 'flex';
    });
    document.addEventListener('click', (e) => {
        const suggestions = document.getElementById('discoverSuggestions');
        if (suggestions && !e.target.closest('.discover-search-input-wrapper')) {
            suggestions.style.display = 'none';
        }
    });
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // View buttons
    document.querySelectorAll('.btn-view').forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchView(e.currentTarget.dataset.view);
        });
    });

    // Filter
    document.getElementById('filterBtn').addEventListener('click', () => {
        const panel = document.getElementById('filterPanel');
        panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    });

    document.getElementById('typeFilter').addEventListener('change', applyFilters);
    document.getElementById('sortFilter').addEventListener('change', applyFilters);
    document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);

    // Search
    document.getElementById('searchInput').addEventListener('input', applyFilters);

    // Upload modal
    document.getElementById('closeUploadBtn').addEventListener('click', () => {
        document.getElementById('uploadModal').style.display = 'none';
    });

    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    setupDragAndDrop();

    // Gallery
    document.getElementById('closeGalleryBtn').addEventListener('click', closeGallery);
    document.getElementById('galleryPrevBtn').addEventListener('click', () => navigateGallery(-1));
    document.getElementById('galleryNextBtn').addEventListener('click', () => navigateGallery(1));

    // Empty state
    document.getElementById('uploadEmptyBtn')?.addEventListener('click', () => {
        document.getElementById('uploadModal').style.display = 'flex';
    });

    // Keyboard navigation for gallery
    document.addEventListener('keydown', (e) => {
        if (document.getElementById('galleryModal').style.display !== 'none') {
            if (e.key === 'ArrowLeft') navigateGallery(-1);
            if (e.key === 'ArrowRight') navigateGallery(1);
            if (e.key === 'Escape') closeGallery();
        }
    });

    // Create folder modal
    document.getElementById('closeCreateFolderBtn')?.addEventListener('click', () => {
        document.getElementById('createFolderModal').style.display = 'none';
    });
    document.getElementById('cancelCreateFolderBtn')?.addEventListener('click', () => {
        document.getElementById('createFolderModal').style.display = 'none';
    });
    document.getElementById('confirmCreateFolderBtn')?.addEventListener('click', handleCreateFolder);

    // Create guest modal
    document.getElementById('confirmCreateGuestBtn')?.addEventListener('click', handleCreateGuest);

    // Rename modal
    document.getElementById('closeRenameBtn')?.addEventListener('click', () => {
        document.getElementById('renameModal').style.display = 'none';
    });
    document.getElementById('cancelRenameBtn')?.addEventListener('click', () => {
        document.getElementById('renameModal').style.display = 'none';
    });
    document.getElementById('confirmRenameBtn')?.addEventListener('click', handleRename);

    // Move modal
    document.getElementById('closeMoveBtn')?.addEventListener('click', () => {
        document.getElementById('moveModal').style.display = 'none';
    });
    document.getElementById('cancelMoveBtn')?.addEventListener('click', () => {
        document.getElementById('moveModal').style.display = 'none';
    });
    document.getElementById('confirmMoveBtn')?.addEventListener('click', handleMove);

    // Share modal
    document.getElementById('closeShareBtn')?.addEventListener('click', () => {
        document.getElementById('shareModal').style.display = 'none';
    });
    document.getElementById('cancelShareBtn')?.addEventListener('click', () => {
        document.getElementById('shareModal').style.display = 'none';
    });
    document.getElementById('applyShareBtn')?.addEventListener('click', handleGenerateShareLink);
    document.getElementById('copyShareLinkBtn')?.addEventListener('click', copyShareLink);
    
    // Close result step
    document.getElementById('closeShareResultBtn')?.addEventListener('click', () => {
        document.getElementById('shareModal').style.display = 'none';
    });
    
    // Send by email
    document.getElementById('sendShareEmailBtn')?.addEventListener('click', async () => {
        const linkId = document.getElementById('shareModal').dataset.linkId;
        const shareLink = document.getElementById('shareLinkInput').value;
        const recipientEmails = document.getElementById('shareRecipientEmailInput').value.trim();
        const fileName = document.getElementById('shareModalTitle').textContent.replace('Partager "', '').replace('"', '');
        
        if (!linkId || !shareLink) return;
        
        const sendBtn = document.getElementById('sendShareEmailBtn');
        if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Envoi...'; }
        
        try {
            const token = getAuthToken();
            const res = await fetch(`${API_URL}/share/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ linkId, recipientEmails, fileName, shareLink })
            });
            const data = await res.json();
            if (data.success) {
                showSuccess('Email envoyé !');
                if (sendBtn) { sendBtn.innerHTML = '<i class="fas fa-check"></i> Envoyé !'; sendBtn.style.background = '#4caf50'; }
            } else {
                showError(data.error || 'Erreur envoi email');
                if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="fas fa-envelope"></i> Envoyer par email'; }
            }
        } catch(e) {
            showError('Erreur envoi email');
            if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="fas fa-envelope"></i> Envoyer par email'; }
        }
    });
    
    // Toggle password visibility
    document.getElementById('togglePasswordVisibility')?.addEventListener('click', () => {
        const pwd = document.getElementById('sharePasswordInput');
        const btn = document.getElementById('togglePasswordVisibility');
        if (pwd.type === 'password') { pwd.type = 'text'; btn.innerHTML = '<i class="fas fa-eye-slash"></i>'; }
        else { pwd.type = 'password'; btn.innerHTML = '<i class="fas fa-eye"></i>'; }
    });
    
    }

// ============================================
// File Management
// ============================================

async function loadFiles(path = '') {
    try {
        const token = getAuthToken();
        const url = path ? `${API_URL}/user/files?path=${encodeURIComponent(path)}` : `${API_URL}/user/files`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            handleLogout();
            return;
        }

        const data = await response.json();
        if (data.success) {
            currentPath = data.currentPath || '';
            allFiles = data.files || [];
            filteredFiles = [...allFiles];
            imageFiles = allFiles.filter(f => !f.isFolder && f.contentType && f.contentType.startsWith('image/'));
            updateBreadcrumb();
            applyFilters();
        }
    } catch (error) {
        console.error('Erreur chargement fichiers:', error);
        showError('Erreur lors du chargement des fichiers');
    }
}

function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const typeFilter = document.getElementById('typeFilter').value;
    const sortFilter = document.getElementById('sortFilter').value;

    filteredFiles = allFiles.filter(file => {
        const displayName = (file.displayName || file.originalName || file.name).toLowerCase();
        const matchesSearch = !searchTerm || displayName.includes(searchTerm);
        
        let matchesType = true;
        if (typeFilter === 'image') {
            matchesType = !file.isFolder && file.contentType && file.contentType.startsWith('image/');
        } else if (typeFilter === 'video') {
            matchesType = !file.isFolder && file.contentType && file.contentType.startsWith('video/');
        } else if (typeFilter === 'audio') {
            matchesType = !file.isFolder && file.contentType && file.contentType.startsWith('audio/');
        } else if (typeFilter === 'document') {
            matchesType = !file.isFolder && file.contentType && (
                file.contentType.includes('pdf') ||
                file.contentType.includes('word') ||
                file.contentType.includes('document') ||
                file.contentType.includes('excel') ||
                file.contentType.includes('spreadsheet') ||
                file.contentType.includes('powerpoint') ||
                file.contentType.includes('presentation')
            );
        } else if (typeFilter === 'other') {
            matchesType = !file.isFolder && file.contentType && 
                !file.contentType.startsWith('image/') &&
                !file.contentType.startsWith('video/') &&
                !file.contentType.startsWith('audio/') &&
                !file.contentType.includes('pdf') &&
                !file.contentType.includes('word') &&
                !file.contentType.includes('document') &&
                !file.contentType.includes('excel') &&
                !file.contentType.includes('spreadsheet');
        }
        
        return matchesSearch && matchesType;
    });

    // Trier
    filteredFiles.sort((a, b) => {
        // Dossiers toujours en premier
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        
        if (sortFilter === 'name-asc') {
            const nameA = (a.displayName || a.originalName || a.name).toLowerCase();
            const nameB = (b.displayName || b.originalName || b.name).toLowerCase();
            return nameA.localeCompare(nameB);
        } else if (sortFilter === 'name-desc') {
            const nameA = (a.displayName || a.originalName || a.name).toLowerCase();
            const nameB = (b.displayName || b.originalName || b.name).toLowerCase();
            return nameB.localeCompare(nameA);
        } else if (sortFilter === 'size-desc') {
            return (b.size || 0) - (a.size || 0);
        } else if (sortFilter === 'size-asc') {
            return (a.size || 0) - (b.size || 0);
        } else if (sortFilter === 'date-desc') {
            return new Date(b.lastModified) - new Date(a.lastModified);
        } else if (sortFilter === 'date-asc') {
            return new Date(a.lastModified) - new Date(b.lastModified);
        }
        return 0;
    });

    renderFiles();
}

function clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('typeFilter').value = '';
    document.getElementById('sortFilter').value = 'date-desc';
    applyFilters();
}

function getFileType(contentType) {
    if (!contentType) return 'Autre';
    if (contentType.startsWith('image/')) return 'Image';
    if (contentType.startsWith('video/')) return 'Vidéo';
    if (contentType.startsWith('audio/')) return 'Audio';
    if (contentType === 'application/pdf') return 'PDF';
    if (contentType.includes('word') || contentType.includes('document')) return 'Document';
    if (contentType.includes('excel') || contentType.includes('spreadsheet')) return 'Tableur';
    if (contentType.includes('powerpoint') || contentType.includes('presentation')) return 'Présentation';
    if (contentType.includes('zip') || contentType.includes('compressed')) return 'Archive';
    return 'Autre';
}

function renderFiles() {
    if (filteredFiles.length === 0) {
        document.getElementById('filesGrid').innerHTML = '<div class="loading-state"><p>Aucun fichier trouvé</p></div>';
        document.getElementById('filesList').innerHTML = '<div class="loading-state"><p>Aucun fichier trouvé</p></div>';
        return;
    }

    if (currentView === 'grid') {
        renderGridView();
    } else {
        renderListView();
    }
}

function renderGridView() {
    const grid = document.getElementById('filesGrid');
    grid.style.display = 'grid';
    document.getElementById('filesList').style.display = 'none';

    const token = getAuthToken();

    grid.innerHTML = filteredFiles.map(file => {
        const isFolder = file.isFolder;
        const isImage = !isFolder && file.contentType && file.contentType.startsWith('image/');
        const displayName = file.displayName || file.originalName || file.name;
        
        let thumbnail;
        if (isFolder) {
            thumbnail = `<div class="file-card-icon folder-icon"><i class="fas fa-folder"></i></div>`;
        } else if (isImage) {
            // Utiliser l'endpoint preview pour les miniatures d'images
            const imageUrl = token 
                ? `${API_URL}/preview/${encodeURIComponent(file.name)}?token=${encodeURIComponent(token)}`
                : `${API_URL}/preview/${encodeURIComponent(file.name)}`;
            thumbnail = `<img src="${imageUrl}" alt="${displayName}" class="file-card-image" loading="lazy">`;
        } else {
            thumbnail = `<div class="file-card-icon">${getFileIcon(file.contentType)}</div>`;
        }

        return `
            <div class="file-card ${isFolder ? 'folder-card' : ''}" data-file-name="${file.name}" data-is-folder="${isFolder}">
                ${thumbnail}
                <div class="file-card-info">
                    <div class="file-card-name" title="${displayName}">
                        ${displayName}
                    </div>
                    <div class="file-card-meta">
                        <span>${isFolder ? 'Dossier' : formatBytes(file.size || 0)}</span>
                        <span>${formatDate(file.lastModified)}</span>
                    </div>
                </div>
                <div class="file-card-actions">
                    ${!isFolder && isImage ? `<button class="file-action-btn gallery-btn" data-file-name="${file.name}" title="Voir en galerie">
                        <i class="fas fa-images"></i>
                    </button>` : ''}
                    ${!isFolder ? `<button class="file-action-btn preview-btn" data-file-name="${file.name}" title="Aperçu">
                        <i class="fas fa-eye"></i>
                    </button>` : ''}
                    ${!isFolder ? `<button class="file-action-btn download-btn" data-file-name="${file.name}" title="Télécharger">
                        <i class="fas fa-download"></i>
                    </button>` : ''}
                    <button class="file-action-btn context-btn" data-file-name="${file.name}" data-is-folder="${isFolder}" title="Plus d'options">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // Ajouter les événements de clic sur les cartes
    grid.querySelectorAll('.file-card').forEach(card => {
        const fileName = card.dataset.fileName;
        const isFolder = card.dataset.isFolder === 'true';
        const file = filteredFiles.find(f => f.name === fileName);
        
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.file-card-actions')) {
                if (isFolder) {
                    navigateToFolder(fileName);
                } else if (file && file.contentType && file.contentType.startsWith('image/')) {
                    openGallery(fileName);
                }
            }
        });

        // Actions dans les boutons
        card.querySelector('.gallery-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            openGallery(fileName);
        });
        card.querySelector('.preview-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            previewFile(fileName);
        });
        card.querySelector('.download-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            downloadFile(fileName);
        });
        card.querySelector('.context-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            showContextMenu(e, fileName, isFolder);
        });
    });
}

function renderListView() {
    const list = document.getElementById('filesList');
    list.style.display = 'block';
    document.getElementById('filesGrid').style.display = 'none';

    const token = getAuthToken();
    const tbody = document.getElementById('filesTableBody');
    tbody.innerHTML = filteredFiles.map(file => {
        const isFolder = file.isFolder;
        const isImage = !isFolder && file.contentType && file.contentType.startsWith('image/');
        const displayName = file.displayName || file.originalName || file.name;
        
        let icon;
        if (isFolder) {
            icon = `<div class="file-icon-placeholder folder-icon"><i class="fas fa-folder"></i></div>`;
        } else if (isImage) {
            // Utiliser l'endpoint preview pour les miniatures d'images
            const imageUrl = token 
                ? `${API_URL}/preview/${encodeURIComponent(file.name)}?token=${encodeURIComponent(token)}`
                : `${API_URL}/preview/${encodeURIComponent(file.name)}`;
            icon = `<img src="${imageUrl}" alt="${displayName}" class="file-icon" loading="lazy">`;
        } else {
            icon = `<div class="file-icon-placeholder">${getFileIcon(file.contentType)}</div>`;
        }

        return `
            <tr class="${isFolder ? 'folder-row' : ''}" data-file-name="${file.name}" data-is-folder="${isFolder}" style="cursor: ${isFolder ? 'pointer' : 'default'};">
                <td>
                    <div class="file-name-cell">
                        ${icon}
                        <span>${displayName}</span>
                    </div>
                </td>
                <td>${isFolder ? '—' : formatBytes(file.size || 0)}</td>
                <td>${isFolder ? 'Dossier' : getFileType(file.contentType)}</td>
                <td>${formatDate(file.lastModified)}</td>
                <td>
                    <div class="file-actions-cell">
                        ${!isFolder && isImage ? `<button class="file-action-btn gallery-btn" data-file-name="${file.name}" title="Galerie">
                            <i class="fas fa-images"></i>
                        </button>` : ''}
                        ${!isFolder ? `<button class="file-action-btn preview-btn" data-file-name="${file.name}" title="Aperçu">
                            <i class="fas fa-eye"></i>
                        </button>` : ''}
                        ${!isFolder ? `<button class="file-action-btn download-btn" data-file-name="${file.name}" title="Télécharger">
                            <i class="fas fa-download"></i>
                        </button>` : ''}
                        <button class="file-action-btn context-btn" data-file-name="${file.name}" data-is-folder="${isFolder}" title="Plus d'options">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Ajouter les événements de clic sur les lignes et boutons
    tbody.querySelectorAll('tr').forEach(row => {
        const fileName = row.dataset.fileName;
        const isFolder = row.dataset.isFolder === 'true';
        
        if (isFolder) {
            // Clic simple ou double-clic sur toute la ligne pour ouvrir le dossier
            row.style.cursor = 'pointer';
            row.addEventListener('click', (e) => {
                if (!e.target.closest('.file-actions-cell')) {
                    navigateToFolder(fileName);
                }
            });
            row.addEventListener('dblclick', () => {
                navigateToFolder(fileName);
            });
        } else {
            row.style.cursor = 'default';
        }

        // Actions dans les boutons
        row.querySelector('.gallery-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            openGallery(fileName);
        });
        row.querySelector('.preview-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            previewFile(fileName);
        });
        row.querySelector('.download-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            downloadFile(fileName);
        });
        row.querySelector('.context-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            showContextMenu(e, fileName, isFolder);
        });
    });
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

function switchView(view) {
    currentView = view;
    document.querySelectorAll('.btn-view').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    renderFiles();
}

// ============================================
// Gallery
// ============================================

function openGallery(fileName) {
    const file = filteredFiles.find(f => f.name === fileName);
    if (!file || file.isFolder || !file.contentType || !file.contentType.startsWith('image/')) return;

    // Filtrer uniquement les images
    const images = filteredFiles.filter(f => !f.isFolder && f.contentType && f.contentType.startsWith('image/'));
    currentImageIndex = images.findIndex(f => f.name === fileName);
    
    if (currentImageIndex === -1) return;

    document.getElementById('galleryModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    
    updateGallery();
    renderGalleryThumbnails(images);
}

function updateGallery() {
    const images = filteredFiles.filter(f => !f.isFolder && f.contentType && f.contentType.startsWith('image/'));
    if (images.length === 0) return;

    const currentImage = images[currentImageIndex];
    const displayName = currentImage.displayName || currentImage.originalName || currentImage.name;
    
    // Utiliser l'endpoint preview au lieu de l'URL directe du blob
    const token = getAuthToken();
    const imageUrl = token 
        ? `${API_URL}/preview/${encodeURIComponent(currentImage.name)}?token=${encodeURIComponent(token)}`
        : `${API_URL}/preview/${encodeURIComponent(currentImage.name)}`;
    
    const galleryImage = document.getElementById('galleryImage');
    
    // Réinitialiser l'image
    galleryImage.style.display = 'block';
    galleryImage.style.opacity = '0.7';
    galleryImage.alt = displayName;
    
    // Charger l'image directement
    galleryImage.onload = function() {
        galleryImage.style.opacity = '1';
    };
    
    galleryImage.onerror = function() {
        console.error('Erreur chargement image:', imageUrl);
        console.error('Image name:', currentImage.name);
        console.error('Token:', token ? 'present' : 'missing');
        galleryImage.alt = 'Erreur de chargement de l\'image';
        galleryImage.style.opacity = '1';
    };
    
    console.log('Loading gallery image:', imageUrl);
    galleryImage.src = imageUrl;
    
    document.getElementById('galleryTitle').textContent = displayName;
    document.getElementById('galleryCounter').textContent = `${currentImageIndex + 1} / ${images.length}`;

    // Mettre à jour les boutons de navigation
    document.getElementById('galleryPrevBtn').style.display = currentImageIndex === 0 ? 'none' : 'flex';
    document.getElementById('galleryNextBtn').style.display = currentImageIndex === images.length - 1 ? 'none' : 'flex';

    // Mettre à jour les thumbnails
    document.querySelectorAll('.gallery-thumbnail').forEach((thumb, index) => {
        thumb.classList.toggle('active', index === currentImageIndex);
    });
}

function renderGalleryThumbnails(images) {
    const container = document.getElementById('galleryThumbnails');
    const token = getAuthToken();
    
    container.innerHTML = images.map((img, index) => {
        const thumbnailUrl = token 
            ? `${API_URL}/preview/${encodeURIComponent(img.name)}?token=${encodeURIComponent(token)}`
            : `${API_URL}/preview/${encodeURIComponent(img.name)}`;
        return `<img src="${thumbnailUrl}" alt="${img.originalName || img.displayName}" class="gallery-thumbnail ${index === currentImageIndex ? 'active' : ''}" 
              data-index="${index}">`;
    }).join('');
    
    // Ajouter les événements de clic sur les thumbnails
    container.querySelectorAll('.gallery-thumbnail').forEach((thumb, index) => {
        thumb.addEventListener('click', () => {
            currentImageIndex = index;
            updateGallery();
        });
    });
}

function navigateGallery(direction) {
    const images = filteredFiles.filter(f => !f.isFolder && f.contentType && f.contentType.startsWith('image/'));
    if (images.length === 0) return;

    currentImageIndex += direction;
    if (currentImageIndex < 0) currentImageIndex = images.length - 1;
    if (currentImageIndex >= images.length) currentImageIndex = 0;

    updateGallery();
}

function closeGallery() {
    document.getElementById('galleryModal').style.display = 'none';
    document.body.style.overflow = '';
}

// ============================================
// File Actions
// ============================================

function previewFile(fileName) {
    const file = filteredFiles.find(f => f.name === fileName);
    if (!file || file.isFolder) return;

    const token = getAuthToken();
    if (token) {
        window.open(`${API_URL}/preview/${encodeURIComponent(fileName)}?token=${encodeURIComponent(token)}`, '_blank');
    } else {
        window.open(`${API_URL}/preview/${encodeURIComponent(fileName)}`, '_blank');
    }
}

function downloadFile(fileName) {
    const file = filteredFiles.find(f => f.name === fileName);
    if (!file || file.isFolder) return;

    const token = getAuthToken();
    if (token) {
        window.location.href = `${API_URL}/download/${encodeURIComponent(fileName)}?token=${encodeURIComponent(token)}`;
    } else {
        window.location.href = `${API_URL}/download/${encodeURIComponent(fileName)}`;
    }
}

// ============================================
// Upload
// ============================================

function setupDragAndDrop() {
    const uploadZone = document.getElementById('uploadZone');
    
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        const files = Array.from(e.dataTransfer.files);
        handleFiles(files);
    });

    uploadZone.addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    handleFiles(files);
}

async function handleFiles(files) {
    const token = getAuthToken();
    const uploadProgress = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const uploadFilesList = document.getElementById('uploadFilesList');

    uploadProgress.style.display = 'block';
    uploadFilesList.innerHTML = '';

    let uploaded = 0;
    const total = files.length;

    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        
        // Ajouter le chemin du dossier courant
        if (currentPath) {
            formData.append('path', currentPath);
        }

        try {
            const url = currentPath ? `${API_URL}/upload?path=${encodeURIComponent(currentPath)}` : `${API_URL}/upload`;
            const response = await fetch(url, {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                uploaded++;
                const progress = (uploaded / total) * 100;
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `${Math.round(progress)}%`;

                const fileItem = document.createElement('div');
                fileItem.className = 'upload-file-item';
                fileItem.innerHTML = `
                    <i class="fas fa-check-circle" style="color: var(--april-green);"></i>
                    <span>${file.name}</span>
                `;
                uploadFilesList.appendChild(fileItem);
            } else {
                throw new Error('Erreur upload');
            }
        } catch (error) {
            console.error('Erreur upload:', error);
            const fileItem = document.createElement('div');
            fileItem.className = 'upload-file-item';
            fileItem.innerHTML = `
                <i class="fas fa-times-circle" style="color: #DC2626;"></i>
                <span>${file.name} - Erreur</span>
            `;
            uploadFilesList.appendChild(fileItem);
        }
    }

    if (uploaded === total) {
        setTimeout(() => {
            document.getElementById('uploadModal').style.display = 'none';
            loadFiles(currentPath);
        }, 1500);
    }
}

// ============================================
// Utilities
// ============================================

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Aujourd'hui";
    if (days === 1) return 'Hier';
    if (days < 7) return `Il y a ${days} jours`;
    
    return date.toLocaleDateString('fr-FR', { 
        day: 'numeric', 
        month: 'short', 
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
}

function handleLogout() {
    ['authToken', 'adminToken', 'userToken', 'userData', 'adminUser', 'adminUsername'].forEach(key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
    });
    window.location.href = 'login.html';
}

function showError(message) {
    // Simple error notification (peut être amélioré)
    alert(message);
}

// ============================================
// Folder Management
// ============================================

function updateBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    const paths = currentPath.split('/').filter(p => p);
    
    breadcrumb.innerHTML = `
        <button class="breadcrumb-item ${currentPath === '' ? 'active' : ''}" data-path="" onclick="navigateToPath('')">
            <i class="fas fa-home"></i>
            <span>Accueil</span>
        </button>
        ${paths.map((path, index) => {
            const pathToHere = paths.slice(0, index + 1).join('/') + '/';
            return `
                <span class="breadcrumb-separator">/</span>
                <button class="breadcrumb-item ${index === paths.length - 1 ? 'active' : ''}" data-path="${pathToHere}" onclick="navigateToPath('${pathToHere}')">
                    <span>${path}</span>
                </button>
            `;
        }).join('')}
    `;
}

function navigateToPath(path) {
    currentPath = path;
    loadFiles(path);
}

function navigateToFolder(folderPath) {
    navigateToPath(folderPath);
}

function showCreateFolderModal() {
    document.getElementById('createFolderModal').style.display = 'flex';
    document.getElementById('folderNameInput').value = '';
    document.getElementById('folderNameInput').focus();
}

async function handleCreateFolder() {
    const folderName = document.getElementById('folderNameInput').value.trim();
    
    if (!folderName || folderName.includes('/')) {
        showError('Nom de dossier invalide');
        return;
    }
    
    try {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/user/folders/create`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                folderName: folderName,
                parentPath: currentPath
            })
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('createFolderModal').style.display = 'none';
            loadFiles(currentPath);
        } else {
            showError(data.error || 'Erreur lors de la création du dossier');
        }
    } catch (error) {
        console.error('Erreur création dossier:', error);
        showError('Erreur lors de la création du dossier');
    }
}

// ============================================
// Context Menu
// ============================================

let contextMenuFile = null;
let contextMenuIsFolder = false;

function showContextMenu(event, fileName, isFolder) {
    event.preventDefault();
    event.stopPropagation();
    
    contextMenuFile = fileName;
    contextMenuIsFolder = isFolder;
    
    const menu = document.getElementById('contextMenu');
    menu.style.display = 'block';
    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
    
    // Event listeners (une seule fois)
    if (!menu.dataset.initialized) {
        document.getElementById('contextPreview').onclick = () => {
            menu.style.display = 'none';
            showPreview(contextMenuFile);
        };
        document.getElementById('contextRename').onclick = () => {
            menu.style.display = 'none';
            showRenameModal();
        };
        document.getElementById('contextMove').onclick = () => {
            menu.style.display = 'none';
            showMoveModal();
        };
        document.getElementById('contextShare').onclick = () => {
            menu.style.display = 'none';
            showShareModal();
        };
        document.getElementById('contextDelete').onclick = () => {
            menu.style.display = 'none';
            handleDelete();
        };
        menu.dataset.initialized = 'true';
    }
    
    // Fermer le menu si on clique ailleurs
    setTimeout(() => {
        document.addEventListener('click', closeContextMenu, { once: true });
    }, 0);
}

function closeContextMenu() {
    document.getElementById('contextMenu').style.display = 'none';
}

// ============================================
// Rename
// ============================================

function showRenameModal() {
    const file = filteredFiles.find(f => f.name === contextMenuFile);
    if (!file) return;
    
    const displayName = file.displayName || file.originalName || file.name;
    const currentName = contextMenuIsFolder ? displayName : displayName.split('.').slice(0, -1).join('.');
    
    document.getElementById('renameModalTitle').textContent = contextMenuIsFolder ? 'Renommer le dossier' : 'Renommer le fichier';
    document.getElementById('renameInput').value = currentName;
    document.getElementById('renameModal').style.display = 'flex';
    document.getElementById('renameInput').focus();
    
    document.getElementById('renameInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleRename();
        }
    });
}

async function handleRename() {
    const newName = document.getElementById('renameInput').value.trim();
    
    if (!newName || newName.includes('/')) {
        showError('Nom invalide');
        return;
    }
    
    try {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/user/files/rename`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                oldPath: contextMenuFile,
                newName: newName
            })
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('renameModal').style.display = 'none';
            loadFiles(currentPath);
        } else {
            showError(data.error || 'Erreur lors du renommage');
        }
    } catch (error) {
        console.error('Erreur renommage:', error);
        showError('Erreur lors du renommage');
    }
}

// ============================================
// Move
// ============================================

function showMoveModal() {
    const file = filteredFiles.find(f => f.name === contextMenuFile);
    if (!file) return;
    
    const displayName = file.displayName || file.originalName || file.name;
    
    // Construire la liste des dossiers disponibles
    const folders = allFiles.filter(f => f.isFolder && f.name !== contextMenuFile);
    const folderSelect = document.getElementById('moveDestinationSelect');
    folderSelect.innerHTML = '<option value="">Racine</option>';
    
    folders.forEach(folder => {
        const folderPath = folder.name;
        const folderDisplayName = folder.displayName || folderPath.replace(/\/$/, '').split('/').pop();
        folderSelect.innerHTML += `<option value="${folderPath}">${folderDisplayName}</option>`;
    });
    
    document.getElementById('moveModal').style.display = 'flex';
}

async function handleMove() {
    const destinationPath = document.getElementById('moveDestinationSelect').value;
    
    try {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/user/files/move`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sourcePath: contextMenuFile,
                destinationPath: destinationPath || ''
            })
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('moveModal').style.display = 'none';
            loadFiles(currentPath);
        } else {
            showError(data.error || 'Erreur lors du déplacement');
        }
    } catch (error) {
        console.error('Erreur déplacement:', error);
        showError('Erreur lors du déplacement');
    }
}

// ============================================
// Share
// ============================================

async function showShareModal() {
    const file = filteredFiles.find(f => f.name === contextMenuFile);
    if (!file || file.isFolder) return;
    
    const displayName = file.displayName || file.originalName || contextMenuFile;
    document.getElementById('shareModalTitle').textContent = `Partager "${displayName}"`;
    
    // Reset fields
    document.getElementById('shareLinkInput').value = '';
    document.getElementById('shareRecipientEmailInput').value = '';
    document.getElementById('sharePasswordInput').value = '';
    document.getElementById('shareExpirationSelect').value = '1440';
    document.getElementById('shareModal').dataset.linkId = '';
    
    // Show step 1 (config), hide step 2 (result)
    const stepConfig = document.getElementById('shareStepConfig');
    const stepResult = document.getElementById('shareStepResult');
    if (stepConfig) stepConfig.style.display = 'block';
    if (stepResult) stepResult.style.display = 'none';
    
    // File info
    const shareFileInfo = document.getElementById('shareFileInfo');
    if (shareFileInfo) {
        shareFileInfo.innerHTML = `<div style="display:flex;align-items:center;gap:12px;">
            <div style="font-size:1.5rem;">📄</div>
            <div><div style="font-weight:600;font-size:0.95rem;">${escapeHtml(displayName)}</div>
            <div style="color:#888;font-size:0.85rem;">${file.size ? formatSize(file.size) : ''}</div></div>
        </div>`;
    }
    
    // Reset watermark
    const wmSelect = document.getElementById('shareWatermarkSelect');
    if (wmSelect) wmSelect.value = '';
    const wmCustom = document.getElementById('shareWatermarkCustom');
    if (wmCustom) { wmCustom.value = ''; wmCustom.style.display = 'none'; }
    
    document.getElementById('shareModal').style.display = 'flex';
    document.getElementById('shareRecipientEmailInput').focus();
}

function getWatermarkText() {
    const select = document.getElementById('shareWatermarkSelect');
    if (!select || !select.value) return '';
    if (select.value === 'custom') {
        return (document.getElementById('shareWatermarkCustom')?.value || '').trim();
    }
    return select.value;
}

async function handleGenerateShareLink() {
    if (!contextMenuFile) return;
    
    const file = filteredFiles.find(f => f.name === contextMenuFile);
    if (!file || file.isFolder) return;
    
    // Valider email
    const recipientEmails = document.getElementById('shareRecipientEmailInput').value.trim();
    if (!recipientEmails) {
        showError('Veuillez entrer au moins un email de destinataire');
        document.getElementById('shareRecipientEmailInput').focus();
        return;
    }
    
    // Valider mot de passe obligatoire
    const password = document.getElementById('sharePasswordInput').value.trim();
    if (!password) {
        showError('Le mot de passe est obligatoire');
        document.getElementById('sharePasswordInput').focus();
        return;
    }
    
    const applyBtn = document.getElementById('applyShareBtn');
    if (applyBtn) {
        applyBtn.disabled = true;
        applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Création...';
    }
    
    try {
        const expiresInMinutes = parseInt(document.getElementById('shareExpirationSelect').value);
        
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/share/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                blobName: contextMenuFile,
                expiresInMinutes,
                recipientEmail: recipientEmails,
                password,
                permissions: 'r',
                watermarkText: getWatermarkText()
            })
        });
        
        const data = await response.json();
        
        if (data.success && data.shareLink) {
            document.getElementById('shareLinkInput').value = data.shareLink;
            
            // Expiration info
            const shareExpires = document.getElementById('shareExpires');
            if (shareExpires && data.expiresAt) {
                const d = new Date(data.expiresAt);
                shareExpires.innerHTML = `🕒 Expire le <strong>${d.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}</strong>`;
            }
            
            // QR Code
            const qrImg = document.getElementById('qrCodeImage');
            if (qrImg && data.qrCode) qrImg.src = data.qrCode;
            
            // Store linkId
            document.getElementById('shareModal').dataset.linkId = data.linkId || '';
            
            // Switch to result step
            const stepConfig = document.getElementById('shareStepConfig');
            const stepResult = document.getElementById('shareStepResult');
            if (stepConfig) stepConfig.style.display = 'none';
            if (stepResult) stepResult.style.display = 'block';
            
            showSuccess('Lien de partage créé !');
        } else {
            showError(data.error || 'Erreur lors de la génération du lien');
        }
    } catch (error) {
        console.error('Erreur génération lien:', error);
        showError('Erreur lors de la génération du lien');
    } finally {
        if (applyBtn) {
            applyBtn.disabled = false;
            applyBtn.innerHTML = '<i class="fas fa-link"></i> Créer le lien';
        }
    }
}

// Fonction pour appliquer les modifications (fermer le modal)
function handleApplyShare() {
    // Vérifier que le lien a été généré
    const shareLink = document.getElementById('shareLinkInput').value;
    if (!shareLink) {
        showError('Veuillez générer un lien de partage d\'abord');
        return;
    }
    
    // Fermer le modal
    document.getElementById('shareModal').style.display = 'none';
    
    // Recharger la liste des liens si la section est visible
    if (document.getElementById('shareLinksSection').style.display !== 'none') {
        loadShareLinks();
    }
}

function copyShareLink() {
    const shareLinkInput = document.getElementById('shareLinkInput');
    if (!shareLinkInput.value) {
        showError('Aucun lien à copier. Générez d\'abord un lien.');
        return;
    }
    
    shareLinkInput.select();
    shareLinkInput.setSelectionRange(0, 99999); // Pour mobile
    
    try {
        document.execCommand('copy');
        const copyBtn = document.getElementById('copyShareLinkBtn');
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '<i class="fas fa-check"></i> Copié!';
        copyBtn.style.backgroundColor = 'var(--april-green)';
        
        setTimeout(() => {
            copyBtn.innerHTML = originalText;
            copyBtn.style.backgroundColor = '';
        }, 2000);
    } catch (err) {
        showError('Impossible de copier le lien');
    }
}

// ============================================
// Delete
// ============================================

async function handleDelete() {
    if (!contextMenuFile) return;
    
    const file = filteredFiles.find(f => f.name === contextMenuFile);
    if (!file) return;
    
    const displayName = file.displayName || file.originalName || contextMenuFile;
    const confirmed = await showConfirmDialog('Corbeille', `Mettre "${displayName}" en corbeille ?\n\nLe fichier sera archivé et pourra être restauré.`);
    if (!confirmed) return;
    
    try {
        const token = getAuthToken();
        const blobName = file.blobName || file.name || contextMenuFile;
        const response = await fetch(`${API_URL}/files/trash`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ blobName })
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        const data = await response.json();
        if (data.success) {
            showSuccess('Fichier mis en corbeille');
            loadFiles(currentPath);
        } else {
            showError(data.error || 'Erreur lors de la mise en corbeille');
        }
    } catch (error) {
        console.error('Erreur corbeille:', error);
        showError('Erreur lors de la mise en corbeille');
    }
}

// ============================================
// Share Links Management
// ============================================

function showShareLinksSection() {
    document.getElementById('filesSection').style.display = 'none';
    document.getElementById('shareLinksSection').style.display = 'block';
    document.getElementById('discoverSection').style.display = 'none';
    document.getElementById('teamFilesSection').style.display = 'none';
    loadShareLinks();
}

function hideShareLinksSection() {
    document.getElementById('shareLinksSection').style.display = 'none';
    document.getElementById('filesSection').style.display = 'block';
}

async function loadShareLinks() {
    try {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/user/share-links`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.status === 401) {
            handleLogout();
            return;
        }
        
        const data = await response.json();
        if (data.success) {
            renderShareLinks(data.links || []);
        } else {
            showError(data.error || 'Erreur lors du chargement des liens');
        }
    } catch (error) {
        console.error('Erreur chargement liens:', error);
        showError('Erreur lors du chargement des liens de partage');
    }
}

function renderShareLinks(links) {
    const container = document.getElementById('shareLinksContainer');
    
    if (links.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-link"></i>
                <h3>Aucun lien de partage</h3>
                <p>Vous n'avez pas encore créé de lien de partage</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <table class="share-links-table">
            <thead>
                <tr>
                    <th>Fichier</th>
                    <th>Taille</th>
                    <th>Créé le</th>
                    <th>Expire le</th>
                    <th>Téléchargements</th>
                    <th>Coût total</th>
                    <th>Statut</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${links.map(link => renderShareLinkRow(link)).join('')}
            </tbody>
        </table>
    `;
    
    // Ajouter les event listeners pour les menus et boutons
    links.forEach(link => {
        const menuBtn = document.getElementById(`shareLinkMenuBtn-${link.link_id}`);
        const menu = document.getElementById(`shareLinkMenu-${link.link_id}`);
        
        if (menuBtn && menu) {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Fermer tous les autres menus
                document.querySelectorAll('.share-link-menu').forEach(m => {
                    if (m.id !== menu.id) m.style.display = 'none';
                });
                // Afficher/masquer ce menu
                menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
            });
        }
        
        const viewBtn = document.getElementById(`viewLinkBtn-${link.link_id}`);
        if (viewBtn) {
            viewBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.style.display = 'none';
                viewShareLink(link);
            });
        }
        
        const deleteBtn = document.getElementById(`deleteLinkBtn-${link.link_id}`);
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.style.display = 'none';
                deleteShareLink(link.link_id);
            });
        }
    });
    
    // Fermer les menus si on clique ailleurs
    document.addEventListener('click', () => {
        document.querySelectorAll('.share-link-menu').forEach(menu => {
            menu.style.display = 'none';
        });
    });
}

function renderShareLinkRow(link) {
    const createdAt = new Date(link.created_at);
    const expiresAt = new Date(link.expires_at);
    const now = new Date();
    const isExpired = now > expiresAt;
    const isActive = link.is_active === 1 && !isExpired;
    
    const statusBadge = isActive 
        ? '<span class="badge badge-success">Actif</span>'
        : isExpired 
        ? '<span class="badge badge-danger">Expiré</span>'
        : '<span class="badge badge-secondary">Inactif</span>';
    
    return `
        <tr>
            <td>
                <div class="share-link-file">
                    <i class="fas ${getFileIconClass(link.content_type)}"></i>
                    <div>
                        <div class="share-link-file-name">${escapeHtml(link.original_name)}</div>
                        ${link.hasPassword ? '<span class="badge badge-info badge-sm"><i class="fas fa-lock"></i> Protégé</span>' : ''}
                    </div>
                </div>
            </td>
            <td>${formatBytes(link.file_size || 0)}</td>
            <td>${formatDate(link.created_at)}</td>
            <td>${formatDate(link.expires_at)}</td>
            <td>${link.downloadCount || 0}</td>
            <td><strong>${formatCurrency(link.costs?.total || 0)}</strong></td>
            <td>${statusBadge}</td>
            <td>
                <div class="share-link-actions">
                    <button class="btn-icon context-btn" id="shareLinkMenuBtn-${link.link_id}" title="Actions" data-link-id="${link.link_id}">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div class="share-link-menu" id="shareLinkMenu-${link.link_id}" style="display: none;">
                        <button class="share-link-menu-item" id="viewLinkBtn-${link.link_id}" data-link-id="${link.link_id}">
                            <i class="fas fa-eye"></i>
                            <span>Voir le lien</span>
                        </button>
                        <button class="share-link-menu-item share-link-menu-item-danger" id="deleteLinkBtn-${link.link_id}" data-link-id="${link.link_id}">
                            <i class="fas fa-trash"></i>
                            <span>Supprimer</span>
                        </button>
                    </div>
                </div>
            </td>
        </tr>
    `;
}

function getFileIconClass(contentType) {
    if (!contentType) return 'fa-file';
    if (contentType.startsWith('image/')) return 'fa-file-image';
    if (contentType.startsWith('video/')) return 'fa-file-video';
    if (contentType.startsWith('audio/')) return 'fa-file-audio';
    if (contentType.includes('pdf')) return 'fa-file-pdf';
    if (contentType.includes('word')) return 'fa-file-word';
    if (contentType.includes('excel') || contentType.includes('spreadsheet')) return 'fa-file-excel';
    if (contentType.includes('zip') || contentType.includes('archive')) return 'fa-file-archive';
    return 'fa-file';
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 4,
        maximumFractionDigits: 4
    }).format(amount);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function viewShareLink(link) {
    // Ouvrir la modale de partage avec le lien existant
    const displayName = link.original_name || link.blob_name;
    document.getElementById('shareModalTitle').textContent = `Lien de partage - "${displayName}"`;
    document.getElementById('shareLinkInput').value = link.share_url || '';
    
    
    document.getElementById('sharePasswordInput').value = '';
    
    // Calculer la durée d'expiration restante en heures
    const now = new Date();
    const expiresAt = new Date(link.expires_at);
    const hoursRemaining = Math.ceil((expiresAt - now) / (1000 * 60 * 60));
    const expirationHours = Math.max(1, hoursRemaining);
    document.getElementById('shareExpirationSelect').value = expirationHours.toString();
    
    // Le bouton generateShareLinkBtn n'existe plus, remplacé par refreshShareLinkBtn
    
    // Définir le fichier pour la régénération si nécessaire
    contextMenuFile = link.blob_name;
    
    // Afficher la modale
    document.getElementById('shareModal').style.display = 'flex';
}

async function regenerateShareLink(link) {
    // Ouvrir la modale de partage pour régénérer le lien
    const displayName = link.original_name || link.blob_name;
    document.getElementById('shareModalTitle').textContent = `Régénérer le lien - "${displayName}"`;
    document.getElementById('shareLinkInput').value = '';
    
    
    document.getElementById('sharePasswordInput').value = '';
    document.getElementById('shareExpirationSelect').value = '24';
    
    // Stocker le linkId pour référence (ne pas supprimer l'ancien, juste créer un nouveau)
    document.getElementById('shareModal').dataset.linkId = link.link_id;
    contextMenuFile = link.blob_name;
    
    // Afficher la modale
    document.getElementById('shareModal').style.display = 'flex';
    
    // Générer automatiquement le nouveau lien
    await handleGenerateShareLink();
}

async function deleteShareLink(linkId) {
    const confirmed = await showConfirmDialog('Supprimer le lien', 'Êtes-vous sûr de vouloir supprimer ce lien de partage ?');
    if (!confirmed) return;

    try {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/user/share-links/${linkId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            handleLogout();
            return;
        }

        const data = await response.json();
        if (data.success) {
            loadShareLinks();
        } else {
            showError(data.error || 'Erreur lors de la suppression du lien');
        }
    } catch (error) {
        console.error('Erreur suppression lien:', error);
        showError('Erreur lors de la suppression du lien');
    }
}

// ============================================
// Guest Account Management
// ============================================

async function loadMyGuestsList() {
    const list = document.getElementById('myGuestsList');
    list.innerHTML = '<p style="text-align:center;color:#666;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</p>';
    
    try {
        const token = getAuthToken();
        const res = await fetch(`${API_URL}/user/my-guests`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (!data.success || !data.guests || data.guests.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:40px;color:#888;"><i class="fas fa-user-slash" style="font-size:2rem;margin-bottom:12px;display:block;"></i>Aucun invité créé pour le moment</div>';
            return;
        }
        
        list.innerHTML = data.guests.map(g => {
            const now = new Date();
            const codeExpires = new Date(g.code_expires_at);
            const accountExpires = new Date(g.account_expires_at);
            const codeExpired = codeExpires < now;
            const accountExpired = accountExpires < now;
            
            let statusBadge, statusColor;
            if (g.pending_approval) {
                statusBadge = '⏳ En attente d\'approbation'; statusColor = '#ff9800';
            } else if (!g.is_active || accountExpired) {
                statusBadge = 'Expiré'; statusColor = '#9e9e9e';
            } else if (g.code_used) {
                statusBadge = 'Vérifié'; statusColor = '#4caf50';
            } else if (codeExpired) {
                statusBadge = 'Code expiré'; statusColor = '#ff9800';
            } else {
                statusBadge = 'En attente'; statusColor = '#2196f3';
            }
            
            const isUnlimited = g.is_unlimited;
            const showCode = !g.code_used && !codeExpired && g.is_active && !g.pending_approval;
            
            return `<div style="background:#f9f9f9;border:1px solid #e0e0e0;border-radius:10px;padding:16px;margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                    <div>
                        <strong style="font-size:1rem;">${escapeHtml(g.email)}</strong>
                        <span style="display:inline-block;background:${statusColor};color:white;font-size:0.75rem;padding:2px 10px;border-radius:12px;margin-left:8px;">${statusBadge}</span>
                    </div>
                    <div style="color:#888;font-size:0.85rem;">
                        Créé le ${new Date(g.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
                ${showCode ? `
                <div style="background:#fff;border:2px dashed #4caf50;border-radius:8px;padding:12px;margin-top:12px;text-align:center;">
                    <div style="color:#666;font-size:0.85rem;margin-bottom:4px;">Code de vérification</div>
                    <div style="font-size:1.8rem;font-weight:bold;color:#4caf50;letter-spacing:6px;font-family:monospace;">${g.verification_code}</div>
                    <div style="color:#888;font-size:0.8rem;margin-top:4px;">Expire le ${codeExpires.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                </div>` : ''}
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
                    <div style="display:flex;gap:16px;font-size:0.85rem;color:#666;">
                        <span>📧 ${g.code_used ? 'Email vérifié' : 'Non vérifié'}</span>
                        <span>${isUnlimited ? '♾️ Illimité' : '⏰ Expire le ' + accountExpires.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                    </div>
                    <button onclick="deleteMyGuest(${g.id}, '${escapeHtml(g.email)}')" style="background:none;border:1px solid #ef5350;color:#ef5350;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:0.85rem;" onmouseover="this.style.background='#ffebee'" onmouseout="this.style.background='none'">
                        <i class="fas fa-trash"></i> Supprimer
                    </button>
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        list.innerHTML = `<p style="color:#c62828;text-align:center;padding:20px;">Erreur: ${e.message}</p>`;
    }
}

async function deleteMyGuest(id, email) {
    if (!confirm(`Supprimer l'invité ${email} ?\n\nCette action est irréversible.`)) return;
    try {
        const token = getAuthToken();
        const res = await fetch(`${API_URL}/user/my-guests/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            showSuccess(`Invité ${email} supprimé`);
            loadMyGuestsList(); // Refresh list
        } else {
            showError(data.error || 'Erreur suppression');
        }
    } catch(e) { showError(e.message); }
}

function showCreateGuestModal() {
    document.getElementById('createGuestModal').style.display = 'flex';
    document.getElementById('guestEmailInput').value = '';
    document.getElementById('guestCreateResult').style.display = 'none';
    document.getElementById('guestEmailInput').focus();
}

function showMyGuestsModal() {
    document.getElementById('myGuestsModal').style.display = 'flex';
    loadMyGuestsList();
}

async function handleCreateGuest() {
    const emailInput = document.getElementById('guestEmailInput');
    const email = emailInput.value.trim();
    const resultDiv = document.getElementById('guestCreateResult');
    const confirmBtn = document.getElementById('confirmCreateGuestBtn');

    // Validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        resultDiv.style.display = 'block';
        resultDiv.style.backgroundColor = '#fee';
        resultDiv.style.borderLeft = '4px solid #dc3545';
        resultDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Veuillez entrer un email valide';
        return;
    }

    // Désactiver le bouton pendant la requête
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Création...';

    try {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/admin/guest-accounts`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, durationDays: parseInt(document.getElementById('guestDurationSelect').value) })
        });

        if (response.status === 401) {
            handleLogout();
            return;
        }

        const data = await response.json();

        if (data.success) {
            resultDiv.style.display = 'block';

            if (data.needsApproval) {
                resultDiv.style.backgroundColor = '#fff3e0';
                resultDiv.style.borderLeft = '4px solid #ff9800';
                resultDiv.innerHTML = `
                    <div style="margin-bottom: 10px;">
                        <i class="fas fa-clock" style="color: #ff9800;"></i>
                        <strong>Invitation créée — en attente d'approbation</strong>
                    </div>
                    <div style="font-size: 0.9rem;">
                        <p><strong>Email :</strong> ${email}</p>
                        <p>L'accès illimité nécessite la validation d'un administrateur.</p>
                        <p>Le code de vérification sera envoyé après approbation.</p>
                    </div>
                `;
            } else {
                resultDiv.style.backgroundColor = '#d4edda';
                resultDiv.style.borderLeft = '4px solid #28a745';

                const codeInfo = data.guest.emailSent
                    ? 'Le code de vérification a été envoyé par email.'
                    : `Code de vérification : <strong>${data.guest.verificationCode}</strong> (email non envoyé)`;

                resultDiv.innerHTML = `
                    <div style="margin-bottom: 10px;">
                        <i class="fas fa-check-circle" style="color: #28a745;"></i>
                        <strong>Compte invité créé avec succès !</strong>
                    </div>
                    <div style="font-size: 0.9rem;">
                        <p><strong>Email :</strong> ${email}</p>
                        <p>${codeInfo}</p>
                        <p><strong>Expiration du code :</strong> ${formatDate(data.guest.codeExpiresAt)}</p>
                        <p><strong>Expiration du compte :</strong> ${formatDate(data.guest.accountExpiresAt)}</p>
                    </div>
                `;
            }

            // Réinitialiser le formulaire après 4 secondes
            setTimeout(() => {
                emailInput.value = '';
                resultDiv.style.display = 'none';
                document.getElementById('createGuestModal').style.display = 'none';
            }, 4000);
        } else {
            resultDiv.style.display = 'block';
            resultDiv.style.backgroundColor = '#fee';
            resultDiv.style.borderLeft = '4px solid #dc3545';
            resultDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${data.error || 'Erreur lors de la création'}`;
        }
    } catch (error) {
        console.error('Erreur création compte invité:', error);
        resultDiv.style.display = 'block';
        resultDiv.style.backgroundColor = '#fee';
        resultDiv.style.borderLeft = '4px solid #dc3545';
        resultDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Erreur de connexion au serveur';
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="fas fa-user-plus"></i> Créer le compte';
    }
}

// ============================================
// Team Files Section (read-only)
// ============================================

async function loadTeamFilesSection() {
    // Check if user has teams via userData
    const userDataStr = localStorage.getItem('userData') || sessionStorage.getItem('userData');
    if (!userDataStr) return;

    let user;
    try {
        user = JSON.parse(userDataStr);
    } catch (e) { return; }

    const teams = user.teams || [];
    if (teams.length === 0) return;

    // Show the team files button in header
    const btn = document.getElementById('teamFilesBtn');
    if (btn) {
        btn.style.display = '';
        btn.addEventListener('click', showTeamFilesSection);
    }

    const closeBtn = document.getElementById('closeTeamFilesBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', hideTeamFilesSection);
    }
}

function showTeamFilesSection() {
    document.getElementById('filesSection').style.display = 'none';
    document.getElementById('shareLinksSection').style.display = 'none';
    document.getElementById('discoverSection').style.display = 'none';
    document.getElementById('teamFilesSection').style.display = 'block';
    loadTeamFiles();
}

function hideTeamFilesSection() {
    document.getElementById('teamFilesSection').style.display = 'none';
    document.getElementById('filesSection').style.display = 'block';
}

async function loadTeamFiles() {
    const container = document.getElementById('teamFilesContainer');
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Chargement...</p></div>';

    const userDataStr = localStorage.getItem('userData') || sessionStorage.getItem('userData');
    if (!userDataStr) return;

    let user;
    try { user = JSON.parse(userDataStr); } catch (e) { return; }

    const teams = user.teams || [];
    if (teams.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Vous n\'etes membre d\'aucune equipe</p></div>';
        return;
    }

    let html = '';
    const token = getAuthToken();

    for (const team of teams) {
        try {
            const response = await fetch(`${API_URL}/files?teamId=${team.teamId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            const files = data.files || [];

            html += `<div class="team-files-group">
                <h3 style="margin: 16px 0 12px; color: #003C61;">
                    <i class="fas fa-users"></i> ${escapeHtml(team.displayName || team.name)}
                    <span style="color: #999; font-size: 0.85rem; font-weight: 400;"> (${files.length} fichier${files.length !== 1 ? 's' : ''})</span>
                </h3>`;

            if (files.length === 0) {
                html += '<p style="color: #999; padding: 8px 0;">Aucun fichier dans cette equipe</p>';
            } else {
                html += `<table class="files-table" style="width: 100%; margin-bottom: 16px;">
                    <thead><tr><th>Nom</th><th>Taille</th><th>Type</th><th>Date</th><th>Actions</th></tr></thead>
                    <tbody>`;

                files.forEach(file => {
                    const displayName = file.metadata?.originalName || file.name;
                    html += `<tr>
                        <td><div class="file-name-cell">${getFileIcon(file.contentType)} <span>${escapeHtml(displayName)}</span></div></td>
                        <td>${formatBytes(file.size || 0)}</td>
                        <td>${getFileType(file.contentType)}</td>
                        <td>${formatDate(file.lastModified)}</td>
                        <td style="white-space:nowrap;">
                            <button class="btn-icon" onclick="window.open('${API_URL}/download/${encodeURIComponent(file.name)}', '_blank')" title="Télécharger">
                                <i class="fas fa-download"></i>
                            </button>
                            <button class="btn-icon" onclick="shareTeamFile('${escapeHtml(file.name)}', '${escapeHtml(displayName)}')" title="Partager">
                                <i class="fas fa-share-alt"></i>
                            </button>
                            <button class="btn-icon" onclick="trashTeamFile('${escapeHtml(file.name)}', '${escapeHtml(displayName)}')" title="Corbeille" style="color:#ef5350;">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </td>
                    </tr>`;
                });

                html += '</tbody></table>';
            }
            html += '</div>';
        } catch (e) {
            html += `<div class="team-files-group">
                <h3 style="margin: 16px 0 12px; color: #003C61;">
                    <i class="fas fa-users"></i> ${escapeHtml(team.displayName || team.name)}
                </h3>
                <p style="color: #dc3545; padding: 8px 0;">Erreur de chargement</p>
            </div>`;
        }
    }

    container.innerHTML = html;
    document.getElementById('teamFilesSectionTitle').textContent =
        `Fichiers d'equipe (${teams.length} equipe${teams.length > 1 ? 's' : ''})`;
}

// ============================================
// Discover Section
// ============================================

function showDiscoverSection() {
    document.getElementById('filesSection').style.display = 'none';
    document.getElementById('shareLinksSection').style.display = 'none';
    document.getElementById('teamFilesSection').style.display = 'none';
    document.getElementById('discoverSection').style.display = 'block';

    // Load current tab data
    if (discoverCurrentTab === 'tags') {
        loadDiscoverTags();
    } else if (discoverCurrentTab === 'search') {
        // Search tab: nothing to pre-load
    } else if (discoverCurrentTab === 'map') {
        loadDiscoverMap();
    }
}

function hideDiscoverSection() {
    document.getElementById('discoverSection').style.display = 'none';
    document.getElementById('filesSection').style.display = 'block';
}

function switchDiscoverTab(tabName) {
    discoverCurrentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.discover-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Show/hide tab content
    document.getElementById('discoverTabTags').style.display = tabName === 'tags' ? '' : 'none';
    document.getElementById('discoverTabSearch').style.display = tabName === 'search' ? '' : 'none';
    document.getElementById('discoverTabMap').style.display = tabName === 'map' ? '' : 'none';

    // Load data
    if (tabName === 'tags') {
        loadDiscoverTags();
    } else if (tabName === 'map') {
        loadDiscoverMap();
    }
}

async function loadDiscoverTags() {
    const container = document.getElementById('discoverTagCloud');
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Chargement des tags...</p></div>';
    container.style.display = 'flex';
    document.getElementById('discoverTagResults').style.display = 'none';

    try {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/ai/tags`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 503 || response.status === 404) {
            showDiscoverEmpty(container, 'La fonctionnalite IA n\'est pas activee sur ce serveur.');
            return;
        }
        if (response.status === 401) { handleLogout(); return; }

        const data = await response.json();
        const tags = data.tags || data || [];

        if (!Array.isArray(tags) || tags.length === 0) {
            showDiscoverEmpty(container, 'Aucun tag disponible. Analysez des fichiers pour generer des tags.');
            return;
        }

        // Determine min/max counts for sizing
        const counts = tags.map(t => t.count || 1);
        const maxCount = Math.max(...counts);
        const minCount = Math.min(...counts);
        const range = maxCount - minCount || 1;

        container.innerHTML = tags.map(tag => {
            const relative = (tag.count - minCount) / range;
            let sizeClass = 'discover-tag-sm';
            if (relative > 0.66) sizeClass = 'discover-tag-lg';
            else if (relative > 0.33) sizeClass = 'discover-tag-md';

            return `<button class="discover-tag ${sizeClass}" data-tag="${escapeHtml(tag.tag || tag.name)}">
                ${escapeHtml(tag.tag || tag.name)}
                <span class="tag-count">${tag.count}</span>
            </button>`;
        }).join('');

        // Add click events
        container.querySelectorAll('.discover-tag').forEach(btn => {
            btn.addEventListener('click', () => loadDiscoverTagFiles(btn.dataset.tag));
        });
    } catch (error) {
        console.error('Erreur chargement tags:', error);
        showDiscoverEmpty(container, 'Erreur lors du chargement des tags.');
    }
}

async function loadDiscoverTagFiles(tag) {
    document.getElementById('discoverTagCloud').style.display = 'none';
    const resultsSection = document.getElementById('discoverTagResults');
    resultsSection.style.display = 'block';
    document.getElementById('discoverTagResultsTitle').textContent = `Fichiers avec le tag "${tag}"`;
    const grid = document.getElementById('discoverTagFilesGrid');
    grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Chargement...</p></div>';

    try {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/ai/tags/${encodeURIComponent(tag)}/files`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401) { handleLogout(); return; }
        const data = await response.json();
        const files = data.files || data || [];

        if (!Array.isArray(files) || files.length === 0) {
            grid.innerHTML = '<div class="discover-empty"><i class="fas fa-folder-open"></i><p>Aucun fichier trouve pour ce tag.</p></div>';
            return;
        }

        grid.innerHTML = files.map(file => renderDiscoverFileCard(file)).join('');
        grid.querySelectorAll('.discover-file-card').forEach(card => {
            card.addEventListener('click', () => handleDiscoverFileClick(card.dataset.blobName));
        });
    } catch (error) {
        console.error('Erreur chargement fichiers tag:', error);
        grid.innerHTML = '<div class="discover-empty"><i class="fas fa-exclamation-circle"></i><p>Erreur lors du chargement.</p></div>';
    }
}

async function handleDiscoverSearch() {
    const query = document.getElementById('discoverSearchInput').value.trim();
    if (!query) return;

    document.getElementById('discoverSuggestions').style.display = 'none';
    const typeFilter = document.getElementById('discoverSearchType').value;
    const grid = document.getElementById('discoverSearchResultsGrid');
    grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Recherche en cours...</p></div>';

    try {
        const token = getAuthToken();
        let url = `${API_URL}/ai/search?q=${encodeURIComponent(query)}`;
        if (typeFilter) url += `&type=${encodeURIComponent(typeFilter)}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 503 || response.status === 404) {
            grid.innerHTML = '<div class="discover-empty"><i class="fas fa-robot"></i><p>La fonctionnalite de recherche IA n\'est pas activee.</p></div>';
            return;
        }
        if (response.status === 401) { handleLogout(); return; }

        const data = await response.json();
        const results = data.results || data || [];

        if (!Array.isArray(results) || results.length === 0) {
            grid.innerHTML = '<div class="discover-empty"><i class="fas fa-search"></i><p>Aucun resultat pour "' + escapeHtml(query) + '".</p></div>';
            return;
        }

        grid.innerHTML = results.map(file => renderDiscoverFileCard(file)).join('');
        grid.querySelectorAll('.discover-file-card').forEach(card => {
            card.addEventListener('click', () => handleDiscoverFileClick(card.dataset.blobName));
        });
    } catch (error) {
        console.error('Erreur recherche:', error);
        grid.innerHTML = '<div class="discover-empty"><i class="fas fa-exclamation-circle"></i><p>Erreur lors de la recherche.</p></div>';
    }
}

async function loadDiscoverSuggestions(query) {
    try {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/ai/search/suggestions?q=${encodeURIComponent(query)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            document.getElementById('discoverSuggestions').style.display = 'none';
            return;
        }

        const data = await response.json();
        const suggestions = data.suggestions || data || [];
        const container = document.getElementById('discoverSuggestions');

        if (!Array.isArray(suggestions) || suggestions.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.innerHTML = suggestions.map(s => {
            const text = typeof s === 'string' ? s : s.text || s.suggestion || '';
            return `<div class="discover-suggestion-item">${escapeHtml(text)}</div>`;
        }).join('');
        container.style.display = 'block';

        container.querySelectorAll('.discover-suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                document.getElementById('discoverSearchInput').value = item.textContent;
                container.style.display = 'none';
                handleDiscoverSearch();
            });
        });
    } catch (error) {
        console.error('Erreur suggestions:', error);
        document.getElementById('discoverSuggestions').style.display = 'none';
    }
}

async function loadDiscoverMap() {
    const container = document.getElementById('discover-map');
    const counter = document.getElementById('discoverMapCounter');

    // Initialize map only once
    if (!discoverMapInstance) {
        discoverMapInstance = L.map('discover-map').setView([46.6, 1.9], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(discoverMapInstance);
    }

    // Invalidate size in case container was hidden
    setTimeout(() => discoverMapInstance.invalidateSize(), 200);

    try {
        const token = getAuthToken();
        const response = await fetch(`${API_URL}/ai/map`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 503 || response.status === 404) {
            counter.textContent = 'La fonctionnalite de geolocalisation n\'est pas activee.';
            return;
        }
        if (response.status === 401) { handleLogout(); return; }

        const data = await response.json();
        const files = data.files || data || [];

        // Remove existing markers
        discoverMapInstance.eachLayer(layer => {
            if (layer instanceof L.Marker || layer instanceof L.MarkerClusterGroup) {
                discoverMapInstance.removeLayer(layer);
            }
        });

        if (!Array.isArray(files) || files.length === 0) {
            counter.textContent = 'Aucun fichier geotague.';
            return;
        }

        const markers = L.markerClusterGroup();

        files.forEach(file => {
            const lat = parseFloat(file.lat || file.latitude);
            const lng = parseFloat(file.lng || file.longitude);
            if (isNaN(lat) || isNaN(lng)) return;

            const displayName = file.originalName || file.blobName || file.blob_name || '';
            const city = file.city || '';
            const country = file.country || '';
            const location = [city, country].filter(Boolean).join(', ');

            const popup = `
                <div style="min-width: 180px;">
                    <strong>${escapeHtml(displayName)}</strong>
                    ${location ? `<br><i class="fas fa-map-marker-alt"></i> ${escapeHtml(location)}` : ''}
                    <br><small>${lat.toFixed(5)}, ${lng.toFixed(5)}</small>
                    <br><a href="#" onclick="handleDiscoverFileClick('${escapeHtml(file.blobName || file.blob_name)}'); return false;">Voir le fichier</a>
                </div>
            `;

            const marker = L.marker([lat, lng]).bindPopup(popup);
            markers.addLayer(marker);
        });

        discoverMapInstance.addLayer(markers);

        if (files.length > 0) {
            const bounds = markers.getBounds();
            if (bounds.isValid()) {
                discoverMapInstance.fitBounds(bounds, { padding: [30, 30] });
            }
        }

        counter.textContent = `${files.length} fichier${files.length > 1 ? 's' : ''} geotague${files.length > 1 ? 's' : ''}`;
    } catch (error) {
        console.error('Erreur chargement carte:', error);
        counter.textContent = 'Erreur lors du chargement de la carte.';
    }
}

function renderDiscoverFileCard(file) {
    const blobName = file.blobName || file.blob_name || file.name || '';
    const displayName = file.originalName || file.original_name || file.displayName || blobName;
    const tags = file.tags || [];
    const contentType = file.contentType || file.content_type || '';
    const isImage = contentType.startsWith('image/');

    let thumbHtml;
    if (isImage) {
        const thumbUrl = getDiscoverThumbnailUrl(blobName);
        thumbHtml = `<img src="${thumbUrl}" alt="${escapeHtml(displayName)}" class="discover-file-card-thumb" loading="lazy">`;
    } else {
        thumbHtml = `<div class="discover-file-card-icon">${getFileIcon(contentType)}</div>`;
    }

    const tagsHtml = Array.isArray(tags) && tags.length > 0
        ? `<div class="discover-file-card-tags">${tags.slice(0, 4).map(t => `<span class="mini-tag">${escapeHtml(typeof t === 'string' ? t : t.tag || '')}</span>`).join('')}</div>`
        : '';

    return `<div class="discover-file-card" data-blob-name="${escapeHtml(blobName)}">
        ${thumbHtml}
        <div class="discover-file-card-info">
            <div class="discover-file-card-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</div>
            ${tagsHtml}
        </div>
    </div>`;
}

function getDiscoverThumbnailUrl(blobName) {
    const token = getAuthToken();
    const url = `${API_URL}/preview/${encodeURIComponent(blobName)}`;
    return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

function handleDiscoverFileClick(blobName) {
    if (!blobName) return;
    const token = getAuthToken();
    const previewUrl = `${API_URL}/preview/${encodeURIComponent(blobName)}`;
    window.open(token ? `${previewUrl}?token=${encodeURIComponent(token)}` : previewUrl, '_blank');
}

function showDiscoverEmpty(container, message) {
    container.innerHTML = `<div class="discover-empty"><i class="fas fa-compass"></i><p>${message}</p></div>`;
}

// Confirm dialog (replaces native confirm())
function showConfirmDialog(title, message) {
    return new Promise(resolve => {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        const modal = document.getElementById('confirmModal');
        const yes = document.getElementById('confirmYesBtn');
        const no = document.getElementById('confirmNoBtn');
        const close = document.getElementById('confirmCloseBtn');
        const cleanup = () => {
            yes.removeEventListener('click', onYes);
            no.removeEventListener('click', onNo);
            close.removeEventListener('click', onNo);
            modal.style.display = 'none';
        };
        const onYes = () => { cleanup(); resolve(true); };
        const onNo = () => { cleanup(); resolve(false); };
        yes.addEventListener('click', onYes);
        no.addEventListener('click', onNo);
        close.addEventListener('click', onNo);
        modal.style.display = 'flex';
    });
}

// ============================================
// Corbeille (Trash)
// ============================================

async function showTrashModal() {
    document.getElementById('trashModal').style.display = 'flex';
    const list = document.getElementById('trashFilesList');
    list.innerHTML = '<p style="text-align:center;color:#666;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</p>';
    
    try {
        const token = getAuthToken();
        const res = await fetch(`${API_URL}/files/trash`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (!data.success || !data.files || data.files.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:40px;color:#999;"><i class="fas fa-recycle" style="font-size:3rem;margin-bottom:12px;display:block;"></i><p>La corbeille est vide</p></div>';
            document.getElementById('emptyTrashBtn').style.display = 'none';
            document.getElementById('restoreAllTrashBtn').style.display = 'none';
            return;
        }
        
        document.getElementById('emptyTrashBtn').style.display = 'inline-flex';
        document.getElementById('restoreAllTrashBtn').style.display = 'inline-flex';
        
        list.innerHTML = data.files.map(f => {
            const name = f.original_name || f.blob_name.split('/').pop();
            const size = f.file_size ? formatSize(f.file_size) : '—';
            const trashedDate = f.trashed_at ? new Date(f.trashed_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
            const icon = getFileIcon(name);
            
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:8px;background:#fafafa;">
                <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
                    <i class="${icon}" style="font-size:1.3rem;color:#999;width:24px;text-align:center;"></i>
                    <div style="min-width:0;">
                        <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(name)}</div>
                        <div style="font-size:0.8rem;color:#888;">${size} · Supprimé le ${trashedDate}</div>
                    </div>
                </div>
                <div style="display:flex;gap:8px;flex-shrink:0;">
                    <button onclick="restoreFile('${escapeHtml(f.blob_name)}')" style="background:#4caf50;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:0.8rem;" title="Restaurer">
                        <i class="fas fa-undo"></i> Restaurer
                    </button>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        list.innerHTML = `<p style="color:#c62828;text-align:center;">Erreur: ${e.message}</p>`;
    }
}

async function restoreFile(blobName) {
    if (!confirm('Restaurer ce fichier ?\n\nLa réhydratation depuis Archive peut prendre quelques heures.')) return;
    try {
        const token = getAuthToken();
        const res = await fetch(`${API_URL}/files/restore`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ blobName })
        });
        const data = await res.json();
        if (data.success) {
            showSuccess(data.message || 'Fichier restauré');
            showTrashModal(); // Refresh
            loadFiles(currentPath);
        } else {
            showError(data.error || 'Erreur');
        }
    } catch (e) { showError(e.message); }
}

async function emptyTrash() {
    if (!confirm('Vider la corbeille ?\n\nTous les fichiers seront supprimés DÉFINITIVEMENT.')) return;
    if (!confirm('⚠️ Dernière chance !\n\nCette action est irréversible.')) return;
    try {
        const token = getAuthToken();
        const res = await fetch(`${API_URL}/files/trash/empty`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            showSuccess(data.message);
            showTrashModal(); // Refresh
        } else {
            showError(data.error || 'Erreur');
        }
    } catch (e) { showError(e.message); }
}

function getFileIcon(name) {
    const ext = (name || '').split('.').pop().toLowerCase();
    const icons = {
        pdf: 'fas fa-file-pdf', doc: 'fas fa-file-word', docx: 'fas fa-file-word',
        xls: 'fas fa-file-excel', xlsx: 'fas fa-file-excel', ppt: 'fas fa-file-powerpoint',
        pptx: 'fas fa-file-powerpoint', jpg: 'fas fa-file-image', jpeg: 'fas fa-file-image',
        png: 'fas fa-file-image', gif: 'fas fa-file-image', svg: 'fas fa-file-image',
        mp4: 'fas fa-file-video', mov: 'fas fa-file-video', avi: 'fas fa-file-video',
        mp3: 'fas fa-file-audio', wav: 'fas fa-file-audio', zip: 'fas fa-file-archive',
        rar: 'fas fa-file-archive', txt: 'fas fa-file-alt', csv: 'fas fa-file-csv'
    };
    return icons[ext] || 'fas fa-file';
}

async function restoreAllTrash() {
    if (!confirm('Restaurer tous les fichiers de la corbeille ?\n\nLa réhydratation depuis Archive peut prendre quelques heures.')) return;
    try {
        const token = getAuthToken();
        const res = await fetch(`${API_URL}/files/trash/restore-all`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const data = await res.json();
        if (data.success) {
            showSuccess(data.message);
            showTrashModal(); // Refresh
            loadFiles(currentPath);
        } else {
            showError(data.error || 'Erreur');
        }
    } catch (e) { showError(e.message); }
}

// Share a team file directly
async function shareTeamFile(blobName, displayName) {
    contextMenuFile = blobName;
    // Build a fake file entry for showShareModal
    const fakeFile = { name: blobName, displayName: displayName, isFolder: false, size: null };
    // Temporarily inject into filteredFiles
    if (!filteredFiles.find(f => f.name === blobName)) {
        filteredFiles.push(fakeFile);
    }
    showShareModal();
}

// Trash a team file
async function trashTeamFile(blobName, displayName) {
    if (!confirm(`Mettre "${displayName}" en corbeille ?\n\nLe fichier sera archivé et pourra être restauré.`)) return;
    try {
        const token = getAuthToken();
        const res = await fetch(`${API_URL}/files/trash`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ blobName })
        });
        const data = await res.json();
        if (data.success) {
            showSuccess('Fichier mis en corbeille');
            loadTeamFiles(); // Refresh team files
        } else {
            showError(data.error || 'Erreur');
        }
    } catch (e) { showError(e.message); }
}

// ============================================================================
// FINOPS
// ============================================================================

function showFinopsSection() {
    document.getElementById('filesSection').style.display = 'none';
    document.getElementById('shareLinksSection').style.display = 'none';
    document.getElementById('teamFilesSection').style.display = 'none';
    document.getElementById('discoverSection').style.display = 'none';
    document.getElementById('finopsSection').style.display = 'block';
    loadFinopsData();
}

function hideFinopsSection() {
    document.getElementById('finopsSection').style.display = 'none';
    document.getElementById('filesSection').style.display = 'block';
}

function formatCost(euros) {
    if (euros < 0.01) return '< 0,01 €';
    if (euros < 1) return euros.toFixed(3).replace('.', ',') + ' €';
    return euros.toFixed(2).replace('.', ',') + ' €';
}

function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 o';
    const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0) + ' ' + units[i];
}

async function loadFinopsData() {
    try {
        const response = await fetch(`${API_URL}/finops/me`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error);

        const s = data.summary;

        // Summary cards
        document.getElementById('finopsTotalStorage').textContent = formatCost(s.totalStorageCostMonth);
        document.getElementById('finopsTotalSize').textContent = `${data.summary.totalFiles} fichiers — ${formatSize(s.totalSize)}`;
        document.getElementById('finopsShareCost').textContent = formatCost(s.totalShareCost);
        document.getElementById('finopsShareInfo').textContent = `${s.totalDownloads} téléchargements — ${s.activeShares} partages actifs`;
        document.getElementById('finopsGuestCost').textContent = formatCost(data.guestUploads.estimatedCost);
        document.getElementById('finopsGuestInfo').textContent = `${data.guestUploads.count} fichiers reçus — ${formatSize(data.guestUploads.totalSize)}`;
        document.getElementById('finopsTotalCost').textContent = formatCost(s.totalCostMonth);

        const savingEl = document.getElementById('finopsPotentialSaving');
        if (s.potentialSavingMonth > 0.001) {
            savingEl.style.display = 'inline-block';
            savingEl.querySelector('span').textContent = formatCost(s.potentialSavingMonth);
        } else {
            savingEl.style.display = 'none';
        }

        // Tier bar
        renderTierBar(data.costByTier, s.totalSize);

        // Optimizations
        renderOptimizations(data.optimizations);

    } catch (e) {
        console.error('FinOps error:', e);
        document.getElementById('finopsOptimList').innerHTML = '<p class="finops-empty">Erreur de chargement</p>';
    }
}

function renderTierBar(costByTier, totalSize) {
    const tierBar = document.getElementById('finopsTierBar');
    const tierLegend = document.getElementById('finopsTierLegend');
    const colors = { Hot: '#ef5350', Cool: '#42a5f5', Archive: '#78909c' };
    const labels = { Hot: 'Hot (fréquent)', Cool: 'Cool (occasionnel)', Archive: 'Archive (rare)' };

    if (!totalSize || totalSize === 0) {
        tierBar.innerHTML = '<div style="width:100%;background:#e0e0e0;color:#999;">Aucun fichier</div>';
        tierLegend.innerHTML = '';
        return;
    }

    tierBar.innerHTML = '';
    tierLegend.innerHTML = '';

    for (const tier of ['Hot', 'Cool', 'Archive']) {
        const t = costByTier[tier] || { size: 0, count: 0, cost: 0 };
        const pct = (t.size / totalSize) * 100;
        if (pct > 0) {
            const div = document.createElement('div');
            div.style.width = Math.max(pct, 3) + '%';
            div.style.background = colors[tier];
            div.textContent = pct >= 10 ? Math.round(pct) + '%' : '';
            div.title = `${tier}: ${formatSize(t.size)} (${t.count} fichiers) — ${formatCost(t.cost)}/mois`;
            tierBar.appendChild(div);
        }

        tierLegend.innerHTML += `
            <div>
                <span class="dot" style="background:${colors[tier]}"></span>
                <strong>${labels[tier]}</strong>: ${t.count} fichiers, ${formatSize(t.size)} — ${formatCost(t.cost)}/mois
            </div>`;
    }
}

function renderOptimizations(optimizations) {
    const container = document.getElementById('finopsOptimList');
    if (!optimizations || optimizations.length === 0) {
        container.innerHTML = '<p class="finops-no-optim">✅ Tous vos fichiers sont dans le tier optimal !</p>';
        return;
    }

    container.innerHTML = optimizations.map(o => {
        const buttons = o.suggestions.map(s => `
            <button class="btn-optimize btn-${s.tier.toLowerCase()}" onclick="applyOptimization('${o.blobName.replace(/'/g, "\\'")}', '${s.tier}', this)">
                → ${s.tier} <span class="saving-badge">-${s.savingPercent}%</span>
            </button>
        `).join('');

        return `
            <div class="finops-optim-item">
                <div class="file-info">
                    <div class="file-name">${o.fileName}</div>
                    <div class="file-meta">${formatSize(o.fileSize)} — ${o.ageDays} jours en ${o.currentTier}</div>
                </div>
                <div class="cost-compare">
                    <span class="cost-current">${formatCost(o.currentCostMonth)}/mois</span>
                    <span class="cost-new">${formatCost(o.suggestions[0].costMonth)}/mois</span>
                </div>
                <div>${buttons}</div>
            </div>`;
    }).join('');
}

async function applyOptimization(blobName, targetTier, btn) {
    if (!confirm(`Passer ce fichier en ${targetTier} ?\n\n⚠️ ${targetTier === 'Archive' ? 'La réhydratation depuis Archive peut prendre plusieurs heures.' : 'Accès moins fréquent, coût réduit.'}`)) return;
    
    btn.disabled = true;
    btn.textContent = '...';
    
    try {
        const response = await fetch(`${API_URL}/finops/optimize`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}` 
            },
            body: JSON.stringify({ blobName, targetTier })
        });
        const data = await response.json();
        if (data.success) {
            showSuccess(`Fichier déplacé vers ${targetTier}`);
            loadFinopsData(); // Recharger
        } else {
            showError(data.error || 'Erreur');
            btn.disabled = false;
        }
    } catch (e) {
        showError(e.message);
        btn.disabled = false;
    }
}

// ============================================================================
// PRÉVISUALISATION
// ============================================================================

function showPreview(blobName) {
    const file = filteredFiles.find(f => f.name === blobName);
    if (!file || file.isFolder) return;

    const displayName = file.displayName || file.originalName || blobName.split('/').pop();
    const contentType = file.contentType || '';
    const token = getAuthToken();
    const previewUrl = `${API_URL}/preview/${encodeURIComponent(blobName)}?token=${encodeURIComponent(token)}`;

    document.getElementById('previewTitle').textContent = displayName;
    
    // Download button
    document.getElementById('previewDownloadBtn').onclick = () => {
        const a = document.createElement('a');
        a.href = `${API_URL}/download/${encodeURIComponent(blobName)}?token=${encodeURIComponent(token)}`;
        a.download = displayName;
        a.click();
    };

    const body = document.getElementById('previewBody');

    if (contentType.startsWith('image/')) {
        body.innerHTML = `<img src="${previewUrl}" alt="${escapeHtml(displayName)}" />`;
    } else if (contentType === 'application/pdf') {
        body.innerHTML = `<iframe src="${previewUrl}#toolbar=1&navpanes=0" title="${escapeHtml(displayName)}"></iframe>`;
    } else if (contentType.startsWith('video/')) {
        body.innerHTML = `<video controls autoplay><source src="${previewUrl}" type="${contentType}">Votre navigateur ne supporte pas la vidéo.</video>`;
    } else if (contentType.startsWith('audio/')) {
        body.innerHTML = `<audio controls autoplay><source src="${previewUrl}" type="${contentType}">Votre navigateur ne supporte pas l'audio.</audio>`;
    } else if (contentType.startsWith('text/') || contentType === 'application/json' || contentType === 'application/xml') {
        body.innerHTML = '<div class="spinner"></div>';
        fetch(previewUrl).then(r => r.text()).then(text => {
            body.innerHTML = `<pre style="color:#e0e0e0;background:#111;padding:20px;border-radius:8px;overflow:auto;width:100%;max-height:100%;font-size:0.85rem;white-space:pre-wrap;">${escapeHtml(text)}</pre>`;
        }).catch(() => {
            body.innerHTML = '<div class="preview-unsupported"><i class="fas fa-exclamation-triangle"></i>Erreur de chargement</div>';
        });
    } else {
        body.innerHTML = `<div class="preview-unsupported">
            <i class="fas fa-file"></i>
            <p><strong>${escapeHtml(displayName)}</strong></p>
            <p>Aperçu non disponible pour ce type de fichier</p>
            <button class="btn btn-primary" onclick="document.getElementById('previewDownloadBtn').click()" style="margin-top:12px;">
                <i class="fas fa-download"></i> Télécharger
            </button>
        </div>`;
    }

    document.getElementById('previewModal').style.display = 'flex';
}

function closePreview() {
    document.getElementById('previewModal').style.display = 'none';
    // Stop video/audio
    const body = document.getElementById('previewBody');
    body.querySelectorAll('video, audio').forEach(el => { el.pause(); el.src = ''; });
    body.innerHTML = '';
}

// Double-click sur un fichier = preview
document.addEventListener('dblclick', (e) => {
    const fileCard = e.target.closest('.file-card[data-file-name], .file-row[data-file-name]');
    if (fileCard) {
        const fileName = fileCard.dataset.fileName;
        const file = filteredFiles.find(f => f.name === fileName);
        if (file && !file.isFolder) {
            e.preventDefault();
            showPreview(fileName);
        }
    }
});

// Escape ferme le preview
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('previewModal').style.display === 'flex') {
        closePreview();
    }
});

// Branding: apply company name + logo
(async () => {
    try {
        const res = await fetch(`${API_URL}/company-info`);
        const data = await res.json();
        if (data.success) {
            document.title = `${data.companyName} — Mon espace`;
            document.querySelectorAll('.company-logo-img').forEach(el => {
                if (data.hasLogo) el.src = `${API_URL}/company-logo?t=${Date.now()}`;
            });
        }
    } catch (e) { /* ignore */ }
})();
