# 🚀 Fonctionnalités Avancées de Partage

## 📋 Vue d'ensemble

ShareAzure v2.0 intègre 4 nouvelles fonctionnalités puissantes pour le partage de fichiers :

1. **📊 Historique des liens générés** - Suivez tous vos liens de partage
2. **📱 QR Code** - Partagez facilement via mobile
3. **🔒 Protection par mot de passe** - Sécurisez vos fichiers sensibles
4. **📈 Compteur de téléchargements** - Analysez l'utilisation de vos liens

---

## 1️⃣ Historique des liens de partage

### Fonctionnalité

L'historique permet de :
- Visualiser tous les liens générés (actifs et expirés)
- Voir les statistiques de chaque lien
- Révoquer/désactiver des liens actifs
- Copier à nouveau un lien existant

### Utilisation

1. Cliquez sur **📊 Historique des partages** dans l'interface
2. Parcourez la liste de tous vos liens
3. Chaque lien affiche :
   - Nom du fichier
   - Date de création
   - Date d'expiration
   - Nombre de téléchargements
   - Statut (Actif/Expiré/Désactivé)
   - Protection par mot de passe (si applicable)

### Actions disponibles

Pour chaque lien actif :
- **📊 Statistiques** : Voir les détails complets
- **📋 Copier le lien** : Copier l'URL dans le presse-papiers
- **❌ Désactiver** : Révoquer le lien avant son expiration

### API

```bash
# Obtenir l'historique complet
GET /api/share/history

# Obtenir l'historique d'un fichier spécifique
GET /api/share/history?blobName=uuid.ext

# Limiter le nombre de résultats
GET /api/share/history?limit=50
```

**Réponse :**
```json
{
  "success": true,
  "count": 10,
  "links": [
    {
      "link_id": "abc-123",
      "blob_name": "uuid.pdf",
      "original_name": "document.pdf",
      "download_count": 5,
      "expires_at": "2025-01-08T14:00:00Z",
      "created_at": "2025-01-07T13:00:00Z",
      "isExpired": false,
      "isActive": true,
      "hasPassword": true
    }
  ]
}
```

---

## 2️⃣ QR Code

### Fonctionnalité

Chaque lien de partage génère automatiquement un QR Code pour :
- Partage rapide en présentiel
- Téléchargement mobile simplifié
- Impression sur documents
- Affichage sur écrans

### Utilisation

1. Générez un lien de partage normalement
2. Le QR Code s'affiche automatiquement sous le lien
3. Scannez avec n'importe quelle app de QR Code
4. Le fichier se télécharge directement

### Avantages

✅ **Sans friction** : Pas besoin de copier/coller
✅ **Mobile-first** : Optimisé pour smartphones
✅ **Universel** : Compatible tous lecteurs de QR Code
✅ **Rapide** : Téléchargement en 1 scan

### Cas d'usage

**En réunion :**
```
1. Générer le lien pendant la présentation
2. Afficher le QR Code à l'écran
3. Les participants scannent pour télécharger
4. Pas besoin d'envoyer par email
```

**Sur document imprimé :**
```
1. Générer un QR Code
2. L'imprimer sur une brochure/affiche
3. Les visiteurs scannent pour accéder au fichier
4. Le lien expire automatiquement
```

### API

Le QR Code est généré automatiquement :

```javascript
// Réponse de /api/share/generate
{
  "success": true,
  "shareLink": "https://...",
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  // ...
}
```

Le champ `qrCode` contient une Data URL prête à l'emploi :

```html
<img src="data:image/png;base64,..." alt="QR Code">
```

---

## 3️⃣ Protection par mot de passe

### Fonctionnalité

Protégez vos fichiers sensibles avec un mot de passe :
- Sécurité supplémentaire pour documents confidentiels
- Mot de passe hashé (bcrypt) côté serveur
- Page de saisie sécurisée
- Impossible de télécharger sans le bon mot de passe

### Utilisation

**Lors de la génération du lien :**

1. Cliquez sur **🔗 Partager**
2. Sélectionnez la durée d'expiration
3. **Nouveau** : Entrez un mot de passe dans le champ "🔒 Mot de passe (optionnel)"
4. Générez le lien
5. Le lien sera protégé par mot de passe

**Lors du téléchargement :**

1. Le destinataire clique sur le lien
2. Une page demande le mot de passe
3. Après saisie correcte, le téléchargement démarre
4. En cas d'erreur, un message s'affiche

### Sécurité

🔒 **Mesures implémentées :**
- Mot de passe hashé avec bcrypt (10 rounds)
- Jamais stocké en clair dans la base de données
- Transmission HTTPS recommandée en production
- Rate limiting sur les tentatives (via rate-limit global)
- Pas de révélation du nom de fichier avant authentification

⚠️ **Limitations :**
- Pas de récupération de mot de passe perdu
- Pas de limite sur les tentatives (à implémenter si nécessaire)
- Le mot de passe doit être communiqué séparément

### Bonnes pratiques

✅ **À faire :**
- Utiliser des mots de passe forts (8+ caractères)
- Communiquer le mot de passe par un canal différent (SMS, appel, etc.)
- Utiliser pour documents confidentiels uniquement
- Choisir une expiration courte

❌ **À éviter :**
- Envoyer le lien ET le mot de passe dans le même email
- Utiliser des mots de passe évidents ("password", "1234")
- Protéger des fichiers publics (surcharge inutile)
- Réutiliser le même mot de passe

### API

```bash
# Générer un lien protégé
POST /api/share/generate
Content-Type: application/json

{
  "blobName": "uuid.pdf",
  "expiresInMinutes": 60,
  "password": "MonMotDePasse123!"
}
```

**Réponse :**
```json
{
  "success": true,
  "linkId": "abc-123",
  "shareLink": "http://localhost:3000/api/share/download/abc-123",
  "hasPassword": true,
  "qrCode": "data:image/png;base64,...",
  // ...
}
```

**Téléchargement avec mot de passe :**
```bash
POST /api/share/download/:linkId
Content-Type: application/json

{
  "password": "MonMotDePasse123!"
}
```

---

## 4️⃣ Compteur de téléchargements

### Fonctionnalité

Suivez l'utilisation de vos liens de partage :
- Compteur automatique à chaque téléchargement
- Logs détaillés (date, IP, user-agent)
- Statistiques agrégées par lien
- Historique complet des accès

### Utilisation

**Voir les statistiques d'un lien :**

1. Ouvrez l'**Historique des partages**
2. Cliquez sur **📊 Statistiques** pour un lien
3. Visualisez :
   - Nombre total de téléchargements
   - Date du premier téléchargement
   - Date du dernier téléchargement
   - Liste de tous les téléchargements avec :
     - Date et heure exacte
     - Adresse IP
     - User-Agent (navigateur/système)

### Cas d'usage

**Suivi de diffusion :**
```
Scénario : Newsletter avec lien vers un PDF
- Envoyez le lien à 1000 personnes
- Consultez les stats pour voir combien ont téléchargé
- Analysez les heures de pointe
```

**Audit de sécurité :**
```
Scénario : Document confidentiel partagé
- Vérifiez qui a accédé au fichier
- Identifiez les accès suspects
- Révocquez le lien si nécessaire
```

**Analyse d'engagement :**
```
Scénario : Formation avec supports
- Partagez les supports avec les participants
- Mesurez le taux de consultation
- Identifiez qui n'a pas téléchargé
```

### Données collectées

Pour chaque téléchargement :
- **Date/heure** : Horodatage précis
- **IP** : Adresse IP du téléchargeur
- **User-Agent** : Navigateur et système d'exploitation
- **Lien utilisé** : Quel lien a été utilisé

### Privacy

⚠️ **Considérations RGPD :**
- Les IPs sont des données personnelles
- Informez les utilisateurs de la collecte
- Définissez une politique de rétention
- Permettez la suppression des logs sur demande

### API

**Obtenir les statistiques d'un lien :**
```bash
GET /api/share/stats/:linkId
```

**Réponse :**
```json
{
  "success": true,
  "link": {
    "link_id": "abc-123",
    "original_name": "document.pdf",
    "download_count": 5,
    "created_at": "2025-01-07T13:00:00Z",
    "expires_at": "2025-01-08T14:00:00Z"
  },
  "statistics": {
    "totalDownloads": 5,
    "firstDownload": "2025-01-07T13:30:00Z",
    "lastDownload": "2025-01-07T15:45:00Z",
    "downloadLogs": [
      {
        "downloadedAt": "2025-01-07T15:45:00Z",
        "ipAddress": "192.168.1.100",
        "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
      }
    ]
  }
}
```

---

## 🗄️ Base de données

### Structure

Les nouvelles fonctionnalités utilisent une base de données SQLite :

**Table `share_links` :**
- Stocke l'historique de tous les liens générés
- Contient les métadonnées (nom, taille, type)
- Enregistre le hash du mot de passe si protégé
- Suit le nombre de téléchargements
- Marque les liens comme actifs/inactifs

**Table `download_logs` :**
- Enregistre chaque téléchargement
- Lie les téléchargements aux liens
- Stocke IP et User-Agent
- Permet l'analyse fine

### Emplacement

```
backend/shareazure.db
```

### Maintenance

**Nettoyage automatique :**
- Les liens expirés sont désactivés toutes les minutes
- Les liens restent dans l'historique pour référence
- Pas de suppression automatique

**Nettoyage manuel :**
```bash
# Supprimer les liens expirés depuis > 30 jours
DELETE FROM share_links 
WHERE datetime(expires_at) < datetime('now', '-30 days');

# Supprimer les logs de téléchargement anciens
DELETE FROM download_logs 
WHERE datetime(downloaded_at) < datetime('now', '-90 days');
```

### Backup

```bash
# Backup de la base de données
cp backend/shareazure.db backend/shareazure.db.backup

# Restauration
cp backend/shareazure.db.backup backend/shareazure.db
```

---

## 🔧 Configuration

### Variables d'environnement

Aucune nouvelle variable requise. Les fonctionnalités utilisent la configuration existante.

### Dépendances ajoutées

```json
{
  "better-sqlite3": "^9.x",
  "qrcode": "^1.5.x",
  "bcrypt": "^5.1.x"
}
```

---

## 🧪 Tests

### Test manuel complet

**1. Protection par mot de passe :**
```bash
# Générer un lien protégé
1. Uploader un fichier
2. Partager avec mot de passe "Test123!"
3. Ouvrir le lien dans navigateur privé
4. Essayer mauvais mot de passe → Erreur
5. Essayer bon mot de passe → Téléchargement
```

**2. QR Code :**
```bash
# Scanner le QR Code
1. Générer un lien
2. Scanner le QR Code avec smartphone
3. Vérifier le téléchargement
```

**3. Historique :**
```bash
# Consulter l'historique
1. Générer plusieurs liens
2. Ouvrir l'historique
3. Vérifier que tous les liens apparaissent
4. Vérifier les statuts (actif/expiré)
```

**4. Compteur :**
```bash
# Tester le compteur
1. Générer un lien
2. Télécharger 3 fois
3. Ouvrir les statistiques
4. Vérifier : 3 téléchargements dans les logs
```

### Test API

```bash
# 1. Générer un lien protégé avec QR Code
curl -X POST http://localhost:3000/api/share/generate \
  -H "Content-Type: application/json" \
  -d '{
    "blobName": "test.pdf",
    "expiresInMinutes": 60,
    "password": "Test123!"
  }'

# 2. Voir l'historique
curl http://localhost:3000/api/share/history

# 3. Voir les statistiques
curl http://localhost:3000/api/share/stats/LINK_ID

# 4. Télécharger avec mot de passe
curl -X POST http://localhost:3000/api/share/download/LINK_ID \
  -H "Content-Type: application/json" \
  -d '{"password": "Test123!"}' \
  --output fichier.pdf

# 5. Désactiver un lien
curl -X DELETE http://localhost:3000/api/share/LINK_ID
```

---

## 📊 Métriques et Monitoring

### Logs des opérations

Les nouvelles opérations sont loggées :

```json
{
  "timestamp": "2025-01-07T13:00:00Z",
  "operation": "share_link_generated",
  "linkId": "abc-123",
  "blobName": "document.pdf",
  "expiresInMinutes": 60,
  "hasPassword": true
}

{
  "timestamp": "2025-01-07T13:30:00Z",
  "operation": "file_downloaded_via_share",
  "linkId": "abc-123",
  "blobName": "document.pdf"
}

{
  "timestamp": "2025-01-07T14:00:00Z",
  "operation": "share_link_deactivated",
  "linkId": "abc-123"
}
```

### Requêtes SQL utiles

```sql
-- Liens les plus téléchargés
SELECT original_name, download_count 
FROM share_links 
ORDER BY download_count DESC 
LIMIT 10;

-- Téléchargements par jour
SELECT DATE(downloaded_at) as date, COUNT(*) as downloads
FROM download_logs
GROUP BY DATE(downloaded_at)
ORDER BY date DESC;

-- Liens actifs par fichier
SELECT blob_name, COUNT(*) as active_links
FROM share_links
WHERE is_active = 1 AND datetime(expires_at) > datetime('now')
GROUP BY blob_name;

-- Taux de protection par mot de passe
SELECT 
  COUNT(*) as total,
  SUM(CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END) as protected,
  ROUND(100.0 * SUM(CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 2) as percentage
FROM share_links;
```

---

## 🚀 Déploiement en production

### Checklist

- [ ] Activer HTTPS (obligatoire pour clipboard API)
- [ ] Configurer Application Insights pour les logs
- [ ] Définir une politique de rétention des logs
- [ ] Backup régulier de shareazure.db
- [ ] Limiter les tentatives de mot de passe
- [ ] Ajouter CAPTCHA si nécessaire
- [ ] Informer les utilisateurs de la collecte de données
- [ ] Mettre à jour la documentation utilisateur

### Recommandations de sécurité

**Production :**
```env
# Recommandé
NODE_ENV=production
MAX_FILE_SIZE_MB=50
ALLOWED_ORIGINS=https://yourdomain.com

# Rate limiting plus strict
RATE_LIMIT_WINDOW_MS=900000  # 15 min
RATE_LIMIT_MAX_REQUESTS=50   # 50 req/15min
```

---

## 📝 Changelog

### v2.0.0 - Janvier 2025

**Nouvelles fonctionnalités :**
- ✅ Historique complet des liens de partage
- ✅ Génération automatique de QR Codes
- ✅ Protection par mot de passe
- ✅ Compteur et logs de téléchargements
- ✅ Base de données SQLite intégrée
- ✅ Statistiques détaillées par lien
- ✅ Révocation manuelle des liens

**Améliorations :**
- Interface utilisateur enrichie
- API étendue avec 4 nouveaux endpoints
- Documentation complète
- Tests complets

---

## 🆘 Support

### Questions fréquentes

**Q : Puis-je récupérer un mot de passe oublié ?**
R : Non, les mots de passe sont hashés et ne peuvent pas être récupérés. Il faut générer un nouveau lien.

**Q : Les liens protégés expirent-ils normalement ?**
R : Oui, la protection par mot de passe ne change pas la durée de vie du lien.

**Q : Puis-je voir qui a téléchargé mon fichier ?**
R : Vous pouvez voir les IPs et user-agents, mais pas identifier nominalement les personnes.

**Q : Combien de téléchargements par lien ?**
R : Illimité. Le lien reste valide jusqu'à expiration ou désactivation manuelle.

**Q : La base de données peut-elle devenir trop grosse ?**
R : Avec usage normal, non. Mais vous pouvez nettoyer les vieux logs périodiquement.

### Problèmes connus

- Le clipboard API nécessite HTTPS ou localhost
- Les QR Codes très longs peuvent être difficiles à scanner
- Pas de limite sur les tentatives de mot de passe (à implémenter)

---

**Développé pour APRIL/STTI**  
*Janvier 2025*

Pour toute question : laurent.deberti@april.fr
