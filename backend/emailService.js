const nodemailer = require('nodemailer');

// Configuration du transporteur email
let transporter = null;

function initializeTransporter() {
  const config = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true pour 465, false pour autres ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  };

  // Vérifier si les credentials SMTP sont configurés
  if (!config.auth.user || !config.auth.pass) {
    console.warn('⚠️  Configuration SMTP manquante. Les emails ne seront pas envoyés.');
    return null;
  }

  try {
    transporter = nodemailer.createTransport(config);
    console.log('✅ Service email initialisé');
    return transporter;
  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation du service email:', error.message);
    return null;
  }
}

// Initialiser au chargement du module
initializeTransporter();

/**
 * Envoie un code de vérification à un invité
 * @param {string} email - Email du destinataire
 * @param {string} code - Code de vérification à 6 chiffres
 * @param {number} expiresInHours - Durée de validité du code en heures
 * @returns {Promise<boolean>} - true si l'email a été envoyé, false sinon
 */
async function sendGuestCode(email, code, expiresInHours = 24) {
  if (!transporter) {
    console.error('Service email non configuré. Email non envoyé à:', email);
    return false;
  }

  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
  const appName = process.env.APP_NAME || 'ShareAzure';

  const mailOptions = {
    from: `"${appName}" <${fromEmail}>`,
    to: email,
    subject: `Votre code d'accès temporaire - ${appName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background-color: #f9f9f9;
            border-radius: 8px;
            padding: 30px;
            border: 1px solid #e0e0e0;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .code-box {
            background-color: #fff;
            border: 2px dashed #4CAF50;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 30px 0;
          }
          .code {
            font-size: 36px;
            font-weight: bold;
            color: #4CAF50;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
          }
          .info {
            background-color: #e3f2fd;
            border-left: 4px solid #2196F3;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .warning {
            background-color: #fff3e0;
            border-left: 4px solid #ff9800;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            font-size: 12px;
            color: #666;
            text-align: center;
          }
          ul {
            margin: 10px 0;
            padding-left: 20px;
          }
          li {
            margin: 5px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Bienvenue sur ${appName}</h1>
            <p>Un utilisateur APRIL vous a créé un compte invité temporaire</p>
          </div>

          <div class="code-box">
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">Votre code de vérification :</p>
            <div class="code">${code}</div>
            <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">Valide pendant ${expiresInHours}h</p>
          </div>

          <div class="info">
            <strong>📋 Comment utiliser ce code :</strong>
            <ol>
              <li>Rendez-vous sur la page de connexion invité</li>
              <li>Entrez votre adresse email : <strong>${email}</strong></li>
              <li>Saisissez le code ci-dessus</li>
              <li>Commencez à déposer vos fichiers !</li>
            </ol>
          </div>

          <div class="warning">
            <strong>⚠️ Informations importantes :</strong>
            <ul>
              <li>Ce code est à <strong>usage unique</strong></li>
              <li>Il expire dans <strong>${expiresInHours} heures</strong></li>
              <li>Votre compte invité sera actif pendant <strong>3 jours</strong></li>
              <li>Vous pourrez <strong>uniquement déposer des fichiers</strong> (pas de partage ni suppression)</li>
              <li>À l'expiration, votre compte et tous vos fichiers seront automatiquement supprimés</li>
            </ul>
          </div>

          <p style="text-align: center; margin-top: 30px;">
            <strong>Besoin d'aide ?</strong><br>
            Contactez l'utilisateur APRIL qui vous a invité
          </p>

          <div class="footer">
            <p>Cet email a été envoyé automatiquement. Ne pas répondre.</p>
            <p>${appName} - Partage de fichiers sécurisé</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Bienvenue sur ${appName}

Votre code de vérification : ${code}
Valide pendant ${expiresInHours}h

Comment utiliser ce code :
1. Rendez-vous sur la page de connexion invité
2. Entrez votre email : ${email}
3. Saisissez le code ci-dessus
4. Commencez à déposer vos fichiers !

Informations importantes :
- Ce code est à usage unique
- Il expire dans ${expiresInHours} heures
- Votre compte invité sera actif pendant 3 jours
- Vous pourrez uniquement déposer des fichiers
- À l'expiration, votre compte et vos fichiers seront supprimés

Besoin d'aide ? Contactez l'utilisateur APRIL qui vous a invité.
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email envoyé avec succès à:', email);
    console.log('   Message ID:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi de l\'email à', email, ':', error.message);
    return false;
  }
}

/**
 * Envoie une notification d'expiration imminente du compte
 * @param {string} email - Email du destinataire
 * @param {number} daysRemaining - Nombre de jours restants avant expiration
 * @returns {Promise<boolean>} - true si l'email a été envoyé, false sinon
 */
async function sendAccountExpiringSoon(email, daysRemaining) {
  if (!transporter) {
    console.error('Service email non configuré. Email non envoyé à:', email);
    return false;
  }

  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
  const appName = process.env.APP_NAME || 'ShareAzure';

  const mailOptions = {
    from: `"${appName}" <${fromEmail}>`,
    to: email,
    subject: `⏰ Votre compte invité expire bientôt - ${appName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background-color: #f9f9f9;
            border-radius: 8px;
            padding: 30px;
            border: 1px solid #e0e0e0;
          }
          .warning-header {
            background-color: #ff9800;
            color: white;
            text-align: center;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
          }
          .warning-box {
            background-color: #fff3e0;
            border: 2px solid #ff9800;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            font-size: 12px;
            color: #666;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="warning-header">
            <h1 style="margin: 0;">⏰ Expiration Imminente</h1>
          </div>

          <p>Bonjour,</p>

          <div class="warning-box">
            <h2 style="margin-top: 0; color: #f57c00;">Votre compte invité expire dans ${daysRemaining} jour${daysRemaining > 1 ? 's' : ''}</h2>
            <p>Votre compte invité temporaire sur <strong>${appName}</strong> va bientôt expirer.</p>
          </div>

          <p><strong>Ce qui va se passer :</strong></p>
          <ul>
            <li>Votre compte sera désactivé automatiquement</li>
            <li>Tous vos fichiers uploadés seront <strong>supprimés définitivement</strong></li>
            <li>Vous ne pourrez plus accéder au service</li>
          </ul>

          <p><strong>Actions recommandées :</strong></p>
          <ul>
            <li>Téléchargez tous les fichiers importants</li>
            <li>Assurez-vous que les destinataires ont bien reçu vos fichiers</li>
            <li>Contactez votre référent APRIL si vous avez besoin d'un nouveau compte</li>
          </ul>

          <div class="footer">
            <p>Cet email a été envoyé automatiquement. Ne pas répondre.</p>
            <p>${appName} - Partage de fichiers sécurisé</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
⏰ Expiration Imminente

Votre compte invité expire dans ${daysRemaining} jour${daysRemaining > 1 ? 's' : ''}

Votre compte invité temporaire sur ${appName} va bientôt expirer.

Ce qui va se passer :
- Votre compte sera désactivé automatiquement
- Tous vos fichiers uploadés seront supprimés définitivement
- Vous ne pourrez plus accéder au service

Actions recommandées :
- Téléchargez tous les fichiers importants
- Assurez-vous que les destinataires ont bien reçu vos fichiers
- Contactez votre référent APRIL si vous avez besoin d'un nouveau compte
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Notification d\'expiration envoyée à:', email);
    console.log('   Message ID:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi de la notification à', email, ':', error.message);
    return false;
  }
}

/**
 * Test la configuration email
 * @returns {Promise<boolean>} - true si la config est valide, false sinon
 */
async function testEmailConfiguration() {
  if (!transporter) {
    console.error('❌ Configuration email non initialisée');
    return false;
  }

  try {
    await transporter.verify();
    console.log('✅ Configuration email valide et prête');
    return true;
  } catch (error) {
    console.error('❌ Configuration email invalide:', error.message);
    return false;
  }
}

module.exports = {
  sendGuestCode,
  sendAccountExpiringSoon,
  testEmailConfiguration
};
