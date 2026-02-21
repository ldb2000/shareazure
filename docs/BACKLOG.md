# BACKLOG ShareAzure

## Bugs & Améliorations — 21/02/2026

### 🐛 Bugs

1. ~~**Upload gros fichier bloqué à 0%**~~ ✅ CORRIGÉ (21/02) — Barre de progression temps réel par fichier (%, vitesse, temps restant) via XMLHttpRequest.

2. **Sélection impossible en mode liste** — Les checkboxes de sélection ne fonctionnent pas en vue liste (uniquement en vue grille).

3. **Sélection par simple clic** — Une fois qu'une sélection est commencée (au moins 1 fichier coché), un simple clic sur un autre fichier devrait l'ajouter/retirer de la sélection (sans avoir besoin de cliquer sur la checkbox).

4. **Tag impossible sur fichier fraîchement uploadé** — Impossible d'ajouter un tag à un fichier qui vient d'être uploadé (probablement un problème de rafraîchissement de la liste ou de l'ID fichier).

### 🚀 Nouvelles fonctionnalités

5. **Indexation IA vidéo (rôle COM)** — Les utilisateurs avec le rôle `com` doivent pouvoir lancer une indexation IA sur une vidéo :
   - Extraction du contenu audio → texte (transcription)
   - Extraction des visages uniques de la vidéo
   - Stockage dans un fichier `.info` à la racine de l'utilisateur ou de l'équipe sur Azure
   - Recherche limitée au périmètre de sécurité : espace personnel + équipes de l'utilisateur uniquement
   - **Pas de recherche globale** (éviter fuite de données inter-équipes)

6. **Corbeille par utilisateur/équipe** — La corbeille doit être scopée : chaque utilisateur voit sa propre corbeille, chaque équipe a sa corbeille distincte.

7. **Popup page → sous-page** — Remplacer la popup modale qui s'affiche au clic sur une page par une navigation en sous-page (intégrée dans le layout).

8. **Upload de dossier complet** — Permettre l'upload d'un dossier entier (avec sa structure de sous-dossiers), pas seulement des fichiers individuels.

9. **Icône et couleur de dossier** — Lors de la création d'un dossier, permettre de choisir une icône et une couleur personnalisées.

10. **Changement d'avatar par caméra** — Le changement d'avatar doit proposer de prendre un portrait en direct avec la caméra frontale (mobile) ou la webcam (desktop).
