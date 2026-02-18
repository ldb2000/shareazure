const nodemailer = require('nodemailer');
const https = require('https');

let transporter = null;
let lastConfig = null;

function getConfig() {
  try {
    const { settingsDb } = require('./database');
    return {
      provider: settingsDb.get('emailProvider') || 'smtp',
      host: settingsDb.get('smtpHost') || process.env.SMTP_HOST || 'smtp.mail.yahoo.com',
      port: parseInt(settingsDb.get('smtpPort') || process.env.SMTP_PORT || '465'),
      secure: (settingsDb.get('smtpSecure') || process.env.SMTP_SECURE || 'true') === 'true',
      user: settingsDb.get('smtpUser') || process.env.SMTP_USER || '',
      password: settingsDb.get('smtpPassword') || process.env.SMTP_PASSWORD || '',
      fromEmail: settingsDb.get('smtpFromEmail') || process.env.SMTP_FROM_EMAIL || '',
      fromName: settingsDb.get('smtpFromName') || process.env.APP_NAME || 'ShareAzure',
      enabled: (settingsDb.get('emailEnabled') || 'false') === 'true',
      mailjetApiKey: settingsDb.get('mailjetApiKey') || '',
      mailjetSecretKey: settingsDb.get('mailjetSecretKey') || ''
    };
  } catch(e) {
    return {
      provider: 'smtp',
      host: process.env.SMTP_HOST || 'smtp.mail.yahoo.com',
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      password: process.env.SMTP_PASSWORD || '',
      fromEmail: process.env.SMTP_FROM_EMAIL || '',
      fromName: process.env.APP_NAME || 'ShareAzure',
      enabled: false,
      mailjetApiKey: '',
      mailjetSecretKey: ''
    };
  }
}

function getTransporter() {
  const config = getConfig();
  const configKey = `${config.host}:${config.port}:${config.user}`;
  
  if (!config.user || !config.password) return null;
  if (transporter && lastConfig === configKey) return transporter;
  
  try {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password }
    });
    lastConfig = configKey;
    return transporter;
  } catch(e) {
    console.error('Email transport error:', e.message);
    return null;
  }
}

function isEnabled() {
  const config = getConfig();
  return config.enabled && !!config.user && !!config.password;
}

function reload() {
  transporter = null;
  lastConfig = null;
}

function sendMailjet(to, subject, html, text) {
  const config = getConfig();
  const auth = Buffer.from(`${config.mailjetApiKey}:${config.mailjetSecretKey}`).toString('base64');
  const payload = JSON.stringify({
    Messages: [{
      From: { Email: config.fromEmail || config.user, Name: config.fromName },
      To: [{ Email: to }],
      Subject: subject,
      HTMLPart: html || undefined,
      TextPart: text || undefined
    }]
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.mailjet.com',
      path: '/v3.1/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const msgId = data.Messages && data.Messages[0] && data.Messages[0].To && data.Messages[0].To[0] && data.Messages[0].To[0].MessageID;
            console.log(`✅ Email Mailjet envoyé à ${to}`);
            resolve({ success: true, messageId: msgId || 'ok' });
          } else {
            const errMsg = data.ErrorMessage || data.Message || JSON.stringify(data);
            console.error(`❌ Mailjet échoué vers ${to}:`, errMsg);
            resolve({ success: false, error: errMsg });
          }
        } catch (e) {
          resolve({ success: false, error: `Réponse Mailjet invalide (HTTP ${res.statusCode})` });
        }
      });
    });
    req.on('error', (e) => resolve({ success: false, error: e.message }));
    req.write(payload);
    req.end();
  });
}

async function sendMail(to, subject, html, text) {
  if (!isEnabled()) return { success: false, error: 'Email non configuré' };
  
  const config = getConfig();
  
  // Mailjet API path
  if (config.provider === 'mailjet') {
    if (!config.mailjetApiKey || !config.mailjetSecretKey) {
      return { success: false, error: 'Clés API Mailjet non configurées' };
    }
    return sendMailjet(to, subject, html, text);
  }
  
  // SMTP path (generic, ovh, gmail, yahoo, outlook)
  const t = getTransporter();
  if (!t) return { success: false, error: 'Transporteur SMTP non initialisé' };
  
  try {
    const info = await t.sendMail({
      from: `"${config.fromName}" <${config.fromEmail || config.user}>`,
      to,
      subject,
      html,
      text
    });
    console.log(`✅ Email envoyé à ${to} (${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch(e) {
    console.error(`❌ Email échoué vers ${to}:`, e.message);
    return { success: false, error: e.message };
  }
}

async function testConnection() {
  const config = getConfig();
  
  if (config.provider === 'mailjet') {
    if (!config.mailjetApiKey || !config.mailjetSecretKey) {
      return { success: false, error: 'Clés API Mailjet non configurées' };
    }
    // Test Mailjet by calling their API
    return new Promise((resolve) => {
      const auth = Buffer.from(`${config.mailjetApiKey}:${config.mailjetSecretKey}`).toString('base64');
      const req = https.request({
        hostname: 'api.mailjet.com',
        path: '/v3/REST/apikey',
        method: 'GET',
        headers: { 'Authorization': `Basic ${auth}` }
      }, (res) => {
        let body = '';
        res.on('data', (d) => body += d);
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({ success: true, message: 'Connexion Mailjet API réussie' });
          } else {
            resolve({ success: false, error: `Mailjet API erreur HTTP ${res.statusCode}` });
          }
        });
      });
      req.on('error', (e) => resolve({ success: false, error: e.message }));
      req.end();
    });
  }
  
  const t = getTransporter();
  if (!t) return { success: false, error: 'SMTP non configuré' };
  try {
    await t.verify();
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ============================================
// EMAIL TEMPLATES
// ============================================

async function sendShareNotification(to, { senderName, fileName, shareUrl, password, expiresAt, message }) {
  const config = getConfig();
  const appName = config.fromName;
  const expiresDate = new Date(expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  
  const html = `
  <!DOCTYPE html>
  <html><head><meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background: #f9f9f9; border-radius: 8px; padding: 30px; border: 1px solid #e0e0e0; }
    .header { background: #003C61; color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px; }
    .file-box { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin: 20px 0; display: flex; align-items: center; gap: 15px; }
    .file-icon { font-size: 2rem; }
    .btn { display: inline-block; background: #003C61; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; }
    .password-box { background: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 15px 0; border-radius: 4px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #666; text-align: center; }
  </style></head>
  <body><div class="container">
    <div class="header">
      <h1 style="margin:0;">📎 ${appName}</h1>
      <p style="margin:5px 0 0;opacity:0.8;">Partage de fichier sécurisé</p>
    </div>
    <p><strong>${senderName || 'Un utilisateur'}</strong> vous a partagé un fichier :</p>
    <div class="file-box">
      <div class="file-icon">📄</div>
      <div>
        <div style="font-weight:600;">${fileName}</div>
        <div style="color:#666;font-size:0.85rem;">Expire le ${expiresDate}</div>
      </div>
    </div>
    ${message ? `<p style="background:#e3f2fd;padding:12px;border-radius:6px;"><em>"${message}"</em></p>` : ''}
    <div class="password-box">
      <strong>🔒 Mot de passe requis</strong><br>
      ${password ? `Mot de passe : <strong style="font-size:1.1em;letter-spacing:1px;">${password}</strong>` : `Le mot de passe vous sera communiqué séparément par l'expéditeur.`}
    </div>
    <p style="text-align:center;margin:25px 0;"><a href="${shareUrl}" class="btn">Accéder au fichier</a></p>
    <div class="footer">
      <p>Ce lien expire le ${expiresDate}</p>
      <p>${appName} — Partage sécurisé</p>
    </div>
  </div></body></html>`;
  
  const text = `${senderName || 'Un utilisateur'} vous a partagé "${fileName}"\nLien: ${shareUrl}\n${password ? `Mot de passe: ${password}` : 'Mot de passe requis (communiqué séparément)'}\nExpire le: ${expiresDate}`;
  
  return sendMail(to, `📎 ${senderName || 'Quelqu\'un'} vous a partagé "${fileName}" — ${appName}`, html, text);
}

async function sendUploadRequestNotification(to, { requesterName, title, description, uploadUrl, expiresAt }) {
  const config = getConfig();
  const appName = config.fromName;
  const expiresDate = new Date(expiresAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  
  const html = `
  <!DOCTYPE html>
  <html><head><meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background: #f9f9f9; border-radius: 8px; padding: 30px; border: 1px solid #e0e0e0; }
    .header { background: #003C61; color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px; }
    .btn { display: inline-block; background: #003C61; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; }
    .info-box { background: #e3f2fd; border-left: 4px solid #1565c0; padding: 15px; margin: 15px 0; border-radius: 4px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #666; text-align: center; }
  </style></head>
  <body><div class="container">
    <div class="header">
      <h1 style="margin:0;">📤 ${appName}</h1>
      <p style="margin:5px 0 0;opacity:0.8;">Demande de dépôt de fichiers</p>
    </div>
    <p><strong>${requesterName || 'Un utilisateur'}</strong> vous demande de déposer des fichiers :</p>
    <div class="info-box">
      <strong>${title}</strong>
      ${description ? `<p style="margin:8px 0 0;">${description}</p>` : ''}
    </div>
    <p style="text-align:center;margin:25px 0;"><a href="${uploadUrl}" class="btn">Déposer mes fichiers</a></p>
    <p style="color:#666;font-size:0.85rem;text-align:center;">Ce lien expire le ${expiresDate}</p>
    <div class="footer"><p>${appName} — Partage sécurisé</p></div>
  </div></body></html>`;
  
  const text = `${requesterName} vous demande de déposer des fichiers: ${title}\nLien: ${uploadUrl}\nExpire le: ${expiresDate}`;
  
  return sendMail(to, `📤 ${requesterName || 'Quelqu\'un'} vous demande des fichiers — ${appName}`, html, text);
}

async function sendUploadConfirmation(to, { uploaderEmail, fileName, requestTitle, uploaderName }) {
  const config = getConfig();
  const appName = config.fromName;
  
  const html = `
  <!DOCTYPE html>
  <html><head><meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background: #f9f9f9; border-radius: 8px; padding: 30px; border: 1px solid #e0e0e0; }
    .header { background: #2e7d32; color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #666; text-align: center; }
  </style></head>
  <body><div class="container">
    <div class="header"><h1 style="margin:0;">✅ Nouveau fichier reçu</h1></div>
    <p>Un fichier a été déposé dans votre demande <strong>"${requestTitle}"</strong> :</p>
    <ul>
      <li><strong>Fichier :</strong> ${fileName}</li>
      <li><strong>Déposé par :</strong> ${uploaderEmail}</li>
      <li><strong>Date :</strong> ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</li>
    </ul>
    <div class="footer"><p>${appName} — Partage sécurisé</p></div>
  </div></body></html>`;
  
  return sendMail(to, `✅ Fichier reçu : ${fileName} — ${appName}`, html, `Fichier reçu: ${fileName} de ${uploaderEmail} pour "${requestTitle}"`);
}

async function sendGuestCode(email, code, expiresInHours = 24, baseUrl = '') {
  const config = getConfig();
  const appName = config.fromName;
  const guestLoginUrl = baseUrl ? `${baseUrl}/guest-login.html` : '';
  
  return sendMail(email, `Votre code d'accès temporaire — ${appName}`,
    generateGuestCodeHtml(email, code, expiresInHours, appName, guestLoginUrl),
    `Code: ${code} - Valide ${expiresInHours}h${guestLoginUrl ? ' - Lien: ' + guestLoginUrl : ''}`
  );
}

function generateGuestCodeHtml(email, code, expiresInHours, appName, guestLoginUrl) {
  const btnHtml = guestLoginUrl ? `
    <div style="text-align:center;margin:24px 0;">
      <a href="${guestLoginUrl}" style="display:inline-block;background:#003C61;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:1.1rem;">
        Accéder à l'espace invité
      </a>
    </div>` : '';
  
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background: #f9f9f9; border-radius: 8px; padding: 30px; border: 1px solid #e0e0e0; }
    .header { background: #003C61; color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px; }
    .code-box { background: #fff; border: 2px dashed #4CAF50; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
    .code { font-size: 36px; font-weight: bold; color: #4CAF50; letter-spacing: 8px; font-family: monospace; }
    .info { background-color: #e3f2fd; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .warning { background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #666; text-align: center; }
  </style></head>
  <body><div class="container">
    <div class="header"><h1 style="margin:0;">🎉 ${appName}</h1><p style="margin:5px 0 0;opacity:0.8;">Accès invité</p></div>
    <p>Vous avez été invité(e) à déposer des fichiers sur <strong>${appName}</strong>.</p>
    <div class="code-box">
      <p style="margin:0 0 10px;color:#666;">Votre code de vérification :</p>
      <div class="code">${code}</div>
      <p style="margin:10px 0 0;color:#666;">Valide ${expiresInHours}h</p>
    </div>
    ${btnHtml}
    <div class="info">
      <strong>📋 Comment accéder :</strong>
      <ol>
        <li>Cliquez sur le bouton ci-dessus${guestLoginUrl ? '' : ' ou rendez-vous sur la page de connexion invité'}</li>
        <li>Entrez votre adresse email : <strong>${email}</strong></li>
        <li>Saisissez le code ci-dessus</li>
        <li>Déposez vos fichiers !</li>
      </ol>
    </div>
    <div class="warning">
      <strong>⚠️ Informations importantes :</strong>
      <ul>
        <li>Ce code expire dans <strong>${expiresInHours} heures</strong></li>
        <li>Votre compte invité sera actif pendant <strong>3 jours</strong></li>
        <li>Vous pourrez déposer et télécharger des fichiers</li>
      </ul>
    </div>
    <div class="footer"><p>${appName} — Partage sécurisé</p></div>
  </div></body></html>`;
}

async function sendAccountExpiringSoon(email, daysRemaining) {
  const config = getConfig();
  const appName = config.fromName;
  return sendMail(email, `⏰ Compte invité expire dans ${daysRemaining}j — ${appName}`,
    `<div style="font-family:sans-serif;padding:20px;">
      <h1 style="color:#ff9800;">⏰ Expiration Imminente</h1>
      <p>Votre compte invité expire dans <strong>${daysRemaining} jour${daysRemaining > 1 ? 's' : ''}</strong>.</p>
      <p>Téléchargez vos fichiers importants avant l'expiration.</p>
      <p style="color:#666;font-size:0.85rem;">${appName} — Partage sécurisé</p>
    </div>`,
    `Votre compte expire dans ${daysRemaining} jour(s).`
  );
}

module.exports = {
  sendMail,
  sendShareNotification,
  sendUploadRequestNotification,
  sendUploadConfirmation,
  sendGuestCode,
  sendAccountExpiringSoon,
  testConnection,
  isEnabled,
  reload,
  getConfig
};
