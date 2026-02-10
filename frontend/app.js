// Configuration
const API_URL = 'http://localhost:3000/api';

// État de l'application
let selectedFiles = [];
let fileToDelete = null;
let fileToShare = null;

// Éléments DOM
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const selectedFilesContainer = document.getElementById('selectedFiles');
const actionsDiv = document.getElementById('actions');
const uploadBtn = document.getElementById('uploadBtn');
const clearBtn = document.getElementById('clearBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const messagesContainer = document.getElementById('messages');
const filesList = document.getElementById('filesList');
const refreshBtn = document.getElementById('refreshBtn');
const deleteModal = document.getElementById('deleteModal');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const previewModal = document.getElementById('previewModal');
const previewTitle = document.getElementById('previewTitle');
const previewBody = document.getElementById('previewBody');
const closePreviewBtn = document.getElementById('closePreviewBtn');
const shareModal = document.getElementById('shareModal');
const shareFileInfo = document.getElementById('shareFileInfo');
const closeShareBtn = document.getElementById('closeShareBtn');
const expirationSelect = document.getElementById('expirationSelect');
const generateLinkBtn = document.getElementById('generateLinkBtn');
const shareResult = document.getElementById('shareResult');
const shareLink = document.getElementById('shareLink');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const shareExpires = document.getElementById('shareExpires');
const passwordInput = document.getElementById('passwordInput');
const recipientEmailInput = document.getElementById('recipientEmailInput');
const qrCodeImage = document.getElementById('qrCodeImage');
const shareLinkId = document.getElementById('shareLinkId');
const sharePassword = document.getElementById('sharePassword');
const shareWarning = document.getElementById('shareWarning');
const historyBtn = document.getElementById('historyNavBtn');
const historyModal = document.getElementById('historyModal');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');
const historyList = document.getElementById('historyList');

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    loadFiles();
    checkHealth();
    loadConfig();
});

// Event Listeners
function initializeEventListeners() {
    // Drag & Drop
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    uploadArea.addEventListener('click', () => fileInput.click());

    // Sélection de fichiers
    fileInput.addEventListener('change', handleFileSelect);

    // Boutons
    uploadBtn.addEventListener('click', uploadFiles);
    clearBtn.addEventListener('click', clearSelection);
    refreshBtn.addEventListener('click', loadFiles);
    confirmDeleteBtn.addEventListener('click', confirmDelete);
    cancelDeleteBtn.addEventListener('click', () => deleteModal.style.display = 'none');
    closePreviewBtn.addEventListener('click', closePreview);
    closeShareBtn.addEventListener('click', closeShare);
    generateLinkBtn.addEventListener('click', generateShareLink);
    copyLinkBtn.addEventListener('click', copyShareLink);
    historyBtn.addEventListener('click', showHistory);
    closeHistoryBtn.addEventListener('click', closeHistory);
    
    // Fermer les modals avec Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (previewModal.style.display === 'flex') {
                closePreview();
            }
            if (shareModal.style.display === 'flex') {
                closeShare();
            }
            if (historyModal.style.display === 'flex') {
                closeHistory();
            }
        }
    });
}

// Drag & Drop handlers
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
}

// Sélection de fichiers
function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    addFiles(files);
}

// Ajouter des fichiers
function addFiles(files) {
    selectedFiles = [...selectedFiles, ...files];
    displaySelectedFiles();
    actionsDiv.style.display = 'flex';
}

// Afficher les fichiers sélectionnés
function displaySelectedFiles() {
    if (selectedFiles.length === 0) {
        selectedFilesContainer.innerHTML = '';
        actionsDiv.style.display = 'none';
        return;
    }

    selectedFilesContainer.innerHTML = `
        <h3 style="margin-bottom: 15px;">Fichiers sélectionnés (${selectedFiles.length})</h3>
    `;

    selectedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-info">
                <div class="file-icon">${getFileIcon(file.type)}</div>
                <div class="file-details">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${formatFileSize(file.size)}</div>
                </div>
            </div>
            <div class="file-actions">
                <button class="btn btn-danger btn-small" onclick="removeFile(${index})">
                    ✕ Retirer
                </button>
            </div>
        `;
        selectedFilesContainer.appendChild(fileItem);
    });
}

// Retirer un fichier de la sélection
function removeFile(index) {
    selectedFiles.splice(index, 1);
    displaySelectedFiles();
}

// Effacer la sélection
function clearSelection() {
    selectedFiles = [];
    fileInput.value = '';
    displaySelectedFiles();
}

// Upload des fichiers
async function uploadFiles() {
    if (selectedFiles.length === 0) {
        showMessage('Veuillez sélectionner au moins un fichier', 'error');
        return;
    }

    // Afficher la page de progression
    showUploadProgress();
    
    uploadBtn.disabled = true;
    clearBtn.disabled = true;

    const formData = new FormData();
    selectedFiles.forEach(file => {
        formData.append('files', file);
    });

    try {
        const xhr = new XMLHttpRequest();
        const startTime = Date.now();

        // Progression
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                const elapsed = (Date.now() - startTime) / 1000;
                const speed = e.loaded / elapsed;
                const remaining = (e.total - e.loaded) / speed;
                
                updateUploadProgress(percentComplete, speed, remaining);
            }
        });

        // Completion
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                showUploadSuccess(response);
                setTimeout(() => {
                    hideUploadProgress();
                    clearSelection();
                    loadFiles();
                }, 3000);
            } else {
                const error = JSON.parse(xhr.responseText);
                showUploadError(`Erreur: ${error.error}`);
            }
        });

        // Erreur
        xhr.addEventListener('error', () => {
            showUploadError('Erreur réseau lors de l\'upload');
        });

        xhr.open('POST', `${API_URL}/upload/multiple`);
        xhr.send(formData);

    } catch (error) {
        showUploadError(`Erreur: ${error.message}`);
    }
}

// Afficher la page de progression
function showUploadProgress() {
    // Créer la modal de progression si elle n'existe pas
    let progressModal = document.getElementById('uploadProgressModal');
    if (!progressModal) {
        progressModal = document.createElement('div');
        progressModal.id = 'uploadProgressModal';
        progressModal.className = 'modal-overlay';
        progressModal.innerHTML = `
            <div class="modal-box modal-medium">
                <div class="modal-header">
                    <h3>📤 Upload en cours</h3>
                </div>
                <div class="modal-body">
                    <div class="upload-progress-container">
                        <div class="upload-progress-header">
                            <div class="upload-progress-files">
                                <span class="upload-progress-count">
                                    <strong id="uploadFileCount">${selectedFiles.length}</strong> fichier(s) à envoyer
                                </span>
                                <span class="upload-progress-size" id="uploadTotalSize">
                                    ${formatFileSize(selectedFiles.reduce((sum, f) => sum + f.size, 0))}
                                </span>
                            </div>
                        </div>
                        
                        <div class="upload-progress-main">
                            <div class="upload-progress-bar-wrapper">
                                <div class="upload-progress-bar-container">
                                    <div class="upload-progress-bar-fill" id="uploadProgressBarFill"></div>
                                </div>
                                <div class="upload-progress-stats">
                                    <span class="upload-progress-percent" id="uploadProgressPercent">0%</span>
                                    <span class="upload-progress-speed" id="uploadProgressSpeed">--</span>
                                    <span class="upload-progress-remaining" id="uploadProgressRemaining">Calcul...</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="upload-progress-files-list" id="uploadProgressFilesList">
                            ${selectedFiles.map((file, idx) => `
                                <div class="upload-file-item" id="uploadFileItem${idx}">
                                    <div class="upload-file-icon">${getFileIcon(file.type)}</div>
                                    <div class="upload-file-info">
                                        <div class="upload-file-name">${file.name}</div>
                                        <div class="upload-file-size">${formatFileSize(file.size)}</div>
                                    </div>
                                    <div class="upload-file-status">
                                        <div class="spinner-small"></div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        
                        <div class="upload-progress-message" id="uploadProgressMessage"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(progressModal);
    }
    
    progressModal.style.display = 'flex';
}

// Mettre à jour la progression d'upload
function updateUploadProgress(percent, speed, remaining) {
    const progressBarFill = document.getElementById('uploadProgressBarFill');
    const progressPercent = document.getElementById('uploadProgressPercent');
    const progressSpeed = document.getElementById('uploadProgressSpeed');
    const progressRemaining = document.getElementById('uploadProgressRemaining');
    
    if (progressBarFill) progressBarFill.style.width = `${percent}%`;
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressSpeed) progressSpeed.textContent = `${formatSpeed(speed)}`;
    if (progressRemaining) progressRemaining.textContent = `${formatTime(remaining)} restant`;
}

// Afficher le succès de l'upload
function showUploadSuccess(response) {
    const progressMessage = document.getElementById('uploadProgressMessage');
    const fileItems = document.querySelectorAll('.upload-file-item');
    
    // Marquer tous les fichiers comme uploadés
    fileItems.forEach(item => {
        const statusDiv = item.querySelector('.upload-file-status');
        statusDiv.innerHTML = '<span class="upload-success-icon">✅</span>';
        item.classList.add('upload-complete');
    });
    
    if (progressMessage) {
        progressMessage.innerHTML = `
            <div class="upload-success-message">
                <div class="upload-success-icon-large">✅</div>
                <h3>Upload réussi !</h3>
                <p>${response.message || 'Tous les fichiers ont été uploadés avec succès'}</p>
            </div>
        `;
    }
    
    // Mettre la barre à 100%
    updateUploadProgress(100, 0, 0);
}

// Afficher une erreur d'upload
function showUploadError(errorMessage) {
    const progressMessage = document.getElementById('uploadProgressMessage');
    
    if (progressMessage) {
        progressMessage.innerHTML = `
            <div class="upload-error-message">
                <div class="upload-error-icon-large">❌</div>
                <h3>Erreur d'upload</h3>
                <p>${errorMessage}</p>
                <button class="btn btn-primary" onclick="hideUploadProgress()">Fermer</button>
            </div>
        `;
    }
    
    uploadBtn.disabled = false;
    clearBtn.disabled = false;
}

// Masquer la page de progression
function hideUploadProgress() {
    const progressModal = document.getElementById('uploadProgressModal');
    if (progressModal) {
        progressModal.style.display = 'none';
        // Réinitialiser le contenu
        setTimeout(() => {
            progressModal.remove();
        }, 300);
    }
    
    uploadBtn.disabled = false;
    clearBtn.disabled = false;
}

// Formater la vitesse
function formatSpeed(bytesPerSecond) {
    if (!bytesPerSecond || bytesPerSecond === 0) return '--';
    
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    
    return Math.round((bytesPerSecond / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Formater le temps restant
function formatTime(seconds) {
    if (!seconds || seconds === Infinity || isNaN(seconds)) return 'Calcul...';
    
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

// Charger la liste des fichiers
async function loadFiles() {
    filesList.innerHTML = '<p class="loading">Chargement des fichiers...</p>';

    try {
        const response = await fetch(`${API_URL}/files`);
        const data = await response.json();

        if (data.success && data.files.length > 0) {
            displayFiles(data.files);
        } else {
            filesList.innerHTML = '<p class="empty">Aucun fichier uploadé pour le moment</p>';
        }
    } catch (error) {
        filesList.innerHTML = '<p class="error">Erreur lors du chargement des fichiers</p>';
        showMessage('Erreur lors du chargement des fichiers', 'error');
    }
}

// Afficher les fichiers
function displayFiles(files) {
    filesList.innerHTML = '';

    files.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        const originalName = file.metadata?.originalName || file.name;
        const uploadDate = file.lastModified ? new Date(file.lastModified).toLocaleString('fr-FR') : 'N/A';

        const canPreview = isPreviewable(file.contentType);
        
        fileItem.innerHTML = `
            <div class="file-info">
                <div class="file-icon">${getFileIcon(file.contentType)}</div>
                <div class="file-details">
                    <div class="file-name">${originalName}</div>
                    <div class="file-size">
                        ${formatFileSize(file.size)} • Uploadé le ${uploadDate}
                    </div>
                </div>
            </div>
            <div class="file-actions">
                ${canPreview ? `
                    <button class="btn btn-preview btn-small" onclick="previewFile('${file.name}', '${originalName}', '${file.contentType}')">
                        👁️ Aperçu
                    </button>
                ` : ''}
                <button class="btn btn-success btn-small" onclick="shareFile('${file.name}', '${originalName}', ${file.size})">
                    🔗 Partager
                </button>
                <button class="btn btn-primary btn-small" onclick="downloadFile('${file.name}', '${originalName}')">
                    ⬇️ Télécharger
                </button>
                <button class="btn btn-danger btn-small" onclick="deleteFile('${file.name}')">
                    🗑️ Supprimer
                </button>
            </div>
        `;
        filesList.appendChild(fileItem);
    });
}

// Télécharger un fichier
function downloadFile(blobName, originalName) {
    const link = document.createElement('a');
    link.href = `${API_URL}/download/${blobName}`;
    link.download = originalName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showMessage('Téléchargement en cours...', 'info');
}

// Supprimer un fichier
function deleteFile(blobName) {
    fileToDelete = blobName;
    deleteModal.style.display = 'flex';
}

// Confirmer la suppression
async function confirmDelete() {
    if (!fileToDelete) return;

    deleteModal.style.display = 'none';

    try {
        const response = await fetch(`${API_URL}/files/${fileToDelete}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showMessage('Fichier supprimé avec succès', 'success');
            loadFiles();
        } else {
            showMessage(`Erreur: ${data.error}`, 'error');
        }
    } catch (error) {
        showMessage(`Erreur: ${error.message}`, 'error');
    }

    fileToDelete = null;
}

// Afficher un message
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    
    messagesContainer.appendChild(messageDiv);

    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

// Charger la configuration depuis le serveur
async function loadConfig() {
    try {
        const response = await fetch(`${API_URL}/settings/maxFileSizeMB`);
        const data = await response.json();
        
        if (data.success) {
            const maxSizeMB = parseInt(data.value);
            // Mettre à jour l'affichage de la limite
            const uploadLimitElement = document.querySelector('.upload-limit');
            if (uploadLimitElement) {
                uploadLimitElement.textContent = `Taille maximale : ${maxSizeMB} Mo par fichier`;
            }
        }
    } catch (error) {
        console.error('Erreur lors du chargement de la config:', error);
    }
}

// Vérifier la santé du serveur
async function checkHealth() {
    try {
        const response = await fetch(`${API_URL}/health`);
        const data = await response.json();
        console.log('✅ Serveur connecté:', data);
    } catch (error) {
        console.error('❌ Erreur de connexion au serveur:', error);
        showMessage('Impossible de se connecter au serveur. Assurez-vous qu\'il est démarré.', 'error');
    }
}

// Utilitaires
function getFileIcon(mimeType) {
    if (!mimeType) return '📄';
    
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📘';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📽️';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) return '📦';
    if (mimeType.includes('text')) return '📝';
    
    return '📄';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// Vérifier si le fichier peut être prévisualisé
function isPreviewable(mimeType) {
    if (!mimeType) return false;
    
    const previewableTypes = [
        'image/', 'video/', 'audio/', 'application/pdf',
        'text/', 'application/json', 'application/javascript'
    ];
    
    return previewableTypes.some(type => mimeType.includes(type));
}

// Prévisualiser un fichier
async function previewFile(blobName, originalName, contentType) {
    previewTitle.textContent = `Aperçu: ${originalName}`;
    previewBody.innerHTML = '<p class="loading">Chargement de l\'aperçu...</p>';
    previewModal.style.display = 'flex';
    
    try {
        const url = `${API_URL}/preview/${blobName}`;
        
        if (contentType.startsWith('image/')) {
            await previewImage(url, originalName);
        } else if (contentType.startsWith('video/')) {
            await previewVideo(url, contentType);
        } else if (contentType.startsWith('audio/')) {
            await previewAudio(url, contentType);
        } else if (contentType === 'application/pdf') {
            await previewPDF(url);
        } else if (contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('javascript')) {
            await previewText(url);
        } else {
            previewUnsupported(originalName);
        }
    } catch (error) {
        console.error('Erreur preview:', error);
        previewBody.innerHTML = `
            <div class="preview-error">
                <div class="preview-error-icon">⚠️</div>
                <p>Erreur lors du chargement de l'aperçu</p>
                <p style="font-size: 0.9em; color: #999;">${error.message}</p>
            </div>
        `;
    }
}

// Preview d'image
async function previewImage(url, altText) {
    const img = new Image();
    
    img.onload = () => {
        previewBody.innerHTML = '';
        previewBody.appendChild(img);
    };
    
    img.onerror = () => {
        throw new Error('Impossible de charger l\'image');
    };
    
    img.src = url;
    img.alt = altText;
}

// Preview de vidéo
async function previewVideo(url, contentType) {
    previewBody.innerHTML = `
        <video controls>
            <source src="${url}" type="${contentType}">
            Votre navigateur ne supporte pas la lecture de vidéos.
        </video>
    `;
}

// Preview d'audio
async function previewAudio(url, contentType) {
    previewBody.innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <div style="font-size: 4em; margin-bottom: 20px;">🎵</div>
            <audio controls style="width: 100%;">
                <source src="${url}" type="${contentType}">
                Votre navigateur ne supporte pas la lecture audio.
            </audio>
        </div>
    `;
}

// Preview de PDF
async function previewPDF(url) {
    try {
        // Configuration PDF.js
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        
        previewBody.innerHTML = '<p class="loading">Chargement du PDF...</p>';
        
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        
        let currentPage = 1;
        const totalPages = pdf.numPages;
        
        const renderPage = async (pageNum) => {
            const page = await pdf.getPage(pageNum);
            const scale = 1.5;
            const viewport = page.getViewport({ scale });
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;
            
            return canvas;
        };
        
        const updatePreview = async () => {
            previewBody.innerHTML = `
                <div class="pdf-controls">
                    <button id="prevPage" ${currentPage <= 1 ? 'disabled' : ''}>◀ Précédent</button>
                    <span>Page ${currentPage} / ${totalPages}</span>
                    <button id="nextPage" ${currentPage >= totalPages ? 'disabled' : ''}>Suivant ▶</button>
                </div>
                <div class="pdf-container" id="pdfContainer">
                    <p class="loading">Chargement de la page...</p>
                </div>
            `;
            
            const canvas = await renderPage(currentPage);
            const container = document.getElementById('pdfContainer');
            container.innerHTML = '';
            container.appendChild(canvas);
            
            document.getElementById('prevPage')?.addEventListener('click', () => {
                if (currentPage > 1) {
                    currentPage--;
                    updatePreview();
                }
            });
            
            document.getElementById('nextPage')?.addEventListener('click', () => {
                if (currentPage < totalPages) {
                    currentPage++;
                    updatePreview();
                }
            });
        };
        
        await updatePreview();
        
    } catch (error) {
        console.error('Erreur PDF:', error);
        throw new Error('Impossible de charger le PDF');
    }
}

// Preview de texte
async function previewText(url) {
    try {
        const response = await fetch(url);
        const text = await response.text();
        
        const escapedText = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        previewBody.innerHTML = `<pre>${escapedText}</pre>`;
    } catch (error) {
        throw new Error('Impossible de charger le fichier texte');
    }
}

// Fichier non supporté
function previewUnsupported(fileName) {
    previewBody.innerHTML = `
        <div class="preview-unsupported">
            <div class="preview-unsupported-icon">📄</div>
            <h3>Aperçu non disponible</h3>
            <p>L'aperçu n'est pas supporté pour ce type de fichier.</p>
            <p style="font-size: 0.9em; color: #999; margin-top: 10px;">${fileName}</p>
            <button class="btn btn-primary" onclick="closePreview()" style="margin-top: 20px;">
                Fermer
            </button>
        </div>
    `;
}

// Fermer la preview
function closePreview() {
    previewModal.style.display = 'none';
    previewBody.innerHTML = '';
}

// Ouvrir le modal de partage
function shareFile(blobName, originalName, size) {
    fileToShare = { blobName, originalName, size };
    
    shareFileInfo.innerHTML = `
        <div class="file-info-card">
            <div class="file-icon">${getFileIcon('')}</div>
            <div class="file-details">
                <div class="file-name">${originalName}</div>
                <div class="file-size">${formatFileSize(size)}</div>
            </div>
        </div>
    `;
    
    shareResult.style.display = 'none';
    shareLink.value = '';
    passwordInput.value = '';
    recipientEmailInput.value = '';
    shareExpires.textContent = '';
    shareModal.style.display = 'flex';
    recipientEmailInput.focus();
}

// Générer le lien de partage
async function generateShareLink() {
    if (!fileToShare) return;
    
    // Valider que l'email est rempli
    const recipientEmails = recipientEmailInput.value.trim();
    if (!recipientEmails) {
        showMessage('Veuillez entrer au moins un email de destinataire', 'error');
        recipientEmailInput.focus();
        return;
    }
    
    generateLinkBtn.disabled = true;
    generateLinkBtn.textContent = '⏳ Génération...';
    
    try {
        const expiresInMinutes = parseInt(expirationSelect.value);
        const password = passwordInput.value.trim();
        
        const response = await fetch(`${API_URL}/share/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                blobName: fileToShare.blobName,
                expiresInMinutes,
                recipientEmail: recipientEmails,
                password: password || undefined,
                permissions: 'r' // read-only
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            shareLink.value = data.shareLink;
            
            const expiresDate = new Date(data.expiresAt);
            const expiresText = expiresDate.toLocaleString('fr-FR', {
                dateStyle: 'full',
                timeStyle: 'short'
            });
            
            shareExpires.innerHTML = `🕒 <strong>Expire le :</strong> ${expiresText}`;
            shareLinkId.textContent = data.linkId;
            
            // Afficher le QR Code
            qrCodeImage.src = data.qrCode;
            
            // Afficher/masquer l'info mot de passe
            if (data.hasPassword) {
                sharePassword.style.display = 'block';
                shareWarning.style.display = 'none';
            } else {
                sharePassword.style.display = 'none';
                shareWarning.style.display = 'block';
            }
            
            shareResult.style.display = 'block';
            
            showMessage('Lien de partage généré avec succès !', 'success');
        } else {
            showMessage(`Erreur: ${data.error}`, 'error');
        }
    } catch (error) {
        showMessage(`Erreur: ${error.message}`, 'error');
    } finally {
        generateLinkBtn.disabled = false;
        generateLinkBtn.textContent = '🔗 Générer le lien de partage';
    }
}

// Copier le lien de partage
async function copyShareLink() {
    try {
        await navigator.clipboard.writeText(shareLink.value);
        
        const originalText = copyLinkBtn.textContent;
        copyLinkBtn.textContent = '✅ Copié !';
        copyLinkBtn.classList.add('btn-copied');
        
        setTimeout(() => {
            copyLinkBtn.textContent = originalText;
            copyLinkBtn.classList.remove('btn-copied');
        }, 2000);
        
        showMessage('Lien copié dans le presse-papiers', 'success');
    } catch (error) {
        // Fallback pour les anciens navigateurs
        shareLink.select();
        document.execCommand('copy');
        showMessage('Lien copié dans le presse-papiers', 'success');
    }
}

// Fermer le modal de partage
function closeShare() {
    shareModal.style.display = 'none';
    fileToShare = null;
    shareResult.style.display = 'none';
    passwordInput.value = '';
}

// Afficher l'historique des partages
async function showHistory() {
    historyModal.style.display = 'flex';
    historyList.innerHTML = '<p class="loading">Chargement de l\'historique...</p>';
    
    try {
        const response = await fetch(`${API_URL}/share/history`);
        const data = await response.json();
        
        if (data.success && data.links.length > 0) {
            displayHistory(data.links);
        } else {
            historyList.innerHTML = '<p class="empty">Aucun lien de partage généré</p>';
        }
    } catch (error) {
        historyList.innerHTML = '<p class="error">Erreur lors du chargement de l\'historique</p>';
        showMessage('Erreur lors du chargement de l\'historique', 'error');
    }
}

// Afficher l'historique
function displayHistory(links) {
    historyList.innerHTML = '';
    
    links.forEach(link => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item' + (link.isExpired ? ' expired' : '');
        
        const createdDate = new Date(link.created_at).toLocaleString('fr-FR');
        const expiresDate = new Date(link.expires_at).toLocaleString('fr-FR');
        
        const statusIcon = link.isExpired ? '⏰' : (link.isActive ? '✅' : '❌');
        const statusText = link.isExpired ? 'Expiré' : (link.isActive ? 'Actif' : 'Désactivé');
        
        historyItem.innerHTML = `
            <div class="history-item-header">
                <div class="history-file-info">
                    <div class="file-icon">${getFileIcon(link.content_type)}</div>
                    <div>
                        <div class="history-file-name">${link.original_name}</div>
                        <div class="history-file-meta">
                            ${formatFileSize(link.file_size)} • 
                            Créé le ${createdDate}
                        </div>
                    </div>
                </div>
                <div class="history-status ${link.isActive ? 'active' : 'inactive'}">
                    ${statusIcon} ${statusText}
                </div>
            </div>
            
            <div class="history-item-body">
                <div class="history-stats">
                    <div class="stat">
                        <span class="stat-label">Téléchargements:</span>
                        <span class="stat-value">${link.download_count || 0}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Expire le:</span>
                        <span class="stat-value">${expiresDate}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Durée:</span>
                        <span class="stat-value">${link.expires_in_minutes} min</span>
                    </div>
                    ${link.hasPassword ? '<div class="stat"><span class="stat-label">🔒 Protégé</span></div>' : ''}
                </div>
                
                <div class="history-actions">
                    ${link.isActive ? `
                        <button class="btn btn-primary btn-small" onclick="viewLinkStats('${link.link_id}')">
                            📊 Statistiques
                        </button>
                        <button class="btn btn-success btn-small" onclick="copyHistoryLink('${link.share_url}')">
                            📋 Copier le lien
                        </button>
                        <button class="btn btn-danger btn-small" onclick="deactivateLink('${link.link_id}')">
                            ❌ Désactiver
                        </button>
                    ` : `
                        <button class="btn btn-secondary btn-small" disabled>
                            Lien inactif
                        </button>
                    `}
                </div>
            </div>
        `;
        
        historyList.appendChild(historyItem);
    });
}

// Copier un lien de l'historique
async function copyHistoryLink(url) {
    try {
        await navigator.clipboard.writeText(url);
        showMessage('Lien copié dans le presse-papiers', 'success');
    } catch (error) {
        showMessage('Erreur lors de la copie', 'error');
    }
}

// Voir les statistiques d'un lien
async function viewLinkStats(linkId) {
    try {
        const response = await fetch(`${API_URL}/share/stats/${linkId}`);
        const data = await response.json();
        
        if (data.success) {
            const stats = data.statistics;
            const link = data.link;
            
            const firstDownload = stats.firstDownload ? 
                new Date(stats.firstDownload).toLocaleString('fr-FR') : 'Aucun';
            const lastDownload = stats.lastDownload ? 
                new Date(stats.lastDownload).toLocaleString('fr-FR') : 'Aucun';
            
            let logsHtml = '<p style="color: #666;">Aucun téléchargement</p>';
            if (stats.downloadLogs && stats.downloadLogs.length > 0) {
                logsHtml = '<div class="download-logs">';
                stats.downloadLogs.forEach(log => {
                    const logDate = new Date(log.downloadedAt).toLocaleString('fr-FR');
                    logsHtml += `
                        <div class="download-log-item">
                            <span>📥 ${logDate}</span>
                            <span style="font-size: 0.9em; color: #666;">
                                ${log.ipAddress || 'IP inconnue'}
                            </span>
                        </div>
                    `;
                });
                logsHtml += '</div>';
            }
            
            showMessage(`
                <div style="text-align: left;">
                    <h3 style="margin-top: 0;">📊 Statistiques du lien</h3>
                    <p><strong>Fichier:</strong> ${link.original_name}</p>
                    <p><strong>Total téléchargements:</strong> ${stats.totalDownloads}</p>
                    <p><strong>Premier téléchargement:</strong> ${firstDownload}</p>
                    <p><strong>Dernier téléchargement:</strong> ${lastDownload}</p>
                    <h4>Historique des téléchargements:</h4>
                    ${logsHtml}
                </div>
            `, 'info');
        }
    } catch (error) {
        showMessage('Erreur lors de la récupération des statistiques', 'error');
    }
}

// Désactiver un lien
async function deactivateLink(linkId) {
    if (!confirm('Êtes-vous sûr de vouloir désactiver ce lien de partage ?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/share/${linkId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('Lien désactivé avec succès', 'success');
            showHistory(); // Rafraîchir l'historique
        } else {
            showMessage(`Erreur: ${data.error}`, 'error');
        }
    } catch (error) {
        showMessage(`Erreur: ${error.message}`, 'error');
    }
}

// Fermer l'historique
function closeHistory() {
    historyModal.style.display = 'none';
}
