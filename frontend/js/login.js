// Configuration - API relative au domaine actuel
const API_URL = window.location.origin + '/api';

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    // Check for token from Entra callback
    const params = new URLSearchParams(window.location.search);
    const callbackToken = params.get('token');
    const callbackError = params.get('error');

    if (callbackToken) {
        // Store token from Entra SSO callback
        localStorage.setItem('authToken', callbackToken);
        localStorage.setItem('userToken', callbackToken);
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
        // Verify and redirect
        verifyToken(callbackToken).then(data => {
            if (data) {
                localStorage.setItem('userData', JSON.stringify(data.user));
                if (data.user.role === 'admin') {
                    localStorage.setItem('adminToken', callbackToken);
                    localStorage.setItem('adminUsername', data.user.username);
                }
                redirectUser(data.user);
            } else {
                showLoginError('Token invalide. Veuillez réessayer.');
            }
        }).catch(() => showLoginError('Erreur de vérification du token.'));
        return;
    }

    if (callbackError) {
        window.history.replaceState({}, '', window.location.pathname);
        const errorMessages = {
            'invalid_state': 'Session expirée. Veuillez réessayer.',
            'token_exchange_failed': 'Échec d\'échange de token Microsoft.',
            'no_email': 'Aucun email trouvé dans votre compte Microsoft.',
            'user_creation_failed': 'Impossible de créer votre compte.',
            'server_error': 'Erreur serveur.',
            'callback_error': 'Erreur lors du retour Microsoft.'
        };
        showLoginError(errorMessages[callbackError] || `Erreur: ${callbackError}`);
    }

    checkAuthStatus();
    initializeLogin();
    loadAuthMode();
});

function showLoginError(msg) {
    const errorDiv = document.getElementById('loginError');
    const errorMessage = document.getElementById('loginErrorMessage');
    if (errorDiv && errorMessage) {
        errorMessage.textContent = msg;
        errorDiv.style.display = 'flex';
    }
}

async function loadAuthMode() {
    try {
        const response = await fetch(`${API_URL}/settings/auth`);
        const data = await response.json();
        if (!data.success) return;

        const mode = data.auth.authMode;
        const entraSection = document.getElementById('entraLoginSection');
        const loginForm = document.getElementById('loginForm');
        const divider = document.getElementById('entraDivider');
        const entraBtn = document.getElementById('entraLoginBtn');

        if (mode === 'entra' || mode === 'hybrid') {
            entraSection.style.display = 'block';
            entraBtn.addEventListener('click', () => {
                window.location.href = `${API_URL}/auth/entra/login`;
            });
        }

        if (mode === 'entra') {
            // Entra only: hide local form
            loginForm.style.display = 'none';
            divider.style.display = 'none';
        }
    } catch (e) {
        console.error('Error loading auth mode:', e);
    }
}

function checkAuthStatus() {
    // Vérifier authToken (unifié) puis fallback sur les anciens tokens
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken') ||
                  localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken') ||
                  localStorage.getItem('userToken') || sessionStorage.getItem('userToken');
    if (token) {
        verifyToken(token).then(data => {
            if (data) {
                redirectUser(data.user);
            }
        }).catch(() => {
            // Token invalide, rester sur la page de login
        });
    }
}

function initializeLogin() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleLogin();
        });
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
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (data.success && data.requires2FA) {
            // Show OTP form
            window._pendingToken = data.pendingToken;
            window._rememberMe = rememberMe;
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('otpForm').style.display = 'block';
            document.getElementById('otpCode').focus();
            // Init OTP form handler
            if (!window._otpInit) {
                window._otpInit = true;
                document.getElementById('otpForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await handleOTP();
                });
            }
            return;
        }

        if (data.success && data.token) {
            const storage = rememberMe ? localStorage : sessionStorage;

            // Stocker le token unifié
            storage.setItem('authToken', data.token);
            storage.setItem('userData', JSON.stringify(data.user));

            // Fallback pour compatibilité avec les anciennes interfaces
            if (data.user.role === 'admin') {
                storage.setItem('adminToken', data.token);
                storage.setItem('adminUsername', data.user.username);
            }
            storage.setItem('userToken', data.token);

            // Rediriger selon la réponse du serveur
            if (data.redirect === '/admin/') {
                window.location.href = '/admin/';
            } else {
                window.location.href = data.redirect;
            }
        } else {
            errorMessage.textContent = data.error || 'Identifiants incorrects';
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

function redirectUser(user) {
    if (user.role === 'admin') {
        window.location.href = '/admin/';
    } else if (user.isTeamLeader) {
        window.location.href = 'team.html';
    } else {
        window.location.href = 'user.html';
    }
}

async function verifyToken(token) {
    try {
        const response = await fetch(`${API_URL}/user/verify`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (data.success) {
            return data;
        }
        return null;
    } catch (error) {
        console.error('Erreur vérification token:', error);
        return null;
    }
}

async function handleOTP() {
    const code = document.getElementById('otpCode').value.trim();
    const errDiv = document.getElementById('otpError');
    const errMsg = document.getElementById('otpErrorMessage');
    errDiv.style.display = 'none';
    
    try {
        const res = await fetch(`${API_URL}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pendingToken: window._pendingToken, code })
        });
        const data = await res.json();
        
        if (data.success && data.token) {
            const storage = window._rememberMe ? localStorage : sessionStorage;
            storage.setItem('authToken', data.token);
            storage.setItem('userData', JSON.stringify(data.user));
            if (data.user.role === 'admin') {
                storage.setItem('adminToken', data.token);
                storage.setItem('adminUsername', data.user.username);
            }
            storage.setItem('userToken', data.token);
            window.location.href = data.redirect === '/admin/' ? '/admin/' : data.redirect;
        } else {
            errMsg.textContent = data.error || 'Code invalide';
            errDiv.style.display = 'flex';
            document.getElementById('otpCode').value = '';
            document.getElementById('otpCode').focus();
        }
    } catch (e) {
        errMsg.textContent = 'Erreur de connexion';
        errDiv.style.display = 'flex';
    }
}

function backToLogin() {
    document.getElementById('otpForm').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('otpCode').value = '';
}
