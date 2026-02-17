// Guest Login Script
const API_URL = window.location.origin + '/api';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check if already logged in
    const token = localStorage.getItem('guestToken') || sessionStorage.getItem('guestToken');
    if (token) {
        window.location.href = 'guest-upload.html';
        return;
    }

    initializeLoginForm();
});

// Initialize login form
function initializeLoginForm() {
    const form = document.getElementById('guestLoginForm');
    const loginBtn = document.getElementById('loginBtn');
    const emailInput = document.getElementById('guestEmail');
    const codeInput = document.getElementById('verificationCode');

    // Auto-format code input (only numbers)
    codeInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
    });

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = emailInput.value.trim();
        const code = codeInput.value.trim();

        // Validation
        if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            showError('Email invalide');
            return;
        }

        if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
            showError('Code de vérification invalide (6 chiffres requis)');
            return;
        }

        await login(email, code, loginBtn);
    });
}

// Login function
async function login(email, code, btn) {
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="loading"></div> Connexion...';
    hideError();

    try {
        const response = await fetch(`${API_URL}/guest/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, code })
        });

        const data = await response.json();

        if (data.success && data.token) {
            // Store token and guest info
            localStorage.setItem('guestToken', data.token);
            localStorage.setItem('guestInfo', JSON.stringify(data.guest));

            // Success message
            showSuccess('Connexion réussie ! Redirection...');

            // Redirect after short delay
            setTimeout(() => {
                window.location.href = 'guest-upload.html';
            }, 1000);
        } else {
            showError(data.error || 'Identifiants invalides');
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('Erreur de connexion au serveur. Veuillez réessayer.');
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Show error message
function showError(message) {
    const errorEl = document.getElementById('loginError');
    const messageEl = document.getElementById('loginErrorMessage');

    messageEl.textContent = message;
    errorEl.style.display = 'flex';

    // Auto-hide after 5 seconds
    setTimeout(() => {
        hideError();
    }, 5000);
}

// Hide error message
function hideError() {
    const errorEl = document.getElementById('loginError');
    errorEl.style.display = 'none';
}

// Show success message
function showSuccess(message) {
    const errorEl = document.getElementById('loginError');
    const messageEl = document.getElementById('loginErrorMessage');

    errorEl.style.background = '#f0fdf4';
    errorEl.style.border = '1px solid #86efac';
    errorEl.style.color = '#10b981';

    // Change icon color
    const svg = errorEl.querySelector('svg');
    if (svg) {
        svg.style.color = '#10b981';
    }

    messageEl.textContent = message;
    errorEl.style.display = 'flex';
}
