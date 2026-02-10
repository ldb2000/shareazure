#!/usr/bin/env node

/**
 * Script de test automatique pour la connexion admin
 * Usage: node test-admin-login.js
 */

const http = require('http');
const https = require('https');

console.log('🧪 Test de connexion admin ShareAzure\n');

// Configuration
const BACKEND_URL = 'http://localhost:3000';
const FRONTEND_URL = 'http://localhost:8080';

// Test 1: Backend Health
async function testBackendHealth() {
    console.log('1️⃣  Test backend health...');
    return new Promise((resolve, reject) => {
        http.get(`${BACKEND_URL}/api/health`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log('   ✅ Backend OK:', data);
                    resolve(true);
                } else {
                    console.log('   ❌ Backend Error:', res.statusCode);
                    resolve(false);
                }
            });
        }).on('error', (err) => {
            console.log('   ❌ Backend non accessible:', err.message);
            resolve(false);
        });
    });
}

// Test 2: Frontend accessible
async function testFrontendAccessible() {
    console.log('\n2️⃣  Test frontend accessible...');
    return new Promise((resolve, reject) => {
        http.get(`${FRONTEND_URL}/login.html`, (res) => {
            if (res.statusCode === 200) {
                console.log('   ✅ Frontend OK (login.html accessible)');
                resolve(true);
            } else {
                console.log('   ❌ Frontend Error:', res.statusCode);
                resolve(false);
            }
        }).on('error', (err) => {
            console.log('   ❌ Frontend non accessible:', err.message);
            resolve(false);
        });
    });
}

// Test 3: Admin login
async function testAdminLogin() {
    console.log('\n3️⃣  Test connexion admin...');
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            username: 'admin',
            password: 'admin123'
        });

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/admin/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (res.statusCode === 200 && response.success) {
                        console.log('   ✅ Login OK');
                        console.log('   📝 Token:', response.token);
                        console.log('   👤 User:', JSON.stringify(response.user, null, 2));
                        resolve({ success: true, token: response.token });
                    } else {
                        console.log('   ❌ Login Error:', data);
                        resolve({ success: false, error: data });
                    }
                } catch (err) {
                    console.log('   ❌ Parse Error:', err.message);
                    console.log('   📄 Raw response:', data);
                    resolve({ success: false, error: err.message });
                }
            });
        });

        req.on('error', (err) => {
            console.log('   ❌ Request Error:', err.message);
            resolve({ success: false, error: err.message });
        });

        req.write(postData);
        req.end();
    });
}

// Test 4: Verify token
async function testVerifyToken(token) {
    console.log('\n4️⃣  Test vérification token...');
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/admin/verify',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.success) {
                        console.log('   ✅ Token valide');
                        resolve(true);
                    } else {
                        console.log('   ❌ Token invalide');
                        resolve(false);
                    }
                } catch (err) {
                    console.log('   ❌ Parse Error:', err.message);
                    resolve(false);
                }
            });
        });

        req.on('error', (err) => {
            console.log('   ❌ Request Error:', err.message);
            resolve(false);
        });

        req.end();
    });
}

// Test 5: Admin page
async function testAdminPage() {
    console.log('\n5️⃣  Test page admin...');
    return new Promise((resolve, reject) => {
        http.get(`${FRONTEND_URL}/admin/`, (res) => {
            if (res.statusCode === 200) {
                console.log('   ✅ Page admin accessible');
                resolve(true);
            } else {
                console.log('   ❌ Page admin Error:', res.statusCode);
                resolve(false);
            }
        }).on('error', (err) => {
            console.log('   ❌ Page admin non accessible:', err.message);
            resolve(false);
        });
    });
}

// Run all tests
async function runTests() {
    console.log('=' .repeat(60));

    const backendOk = await testBackendHealth();
    const frontendOk = await testFrontendAccessible();

    if (!backendOk || !frontendOk) {
        console.log('\n❌ Tests échoués: Backend ou Frontend non accessible');
        console.log('\n💡 Vérifiez que les serveurs sont démarrés:');
        console.log('   cd /Users/laurent.deberti/Documents/Dev/shareazure');
        console.log('   ./start.sh');
        process.exit(1);
    }

    const loginResult = await testAdminLogin();

    if (!loginResult.success) {
        console.log('\n❌ Login échoué');
        if (loginResult.error && loginResult.error.includes('Too many requests')) {
            console.log('\n⏰ Rate limiting actif - attendez 15 minutes ou redémarrez le backend');
        }
        process.exit(1);
    }

    await testVerifyToken(loginResult.token);
    await testAdminPage();

    console.log('\n' + '='.repeat(60));
    console.log('✅ TOUS LES TESTS PASSÉS !');
    console.log('\n📍 Vous pouvez maintenant vous connecter:');
    console.log('   1. Ouvrez: http://localhost:8080/login.html');
    console.log('   2. Username: admin');
    console.log('   3. Password: admin123');
    console.log('   4. Vous serez redirigé vers: http://localhost:8080/admin/');
    console.log('\n💡 Si la redirection ne marche pas, utilisez le script dans la console (voir README)');
    console.log('=' .repeat(60));
}

// Run
runTests().catch(err => {
    console.error('❌ Erreur fatale:', err);
    process.exit(1);
});
