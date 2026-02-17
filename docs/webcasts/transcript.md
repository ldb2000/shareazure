# ShareAzure — Webcast de Présentation

> **Durée estimée** : 8-9 minutes  
> **Public** : Direction, DSI, équipes métier, prospects  
> **Angle** : Pourquoi ShareAzure vs les solutions du marché  
> **Voix** : Charlotte (ElevenLabs, féminine professionnelle)

---

## Scène 1 — Accroche (25s)
**[Écran : Titre animé ShareAzure + logo]**

Chaque jour, des milliers d'entreprises partagent des fichiers sensibles via WeTransfer, Dropbox ou des clés USB. Sans chiffrement, sans traçabilité, sans contrôle.

ShareAzure change la donne. Stockage souverain, partage sécurisé, intelligence artificielle intégrée. Le tout hébergé en France, sous votre contrôle total.

---

## Scène 2 — Le problème (35s)
**[Écran : Comparatif visuel des risques]**

Aujourd'hui, les entreprises utilisent en moyenne cinq outils différents pour partager des fichiers. Swiss Transfer pour les gros fichiers, Dropbox pour le stockage, WeTransfer pour les envois rapides, une messagerie pour le reste.

Le résultat ? Des données éparpillées, aucune traçabilité, et des fichiers confidentiels qui transitent par des serveurs étrangers sans aucun contrôle.

ShareAzure centralise tout en une seule plateforme, sécurisée et souveraine.

---

## Scène 3 — Stockage intelligent (50s)
**[Écran : Upload drag & drop → Galerie photos → Arborescence]**

L'upload se fait par simple glisser-déposer. Photos, vidéos, documents, présentations — tous les formats sont acceptés.

Les images s'affichent dans une galerie visuelle, avec miniatures et prévisualisation. Fini les noms de fichiers incompréhensibles : l'intelligence artificielle génère automatiquement des descriptions et des tags pour chaque photo.

Les fichiers sont organisés par équipe, avec une arborescence claire. Chaque équipe dispose de son propre espace, avec des quotas de stockage configurables.

Et surtout, le stockage est intelligent. Les fichiers récents restent en accès instantané. Les fichiers plus anciens migrent automatiquement vers des tiers économiques — Cool puis Archive — réduisant vos coûts de stockage Azure jusqu'à 80 pourcent. Ces seuils sont paramétrables globalement ou par équipe.

---

## Scène 4 — Partage sécurisé (55s)
**[Écran : Création lien de partage → Email destinataire → Page téléchargement]**

C'est le cœur de ShareAzure, et ce qui nous différencie radicalement des solutions grand public.

Chaque lien de partage est protégé par un mot de passe. C'est obligatoire, sans exception. Contrairement à WeTransfer ou Dropbox où n'importe qui avec le lien peut télécharger vos fichiers.

Vous définissez une date d'expiration. Les liens expirés sont automatiquement désactivés. Le destinataire reçoit une notification par email avec le lien sécurisé.

Point technique crucial : les tokens d'accès Azure ne sont jamais exposés. Le fichier transite par notre serveur, qui vérifie le mot de passe avant chaque téléchargement. Chez la plupart des concurrents, le lien de téléchargement pointe directement vers le stockage cloud, sans vérification intermédiaire.

Là où Swiss Transfer ne vous donne aucune visibilité, ShareAzure vous dit exactement qui a téléchargé quoi, quand, et depuis quelle adresse IP.

---

## Scène 5 — Portail de réception externe (45s)
**[Écran : Création demande → Portail upload externe → Fichiers reçus]**

Voici une fonctionnalité que vous ne trouverez pas chez WeTransfer : la réception sécurisée de fichiers.

Imaginons qu'un client, un fournisseur, ou un candidat doive vous envoyer des documents. Aujourd'hui, il vous les envoie par email — avec des pièces jointes de 25 mégaoctets maximum, sans chiffrement.

Avec ShareAzure, vous créez un portail d'upload dédié. Votre correspondant reçoit un lien unique, s'authentifie par email avec un code de vérification, puis dépose ses fichiers par glisser-déposer.

Aucun compte à créer. Aucune application à installer. Et chaque fichier reçu est automatiquement scanné par l'antivirus avant d'être intégré à votre espace.

---

## Scène 6 — Galerie et Intelligence Artificielle (60s)
**[Écran : Galerie photos → Tags IA → OCR → Carte géoloc → Visages]**

ShareAzure ne se contente pas de stocker vos fichiers. Il les comprend.

Grâce à Azure OpenAI et GPT-4o Vision, chaque image uploadée est automatiquement analysée. L'IA génère une description, identifie les objets, les lieux, les scènes, et propose des tags intelligents. Vous retrouvez n'importe quelle photo en quelques secondes, par recherche textuelle.

L'OCR extrait le texte de vos images et documents scannés. Un bon de commande photographié ? Le texte est indexé et recherchable.

Pour les fichiers audio et vidéo, le modèle Whisper transcrit automatiquement le contenu en français. Une réunion enregistrée devient un document texte exploitable.

La reconnaissance faciale détecte et identifie les visages dans vos photos et vidéos. Créez des profils, associez des noms, et retrouvez instantanément toutes les photos d'une personne.

Et grâce aux données EXIF, vos photos sont positionnées sur une carte interactive. En un clic, vous visualisez où chaque photo a été prise, avec regroupement intelligent en clusters.

Aucun outil grand public n'offre ce niveau d'analyse automatisée sur vos propres fichiers, hébergés sur vos propres serveurs.

---

## Scène 7 — Sécurité multicouche (60s)
**[Écran : Architecture sécurité → Antivirus → Domaines → Audit]**

La sécurité n'est pas une option chez ShareAzure. C'est le fondement de l'architecture.

Première couche : l'infrastructure. Aucun port n'est ouvert sur le serveur, à l'exception du SSH. Tout le trafic transite par Cloudflare Tunnel, avec protection DDoS, WAF et certificat SSL automatique. Le pare-feu iptables bloque tout trafic entrant.

Deuxième couche : l'antivirus. ClamAV scanne chaque fichier uploadé en temps réel. Les fichiers infectés sont immédiatement mis en quarantaine, avant même d'être stockés. C'est une fonctionnalité que vous ne trouverez ni chez Dropbox, ni chez Google Drive en version standard.

Troisième couche : la vérification des domaines email. ShareAzure contrôle automatiquement l'ancienneté du domaine via WHOIS, vérifie la présence DMARC, et détecte les domaines suspects. Un email provenant d'un domaine créé il y a trois jours ? ShareAzure le signale immédiatement.

Quatrième couche : l'audit. Un module dédié, avec des permissions séparées même pour l'administrateur. Traçabilité complète des partages, des téléchargements, de chaque accès fichier. Les partages suspects peuvent être révoqués en un clic.

---

## Scène 8 — Gestion des équipes et des rôles (40s)
**[Écran : Équipes → Rôles → Permissions → Quotas]**

ShareAzure gère quatre niveaux de rôles : Administrateur, COM, Utilisateur et Lecteur. Chaque rôle dispose de huit permissions configurables, ajustables dans une matrice visuelle.

Les équipes ont leurs propres quotas de stockage et de partage, avec des barres de progression visuelles. Impossible de dépasser la limite sans intervention d'un administrateur.

Et si votre entreprise utilise Microsoft 365, l'intégration Azure Entra ID permet le Single Sign-On. Les groupes Active Directory sont automatiquement mappés aux rôles ShareAzure. Un nouveau collaborateur se connecte, et ses droits sont déjà configurés.

---

## Scène 9 — Face à la concurrence (50s)
**[Écran : Tableau comparatif ShareAzure vs concurrents]**

Comparons objectivement ShareAzure aux solutions du marché.

WeTransfer et Swiss Transfer ? Aucun contrôle d'accès, aucun audit, pas de mot de passe obligatoire, données hébergées à l'étranger.

Dropbox et Google Drive ? Pas d'antivirus intégré, pas de tiering automatique, pas d'analyse IA sur vos propres données. Et vos fichiers sont sur leurs serveurs américains.

Kiteworks et Egnyte ? Des solutions enterprise à plus de vingt euros par utilisateur par mois, sans l'intelligence artificielle intégrée.

ShareAzure combine le meilleur des trois mondes : la simplicité d'un WeTransfer, la puissance d'un Egnyte, et l'intelligence artificielle d'Azure OpenAI. Le tout avec un hébergement souverain en France et un contrôle total sur vos données.

---

## Scène 10 — Configuration et Administration (35s)
**[Écran : Paramètres → Email → Tiering → Dashboard]**

L'administration est pensée pour être autonome. Vingt et un fournisseurs SMTP préconfigurés — d'OVH à Gmail en passant par Mailjet. Configuration en quelques clics.

Le tableau de bord centralise toutes vos métriques : fichiers, stockage, partages, activité. La section Stockage détaille la répartition par tier, par type de fichier, par équipe.

Chaque paramètre est accessible depuis une interface unifiée, sans ligne de commande, sans fichier de configuration à éditer.

---

## Scène 11 — Infrastructure souveraine (35s)
**[Écran : Diagramme d'architecture + carte France]**

Toute l'infrastructure Azure est déployée en France, région France Central, via Terraform. Stockage, intelligence artificielle, authentification — tout reste sur le territoire français.

Le backend Node.js tourne derrière Nginx avec SSL, rate limiting et en-têtes de sécurité. L'accès se fait exclusivement via Cloudflare Tunnel. Zéro surface d'attaque exposée.

C'est une architecture de niveau enterprise, déployable en quelques heures.

---

## Scène 12 — Conclusion (30s)
**[Écran : Logo ShareAzure + points clés animés]**

ShareAzure, c'est le partage de fichiers repensé pour l'entreprise française.

Stockage intelligent avec tiering automatique. Partage sécurisé par conception. Intelligence artificielle intégrée. Audit et traçabilité complète. Hébergement souverain en France.

Sécurisé par conception. Intelligent par nature. Simple au quotidien.

Merci d'avoir suivi cette présentation. Contactez-nous pour une démonstration personnalisée.

---

## Données techniques pipeline

| Scène | Durée | Caractères | Contenu visuel |
|-------|-------|-----------|----------------|
| 1 - Accroche | 25s | ~280 | Titre animé |
| 2 - Problème | 35s | ~420 | Comparatif risques |
| 3 - Stockage | 50s | ~620 | Upload + galerie + tiers |
| 4 - Partage | 55s | ~680 | Lien partage + téléchargement |
| 5 - Externe | 45s | ~520 | Portail upload externe |
| 6 - IA | 60s | ~750 | Galerie + tags + OCR + carte |
| 7 - Sécurité | 60s | ~720 | Archi + AV + DMARC + audit |
| 8 - Équipes | 40s | ~460 | Rôles + permissions + quotas |
| 9 - Concurrence | 50s | ~530 | Tableau comparatif |
| 10 - Config | 35s | ~380 | Paramètres admin |
| 11 - Infra | 35s | ~330 | Architecture + carte France |
| 12 - Conclusion | 30s | ~300 | Logo + points clés |

**Total** : ~5 990 caractères / ~8-9 minutes
