// Guest Upload Script
const API_URL = 'http://localhost:3000/api';

let guestToken = null;
let guestInfo = null;
let uploadedFiles = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Get token and guest info
    guestToken = localStorage.getItem('guestToken') || sessionStorage.getItem('guestToken');
    const guestInfoStr = localStorage.getItem('guestInfo') || sessionStorage.getItem('guestInfo');

    if (!guestToken || !guestInfoStr) {
        window.location.href = 'guest-login.html';
        return;
    }

    try {
        guestInfo = JSON.parse(guestInfoStr);
    } catch (error) {
        console.error('Error parsing guest info:', error);
        logout();
        return;
    }

    initializeUploadInterface();
    displayGuestInfo();
    updateExpirationTimer();
    loadFiles();

    // Update expiration timer every minute
    setInterval(updateExpirationTimer, 60000);
});

// Display guest info
function displayGuestInfo() {
    const emailEl = document.getElementById('guestEmail');
    if (emailEl && guestInfo) {
        emailEl.textContent = guestInfo.email;
    }
}

// Update expiration timer
function updateExpirationTimer() {
    if (!guestInfo || !guestInfo.accountExpiresAt) return;

    const expiresAt = new Date(guestInfo.accountExpiresAt);
    const now = new Date();
    const timeRemaining = expiresAt - now;

    const timeEl = document.getElementById('expirationTime');
    if (!timeEl) return;

    if (timeRemaining <= 0) {
        timeEl.textContent = 'Expiré';
        timeEl.style.color = '#ef4444';
        showExpiredMessage();
        return;
    }

    const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours >= 24) {
        const days = Math.floor(hours / 24);
        timeEl.textContent = `${days} jour(s)`;
        timeEl.style.color = '#10b981';
    } else if (hours > 0) {
        timeEl.textContent = `${hours}h ${minutes}min`;
        timeEl.style.color = hours <= 3 ? '#f59e0b' : '#10b981';
    } else {
        timeEl.textContent = `${minutes} minute(s)`;
        timeEl.style.color = '#ef4444';
    }
}

// Show expired message
function showExpiredMessage() {
    const banner = document.getElementById('expirationBanner');
    if (banner) {
        banner.style.background = 'linear-gradient(135deg, #fee2e2, #fecaca)';
        banner.style.borderColor = '#ef4444';
        banner.querySelector('strong').textContent = 'Votre accès invité a expiré';
    }

    // Disable upload
    const uploadZone = document.getElementById('uploadZone');
    if (uploadZone) {
        uploadZone.style.opacity = '0.5';
        uploadZone.style.pointerEvents = 'none';
    }
}

// Initialize upload interface
function initializeUploadInterface() {
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const logoutBtn = document.getElementById('logoutBtn');

    // Drag and drop
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('drag-over');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            uploadFiles(files);
        }
    });

    // File input
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            uploadFiles(files);
        }
        // Reset input
        e.target.value = '';
    });

    // Logout
    logoutBtn.addEventListener('click', logout);
}

// Upload files
async function uploadFiles(files) {
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    progressContainer.style.display = 'block';

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);

        try {
            progressText.textContent = `Upload en cours... ${i + 1}/${files.length}`;
            progressBar.style.width = `${((i) / files.length) * 100}%`;

            const response = await fetch(`${API_URL}/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${guestToken}`
                },
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                console.log('File uploaded:', data.file);
            } else {
                console.error('Upload failed:', data.error);
                showNotification(`Erreur: ${data.error}`, 'error');
            }
        } catch (error) {
            console.error('Upload error:', error);
            showNotification(`Erreur lors de l'upload de ${file.name}`, 'error');
        }
    }

    // Complete
    progressBar.style.width = '100%';
    progressText.textContent = 'Upload terminé !';

    setTimeout(() => {
        progressContainer.style.display = 'none';
        progressBar.style.width = '0%';
        loadFiles();
    }, 1500);
}

// Load files
async function loadFiles() {
    try {
        const response = await fetch(`${API_URL}/files`, {
            headers: {
                'Authorization': `Bearer ${guestToken}`
            }
        });

        const data = await response.json();

        if (data.success) {
            uploadedFiles = data.files || [];
            displayFiles(uploadedFiles);
        } else if (response.status === 401) {
            // Token invalid or expired
            logout();
        } else {
            console.error('Error loading files:', data.error);
        }
    } catch (error) {
        console.error('Error loading files:', error);
    }
}

// Display files
function displayFiles(files) {
    const filesList = document.getElementById('filesList');
    const filesCount = document.getElementById('filesCount');

    filesCount.textContent = files.length;

    if (files.length === 0) {
        filesList.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
                    <path d="M13 2v7h7"/>
                </svg>
                <p>Aucun fichier uploadé pour le moment</p>
            </div>
        `;
        return;
    }

    filesList.innerHTML = files.map(file => `
        <div class="file-item">
            <div class="file-info">
                <div class="file-icon">
                    ${getFileIcon(file.contentType)}
                </div>
                <div class="file-details">
                    <div class="file-name">${escapeHtml(file.originalName || file.name)}</div>
                    <div class="file-meta">
                        ${formatFileSize(file.size)} •
                        ${formatDate(file.uploadedAt || file.lastModified)}
                    </div>
                </div>
            </div>
            <div class="file-status">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                    <path d="M22 4L12 14.01l-3-3"/>
                </svg>
                Uploadé
            </div>
        </div>
    `).join('');
}

// Get file icon
function getFileIcon(contentType) {
    if (contentType && contentType.startsWith('image/')) {
        return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <path d="M21 15l-5-5L5 21"/>
        </svg>`;
    } else if (contentType && contentType.startsWith('video/')) {
        return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 7l-7 5 7 5V7z"/>
            <rect x="1" y="5" width="15" height="14" rx="2"/>
        </svg>`;
    } else if (contentType && contentType.includes('pdf')) {
        return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <path d="M14 2v6h6"/>
            <path d="M8 13h2v6"/>
        </svg>`;
    } else {
        return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
            <path d="M13 2v7h7"/>
        </svg>`;
    }
}

// Format file size
function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Format date
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show notification
function showNotification(message, type = 'info') {
    // Simple console notification for now
    console.log(`[${type.toUpperCase()}] ${message}`);

    // You could add a toast notification system here
    alert(message);
}

// Logout
function logout() {
    localStorage.removeItem('guestToken');
    localStorage.removeItem('guestInfo');
    sessionStorage.removeItem('guestToken');
    sessionStorage.removeItem('guestInfo');
    window.location.href = 'guest-login.html';
}
