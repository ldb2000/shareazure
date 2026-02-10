# 🔗 Fonctionnalité de Partage avec Liens Temporaires

## 📋 Vue d'ensemble

ShareAzure intègre maintenant un système de partage de fichiers sécurisé utilisant les **SAS (Shared Access Signature) tokens** d'Azure. Cette fonctionnalité permet de générer des liens de téléchargement temporaires avec expiration automatique.

## ✨ Fonctionnalités

- ✅ Génération de liens de partage temporaires
- ✅ Expiration configurable (15 min à 30 jours)
- ✅ Sécurité via SAS tokens Azure
- ✅ Copie en un clic dans le presse-papiers
- ✅ **Email obligatoire** : Chaque partage doit être ciblé vers un ou plusieurs destinataires
- ✅ **Support de plusieurs emails** : Possibilité de partager à plusieurs personnes en une fois
- ✅ **Domaines d'emails autorisés** : Contrôle des domaines autorisés par l'administrateur
- ✅ **Protection par mot de passe** : Optionnelle pour sécuriser les fichiers sensibles
- ✅ Interface intuitive et responsive

## 🚀 Utilisation

### Étape 1 : Ouvrir l'interface de partage

1. Dans la liste des fichiers uploadés
2. Cliquez sur le bouton **🔗 Partager** du fichier à partager
3. Le modal de partage s'ouvre

### Étape 2 : Entrer les emails des destinataires

1. Dans le champ **"Emails des destinataires"** (obligatoire)
2. Entrez un ou plusieurs emails séparés par des virgules :
   - Exemple : `email1@example.com, email2@example.com`
3. ⚠️ **Important** : Le domaine de chaque email doit être autorisé par l'administrateur

### Étape 3 : Configurer l'expiration

Choisissez la durée de validité du lien :

| Durée | Usage recommandé |
|-------|------------------|
| 15 minutes | Partage immédiat, présentation |
| 1 heure | Transfert rapide |
| 4 heures | Session de travail |
| 8 heures | Journée de travail |
| 24 heures | Partage court terme |
| 7 jours | Projet en cours |
| 30 jours | Archive temporaire |

### Étape 4 : (Optionnel) Ajouter un mot de passe

1. Entrez un mot de passe dans le champ "Mot de passe (optionnel)"
2. Le destinataire devra saisir ce mot de passe pour télécharger le fichier
3. ⚠️ Le mot de passe ne sera jamais visible dans l'URL

### Étape 5 : Générer le lien

1. Cliquez sur **🔗 Générer le lien de partage**
2. Le lien est généré instantanément
3. La date d'expiration s'affiche

### Étape 6 : Partager

1. Cliquez sur **📋 Copier** pour copier le lien
2. Partagez-le par email, chat, etc.
3. ⚠️ Le lien permet à quiconque de télécharger le fichier (si protégé par mot de passe, le mot de passe sera requis)

## 🔒 Sécurité

### Mécanisme SAS Tokens

Les liens de partage utilisent les SAS tokens Azure qui offrent :

- **Limitation temporelle** : Expiration automatique
- **Permissions granulaires** : Lecture seule par défaut
- **Pas d'exposition des credentials** : Les clés Azure restent côté serveur
- **Révocation impossible** : Une fois généré, le lien est valide jusqu'à expiration

### Bonnes Pratiques

✅ **À faire :**
- Utiliser la durée d'expiration la plus courte possible
- Ne partager que les fichiers nécessaires
- Vérifier le destinataire avant de partager
- Utiliser des canaux sécurisés (email professionnel, chat chiffré)

❌ **À éviter :**
- Partager des liens sur des plateformes publiques
- Utiliser 30 jours pour des documents sensibles
- Partager des liens dans des emails non chiffrés pour données confidentielles
- Réutiliser les liens après expiration

### Limitations de Sécurité

⚠️ **Important :**

1. **Pas de révocation** : Une fois généré, un lien SAS ne peut pas être révoqué avant son expiration
2. **Accès anonyme** : Quiconque possède le lien peut télécharger le fichier
3. **Pas de tracking** : Impossible de savoir qui a téléchargé
4. **Copie possible** : Le lien peut être partagé à d'autres personnes

**Alternative pour documents sensibles** : Utiliser Azure AD avec authentification requise.

## 🛠️ Détails Techniques

### API Backend

#### Endpoint : `POST /api/share/generate`

Génère un lien de partage avec SAS token.

**Request Body :**
```json
{
  "blobName": "uuid.ext",
  "expiresInMinutes": 60,
  "permissions": "r",
  "recipientEmail": "email1@example.com, email2@example.com",
  "password": "motdepasse" // optionnel
}
```

**Paramètres :**
- `blobName` (requis) : Nom du fichier dans Azure
- `expiresInMinutes` (optionnel, défaut: 60) : Durée de validité en minutes
- `permissions` (optionnel, défaut: "r") : Permissions (r=read, w=write, d=delete)
- `recipientEmail` (requis) : Email(s) du(des) destinataire(s), séparés par des virgules
- `password` (optionnel) : Mot de passe pour protéger le lien

**Erreurs possibles :**
- `400` : Email requis ou format invalide
- `403` : Domaine de l'email non autorisé

**Response :**
```json
{
  "success": true,
  "shareLink": "https://account.blob.core.windows.net/uploads/file.pdf?sv=2021-12-02&...",
  "expiresAt": "2025-01-08T14:30:00.000Z",
  "expiresInMinutes": 60,
  "file": {
    "blobName": "uuid.ext",
    "originalName": "document.pdf",
    "contentType": "application/pdf",
    "size": 1048576
  }
}
```

#### Endpoint : `GET /api/share/info/:blobName`

Obtient les informations d'un fichier.

**Response :**
```json
{
  "success": true,
  "file": {
    "blobName": "uuid.ext",
    "originalName": "document.pdf",
    "contentType": "application/pdf",
    "size": 1048576,
    "lastModified": "2025-01-07T12:00:00.000Z",
    "uploadedAt": "2025-01-07T12:00:00.000Z"
  }
}
```

### Structure du SAS Token

Un lien de partage ressemble à :
```
https://account.blob.core.windows.net/container/file.pdf?
  sv=2021-12-02            # Version API
  &se=2025-01-08T14:30:00Z # Date d'expiration
  &sr=b                    # Resource (blob)
  &sp=r                    # Permissions (read)
  &sig=...                 # Signature cryptographique
```

### Permissions Disponibles

| Permission | Code | Description |
|------------|------|-------------|
| Read | `r` | Lecture/téléchargement (défaut) |
| Write | `w` | Écriture/upload |
| Delete | `d` | Suppression |

**Note :** ShareAzure utilise uniquement `r` (read-only) pour les liens de partage.

## 📊 Logs et Monitoring

### Événements Loggés

```json
{
  "timestamp": "2025-01-07T12:00:00.000Z",
  "operation": "share_link_generated",
  "blobName": "uuid.ext",
  "expiresInMinutes": 60,
  "expiresAt": "2025-01-07T13:00:00.000Z"
}
```

### Monitoring Recommandé

Pour une utilisation en production, il est recommandé de :

1. **Logger les générations de liens** : Savoir quels fichiers sont partagés
2. **Monitorer les accès** : Via Azure Storage Analytics
3. **Alertes sur usage anormal** : Trop de générations de liens
4. **Audit régulier** : Révision des fichiers partagés

## 🎨 Personnalisation

### Modifier les Durées d'Expiration

Dans `frontend/index.html`, modifiez le select :

```html
<select id="expirationSelect" class="share-select">
    <option value="5">5 minutes</option>
    <option value="30">30 minutes</option>
    <option value="120">2 heures</option>
    <!-- Ajoutez vos durées personnalisées -->
</select>
```

### Ajouter des Permissions d'Écriture

⚠️ **Non recommandé pour la sécurité**

Si vous souhaitez permettre l'upload via le lien :

```javascript
// Dans app.js
body: JSON.stringify({
    blobName: fileToShare.blobName,
    expiresInMinutes,
    permissions: 'rw' // read + write
})
```

### Personnaliser l'Interface

Les styles du modal de partage sont dans `frontend/styles.css` :

```css
.share-modal {
    max-width: 600px;
    /* Personnalisez ici */
}
```

## 🧪 Tests

### Test Manuel

1. **Upload un fichier** : Uploader `test.pdf`
2. **Générer un lien** : Cliquer sur 🔗 Partager
3. **Choisir 15 minutes** : Sélectionner l'expiration
4. **Générer** : Cliquer sur générer
5. **Copier** : Cliquer sur 📋 Copier
6. **Tester** : Ouvrir le lien dans un navigateur privé
7. **Vérifier** : Le fichier doit se télécharger
8. **Attendre** : Après 15 minutes, le lien doit expirer

### Test Automatisé (cURL)

```bash
# 1. Générer un lien
curl -X POST http://localhost:3000/api/share/generate \
  -H "Content-Type: application/json" \
  -d '{
    "blobName": "test-file.pdf",
    "expiresInMinutes": 60
  }'

# Réponse attendue : { "success": true, "shareLink": "https://..." }

# 2. Télécharger via le lien (copier le shareLink de la réponse)
curl -O "https://account.blob.core.windows.net/uploads/test-file.pdf?sv=..."

# 3. Vérifier l'info
curl http://localhost:3000/api/share/info/test-file.pdf
```

## 📱 Cas d'Usage

### 1. Partage avec Client

**Scénario :** Envoyer une présentation à un client

```
Durée : 24 heures
Méthode : Email professionnel
Sécurité : Moyenne (pas de données sensibles)
```

### 2. Collaboration Interne

**Scénario :** Partager un fichier avec l'équipe

```
Durée : 7 jours
Méthode : Slack/Teams
Sécurité : Bonne (réseau privé)
```

### 3. Transfert Temporaire

**Scénario :** Téléchargement immédiat lors d'une réunion

```
Durée : 15 minutes
Méthode : Chat de réunion
Sécurité : Excellente (usage immédiat)
```

### 4. Archive Court Terme

**Scénario :** Backup temporaire accessible

```
Durée : 30 jours
Méthode : Email personnel
Sécurité : Faible (long terme)
```

## ⚙️ Configuration Requise

### Variables d'Environnement

Le partage nécessite les mêmes credentials que l'upload :

```env
# Connection string (recommandé)
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...

# OU Account Name + Key
AZURE_STORAGE_ACCOUNT_NAME=votrecompte
AZURE_STORAGE_ACCOUNT_KEY=votreclé==
```

**Important :** Les SAS tokens nécessitent les credentials (nom + clé), pas seulement une connection string sans clé.

### Permissions Azure Requises

Le compte de service doit avoir :

- ✅ **Lecture** : Lire les blobs
- ✅ **Génération SAS** : Créer des tokens
- ❌ Pas besoin de permissions supplémentaires

## 🔧 Dépannage

### Erreur : "Unable to generate SAS token"

**Cause :** Credentials Azure manquants ou invalides

**Solution :**
```bash
# Vérifier les variables d'environnement
echo $AZURE_STORAGE_CONNECTION_STRING
# ou
echo $AZURE_STORAGE_ACCOUNT_NAME
echo $AZURE_STORAGE_ACCOUNT_KEY
```

### Erreur : "File not found"

**Cause :** Le fichier n'existe pas dans le conteneur

**Solution :**
```bash
# Lister les fichiers
curl http://localhost:3000/api/files
```

### Le lien expire immédiatement

**Cause :** Horloge système désynchronisée

**Solution :**
```bash
# Synchroniser l'heure système
sudo ntpdate -s time.apple.com  # macOS
sudo timedatectl set-ntp true    # Linux
```

### Le lien ne fonctionne pas après génération

**Cause :** CORS ou problème réseau

**Solution :**
1. Vérifier que le lien commence par `https://`
2. Tester dans un navigateur privé
3. Vérifier les règles de firewall Azure

## 📈 Améliorations Futures

### Court Terme
- [x] Historique des liens générés ✅
- [x] Compteur de téléchargements ✅
- [x] QR Code pour le lien ✅
- [x] Protection par mot de passe ✅
- [x] Partage ciblé par email ✅
- [x] Gestion des domaines autorisés ✅

### Moyen Terme
- [ ] Révocation anticipée des liens
- [ ] Notifications d'expiration
- [ ] Envoi automatique d'email aux destinataires

### Long Terme
- [ ] Authentification Azure AD optionnelle
- [ ] Analytics détaillées (qui, quand, combien)
- [ ] Limitation du nombre de téléchargements

## 📞 Support

### Documentation Connexe

- [README.md](../README.md) - Documentation principale
- [AZURE_SETUP.md](AZURE_SETUP.md) - Configuration Azure
- [PREVIEW_FEATURE.md](PREVIEW_FEATURE.md) - Fonctionnalité de preview

### Documentation Azure

- [SAS Tokens](https://docs.microsoft.com/azure/storage/common/storage-sas-overview)
- [Blob Storage Security](https://docs.microsoft.com/azure/storage/blobs/security-recommendations)

---

**Développé pour APRIL/STTI**  
*Janvier 2025*

Pour toute question : laurent.deberti@april.fr
