// Configuration
const API_URL = 'http://localhost:3000/api';

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    initializeLogin();
});

function checkAuthStatus() {
    const token = localStorage.getItem('userToken') || sessionStorage.getItem('userToken');
    if (token) {
        verifyToken(token).then(valid => {
            if (valid) {
                window.location.href = 'user.html';
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
        // Essayer d'abord la connexion admin
        let response = await fetch(`${API_URL}/admin/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        let data = await response.json();
        let isAdmin = false;

        // Si échec admin, essayer connexion utilisateur
        if (!data.success) {
            response = await fetch(`${API_URL}/user/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            data = await response.json();
        } else {
            isAdmin = true;
        }

        if (data.success && data.token) {
            // Stocker le token
            const storage = rememberMe ? localStorage : sessionStorage;

            if (isAdmin) {
                storage.setItem('adminToken', data.token);
                storage.setItem('adminUsername', username);
                // Rediriger vers l'interface admin (à la racine)
                window.location.href = '/admin/';
            } else {
                storage.setItem('userToken', data.token);
                storage.setItem('userData', JSON.stringify(data.user));
                // Rediriger vers l'interface utilisateur
                window.location.href = 'user.html';
            }
        } else {
            // Afficher l'erreur
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
        return data.success === true;
    } catch (error) {
        console.error('Erreur vérification token:', error);
        return false;
    }
}


