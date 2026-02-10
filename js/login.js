// Configuration
const API_URL = 'http://localhost:3000/api';

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    initializeLogin();
});

function checkAuthStatus() {
    // Vérifier si admin est connecté
    const adminToken = localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken');
    if (adminToken) {
        verifyAdminToken(adminToken).then(valid => {
            if (valid) {
                window.location.href = 'admin/index.html';
                return;
            }
        });
    }

    // Vérifier si user est connecté
    const userToken = localStorage.getItem('userToken') || sessionStorage.getItem('userToken');
    if (userToken) {
        verifyUserToken(userToken).then(valid => {
            if (valid) {
                window.location.href = 'frontend/user.html';
                return;
            }
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
        // Essayer d'abord avec admin
        let response = await fetch(`${API_URL}/admin/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        let data = await response.json();

        if (data.success && data.token && data.user && data.user.role === 'admin') {
            // Admin connecté
            if (rememberMe) {
                localStorage.setItem('adminToken', data.token);
                localStorage.setItem('adminUser', JSON.stringify(data.user));
            } else {
                sessionStorage.setItem('adminToken', data.token);
                sessionStorage.setItem('adminUser', JSON.stringify(data.user));
            }
            window.location.href = 'admin/index.html';
            return;
        }

        // Essayer avec user
        response = await fetch(`${API_URL}/user/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        data = await response.json();

        if (data.success && data.token && data.user && data.user.role === 'user') {
            // User connecté
            if (rememberMe) {
                localStorage.setItem('userToken', data.token);
                localStorage.setItem('userData', JSON.stringify(data.user));
            } else {
                sessionStorage.setItem('userToken', data.token);
                sessionStorage.setItem('userData', JSON.stringify(data.user));
            }
            window.location.href = 'frontend/user.html';
            return;
        }

        // Aucun compte trouvé
        errorMessage.textContent = data.error || 'Identifiants invalides';
        errorDiv.style.display = 'flex';
        loginForm.querySelector('input[type="password"]').value = '';

    } catch (error) {
        console.error('Erreur login:', error);
        errorMessage.textContent = 'Erreur de connexion au serveur';
        errorDiv.style.display = 'flex';
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

async function verifyAdminToken(token) {
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
        console.error('Erreur vérification token admin:', error);
        return false;
    }
}

async function verifyUserToken(token) {
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
        console.error('Erreur vérification token user:', error);
        return false;
    }
}


