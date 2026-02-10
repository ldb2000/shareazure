# 🎨 Design ShareAzure - Style APRIL

## 📋 Vue d'ensemble

Le frontend ShareAzure a été complètement redesigné pour correspondre au style professionnel et moderne du site APRIL (www.april.com).

## 🎨 Palette de couleurs APRIL

### Couleurs principales
- **APRIL Blue**: `#0066CC` - Couleur principale de la marque
- **APRIL Blue Dark**: `#004C99` - Variante sombre pour les hovers
- **APRIL Blue Light**: `#3385D6` - Variante claire
- **APRIL Green**: `#00B388` - Couleur d'accent
- **APRIL Green Dark**: `#008C6A`
- **APRIL Green Light**: `#33C49D`

### Couleurs neutres
- Échelle de gris de 50 à 900 pour les textes et arrière-plans
- Blanc `#FFFFFF` pour les cartes et sections

### Couleurs de statut
- **Success**: `#10B981` (Vert)
- **Warning**: `#F59E0B` (Orange)
- **Error**: `#EF4444` (Rouge)
- **Info**: `#3B82F6` (Bleu)

## 🏗️ Structure de la page

### Header
- Logo APRIL officiel (SVG)
- Nom de l'application "ShareAzure" avec séparateur
- Navigation avec icônes SVG
- Sticky header avec ombre subtile

### Hero Section
- Dégradé bleu APRIL
- Titre et sous-titre centrés
- Typographie claire et professionnelle

### Cartes et sections
- Arrière-plan blanc
- Bordures arrondies (16px)
- Ombres subtiles (shadow-md)
- Padding généreux (2rem-2.5rem)

### Footer
- Fond gris foncé
- Copyright et mentions légales

## 🖼️ Composants clés

### Boutons
4 variantes principales :
1. **Primary** - Bleu APRIL pour actions principales
2. **Success** - Vert APRIL pour confirmations
3. **Outline** - Transparent avec bordure pour actions secondaires
4. **Danger** - Rouge pour suppressions

Tous avec :
- Transitions fluides
- Effet de lift au survol (translateY)
- Ombres au hover
- Icônes SVG intégrées

### Zone d'upload
- Bordure pointillée
- Icône SVG personnalisée
- Animation au drag & drop
- Changement de couleur au survol

### Progress bar
- Dégradé bleu vers vert
- Border radius arrondi
- Animation fluide

### Modals
- 3 tailles : normal, medium, large
- Animation slide-up
- Header avec fond gris clair
- Footer pour actions
- Bouton de fermeture stylisé

## 📱 Responsive Design

### Breakpoints
- Mobile : < 768px
- Desktop : ≥ 768px

### Adaptations mobile
- Header en colonne
- Boutons en pleine largeur
- Grilles en une colonne
- Padding réduit
- Tailles de police adaptées

## ✨ Animations et transitions

### Variables CSS
```css
--transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
```

### Animations
1. **slideIn** - Messages
2. **spin** - Spinner de chargement
3. **modalSlideUp** - Ouverture des modals
4. **pulse** - Zone d'upload en cours

## 🎯 Typographie

### Police
- **Inter** - Police moderne de Google Fonts
- Fallback : System fonts

### Hiérarchie
- Hero title: 2.5rem (mobile: 2rem)
- Section title: 1.5rem
- Body: 1rem
- Small: 0.875rem

### Poids
- Light: 300
- Regular: 400
- Medium: 500
- Semibold: 600
- Bold: 700

## 🔧 Variables CSS personnalisées

Toutes les couleurs, ombres et transitions sont définies en variables CSS pour :
- Facilité de maintenance
- Cohérence du design
- Possibilité de théming futur

## 📦 Ressources

### Logo APRIL
- Fichier: `logo-april.svg`
- Source: Site officiel APRIL
- Format: SVG vectoriel
- Hauteur: 40px

### Icônes
- Format: SVG inline
- Style: Stroke-based
- Épaisseur: 2px
- Taille: 16px-24px selon contexte

## 🚀 Améliorations par rapport à l'ancien design

1. ✅ **Identité visuelle** alignée avec APRIL
2. ✅ **Accessibilité** améliorée (contraste, tailles)
3. ✅ **Performance** optimisée (SVG, pas d'images lourdes)
4. ✅ **Responsive** soigné pour tous les écrans
5. ✅ **Animations** fluides et professionnelles
6. ✅ **Composants** modulaires et réutilisables

## 📝 Notes de développement

### Compatibilité
- Navigateurs modernes (Chrome, Firefox, Safari, Edge)
- CSS Grid et Flexbox
- Variables CSS
- SVG

### Bonnes pratiques
- Mobile-first approach
- Semantic HTML5
- Accessible forms
- ARIA labels où nécessaire

## 🎨 Mockups et références

Le design s'inspire de :
- Site APRIL : https://www.april.com/fr/
- Palette de couleurs extraite du site officiel
- Principes de Material Design pour les composants
- Guidelines d'accessibilité WCAG 2.1

---

**Design créé le** : 11 janvier 2025
**Version** : 2.0 - APRIL Edition
