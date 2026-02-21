// Configuration
const API_URL = window.location.origin + '/api';

// Encode blob path: encode each segment but keep slashes
function encodeBlobPath(blobName) {
    return blobName.split('/').map(s => encodeURIComponent(s)).join('/');
}

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

// État du contexte équipe
let currentContext = 'my'; // 'my' ou teamId (number)
let userTeamsList = []; // équipes de l'utilisateur
let currentTeamRole = null; // rôle dans l'équipe courante

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initializeEventListeners();
    loadFiles();
    initContextTabs();
    load2FAStatus();
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
        const displayName = user.username || user.full_name || user.fullName || user.name || 'Utilisateur';
        document.getElementById('userName').textContent = displayName + ' ▾';
        // Fill dropdown header
        const ddName = document.getElementById('dropdownUserName');
        const ddRole = document.getElementById('dropdownUserRole');
        if (ddName) ddName.textContent = displayName;
        if (ddRole) {
            const roleLabels = { admin: 'Administrateur', com: 'Communication', user: 'Utilisateur', viewer: 'Lecteur' };
            ddRole.textContent = roleLabels[user.role] || user.role || '';
        }
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
        if (currentContext !== 'my') {
            currentPath = '';
            loadFiles();
        } else {
            loadFiles(currentPath);
        }
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
        let url;
        if (currentContext !== 'my') {
            // Team context: use /api/files?teamId=X
            url = `${API_URL}/files?teamId=${currentContext}`;
            if (path) url += `&path=${encodeURIComponent(path)}`;
        } else {
            url = path ? `${API_URL}/user/files?path=${encodeURIComponent(path)}` : `${API_URL}/user/files`;
        }
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
        if (data.success || data.files) {
            currentPath = data.currentPath || '';
            if (data.userPrefix) window._userPrefix = data.userPrefix;
            let files = data.files || [];
            
            // Normalize team files to match user files format
            if (currentContext !== 'my') {
                files = files.map(f => ({
                    ...f,
                    displayName: f.displayName || f.originalName || (f.metadata && f.metadata.originalName) || f.name.split('/').pop(),
                    isFolder: f.isFolder || false,
                    blobName: f.name
                }));
            }
            
            allFiles = files;
            
            // Charger les tags pour la recherche
            try {
                const tagsRes = await fetch(`${API_URL}/tags/all`, {
                    headers: { 'Authorization': `Bearer ${getAuthToken()}` }
                });
                const tagsData = await tagsRes.json();
                if (tagsData.success && tagsData.tags) {
                    for (const f of allFiles) {
                        f.tags = tagsData.tags[f.name] || tagsData.tags[f.blobName] || [];
                    }
                }
            } catch (e) { /* tags optionnels */ }
            
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
        const tagsStr = (file.tags || []).join(' ').toLowerCase();
        const matchesSearch = !searchTerm || displayName.includes(searchTerm) || tagsStr.includes(searchTerm);
        
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

    if (currentView === 'list') {
        renderListView();
    } else {
        renderGridView();
    }
}

function renderGridView() {
    const grid = document.getElementById('filesGrid');
    grid.style.display = 'grid';
    grid.classList.toggle('compact', currentView === 'grid-compact');
    document.getElementById('filesList').style.display = 'none';

    const token = getAuthToken();

    grid.innerHTML = filteredFiles.map(file => {
        const isFolder = file.isFolder;
        const isImage = !isFolder && file.contentType && file.contentType.startsWith('image/');
        const displayName = file.displayName || file.originalName || file.name;
        
        const isVideo = !isFolder && file.contentType && file.contentType.startsWith('video/');
        const isPdf = !isFolder && file.contentType === 'application/pdf';
        const isArchived = file.tier === 'Archive';
        const thumbSize = currentView === 'grid-compact' ? '&size=sm' : '';
        const archiveFallback = (type) => `onerror="this.outerHTML='<img src=\\'img/archive-${type}.svg\\' class=\\'file-card-image\\' style=\\'object-fit:contain;padding:8px;\\'>'"`; 
        let thumbnail;
        if (isFolder) {
            thumbnail = `<div class="file-card-icon folder-icon"><i class="fas fa-folder"></i></div>`;
        } else if (isArchived && (isImage || isVideo || isPdf)) {
            // Fichier archivé : utiliser le cache thumbnail, fallback SVG glacier
            const thumbUrl = `${API_URL}/thumbnail/${encodeBlobPath(file.name)}?token=${encodeURIComponent(token)}${thumbSize}`;
            const svgType = isVideo ? 'video' : isImage ? 'image' : 'pdf';
            thumbnail = `<img src="${thumbUrl}" alt="${displayName}" class="file-card-image" loading="lazy" style="object-fit:contain;" ${archiveFallback(svgType)}>`;
        } else if (isImage) {
            const imageUrl = `${API_URL}/preview/${encodeBlobPath(file.name)}?token=${encodeURIComponent(token)}`;
            thumbnail = `<img src="${imageUrl}" alt="${displayName}" class="file-card-image" loading="lazy">`;
        } else if (isVideo) {
            const thumbUrl = `${API_URL}/thumbnail/${encodeBlobPath(file.name)}?token=${encodeURIComponent(token)}${thumbSize}`;
            thumbnail = `<div class="file-card-video-thumb"><img src="${thumbUrl}" alt="${displayName}" class="file-card-image" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'file-card-icon\\'>' + getFileIcon('video/mp4') + '</div>'"><div class="video-play-overlay"><i class="fas fa-play-circle"></i></div></div>`;
        } else if (isPdf) {
            const thumbUrl = `${API_URL}/thumbnail/${encodeBlobPath(file.name)}?token=${encodeURIComponent(token)}${thumbSize}`;
            thumbnail = `<div class="file-card-pdf-thumb"><img src="${thumbUrl}" alt="${displayName}" class="file-card-image" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'file-card-icon\\'>' + getFileIcon('application/pdf') + '</div>'"><div class="pdf-badge">PDF</div></div>`;
        } else if (isArchived) {
            thumbnail = `<img src="img/archive-file.svg" alt="Archivé" class="file-card-image" style="object-fit:contain;padding:8px;">`;
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
        
        const isVideo = !isFolder && file.contentType && file.contentType.startsWith('video/');
        const isPdf = !isFolder && file.contentType === 'application/pdf';
        const isArchived = file.tier === 'Archive';
        let icon;
        if (isFolder) {
            icon = `<div class="file-icon-placeholder folder-icon"><i class="fas fa-folder"></i></div>`;
        } else if (isArchived && (isImage || isVideo || isPdf)) {
            const thumbUrl = `${API_URL}/thumbnail/${encodeBlobPath(file.name)}?token=${encodeURIComponent(token)}&size=sm`;
            const svgType = isVideo ? 'video' : isImage ? 'image' : 'pdf';
            icon = `<img src="${thumbUrl}" alt="${displayName}" class="file-icon" loading="lazy" style="border-radius:4px;" onerror="this.src='img/archive-${svgType}.svg';this.style.objectFit='contain';this.onerror=null;">`;
        } else if (isArchived) {
            icon = `<img src="img/archive-file.svg" alt="Archivé" class="file-icon" style="object-fit:contain;">`;
        } else if (isImage) {
            const imageUrl = `${API_URL}/preview/${encodeBlobPath(file.name)}?token=${encodeURIComponent(token)}`;
            icon = `<img src="${imageUrl}" alt="${displayName}" class="file-icon" loading="lazy">`;
        } else if (isVideo || isPdf) {
            const thumbUrl = `${API_URL}/thumbnail/${encodeBlobPath(file.name)}?token=${encodeURIComponent(token)}&size=sm`;
            icon = `<img src="${thumbUrl}" alt="${displayName}" class="file-icon" loading="lazy" style="border-radius:4px;" onerror="this.outerHTML='<div class=\\'file-icon-placeholder\\'>' + getFileIcon(this.alt.match(/\\.pdf$/i) ? 'application/pdf' : 'video/mp4') + '</div>'">`;
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
    const type = getFileIconClass(contentType);
    const icons = {
        'fa-file-image':  { color: '#10b981', svg: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/><circle cx="10" cy="13" r="2"/><path d="M20 17l-3.5-3.5L10 20H6l4-6 2.5 2.5L16 12"/>' },
        'fa-file-video':  { color: '#6366f1', svg: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/><polygon points="10,11 10,17 15,14"/>' },
        'fa-file-audio':  { color: '#f59e0b', svg: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/><path d="M10 12v5a2 2 0 104 0v-5"/>' },
        'fa-file-pdf':    { color: '#DC2626', svg: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/><text x="7" y="17" font-size="6" font-weight="bold" fill="currentColor">PDF</text>' },
        'fa-file-word':   { color: '#2563eb', svg: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/><text x="7" y="17" font-size="6" font-weight="bold" fill="currentColor">W</text>' },
        'fa-file-excel':  { color: '#16a34a', svg: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/><text x="7" y="17" font-size="6" font-weight="bold" fill="currentColor">XL</text>' },
        'fa-file-archive': { color: '#8b5cf6', svg: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/><rect x="9" y="12" width="6" height="5" rx="1"/><path d="M10 12v-1h4v1"/>' },
        'fa-file-code':   { color: '#06b6d4', svg: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/><path d="M9 15l-2-2 2-2"/><path d="M15 15l2-2-2-2"/>' },
        'fa-file-alt':    { color: '#64748b', svg: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="16" x2="13" y2="16"/>' },
        'fa-file':        { color: '#94a3b8', svg: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/>' }
    };
    const i = icons[type] || icons['fa-file'];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="${i.color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:${i.color}">${i.svg}</svg>`;
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
        ? `${API_URL}/preview/${encodeBlobPath(currentImage.name)}?token=${encodeURIComponent(token)}`
        : `${API_URL}/preview/${encodeBlobPath(currentImage.name)}`;
    
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
    showPreview(fileName);
}

function downloadFile(fileName) {
    const file = filteredFiles.find(f => f.name === fileName);
    if (!file || file.isFolder) return;

    if (file.tier === 'Archive' || file.tier === 'archive') {
        showRehydrateDialog(file);
        return;
    }

    const token = getAuthToken();
    window.location.href = `${API_URL}/download/${encodeBlobPath(fileName)}${token ? '?token=' + encodeURIComponent(token) : ''}`;
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

    uploadZone.addEventListener('click', (e) => {
        // Ne pas déclencher si on clique sur le bouton (il a son propre onclick)
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
        document.getElementById('fileInput').click();
    });
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    handleFiles(files);
    // Reset input pour permettre re-upload du même fichier
    e.target.value = '';
}

async function handleFiles(files) {
    if (!files || files.length === 0) {
        showError('Aucun fichier sélectionné');
        return;
    }
    const token = getAuthToken();
    if (!token) {
        showError('Session expirée, veuillez vous reconnecter');
        window.location.href = 'login.html';
        return;
    }
    const uploadProgress = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const uploadFilesList = document.getElementById('uploadFilesList');

    uploadProgress.style.display = 'block';
    uploadFilesList.innerHTML = '';

    // Ajouter la barre de progression par fichier
    progressFill.style.width = '0%';
    progressText.textContent = '0%';

    let uploaded = 0;
    const total = files.length;

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' o';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' Ko';
        if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' Mo';
        return (bytes / 1073741824).toFixed(2) + ' Go';
    }

    function uploadFile(file) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);
            if (currentPath) formData.append('path', currentPath);
            if (currentContext !== 'my') formData.append('teamId', currentContext);

            let url = currentPath ? `${API_URL}/upload?path=${encodeURIComponent(currentPath)}` : `${API_URL}/upload`;
            if (currentContext !== 'my') {
                url += (url.includes('?') ? '&' : '?') + `teamId=${currentContext}`;
            }

            // Créer l'élément de progression pour ce fichier
            const fileItem = document.createElement('div');
            fileItem.className = 'upload-file-item';
            fileItem.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;width:100%">
                    <i class="fas fa-spinner fa-spin" style="color:var(--april-blue);"></i>
                    <div style="flex:1;min-width:0">
                        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">${file.name}</span>
                            <span class="file-upload-stats" style="font-size:0.8em;color:#666">0% — ${formatSize(file.size)}</span>
                        </div>
                        <div style="width:100%;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden">
                            <div class="file-progress-bar" style="width:0%;height:100%;background:linear-gradient(90deg,var(--april-blue),var(--april-green));border-radius:3px;transition:width 0.2s"></div>
                        </div>
                    </div>
                </div>
            `;
            uploadFilesList.appendChild(fileItem);
            const fileProgressBar = fileItem.querySelector('.file-progress-bar');
            const fileStats = fileItem.querySelector('.file-upload-stats');
            const fileIcon = fileItem.querySelector('i');

            const xhr = new XMLHttpRequest();
            const startTime = Date.now();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const pct = Math.round((e.loaded / e.total) * 100);
                    fileProgressBar.style.width = pct + '%';

                    // Vitesse et temps restant
                    const elapsed = (Date.now() - startTime) / 1000;
                    const speed = elapsed > 0 ? e.loaded / elapsed : 0;
                    const remaining = speed > 0 ? (e.total - e.loaded) / speed : 0;
                    const speedStr = formatSize(Math.round(speed)) + '/s';
                    const remainStr = remaining > 60 ? Math.round(remaining / 60) + ' min' : Math.round(remaining) + ' s';

                    fileStats.textContent = pct < 100
                        ? `${pct}% — ${formatSize(e.loaded)}/${formatSize(e.total)} — ${speedStr} — ~${remainStr}`
                        : `Traitement en cours...`;

                    // Progression globale
                    const globalPct = Math.round(((uploaded + pct / 100) / total) * 100);
                    progressFill.style.width = globalPct + '%';
                    progressText.textContent = globalPct + '%';
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    fileIcon.className = 'fas fa-check-circle';
                    fileIcon.style.color = 'var(--april-green)';
                    fileStats.textContent = `✓ ${formatSize(file.size)}`;
                    fileProgressBar.style.width = '100%';
                    resolve();
                } else {
                    let errMsg = `HTTP ${xhr.status}`;
                    try { errMsg = JSON.parse(xhr.responseText).error || errMsg; } catch(e) {}
                    fileIcon.className = 'fas fa-times-circle';
                    fileIcon.style.color = '#DC2626';
                    fileStats.textContent = errMsg;
                    fileProgressBar.style.background = '#DC2626';
                    reject(new Error(errMsg));
                }
            });

            xhr.addEventListener('error', () => {
                fileIcon.className = 'fas fa-times-circle';
                fileIcon.style.color = '#DC2626';
                fileStats.textContent = 'Erreur réseau';
                fileProgressBar.style.background = '#DC2626';
                reject(new Error('Erreur réseau'));
            });

            xhr.open('POST', url);
            xhr.setRequestHeader('Authorization', `Bearer ${getAuthToken()}`);
            xhr.send(formData);
        });
    }

    for (const file of files) {
        try {
            await uploadFile(file);
            uploaded++;
            const globalPct = Math.round((uploaded / total) * 100);
            progressFill.style.width = globalPct + '%';
            progressText.textContent = globalPct + '%';
        } catch (error) {
            console.error('Erreur upload:', error);
            showError(`Erreur upload "${file.name}": ${error.message}`);
        }
    }

    if (uploaded === total) {
        progressText.textContent = '100% — Terminé !';
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
        document.getElementById('contextInfo').onclick = () => {
            menu.style.display = 'none';
            showFileInfoPanel(contextMenuFile, contextMenuIsFolder);
        };
        document.getElementById('contextDelete').onclick = () => {
            menu.style.display = 'none';
            handleDelete();
        };
        // Tier submenu
        document.querySelectorAll('#contextTierSubmenu .context-menu-item').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                menu.style.display = 'none';
                const newTier = btn.dataset.tier;
                const file = filteredFiles.find(f => f.name === contextMenuFile);
                if (!file) return;
                const currentTier = file.tier || 'Cool';
                changeFileTier(contextMenuFile, newTier, currentTier);
            };
        });
        menu.dataset.initialized = 'true';
    }
    
    // Marquer le tier actif et masquer pour les dossiers
    const tierMenu = document.getElementById('contextTierMenu');
    if (isFolder) {
        tierMenu.style.display = 'none';
    } else {
        tierMenu.style.display = '';
        const file = filteredFiles.find(f => f.name === fileName);
        const currentTier = file?.tier || 'Cool';
        document.querySelectorAll('#contextTierSubmenu .context-menu-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tier === currentTier);
        });
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
    
    // Show/hide "delete expired" button
    const now = new Date();
    const expiredLinks = links.filter(l => new Date(l.expires_at) < now);
    const deleteExpiredBtn = document.getElementById('deleteExpiredLinksBtn');
    if (deleteExpiredBtn) {
        deleteExpiredBtn.style.display = expiredLinks.length > 0 ? '' : 'none';
        deleteExpiredBtn.textContent = '';
        deleteExpiredBtn.innerHTML = `<i class="fas fa-trash"></i> Supprimer les expirés (${expiredLinks.length})`;
        deleteExpiredBtn.onclick = () => deleteExpiredShareLinks(expiredLinks);
    }
    
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
    if (contentType.includes('powerpoint') || contentType.includes('presentation')) return 'fa-file-powerpoint';
    if (contentType.includes('zip') || contentType.includes('archive') || contentType.includes('compressed')) return 'fa-file-archive';
    if (contentType.startsWith('text/') || contentType === 'application/json' || contentType === 'application/xml') return 'fa-file-alt';
    if (contentType.includes('javascript') || contentType.includes('css') || contentType.includes('html')) return 'fa-file-code';
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

async function deleteExpiredShareLinks(expiredLinks) {
    if (!confirm(`Supprimer ${expiredLinks.length} lien(s) de partage expiré(s) ?`)) return;
    const token = getAuthToken();
    let deleted = 0;
    for (const link of expiredLinks) {
        try {
            const res = await fetch(`${API_URL}/user/share-links/${link.link_id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) deleted++;
        } catch {}
    }
    showSuccess(`${deleted} lien(s) expiré(s) supprimé(s)`);
    loadShareLinks();
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
// Discover Section
// ============================================

function showDiscoverSection() {
    document.getElementById('filesSection').style.display = 'none';
    document.getElementById('shareLinksSection').style.display = 'none';
    
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
    const url = `${API_URL}/preview/${encodeBlobPath(blobName)}`;
    return token ? `${url}?token=${encodeURIComponent(token)}` : url;
}

function handleDiscoverFileClick(blobName) {
    if (!blobName) return;
    const token = getAuthToken();
    const previewUrl = `${API_URL}/preview/${encodeBlobPath(blobName)}`;
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

// getFileIcon supprimé ici — utilise la version SVG définie plus haut (ligne ~666)

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
// FINOPS
// ============================================================================

function showFinopsSection() {
    document.getElementById('filesSection').style.display = 'none';
    document.getElementById('shareLinksSection').style.display = 'none';
    
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
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
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
                'Authorization': `Bearer ${getAuthToken()}` 
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

    // Bloquer le preview si fichier archivé
    if (file.tier === 'Archive' || file.tier === 'archive') {
        showRehydrateDialog(file);
        return;
    }

    currentPreviewBlobName = blobName;
    const displayName = file.displayName || file.originalName || blobName.split('/').pop();
    const contentType = file.contentType || '';
    const token = getAuthToken();
    const previewUrl = `${API_URL}/preview/${encodeBlobPath(blobName)}?token=${encodeURIComponent(token)}`;
    
    // Reset comments panel
    document.getElementById('commentsPanel').style.display = 'none';
    document.getElementById('commentCount').textContent = '';
    // Pre-load comment count
    fetch(`${API_URL}/files/${encodeBlobPath(blobName)}/comments`, {
        headers: { 'Authorization': `Bearer ${getAuthToken()}` }
    }).then(r => r.json()).then(d => {
        if (d.success && d.comments.length > 0) document.getElementById('commentCount').textContent = d.comments.length;
    }).catch(() => {});

    document.getElementById('previewTitle').textContent = displayName;
    
    // Download button
    document.getElementById('previewDownloadBtn').onclick = () => {
        const a = document.createElement('a');
        a.href = `${API_URL}/download/${encodeBlobPath(blobName)}?token=${encodeURIComponent(token)}`;
        a.download = displayName;
        a.click();
    };

    const body = document.getElementById('previewBody');

    if (contentType.startsWith('image/')) {
        body.innerHTML = `<img src="${previewUrl}" alt="${escapeHtml(displayName)}" />`;
    } else if (contentType === 'application/pdf') {
        body.innerHTML = `<iframe src="${previewUrl}#toolbar=1&navpanes=0" title="${escapeHtml(displayName)}" style="flex:1;"></iframe>`;
        // Add annotate button in header
        const annotBtn = document.createElement('button');
        annotBtn.className = 'btn-icon';
        annotBtn.title = 'Annoter ce PDF';
        annotBtn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
        annotBtn.style.color = '#ffa000';
        annotBtn.onclick = () => { window.open(`pdf-annotate.html?file=${encodeURIComponent(blobName)}`, '_blank'); };
        document.querySelector('.preview-actions').insertBefore(annotBtn, document.getElementById('previewDownloadBtn'));
    } else if (contentType.startsWith('video/')) {
        body.innerHTML = `
        <div class="video-player-container" id="videoPlayerContainer">
            <video id="videoPlayer" preload="metadata"><source src="${previewUrl}" type="video/mp4"></video>
            <div class="video-overlay" id="videoOverlay" onclick="toggleVideoPlay()">
                <div class="video-play-icon"><i class="fas fa-play"></i></div>
            </div>
            <div class="video-markers" id="videoMarkers"></div>
            <div class="video-controls">
                <button class="vc-btn" onclick="toggleVideoPlay()" id="vcPlayBtn"><i class="fas fa-play"></i></button>
                <span class="vc-time" id="vcCurrentTime">0:00</span>
                <div class="vc-progress" id="vcProgress" onclick="seekVideo(event)">
                    <div class="vc-progress-bar" id="vcProgressBar"></div>
                    <div class="vc-progress-markers" id="vcProgressMarkers"></div>
                </div>
                <span class="vc-time" id="vcDuration">0:00</span>
                <select class="vc-speed" id="vcSpeed" onchange="document.getElementById('videoPlayer').playbackRate=parseFloat(this.value)">
                    <option value="0.5">0.5×</option>
                    <option value="0.75">0.75×</option>
                    <option value="1" selected>1×</option>
                    <option value="1.25">1.25×</option>
                    <option value="1.5">1.5×</option>
                    <option value="2">2×</option>
                </select>
                <button class="vc-btn" onclick="captureVideoFrame()" title="Capture d'écran"><i class="fas fa-camera"></i></button>
                <button class="vc-btn" onclick="toggleVideoComment()" title="Commenter ce moment"><i class="fas fa-comment-dots"></i></button>
                <button class="vc-btn" onclick="document.getElementById('videoPlayer').requestFullscreen()" title="Plein écran"><i class="fas fa-expand"></i></button>
            </div>
            <div class="video-comment-bar" id="videoCommentBar" style="display:none;">
                <input type="text" id="videoCommentInput" placeholder="Commentaire à ce timecode..." onkeydown="if(event.key==='Enter')addVideoComment()">
                <button class="btn btn-primary btn-sm" onclick="addVideoComment()"><i class="fas fa-paper-plane"></i></button>
            </div>
        </div>`;
        initVideoPlayer();
    } else if (contentType.startsWith('audio/')) {
        body.innerHTML = `<audio controls autoplay><source src="${previewUrl}" type="${contentType}">Votre navigateur ne supporte pas l'audio.</audio>`;
    } else if (contentType.startsWith('text/') || contentType === 'application/json' || contentType === 'application/xml' || /\.(txt|md|csv|log|json|xml|js|css|sh|py|sql|yml|yaml|conf|cfg|ini|env|html|htm)$/i.test(blobName)) {
        body.innerHTML = '<div class="spinner"></div>';
        fetch(previewUrl, { headers: { 'Authorization': `Bearer ${getAuthToken()}` } }).then(r => {
            if (!r.ok) throw new Error(r.status);
            return r.text();
        }).then(text => {
            const lines = escapeHtml(text).split('\n');
            const numbered = lines.map((line, i) => 
                `<span style="color:#666;user-select:none;display:inline-block;width:3em;text-align:right;margin-right:1em;border-right:1px solid #333;padding-right:0.5em;">${i+1}</span>${line}`
            ).join('\n');
            body.innerHTML = `<pre style="color:#e0e0e0;background:#1a1a2e;padding:20px;border-radius:8px;overflow:auto;width:100%;max-height:100%;font-size:0.85rem;white-space:pre-wrap;line-height:1.6;font-family:'Fira Code',Consolas,monospace;">${numbered}</pre>`;
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

// ============================================
// Réhydratation fichier archivé
// ============================================
function showRehydrateDialog(file) {
    const displayName = file.displayName || file.originalName || file.name.split('/').pop();
    const size = formatBytes(file.size || 0);
    
    // Supprimer un dialog existant
    document.getElementById('rehydrateDialog')?.remove();
    document.getElementById('rehydrateOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'rehydrateOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9998;';
    overlay.onclick = () => { overlay.remove(); dialog.remove(); };

    const dialog = document.createElement('div');
    dialog.id = 'rehydrateDialog';
    dialog.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:16px;padding:32px;max-width:440px;width:90%;z-index:9999;box-shadow:0 20px 60px rgba(0,0,0,.3);';
    dialog.innerHTML = `
        <div style="text-align:center;margin-bottom:20px;">
            <div style="font-size:3rem;">🧊</div>
            <h3 style="margin:12px 0 8px;font-size:1.2rem;color:#1a1a2e;">Fichier en Archive Glacier</h3>
            <p style="color:#666;font-size:0.9rem;margin:0;">
                <strong>${escapeHtml(displayName)}</strong> (${size})
            </p>
        </div>
        <div style="background:#f0f4ff;border-radius:10px;padding:16px;margin-bottom:20px;">
            <p style="margin:0 0 8px;font-size:0.85rem;color:#444;">
                Ce fichier est en stockage froid (Archive). Pour y accéder, il faut le réhydrater vers un tier accessible.
            </p>
            <div style="display:flex;gap:8px;margin-top:12px;">
                <label style="flex:1;cursor:pointer;">
                    <input type="radio" name="rehydratePriority" value="Standard" checked style="margin-right:6px;">
                    <strong>Standard</strong>
                    <div style="font-size:0.75rem;color:#888;margin-top:2px;">~15 heures • Gratuit</div>
                </label>
                <label style="flex:1;cursor:pointer;">
                    <input type="radio" name="rehydratePriority" value="High" style="margin-right:6px;">
                    <strong>Prioritaire</strong>
                    <div style="font-size:0.75rem;color:#888;margin-top:2px;">~1 heure • Coût supérieur</div>
                </label>
            </div>
        </div>
        <div style="display:flex;gap:10px;">
            <button id="rehydrateCancel" style="flex:1;padding:12px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer;font-size:0.9rem;color:#666;">
                Annuler
            </button>
            <button id="rehydrateConfirm" style="flex:1;padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#0066cc,#0052a3);color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;">
                ❄️→🔥 Réhydrater
            </button>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(dialog);

    dialog.querySelector('#rehydrateCancel').onclick = () => {
        overlay.remove(); dialog.remove();
    };

    dialog.querySelector('#rehydrateConfirm').onclick = async () => {
        const priority = dialog.querySelector('input[name="rehydratePriority"]:checked').value;
        const btn = dialog.querySelector('#rehydrateConfirm');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> En cours...';
        
        try {
            const res = await fetch(`${API_URL}/files/${encodeBlobPath(file.name)}/rehydrate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ targetTier: 'Cool', priority })
            });
            const data = await res.json();
            if (data.success) {
                overlay.remove(); dialog.remove();
                showSuccess(`Réhydratation lancée pour "${displayName}". Délai estimé : ${priority === 'High' ? '~1 heure' : '~15 heures'}. Vous serez notifié quand ce sera prêt.`);
            } else {
                showError(data.error || 'Erreur lors de la réhydratation');
                btn.disabled = false;
                btn.innerHTML = '❄️→🔥 Réhydrater';
            }
        } catch (err) {
            showError('Erreur réseau');
            btn.disabled = false;
            btn.innerHTML = '❄️→🔥 Réhydrater';
        }
    };
}

function closePreview() {
    document.getElementById('previewModal').style.display = 'none';
    // Stop video/audio
    const body = document.getElementById('previewBody');
    body.querySelectorAll('video, audio').forEach(el => { el.pause(); el.src = ''; });
    body.innerHTML = '';
    // Cleanup video keyboard handler
    document.removeEventListener('keydown', handleVideoKeys);
    videoTimecodeComments = [];
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

// ============================================================================
// COMMENTAIRES FICHIERS
// ============================================================================

let currentPreviewBlobName = null;

function toggleCommentsPanel() {
    const panel = document.getElementById('commentsPanel');
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    if (panel.style.display === 'flex') loadComments();
}

async function loadComments() {
    if (!currentPreviewBlobName) return;
    const list = document.getElementById('commentsList');
    list.innerHTML = '<div class="comments-empty">Chargement...</div>';
    try {
        const res = await fetch(`${API_URL}/files/${encodeURIComponent(currentPreviewBlobName)}/comments`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        
        document.getElementById('commentCount').textContent = data.comments.length || '';
        
        if (data.comments.length === 0) {
            list.innerHTML = '<div class="comments-empty">Aucun commentaire</div>';
            return;
        }
        list.innerHTML = data.comments.map(c => `
            <div class="comment-item">
                <div class="comment-meta">
                    <span class="comment-author">${escapeHtml(c.username)}</span>
                    <span class="comment-date">${new Date(c.created_at).toLocaleString('fr-FR', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
                </div>
                <div class="comment-text">${escapeHtml(c.comment)}</div>
                <button class="comment-delete" onclick="deleteComment(${c.id})" title="Supprimer">🗑️</button>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<div class="comments-empty">Erreur</div>';
    }
}

async function addComment() {
    const input = document.getElementById('commentInput');
    const text = input.value.trim();
    if (!text || !currentPreviewBlobName) return;
    try {
        const res = await fetch(`${API_URL}/files/${encodeURIComponent(currentPreviewBlobName)}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
            body: JSON.stringify({ comment: text })
        });
        const data = await res.json();
        if (data.success) {
            input.value = '';
            loadComments();
        } else {
            showError(data.error);
        }
    } catch (e) { showError(e.message); }
}

async function deleteComment(id) {
    if (!confirm('Supprimer ce commentaire ?')) return;
    try {
        const res = await fetch(`${API_URL}/files/comments/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const data = await res.json();
        if (data.success) loadComments();
        else showError(data.error);
    } catch (e) { showError(e.message); }
}

// Ctrl+Enter pour envoyer
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter' && document.activeElement?.id === 'commentInput') {
        addComment();
    }
});

// ============================================================================
// VIDEO PLAYER
// ============================================================================

let videoTimecodeComments = [];

function initVideoPlayer() {
    const video = document.getElementById('videoPlayer');
    const overlay = document.getElementById('videoOverlay');
    if (!video) return;

    video.addEventListener('loadedmetadata', () => {
        document.getElementById('vcDuration').textContent = formatTime(video.duration);
        loadVideoComments();
    });

    video.addEventListener('timeupdate', () => {
        const pct = (video.currentTime / video.duration) * 100;
        document.getElementById('vcProgressBar').style.width = pct + '%';
        document.getElementById('vcCurrentTime').textContent = formatTime(video.currentTime);
        showTimecodeMarkers(video.currentTime);
    });

    video.addEventListener('play', () => {
        document.getElementById('vcPlayBtn').innerHTML = '<i class="fas fa-pause"></i>';
        overlay.classList.add('playing');
        overlay.querySelector('.video-play-icon i').className = 'fas fa-pause';
    });

    video.addEventListener('pause', () => {
        document.getElementById('vcPlayBtn').innerHTML = '<i class="fas fa-play"></i>';
        overlay.classList.remove('playing');
        overlay.querySelector('.video-play-icon i').className = 'fas fa-play';
    });

    video.addEventListener('ended', () => {
        overlay.classList.remove('playing');
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', handleVideoKeys);

    // Auto-play
    video.play().catch(() => {});
}

function handleVideoKeys(e) {
    const video = document.getElementById('videoPlayer');
    if (!video || document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggleVideoPlay(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 5); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); video.currentTime = Math.min(video.duration, video.currentTime + 5); }
    else if (e.key === 'j') { video.currentTime = Math.max(0, video.currentTime - 10); }
    else if (e.key === 'l') { video.currentTime = Math.min(video.duration, video.currentTime + 10); }
    else if (e.key === 'f') { video.requestFullscreen?.(); }
    else if (e.key === 'm') { video.muted = !video.muted; }
}

function toggleVideoPlay() {
    const video = document.getElementById('videoPlayer');
    if (!video) return;
    video.paused ? video.play() : video.pause();
}

function seekVideo(e) {
    const video = document.getElementById('videoPlayer');
    const bar = document.getElementById('vcProgress');
    if (!video || !bar) return;
    const rect = bar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    video.currentTime = pct * video.duration;
}

function formatTime(s) {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

function captureVideoFrame() {
    const video = document.getElementById('videoPlayer');
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const link = document.createElement('a');
    link.download = `capture_${formatTime(video.currentTime).replace(':', 'm')}s.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showSuccess('Capture enregistrée');
}

function toggleVideoComment() {
    const bar = document.getElementById('videoCommentBar');
    if (!bar) return;
    bar.style.display = bar.style.display === 'none' ? 'flex' : 'none';
    if (bar.style.display === 'flex') {
        const video = document.getElementById('videoPlayer');
        if (video) video.pause();
        document.getElementById('videoCommentInput').focus();
        document.getElementById('videoCommentInput').placeholder = `Commentaire à ${formatTime(video?.currentTime || 0)}...`;
    }
}

async function addVideoComment() {
    const video = document.getElementById('videoPlayer');
    const input = document.getElementById('videoCommentInput');
    if (!video || !input || !input.value.trim() || !currentPreviewBlobName) return;

    const timecode = video.currentTime;
    const text = `[${formatTime(timecode)}] ${input.value.trim()}`;

    try {
        const res = await fetch(`${API_URL}/files/${encodeURIComponent(currentPreviewBlobName)}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
            body: JSON.stringify({ comment: text })
        });
        const data = await res.json();
        if (data.success) {
            input.value = '';
            document.getElementById('videoCommentBar').style.display = 'none';
            showSuccess(`Commentaire ajouté à ${formatTime(timecode)}`);
            loadVideoComments();
        } else {
            showError(data.error);
        }
    } catch (e) { showError(e.message); }
}

async function loadVideoComments() {
    if (!currentPreviewBlobName) return;
    try {
        const res = await fetch(`${API_URL}/files/${encodeURIComponent(currentPreviewBlobName)}/comments`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const data = await res.json();
        if (!data.success) return;

        // Parse timecoded comments
        const video = document.getElementById('videoPlayer');
        if (!video || !video.duration) return;

        videoTimecodeComments = [];
        const markersContainer = document.getElementById('vcProgressMarkers');
        if (markersContainer) markersContainer.innerHTML = '';

        const tcRegex = /^\[(\d+):(\d{2})\]\s*/;
        for (const c of data.comments) {
            const match = c.comment.match(tcRegex);
            if (match) {
                const seconds = parseInt(match[1]) * 60 + parseInt(match[2]);
                const pct = (seconds / video.duration) * 100;
                videoTimecodeComments.push({ seconds, text: c.comment.replace(tcRegex, ''), username: c.username, pct });
                if (markersContainer) {
                    const marker = document.createElement('div');
                    marker.className = 'vc-marker';
                    marker.style.left = pct + '%';
                    marker.title = `${formatTime(seconds)} — ${c.username}: ${c.comment.replace(tcRegex, '')}`;
                    markersContainer.appendChild(marker);
                }
            }
        }

        // Update comment count badge
        const countEl = document.getElementById('commentCount');
        if (countEl) countEl.textContent = data.comments.length || '';
    } catch (e) { console.error('Video comments error:', e); }
}

function showTimecodeMarkers(currentTime) {
    const container = document.getElementById('videoMarkers');
    if (!container) return;
    container.innerHTML = '';
    for (const tc of videoTimecodeComments) {
        if (Math.abs(tc.seconds - currentTime) < 3) {
            const div = document.createElement('div');
            div.className = 'video-timecode-comment';
            div.style.left = tc.pct + '%';
            div.textContent = `💬 ${tc.username}: ${tc.text}`;
            div.onclick = () => { document.getElementById('videoPlayer').currentTime = tc.seconds; };
            container.appendChild(div);
        }
    }
}

// ============================================================================
// NOTIFICATIONS IN-APP
// ============================================================================

let notifPollInterval = null;

function toggleNotifPanel() {
    const panel = document.getElementById('notifPanel');
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    if (panel.style.display === 'flex') loadNotifications();
}

// Close on outside click
document.addEventListener('click', (e) => {
    const panel = document.getElementById('notifPanel');
    if (panel && panel.style.display === 'flex' && !e.target.closest('.notif-wrapper')) {
        panel.style.display = 'none';
    }
});

async function loadNotifications() {
    try {
        const res = await fetch(`${API_URL}/notifications?limit=30`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const data = await res.json();
        if (!data.success) return;

        updateNotifBadge(data.unreadCount);
        const list = document.getElementById('notifList');
        if (data.notifications.length === 0) {
            list.innerHTML = '<div class="notif-empty">Aucune notification</div>';
            return;
        }

        list.innerHTML = data.notifications.map(n => {
            const iconMap = {
                share_received: { cls: 'share', icon: '📎' },
                file_commented: { cls: 'comment', icon: '💬' },
                guest_pending: { cls: 'guest', icon: '⏳' },
                guest_approved: { cls: 'guest', icon: '✅' },
                file_uploaded: { cls: 'upload', icon: '📁' },
                file_trashed: { cls: 'trash', icon: '🗑️' },
                quota_warning: { cls: 'warning', icon: '⚠️' }
            };
            const ic = iconMap[n.type] || { cls: 'default', icon: '🔔' };
            const timeAgo = getTimeAgo(n.created_at);
            return `<div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="readNotif(${n.id}, '${n.link || ''}')">
                <div class="notif-icon ${ic.cls}">${ic.icon}</div>
                <div class="notif-content">
                    <div class="notif-title">${escapeHtml(n.title)}</div>
                    <div class="notif-msg">${escapeHtml(n.message)}</div>
                    <div class="notif-time">${timeAgo}</div>
                </div>
            </div>`;
        }).join('');
    } catch (e) { console.error('Notif error:', e); }
}

function updateNotifBadge(count) {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

async function readNotif(id, link) {
    try {
        await fetch(`${API_URL}/notifications/${id}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        loadNotifications();
        if (link) window.open(link, '_blank');
    } catch (e) { /* ignore */ }
}

async function markAllRead() {
    try {
        await fetch(`${API_URL}/notifications/read-all`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        loadNotifications();
    } catch (e) { /* ignore */ }
}

function getTimeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr + 'Z').getTime()) / 1000;
    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.floor(diff/60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff/3600)}h`;
    if (diff < 604800) return `Il y a ${Math.floor(diff/86400)}j`;
    return new Date(dateStr).toLocaleDateString('fr-FR');
}

// Poll for new notifications every 30s
async function pollNotifCount() {
    try {
        const res = await fetch(`${API_URL}/notifications?unreadOnly=true&limit=1`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
        });
        const data = await res.json();
        if (data.success) updateNotifBadge(data.unreadCount);
    } catch (e) { /* ignore */ }
}

// Start polling
pollNotifCount();
notifPollInterval = setInterval(pollNotifCount, 30000);

// ============================================================================
// BULK ACTIONS
// ============================================================================

let selectedFiles = new Set();

function toggleFileSelect(blobName, el) {
    if (selectedFiles.has(blobName)) {
        selectedFiles.delete(blobName);
        el?.closest('.file-card, .file-row')?.classList.remove('selected');
    } else {
        selectedFiles.add(blobName);
        el?.closest('.file-card, .file-row')?.classList.add('selected');
    }
    updateBulkBar();
}

function toggleSelectAll(checked) {
    if (checked) {
        filteredFiles.filter(f => !f.isFolder).forEach(f => selectedFiles.add(f.name));
    } else {
        selectedFiles.clear();
    }
    document.querySelectorAll('.file-card, .file-row').forEach(el => {
        const name = el.dataset.fileName;
        if (name) {
            el.classList.toggle('selected', selectedFiles.has(name));
            const cb = el.querySelector('.file-select-checkbox');
            if (cb) cb.checked = selectedFiles.has(name);
        }
    });
    updateBulkBar();
}

function clearSelection() {
    selectedFiles.clear();
    document.querySelectorAll('.file-card.selected, .file-row.selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('.file-select-checkbox').forEach(cb => cb.checked = false);
    updateBulkBar();
}

function updateBulkBar() {
    const bar = document.getElementById('bulkBar');
    if (selectedFiles.size > 0) {
        bar.style.display = 'flex';
        document.getElementById('bulkCount').textContent = `${selectedFiles.size} sélectionné(s)`;
    } else {
        bar.style.display = 'none';
    }
}

async function bulkDownloadZip() {
    if (selectedFiles.size === 0) return;
    showSuccess(`Préparation du ZIP (${selectedFiles.size} fichiers)...`);
    try {
        const res = await fetch(`${API_URL}/files/bulk-download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
            body: JSON.stringify({ blobNames: [...selectedFiles] })
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shareazure-${selectedFiles.size}fichiers.zip`;
        a.click();
        URL.revokeObjectURL(url);
        showSuccess('Téléchargement ZIP terminé');
    } catch (e) { showError('Erreur ZIP: ' + e.message); }
}

async function bulkDelete() {
    if (!confirm(`Mettre ${selectedFiles.size} fichier(s) en corbeille ?`)) return;
    try {
        const res = await fetch(`${API_URL}/files/bulk-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
            body: JSON.stringify({ blobNames: [...selectedFiles] })
        });
        const data = await res.json();
        if (data.success) {
            showSuccess(`${data.trashed} fichier(s) mis en corbeille`);
            clearSelection();
            loadFiles();
        }
    } catch (e) { showError(e.message); }
}

function bulkShare() {
    // If all selected files are in the same folder, share as folder
    const folders = new Set([...selectedFiles].map(f => f.substring(0, f.lastIndexOf('/') + 1)));
    if (folders.size === 1 && [...folders][0]) {
        const folderPath = [...folders][0];
        const folderName = folderPath.replace(/\/$/, '').split('/').pop();
        if (confirm(`Partager tout le dossier "${folderName}" (${selectedFiles.size} fichiers) ?`)) {
            showFolderShareModal(folderPath, folderName, selectedFiles.size);
            return;
        }
    }
    showError('Sélectionnez des fichiers d\'un même dossier pour partager');
}

function showFolderShareModal(folderPath, folderName, fileCount) {
    // Reuse share modal
    document.getElementById('shareModalTitle').textContent = `Partager "📁 ${folderName}" (${fileCount} fichiers)`;
    document.getElementById('shareRecipientEmailInput').value = '';
    document.getElementById('sharePasswordInput').value = '';
    document.getElementById('shareExpirationSelect').value = '1440';
    const wmSelect = document.getElementById('shareWatermarkSelect');
    if (wmSelect) wmSelect.value = '';

    const stepConfig = document.getElementById('shareStepConfig');
    const stepResult = document.getElementById('shareStepResult');
    if (stepConfig) stepConfig.style.display = 'block';
    if (stepResult) stepResult.style.display = 'none';

    const shareFileInfo = document.getElementById('shareFileInfo');
    if (shareFileInfo) {
        shareFileInfo.innerHTML = `<div style="display:flex;align-items:center;gap:12px;">
            <div style="font-size:1.5rem;">📁</div>
            <div><div style="font-weight:600;">${folderName}</div>
            <div style="color:#888;font-size:0.85rem;">${fileCount} fichiers</div></div>
        </div>`;
    }

    // Override the share handler temporarily
    window._folderSharePath = folderPath;
    document.getElementById('shareModal').style.display = 'flex';
}

// Patch handleGenerateShareLink to support folder sharing
const _origHandleGenerate = handleGenerateShareLink;
window.handleGenerateShareLink = async function() {
    if (window._folderSharePath) {
        const folderPath = window._folderSharePath;
        delete window._folderSharePath;
        
        const recipientEmails = document.getElementById('shareRecipientEmailInput').value.trim();
        const password = document.getElementById('sharePasswordInput').value.trim();
        if (!recipientEmails || !password) { showError('Email et mot de passe requis'); return; }
        
        const applyBtn = document.getElementById('applyShareBtn');
        if (applyBtn) { applyBtn.disabled = true; applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
        
        try {
            const res = await fetch(`${API_URL}/files/bulk-share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
                body: JSON.stringify({
                    folderPath,
                    recipientEmail: recipientEmails,
                    password,
                    expiresInMinutes: parseInt(document.getElementById('shareExpirationSelect').value),
                    watermarkText: getWatermarkText()
                })
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('shareLinkInput').value = data.shareLink;
                const qrImg = document.getElementById('qrCodeImage');
                if (qrImg && data.qrCode) qrImg.src = data.qrCode;
                document.getElementById('shareStepConfig').style.display = 'none';
                document.getElementById('shareStepResult').style.display = 'block';
                showSuccess(`Dossier partagé (${data.fileCount} fichiers)`);
            } else { showError(data.error); }
        } catch (e) { showError(e.message); }
        finally { if (applyBtn) { applyBtn.disabled = false; applyBtn.innerHTML = '<i class="fas fa-link"></i> Créer le lien'; } }
        return;
    }
    return _origHandleGenerate.call(this);
};

// Add checkboxes to file cards via MutationObserver
const filesObserver = new MutationObserver(() => {
    document.querySelectorAll('.file-card:not([data-bulk-init]), .file-row:not([data-bulk-init])').forEach(el => {
        el.setAttribute('data-bulk-init', '1');
        const fileName = el.dataset.fileName;
        if (!fileName) return;
        // Check if it's a folder
        const file = (typeof filteredFiles !== 'undefined') ? filteredFiles.find(f => f.name === fileName) : null;
        if (file && file.isFolder) return;
        
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'file-select-checkbox';
        cb.checked = selectedFiles.has(fileName);
        cb.onclick = (e) => { e.stopPropagation(); toggleFileSelect(fileName, cb); };
        el.style.position = 'relative';
        el.prepend(cb);
    });
});
filesObserver.observe(document.getElementById('filesGrid') || document.body, { childList: true, subtree: true });

// === Changement de mot de passe ===
// ============================================================================
// AVATAR
// ============================================================================

function changeUserAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 200 * 1024) { showError('Image trop grande (max 200 Ko)'); return; }
        const img = new Image();
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = 128; canvas.height = 128;
            const ctx = canvas.getContext('2d');
            const size = Math.min(img.width, img.height);
            ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, 128, 128);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            try {
                const res = await fetch(`${API_URL}/user/avatar`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ avatar: dataUrl })
                });
                const data = await res.json();
                if (data.success) { showSuccess('Avatar mis à jour ✅'); }
                else { showError(data.error || 'Erreur'); }
            } catch (err) { showError('Erreur: ' + err.message); }
        };
        img.src = URL.createObjectURL(file);
    };
    input.click();
}

// ============================================================================
// 2FA (Double authentification par email)
// ============================================================================

async function load2FAStatus() {
    try {
        const res = await fetch(`${API_URL}/user/2fa`, { headers: { 'Authorization': `Bearer ${getAuthToken()}` } });
        const data = await res.json();
        const btn = document.getElementById('toggle2faBtn');
        const label = document.getElementById('toggle2faLabel');
        if (!btn || !label) return;
        if (data.enabled) {
            label.innerHTML = '🟢 2FA activée <span style="font-size:0.75rem;color:#888;">(cliquer pour désactiver)</span>';
            btn.dataset.enabled = 'true';
        } else {
            label.innerHTML = '⚪ Activer la 2FA par email';
            btn.dataset.enabled = 'false';
        }
    } catch (e) { console.error('2FA status error:', e); }
}

async function toggle2FA() {
    const btn = document.getElementById('toggle2faBtn');
    const isEnabled = btn?.dataset.enabled === 'true';

    if (isEnabled) {
        if (!confirm('Désactiver la double authentification ?\n\nVotre compte sera moins protégé.')) return;
        try {
            await fetch(`${API_URL}/user/2fa`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: false })
            });
            showSuccess('2FA désactivée');
            load2FAStatus();
        } catch (e) { showError('Erreur: ' + e.message); }
    } else {
        // Vérifier que l'utilisateur a un email
        const userRes = await fetch(`${API_URL}/user/profile`, { headers: { 'Authorization': `Bearer ${getAuthToken()}` } }).catch(() => null);
        const userData = userRes ? await userRes.json().catch(() => null) : null;

        if (!userData?.user?.email) {
            // Demander l'email
            const email = prompt('Pour activer la 2FA, entrez votre adresse email :\n(un code sera envoyé à cette adresse à chaque connexion)');
            if (!email || !email.includes('@')) { showError('Email invalide'); return; }
            // Sauvegarder l'email
            await fetch(`${API_URL}/user/profile`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            }).catch(() => {});
        }

        if (!confirm('Activer la double authentification par email ?\n\nÀ chaque connexion, un code à 6 chiffres sera envoyé à votre adresse email.\nVous aurez 5 minutes pour le saisir.')) return;

        try {
            await fetch(`${API_URL}/user/2fa`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: true })
            });
            showSuccess('✅ 2FA activée ! Un code sera envoyé par email à chaque connexion.');
            load2FAStatus();
        } catch (e) { showError('Erreur: ' + e.message); }
    }
}

function showChangePasswordModal() {
    const old = document.getElementById('changePasswordModal');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'changePasswordModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:12px;padding:32px;width:400px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
            <h3 style="margin:0 0 24px;color:#333;"><i class="fas fa-key" style="color:#1976d2;margin-right:8px;"></i>Changer le mot de passe</h3>
            <div style="margin-bottom:16px;">
                <label style="display:block;font-size:0.85rem;color:#666;margin-bottom:4px;">Mot de passe actuel</label>
                <input type="password" id="cpCurrentPwd" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" autocomplete="current-password">
            </div>
            <div style="margin-bottom:16px;">
                <label style="display:block;font-size:0.85rem;color:#666;margin-bottom:4px;">Nouveau mot de passe</label>
                <input type="password" id="cpNewPwd" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" autocomplete="new-password">
            </div>
            <div style="margin-bottom:24px;">
                <label style="display:block;font-size:0.85rem;color:#666;margin-bottom:4px;">Confirmer le nouveau mot de passe</label>
                <input type="password" id="cpConfirmPwd" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;" autocomplete="new-password">
            </div>
            <div id="cpError" style="display:none;color:#d32f2f;font-size:0.85rem;margin-bottom:16px;padding:8px 12px;background:#ffeaea;border-radius:6px;"></div>
            <div id="cpSuccess" style="display:none;color:#2e7d32;font-size:0.85rem;margin-bottom:16px;padding:8px 12px;background:#e8f5e9;border-radius:6px;"></div>
            <div style="display:flex;gap:12px;justify-content:flex-end;">
                <button onclick="document.getElementById('changePasswordModal').remove();" style="padding:10px 20px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:0.9rem;">Annuler</button>
                <button onclick="submitPasswordChange();" id="cpSubmitBtn" style="padding:10px 20px;border:none;border-radius:8px;background:#1976d2;color:#fff;cursor:pointer;font-size:0.9rem;font-weight:600;">Modifier</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    document.getElementById('cpCurrentPwd').focus();
}

async function submitPasswordChange() {
    const current = document.getElementById('cpCurrentPwd').value;
    const newPwd = document.getElementById('cpNewPwd').value;
    const confirm = document.getElementById('cpConfirmPwd').value;
    const errDiv = document.getElementById('cpError');
    const successDiv = document.getElementById('cpSuccess');
    const btn = document.getElementById('cpSubmitBtn');

    errDiv.style.display = 'none';
    successDiv.style.display = 'none';

    if (!current) { errDiv.textContent = 'Veuillez saisir votre mot de passe actuel'; errDiv.style.display = 'block'; return; }
    if (!newPwd) { errDiv.textContent = 'Veuillez saisir un nouveau mot de passe'; errDiv.style.display = 'block'; return; }
    if (newPwd.length < 8) { errDiv.textContent = 'Le nouveau mot de passe doit contenir au moins 8 caractères'; errDiv.style.display = 'block'; return; }
    if (newPwd !== confirm) { errDiv.textContent = 'Les mots de passe ne correspondent pas'; errDiv.style.display = 'block'; return; }

    btn.disabled = true;
    btn.textContent = 'Modification...';

    try {
        const token = localStorage.getItem('authToken') || localStorage.getItem('userToken');
        const resp = await fetch(window.location.origin + '/api/user/password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ currentPassword: current, newPassword: newPwd })
        });
        const data = await resp.json();
        if (data.success) {
            successDiv.textContent = '✅ Mot de passe modifié avec succès !';
            successDiv.style.display = 'block';
            btn.textContent = '✓ Modifié';
            setTimeout(() => { document.getElementById('changePasswordModal')?.remove(); }, 2000);
        } else {
            errDiv.textContent = data.error || 'Erreur lors de la modification';
            errDiv.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Modifier';
        }
    } catch (e) {
        errDiv.textContent = 'Erreur de connexion au serveur';
        errDiv.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Modifier';
    }
}

// Fermer le dropdown user si clic en dehors
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('userMenuDropdown');
    const userName = document.getElementById('userName');
    if (dropdown && !dropdown.contains(e.target) && e.target !== userName) {
        dropdown.style.display = 'none';
    }
});

// ============================================================================
// CONTEXTE ÉQUIPE - Tabs & Switching
// ============================================================================

async function loadUserTeams() {
    try {
        const token = getAuthToken();
        const res = await fetch(`${API_URL}/user/teams`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        if (!data.success) return;
        userTeamsList = data.teams;
        // Update localStorage
        const userDataStr = localStorage.getItem('userData') || sessionStorage.getItem('userData');
        if (userDataStr) {
            try {
                const user = JSON.parse(userDataStr);
                user.teams = data.teams;
                const storage = localStorage.getItem('userData') ? localStorage : sessionStorage;
                storage.setItem('userData', JSON.stringify(user));
            } catch {}
        }
        // Rebuild tabs
        const teamTabsList = document.getElementById('teamTabsList');
        teamTabsList.innerHTML = '';
        for (const team of data.teams) {
            const btn = document.createElement('button');
            btn.className = 'context-tab';
            btn.dataset.context = team.teamId;
            const teamIcon = team.role === 'owner' ? 'fa-users' : 'fa-user';
            btn.innerHTML = `<i class="fas ${teamIcon}"></i> ${escapeHtml(team.displayName || team.name)}`;
            const logoImg = new Image();
            logoImg.onload = () => { btn.innerHTML = `<img src="${logoImg.src}" class="team-logo-mini" alt=""> ${escapeHtml(team.displayName || team.name)}`; };
            logoImg.src = `${API_URL}/teams/${team.teamId}/logo?t=${Date.now()}`;
            btn.addEventListener('click', () => switchContext(team.teamId));
            teamTabsList.appendChild(btn);
        }
        document.getElementById('teamTabsGroup').style.display = 'flex';
        document.getElementById('contextTabs').style.display = 'flex';
    } catch (e) { console.error('loadUserTeams error:', e); }
}

async function initContextTabs() {
    const userDataStr = localStorage.getItem('userData') || sessionStorage.getItem('userData');
    if (!userDataStr) return;
    let user;
    try { user = JSON.parse(userDataStr); } catch (e) { return; }

    const teams = user.teams || [];

    userTeamsList = teams;
    const tabsContainer = document.getElementById('contextTabs');
    tabsContainer.style.display = 'flex';

    // Show team tabs group
    const teamTabsGroup = document.getElementById('teamTabsGroup');
    const teamTabsList = document.getElementById('teamTabsList');
    teamTabsGroup.style.display = 'flex';

    // Add team tabs
    for (const team of teams) {
        const btn = document.createElement('button');
        btn.className = 'context-tab';
        btn.dataset.context = team.teamId;
        const teamIcon = team.role === 'owner' ? 'fa-users' : 'fa-user';
        btn.innerHTML = `<i class="fas ${teamIcon}"></i> ${escapeHtml(team.displayName || team.name)}`;
        
        // Try to load team logo as mini icon
        const logoImg = new Image();
        logoImg.onload = () => {
            btn.innerHTML = `<img src="${logoImg.src}" class="team-logo-mini" alt=""> ${escapeHtml(team.displayName || team.name)}`;
        };
        logoImg.src = `${API_URL}/teams/${team.teamId}/logo?t=${Date.now()}`;
        
        btn.addEventListener('click', () => switchContext(team.teamId));
        teamTabsList.appendChild(btn);
    }

    // Click handler for "Mes fichiers" tab
    document.getElementById('ctxTabMy').addEventListener('click', () => switchContext('my'));
    
    // Toujours afficher le groupe d'onglets (même sans équipe, pour le bouton +)
    document.getElementById('teamTabsGroup').style.display = 'flex';
}

// ============================================================================
// CRÉATION D'ÉQUIPE
// ============================================================================
function showCreateTeamModal() {
    let modal = document.getElementById('createTeamModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'createTeamModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:420px;">
                <div class="modal-header">
                    <h3><i class="fas fa-plus-circle"></i> Créer une équipe</h3>
                    <button class="modal-close" onclick="document.getElementById('createTeamModal').style.display='none'">&times;</button>
                </div>
                <div class="modal-body" style="padding:20px;">
                    <div style="margin-bottom:16px;">
                        <label style="font-weight:600;font-size:0.85rem;color:#555;display:block;margin-bottom:4px;">Nom de l'équipe *</label>
                        <input type="text" id="newTeamName" placeholder="Ex: Équipe Développement" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
                    </div>
                    <div style="margin-bottom:16px;">
                        <label style="font-weight:600;font-size:0.85rem;color:#555;display:block;margin-bottom:4px;">Description</label>
                        <textarea id="newTeamDesc" rows="3" placeholder="Description optionnelle..." style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:0.95rem;resize:vertical;box-sizing:border-box;"></textarea>
                    </div>
                    <button onclick="createTeam()" style="width:100%;padding:12px;background:#639E30;color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:600;cursor:pointer;">
                        <i class="fas fa-check"></i> Créer l'équipe
                    </button>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }
    document.getElementById('newTeamName').value = '';
    document.getElementById('newTeamDesc').value = '';
    modal.style.display = 'flex';
}

async function createTeam() {
    const name = document.getElementById('newTeamName').value.trim();
    const desc = document.getElementById('newTeamDesc').value.trim();
    if (!name) { showError('Le nom est obligatoire'); return; }

    try {
        const token = getAuthToken();
        const res = await fetch(`${API_URL}/teams`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, displayName: name, description: desc })
        });
        const data = await res.json();
        if (data.success) {
            showSuccess('Équipe créée !');
            document.getElementById('createTeamModal').style.display = 'none';
            // Recharger les équipes
            await loadUserTeams();
            // Basculer sur la nouvelle équipe
            if (data.team && data.team.id) switchContext(data.team.id);
        } else {
            showError(data.error || 'Erreur lors de la création');
        }
    } catch (e) { showError(e.message); }
}

function switchContext(context) {
    currentContext = context;
    currentPath = '';

    // Update active tab
    document.querySelectorAll('.context-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.context == context);
    });

    // Show/hide team-specific action buttons
    const isTeam = context !== 'my';
    const team = isTeam ? userTeamsList.find(t => t.teamId == context) : null;
    currentTeamRole = team ? team.role : null;
    const isOwnerOrAdmin = currentTeamRole === 'owner' || currentTeamRole === 'admin';

    document.getElementById('teamActions').style.display = isTeam ? 'flex' : 'none';
    document.getElementById('teamMembersBtn').style.display = isTeam ? '' : 'none';
    const mb2 = document.getElementById('teamMembersBtn2');
    if (mb2) mb2.style.display = isTeam ? '' : 'none';
    document.getElementById('teamSettingsBtn').style.display = isTeam && isOwnerOrAdmin ? '' : 'none';
    
    // Hide other sections, show files
    document.getElementById('shareLinksSection').style.display = 'none';
    document.getElementById('discoverSection').style.display = 'none';
    
    document.getElementById('finopsSection').style.display = 'none';
    document.getElementById('filesSection').style.display = 'block';

    // Update header title
    const titleEl = document.querySelector('.header-title');
    if (isTeam && team) {
        titleEl.textContent = team.displayName || team.name;
    } else {
        titleEl.textContent = 'Mon espace de stockage';
    }

    loadFiles();
}

// ============================================================================
// MODAL MEMBRES ÉQUIPE
// ============================================================================

async function showTeamMembersModal() {
    if (currentContext === 'my') return;
    const teamId = currentContext;
    const isOwnerOrAdmin = currentTeamRole === 'owner' || currentTeamRole === 'admin';

    document.getElementById('teamMembersAddSection').style.display = isOwnerOrAdmin ? 'block' : 'none';
    document.getElementById('teamMembersModal').style.display = 'flex';

    const list = document.getElementById('teamMembersList');
    list.innerHTML = '<p style="text-align:center;color:#666;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Chargement...</p>';

    try {
        const token = getAuthToken();
        const res = await fetch(`${API_URL}/teams/${teamId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const members = data.team.members || [];
        const roleLabels = { owner: 'Propriétaire', admin: 'Admin', member: 'Membre', viewer: 'Lecteur' };

        if (members.length === 0) {
            list.innerHTML = '<p style="text-align:center;color:#888;padding:20px;">Aucun membre</p>';
            return;
        }

        list.innerHTML = members.map(m => {
            const canManage = isOwnerOrAdmin && m.role !== 'owner';
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:8px;">
                <div>
                    <strong>${escapeHtml(m.full_name || m.username)}</strong>
                    <span style="display:inline-block;background:${m.role === 'owner' ? '#003C61' : '#639E30'};color:#fff;font-size:0.7rem;padding:2px 8px;border-radius:10px;margin-left:8px;">${roleLabels[m.role] || m.role}</span>
                    ${m.email ? `<div style="font-size:0.8rem;color:#888;margin-top:2px;">${escapeHtml(m.email)}</div>` : ''}
                </div>
                ${canManage ? `<div style="display:flex;gap:6px;">
                    <select onchange="changeTeamMemberRole(${teamId}, ${m.user_id}, this.value)" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;font-size:0.8rem;">
                        <option value="member" ${m.role === 'member' ? 'selected' : ''}>Membre</option>
                        <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>Lecteur</option>
                    </select>
                    <button onclick="removeTeamMember(${teamId}, ${m.user_id}, '${escapeHtml(m.username)}')" style="background:#ef5350;color:#fff;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:0.8rem;" title="Retirer">
                        <i class="fas fa-times"></i>
                    </button>
                </div>` : ''}
            </div>`;
        }).join('');
    } catch (e) {
        list.innerHTML = `<p style="color:#c62828;text-align:center;">Erreur: ${e.message}</p>`;
    }
}

async function addTeamMember() {
    const username = document.getElementById('teamMemberUsername').value.trim();
    const role = document.getElementById('teamMemberRole').value;
    if (!username) { showError('Entrez un nom d\'utilisateur'); return; }

    try {
        const token = getAuthToken();
        const res = await fetch(`${API_URL}/teams/${currentContext}/members`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, role })
        });
        const data = await res.json();
        if (data.success) {
            showSuccess('Membre ajouté');
            document.getElementById('teamMemberUsername').value = '';
            showTeamMembersModal();
        } else {
            showError(data.error || 'Erreur');
        }
    } catch (e) { showError(e.message); }
}

async function changeTeamMemberRole(teamId, userId, newRole) {
    try {
        const token = getAuthToken();
        const res = await fetch(`${API_URL}/teams/${teamId}/members/${userId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });
        const data = await res.json();
        if (data.success) showSuccess('Rôle mis à jour');
        else showError(data.error || 'Erreur');
    } catch (e) { showError(e.message); }
}

async function removeTeamMember(teamId, userId, username) {
    const confirmed = await showConfirmDialog('Retirer le membre', `Retirer ${username} de l'équipe ?`);
    if (!confirmed) return;
    try {
        const token = getAuthToken();
        const res = await fetch(`${API_URL}/teams/${teamId}/members/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            showSuccess('Membre retiré');
            showTeamMembersModal();
        } else showError(data.error || 'Erreur');
    } catch (e) { showError(e.message); }
}

// ============================================================================
// MODAL PARAMÈTRES ÉQUIPE
// ============================================================================

async function showTeamSettingsModal() {
    if (currentContext === 'my') return;
    const teamId = currentContext;

    document.getElementById('teamSettingsModal').style.display = 'flex';

    try {
        const token = getAuthToken();
        const res = await fetch(`${API_URL}/teams/${teamId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('teamSettingsName').value = data.team.display_name || data.team.name || '';
            // Try loading logo preview
            const preview = document.getElementById('teamSettingsLogoPreview');
            const testImg = new Image();
            testImg.onload = () => { preview.src = testImg.src; preview.style.display = 'block'; };
            testImg.onerror = () => { preview.style.display = 'none'; };
            testImg.src = `${API_URL}/teams/${teamId}/logo?t=${Date.now()}`;
        }
    } catch (e) { showError(e.message); }
}

async function saveTeamSettings() {
    const teamId = currentContext;
    const displayName = document.getElementById('teamSettingsName').value.trim();
    if (!displayName) { showError('Le nom est requis'); return; }

    try {
        const token = getAuthToken();
        const res = await fetch(`${API_URL}/teams/${teamId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName })
        });
        const data = await res.json();
        if (data.success) {
            showSuccess('Paramètres enregistrés');
            // Update local data
            const team = userTeamsList.find(t => t.teamId == teamId);
            if (team) team.displayName = displayName;
            // Update tab label
            const tab = document.querySelector(`.context-tab[data-context="${teamId}"]`);
            if (tab) {
                const img = tab.querySelector('img');
                if (img) tab.innerHTML = `<img src="${img.src}" class="team-logo-mini" alt=""> ${escapeHtml(displayName)}`;
                else { const ti = currentTeamRole === 'owner' ? 'fa-users' : 'fa-user'; tab.innerHTML = `<i class="fas ${ti}"></i> ${escapeHtml(displayName)}`; }
            }
            // Update header
            document.querySelector('.header-title').textContent = displayName;
            document.getElementById('teamSettingsModal').style.display = 'none';
        } else showError(data.error || 'Erreur');
    } catch (e) { showError(e.message); }
}

function uploadTeamLogo() {
    const teamId = currentContext;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.svg,image/svg+xml';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.name.endsWith('.svg')) { showError('Format SVG uniquement'); return; }
        try {
            const svgText = await file.text();
            const token = getAuthToken();
            const res = await fetch(`${API_URL}/teams/${teamId}/logo`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'image/svg+xml' },
                body: svgText
            });
            const data = await res.json();
            if (data.success) {
                showSuccess('Logo mis à jour');
                const preview = document.getElementById('teamSettingsLogoPreview');
                preview.src = `${API_URL}/teams/${teamId}/logo?t=${Date.now()}`;
                preview.style.display = 'block';
                // Update tab logo
                const tab = document.querySelector(`.context-tab[data-context="${teamId}"]`);
                if (tab) {
                    const team = userTeamsList.find(t => t.teamId == teamId);
                    const name = team ? (team.displayName || team.name) : '';
                    tab.innerHTML = `<img src="${API_URL}/teams/${teamId}/logo?t=${Date.now()}" class="team-logo-mini" alt=""> ${escapeHtml(name)}`;
                }
            } else showError(data.error || 'Erreur');
        } catch (e) { showError(e.message); }
    };
    input.click();
}

// ============================================
// File Info Panel
// ============================================

async function changeFileTier(blobName, newTier, currentTier) {
    if (newTier === currentTier) return;
    
    const fileName = blobName.split('/').pop();
    const token = getAuthToken();

    // Si on passe EN Archive → confirmation
    if (newTier === 'Archive') {
        if (!confirm(`⚠️ Archiver "${fileName}" ?\n\nLe fichier sera inaccessible (lecture/IA) jusqu'à réhydratation (~1h à ~15h).`)) {
            document.getElementById('infoTierSelect').value = currentTier;
            return;
        }
    }

    // Si on sort DE Archive → utiliser la route rehydrate
    if (currentTier === 'Archive') {
        showRehydrateDialog({ name: blobName, displayName: fileName, size: 0, tier: 'Archive' });
        document.getElementById('infoTierSelect').value = currentTier;
        return;
    }

    try {
        const res = await fetch(`${API_URL}/files/${encodeBlobPath(blobName)}/archive`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ tier: newTier })
        });
        const data = await res.json();
        if (data.success) {
            showSuccess(`Tier changé : ${fileName} → ${newTier}`);
            // Mettre à jour le fichier local
            const file = allFiles.find(f => f.name === blobName);
            if (file) file.tier = newTier;
            // Recharger la section général
            loadInfoGeneral(blobName, false, token);
            // Recharger la section IA (peut-être grisée maintenant)
            const contentType = file?.contentType || '';
            if (contentType.startsWith('image/') || contentType.startsWith('video/')) {
                loadInfoAI(blobName, contentType, token, newTier);
            }
        } else {
            showError(data.error || 'Erreur changement de tier');
            document.getElementById('infoTierSelect').value = currentTier;
        }
    } catch (e) {
        showError('Erreur réseau');
        document.getElementById('infoTierSelect').value = currentTier;
    }
}

function closeFileInfoPanel() {
    document.getElementById('infoPanel').style.display = 'none';
    document.getElementById('infoPanelOverlay').style.display = 'none';
    document.getElementById('infoPanel').classList.remove('open');
}

async function showFileInfoPanel(blobName, isFolder) {
    const panel = document.getElementById('infoPanel');
    const overlay = document.getElementById('infoPanelOverlay');
    const body = document.getElementById('infoPanelBody');
    const title = document.getElementById('infoPanelTitle');

    panel.style.display = 'flex';
    overlay.style.display = 'block';
    setTimeout(() => panel.classList.add('open'), 10);

    const file = allFiles.find(f => f.name === blobName);
    const displayName = file ? (file.displayName || file.originalName || file.name) : blobName.split('/').pop();
    title.textContent = displayName;

    body.innerHTML = '<div class="spinner" style="margin:40px auto;"></div>';

    const token = getAuthToken();

    // Build sections
    let html = '';

    // === Section Général ===
    html += `<div class="info-section">
        <div class="info-section-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span>📋 Général</span>
            <i class="fas fa-chevron-down"></i>
        </div>
        <div class="info-section-content" id="infoGeneral">
            <div class="spinner" style="margin:10px auto;"></div>
        </div>
    </div>`;

    // === Section Tags ===
    html += `<div class="info-section">
        <div class="info-section-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <span>🏷️ Tags</span>
            <i class="fas fa-chevron-down"></i>
        </div>
        <div class="info-section-content" id="infoTags">
            <div class="spinner" style="margin:10px auto;"></div>
        </div>
    </div>`;

    // === Section IA (images/vidéos uniquement) ===
    const contentType = file ? (file.contentType || '') : '';
    const isImage = contentType.startsWith('image/');
    const isVideo = contentType.startsWith('video/');
    if (!isFolder && (isImage || isVideo)) {
        html += `<div class="info-section">
            <div class="info-section-header" onclick="this.parentElement.classList.toggle('collapsed')">
                <span>🤖 Intelligence Artificielle</span>
                <i class="fas fa-chevron-down"></i>
            </div>
            <div class="info-section-content" id="infoAI">
                <div class="spinner" style="margin:10px auto;"></div>
            </div>
        </div>`;
    }

    // === Section Géolocalisation (fichiers uniquement) ===
    if (!isFolder) {
        html += `<div class="info-section">
            <div class="info-section-header" onclick="this.parentElement.classList.toggle('collapsed')">
                <span>📍 Géolocalisation</span>
                <i class="fas fa-chevron-down"></i>
            </div>
            <div class="info-section-content" id="infoGeo">
                <div class="spinner" style="margin:10px auto;"></div>
            </div>
        </div>`;
    }

    body.innerHTML = html;

    // Load data
    loadInfoGeneral(blobName, isFolder, token);
    loadInfoTags(blobName, token);
    const fileTier = file?.tier || '';
    if (!isFolder && (isImage || isVideo)) loadInfoAI(blobName, contentType, token, fileTier);
    if (!isFolder) loadInfoGeo(blobName, token);
}

async function loadInfoGeneral(blobName, isFolder, token) {
    const el = document.getElementById('infoGeneral');
    if (isFolder) {
        const file = allFiles.find(f => f.name === blobName);
        el.innerHTML = `
            <div class="info-row"><span class="info-label">Nom</span><span class="info-value">${escapeHtml(file?.displayName || blobName)}</span></div>
            <div class="info-row"><span class="info-label">Type</span><span class="info-value">Dossier</span></div>
        `;
        return;
    }
    try {
        const res = await fetch(`${API_URL}/files/${encodeBlobPath(blobName)}/info`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            const i = data.info;
            el.innerHTML = `
                <div class="info-row"><span class="info-label">Nom</span><span class="info-value">${escapeHtml(i.name)}</span></div>
                <div class="info-row"><span class="info-label">Taille</span><span class="info-value">${formatBytes(i.size || 0)}</span></div>
                <div class="info-row"><span class="info-label">Type MIME</span><span class="info-value">${escapeHtml(i.contentType || '—')}</span></div>
                <div class="info-row"><span class="info-label">Créé le</span><span class="info-value">${i.createdOn ? new Date(i.createdOn).toLocaleString('fr-FR') : '—'}</span></div>
                <div class="info-row"><span class="info-label">Modifié le</span><span class="info-value">${i.lastModified ? new Date(i.lastModified).toLocaleString('fr-FR') : '—'}</span></div>
                <div class="info-row"><span class="info-label">Tier</span><span class="info-value" style="display:flex;align-items:center;gap:8px;">
                    <span class="badge badge-tier-${(i.tier||'Cool').toLowerCase()}">${i.tier || 'Cool'}</span>
                    <select id="infoTierSelect" class="form-input" style="font-size:0.8rem;padding:4px 8px;width:auto;border-radius:6px;" onchange="changeFileTier('${escapeHtml(blobName)}', this.value, '${i.tier || 'Cool'}')">
                        <option value="Hot" ${(i.tier||'Cool')==='Hot'?'selected':''}>🔥 Hot</option>
                        <option value="Cool" ${i.tier==='Cool'?'selected':''}>❄️ Cool</option>
                        <option value="Archive" ${i.tier==='Archive'?'selected':''}>🧊 Archive</option>
                    </select>
                </span></div>
            `;
        } else {
            el.innerHTML = '<p style="color:#999;">Impossible de charger les informations</p>';
        }
    } catch (e) {
        el.innerHTML = '<p style="color:#999;">Erreur de chargement</p>';
    }
}

async function loadInfoTags(blobName, token) {
    const el = document.getElementById('infoTags');
    try {
        const res = await fetch(`${API_URL}/files/${encodeBlobPath(blobName)}/tags`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        const tags = data.tags || [];

        let tagsHtml = '<div class="info-tags-list" id="infoTagsList">';
        tags.forEach(t => {
            tagsHtml += `<span class="info-tag">${escapeHtml(t.tag)} <button class="info-tag-remove" onclick="removeInfoTag('${escapeHtml(blobName)}','${escapeHtml(t.tag)}')">&times;</button></span>`;
        });
        tagsHtml += '</div>';
        tagsHtml += `<div class="info-tag-input-wrapper">
            <input type="text" id="infoTagInput" class="form-input" placeholder="Ajouter un tag..." autocomplete="off" style="font-size:0.85rem;padding:6px 10px;">
            <div class="info-tag-suggestions" id="infoTagSuggestions" style="display:none;"></div>
        </div>`;
        el.innerHTML = tagsHtml;

        // Autocomplete + add on Enter
        const input = document.getElementById('infoTagInput');
        let sugTimeout;
        input.addEventListener('input', () => {
            clearTimeout(sugTimeout);
            const q = input.value.trim();
            if (q.length < 1) { document.getElementById('infoTagSuggestions').style.display = 'none'; return; }
            sugTimeout = setTimeout(async () => {
                try {
                    const sr = await fetch(`${API_URL}/tags/suggest?q=${encodeURIComponent(q)}`, { headers: { 'Authorization': `Bearer ${token}` } });
                    const sd = await sr.json();
                    const sug = document.getElementById('infoTagSuggestions');
                    if (sd.suggestions && sd.suggestions.length > 0) {
                        sug.innerHTML = sd.suggestions.map(s => `<div class="info-tag-sug-item" onclick="selectInfoTagSuggestion('${escapeHtml(s.tag)}','${escapeHtml(blobName)}')">${escapeHtml(s.tag)} <small>(${s.count})</small></div>`).join('');
                        sug.style.display = 'block';
                    } else {
                        sug.style.display = 'none';
                    }
                } catch {}
            }, 200);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addInfoTag(blobName, input.value);
            }
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.info-tag-input-wrapper')) {
                document.getElementById('infoTagSuggestions').style.display = 'none';
            }
        });
    } catch (e) {
        el.innerHTML = '<p style="color:#999;">Erreur de chargement des tags</p>';
    }
}

function selectInfoTagSuggestion(tag, blobName) {
    document.getElementById('infoTagSuggestions').style.display = 'none';
    addInfoTag(blobName, tag);
}

async function addInfoTag(blobName, tag) {
    tag = tag.trim();
    if (!tag) return;
    const token = getAuthToken();
    try {
        const res = await fetch(`${API_URL}/files/${encodeBlobPath(blobName)}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ tag })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('infoTagInput').value = '';
            loadInfoTags(blobName, token);
        } else {
            showError(data.error || 'Erreur ajout tag');
        }
    } catch (e) { showError('Erreur ajout tag'); }
}

async function removeInfoTag(blobName, tag) {
    const token = getAuthToken();
    try {
        const res = await fetch(`${API_URL}/files/${encodeBlobPath(blobName)}/tags/${encodeURIComponent(tag)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            loadInfoTags(blobName, token);
        } else {
            showError(data.error || 'Erreur suppression tag');
        }
    } catch (e) { showError('Erreur suppression tag'); }
}

async function loadInfoAI(blobName, contentType, token, tier) {
    const el = document.getElementById('infoAI');
    const isImage = contentType.startsWith('image/');
    const isVideo = contentType.startsWith('video/');
    const isArchived = tier === 'Archive' || tier === 'archive';

    // Si archivé → section grisée
    if (isArchived) {
        el.innerHTML = `
            <div style="opacity:0.5;pointer-events:none;filter:grayscale(1);">
                <div class="info-ai-buttons">
                    <button class="btn btn-sm btn-secondary" disabled><i class="fas fa-search"></i> Analyser</button>
                    ${isVideo ? '<button class="btn btn-sm btn-secondary" disabled><i class="fas fa-microphone"></i> Transcrire</button>' : ''}
                </div>
            </div>
            <div style="text-align:center;padding:12px;color:#f59e0b;font-size:0.85rem;">
                <i class="fas fa-snowflake"></i> Fichier en Archive — réhydratez-le pour lancer l'IA
            </div>`;
        return;
    }

    // Load existing analysis
    let existingHtml = '';
    try {
        const res = await fetch(`${API_URL}/ai/analysis/${encodeBlobPath(blobName)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.analysis) {
            const a = data.analysis;
            if (a.description) existingHtml += `<div class="info-ai-result"><strong>📝 Description :</strong> ${escapeHtml(a.description)}</div>`;
            if (a.tags && a.tags.length > 0) existingHtml += `<div class="info-ai-result"><strong>🏷️ Tags IA :</strong> ${a.tags.map(t => `<span class="info-tag info-tag-ai">${escapeHtml(t)}</span>`).join(' ')}</div>`;
            if (a.faces && a.faces.length > 0) existingHtml += `<div class="info-ai-result"><strong>👤 Visages :</strong> ${a.faces.length} détecté(s)</div>`;
            if (a.transcription) existingHtml += `<div class="info-ai-result"><strong>🎤 Transcription :</strong> ${escapeHtml(a.transcription.substring(0, 300))}${a.transcription.length > 300 ? '...' : ''}</div>`;
        }
    } catch {}

    let buttonsHtml = '<div class="info-ai-buttons">';
    if (isImage || isVideo) {
        buttonsHtml += `<button class="btn btn-sm btn-secondary" onclick="infoAIAction('analyze','${escapeHtml(blobName)}')"><i class="fas fa-search"></i> Analyser</button>`;
    }
    if (isVideo) {
        buttonsHtml += `<button class="btn btn-sm btn-secondary" onclick="infoAIAction('transcribe','${escapeHtml(blobName)}')"><i class="fas fa-microphone"></i> Transcrire</button>`;
    }
    buttonsHtml += '</div>';

    el.innerHTML = existingHtml + buttonsHtml;
}

async function infoAIAction(action, blobName) {
    const token = getAuthToken();
    try {
        let url, body;
        if (action === 'analyze') {
            url = `${API_URL}/ai/analyze/${encodeBlobPath(blobName)}`;
            body = {};
        } else if (action === 'transcribe') {
            url = `${API_URL}/ai/transcribe/${encodeBlobPath(blobName)}`;
            body = {};
        }
        showSuccess('Analyse lancée...');
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
            showSuccess('Analyse en cours, rechargez dans quelques instants');
            // Reload AI section after delay
            setTimeout(() => {
                const file = allFiles.find(f => f.name === blobName);
                if (file) loadInfoAI(blobName, file.contentType || '', token, file.tier || '');
            }, 5000);
        } else {
            showError(data.error || 'Erreur analyse IA');
        }
    } catch (e) { showError('Erreur analyse IA'); }
}

async function loadInfoGeo(blobName, token) {
    const el = document.getElementById('infoGeo');
    try {
        const res = await fetch(`${API_URL}/files/${encodeBlobPath(blobName)}/geolocation`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        const geo = data.geolocation;

        if (geo) {
            const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${geo.longitude-0.01},${geo.latitude-0.007},${geo.longitude+0.01},${geo.latitude+0.007}&layer=mapnik&marker=${geo.latitude},${geo.longitude}`;
            const osmLink = `https://www.openstreetmap.org/?mlat=${geo.latitude}&mlon=${geo.longitude}#map=15/${geo.latitude}/${geo.longitude}`;
            el.innerHTML = `
                <div style="border-radius:10px;overflow:hidden;margin-bottom:10px;border:1px solid #e5e7eb;">
                    <iframe src="${mapUrl}" style="width:100%;height:180px;border:0;" loading="lazy"></iframe>
                </div>
                <div class="info-row"><span class="info-label">📍 Adresse</span><span class="info-value">${escapeHtml(geo.address || 'Non renseignée')}</span></div>
                <div class="info-row" style="opacity:0.5;font-size:0.75rem;"><span class="info-label">Coordonnées</span><span class="info-value">${geo.latitude.toFixed(5)}, ${geo.longitude.toFixed(5)}</span></div>
                <div style="display:flex;gap:8px;margin-top:10px;">
                    <a href="${osmLink}" target="_blank" class="btn btn-sm btn-secondary" style="text-decoration:none;"><i class="fas fa-external-link-alt"></i> Ouvrir la carte</a>
                    <button class="btn btn-sm btn-secondary" onclick="editInfoGeo('${escapeHtml(blobName)}','${escapeHtml(geo.address||'')}')"><i class="fas fa-edit"></i> Modifier</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteInfoGeo('${escapeHtml(blobName)}')"><i class="fas fa-trash"></i></button>
                </div>
            `;
        } else {
            el.innerHTML = `
                <p style="color:#999;font-size:0.85rem;">Aucune géolocalisation</p>
                <button class="btn btn-sm btn-secondary" onclick="editInfoGeo('${escapeHtml(blobName)}','')"><i class="fas fa-map-marker-alt"></i> Ajouter un lieu</button>
            `;
        }
    } catch (e) {
        el.innerHTML = '<p style="color:#999;">Erreur de chargement</p>';
    }
}

function editInfoGeo(blobName, currentAddress) {
    const el = document.getElementById('infoGeo');
    el.innerHTML = `
        <div class="form-group" style="margin-bottom:10px;">
            <label style="font-size:0.8rem;font-weight:600;color:#444;">📍 Adresse ou ville</label>
            <input type="text" id="geoAddrInput" class="form-input" value="${escapeHtml(currentAddress)}" 
                placeholder="Ex: Paris, 14 rue Juliette Récamier Lyon, Valencin..." 
                style="font-size:0.85rem;padding:8px 12px;margin-top:4px;">
            <div id="geoSearchResults" style="display:none;background:#fff;border:1px solid #e5e7eb;border-radius:8px;margin-top:4px;max-height:150px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,.1);"></div>
        </div>
        <div id="geoPreviewMap" style="display:none;border-radius:10px;overflow:hidden;margin-bottom:10px;border:1px solid #e5e7eb;"></div>
        <input type="hidden" id="geoLatInput" value="0">
        <input type="hidden" id="geoLngInput" value="0">
        <div style="display:flex;gap:8px;">
            <button class="btn btn-sm btn-primary" id="geoSaveBtn" onclick="saveInfoGeo('${escapeHtml(blobName)}')" disabled style="opacity:0.5;"><i class="fas fa-save"></i> Enregistrer</button>
            <button class="btn btn-sm btn-secondary" onclick="loadInfoGeo('${escapeHtml(blobName)}',getAuthToken())">Annuler</button>
        </div>
    `;

    // Autocomplete avec Nominatim (OpenStreetMap)
    let searchTimeout;
    document.getElementById('geoAddrInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const q = e.target.value.trim();
        if (q.length < 3) { document.getElementById('geoSearchResults').style.display = 'none'; return; }
        searchTimeout = setTimeout(async () => {
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&accept-language=fr`);
                const results = await res.json();
                const container = document.getElementById('geoSearchResults');
                if (results.length === 0) {
                    container.innerHTML = '<div style="padding:8px 12px;color:#999;font-size:0.8rem;">Aucun résultat</div>';
                } else {
                    container.innerHTML = results.map(r => `
                        <div class="geo-result-item" style="padding:8px 12px;cursor:pointer;font-size:0.8rem;border-bottom:1px solid #f0f0f0;transition:background .15s;" 
                            onmouseover="this.style.background='#f0f4ff'" onmouseout="this.style.background=''"
                            onclick="selectGeoResult(${r.lat},${r.lon},'${escapeHtml(r.display_name)}')">
                            <i class="fas fa-map-marker-alt" style="color:#ef4444;margin-right:6px;"></i>${escapeHtml(r.display_name)}
                        </div>
                    `).join('');
                }
                container.style.display = 'block';
            } catch (err) { console.error('Geocoding error:', err); }
        }, 400);
    });
}

function selectGeoResult(lat, lng, displayName) {
    document.getElementById('geoLatInput').value = lat;
    document.getElementById('geoLngInput').value = lng;
    document.getElementById('geoAddrInput').value = displayName;
    document.getElementById('geoSearchResults').style.display = 'none';
    
    // Afficher preview carte
    const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.01},${lat-0.007},${lng+0.01},${lat+0.007}&layer=mapnik&marker=${lat},${lng}`;
    document.getElementById('geoPreviewMap').innerHTML = `<iframe src="${mapUrl}" style="width:100%;height:150px;border:0;" loading="lazy"></iframe>`;
    document.getElementById('geoPreviewMap').style.display = 'block';
    
    // Activer le bouton sauvegarder
    const btn = document.getElementById('geoSaveBtn');
    btn.disabled = false;
    btn.style.opacity = '1';
}

async function saveInfoGeo(blobName) {
    const lat = parseFloat(document.getElementById('geoLatInput').value);
    const lng = parseFloat(document.getElementById('geoLngInput').value);
    const address = document.getElementById('geoAddrInput').value.trim();
    if (!lat || !lng || !address) { showError('Sélectionnez une adresse dans la liste'); return; }
    const token = getAuthToken();
    try {
        const res = await fetch(`${API_URL}/files/${encodeBlobPath(blobName)}/geolocation`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ latitude: lat, longitude: lng, address })
        });
        const data = await res.json();
        if (data.success) {
            showSuccess('Géolocalisation enregistrée');
            loadInfoGeo(blobName, token);
        } else {
            showError(data.error || 'Erreur');
        }
    } catch (e) { showError('Erreur sauvegarde géolocalisation'); }
}

async function deleteInfoGeo(blobName) {
    if (!confirm('Supprimer la géolocalisation ?')) return;
    const token = getAuthToken();
    try {
        const res = await fetch(`${API_URL}/files/${encodeBlobPath(blobName)}/geolocation`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success) {
            showSuccess('Géolocalisation supprimée');
            loadInfoGeo(blobName, token);
        } else {
            showError(data.error || 'Erreur');
        }
    } catch (e) { showError('Erreur suppression géolocalisation'); }
}
