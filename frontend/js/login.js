// Configuration
const API_URL = 'http://localhost:3000/api';

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    initializeLogin();
});

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
