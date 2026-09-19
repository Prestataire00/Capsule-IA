---
name: Capsule IA
description: TMS/CRM Qualiopi pour organismes de formation français — dense, coloré par le sens, jamais décoratif.
colors:
  brand-orange: "#F97316"
  brand-orange-deep: "#C2410C"
  ink: "#111A2E"
  canvas: "#F5F7FA"
  horizon-100: "#ECEFF5"
  horizon-200: "#E1E6EE"
  horizon-300: "#C8D0DD"
  horizon-400: "#8E99AE"
  horizon-500: "#5F6B82"
  horizon-600: "#465269"
  horizon-700: "#334056"
  horizon-800: "#1F2940"
  horizon-950: "#0A0F1C"
  formation-teal: "#0F9D8A"
  formation-indigo: "#6A4FE0"
  formation-raspberry: "#D9467A"
  formation-sky: "#2B8FD6"
  surface: "#FFFFFF"
  person-rose: "#E11D48"
  time-blue: "#2563EB"
  qualiopi-purple: "#9333EA"
  money-emerald: "#059669"
  pending-amber: "#D97706"
  failure-red: "#DC2626"
  chart-conforme: "#10B981"
  chart-complet: "#D98A00"
typography:
  display:
    fontFamily: "Manrope, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.06em"
  section-title:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    letterSpacing: "-0.025em"
  lead:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 500
  caption:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  code:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "11px"
    fontWeight: 400
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.brand-orange}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.brand-orange-deep}"
  button-secondary:
    backgroundColor: "{colors.ink}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.horizon-700}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "20px"
  card-hero:
    backgroundColor: "#FFFFFF"
    rounded: "{rounded.2xl}"
    padding: "24px"
  input:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "36px"
  status-pill:
    rounded: "{rounded.full}"
    padding: "2px 10px"
    typography: "{typography.label}"
---

# Design System: Capsule IA

## Overview

**Creative North Star: « Le tableau de bord d'atelier »**

Capsule IA est un outil de travail, pas une vitrine. Un gestionnaire d'organisme de
formation y passe sa journée : il compare des lignes, repère un dossier en retard,
vérifie un taux Qualiopi. La densité prime sur le souffle, et la couleur n'est jamais
décorative — elle dit ce qu'une chose *est*. Une pastille rose annonce une personne,
une date bleue une séance, un montant vert de l'argent validé. Retirer la couleur
retirerait de l'information.

Le monde visuel tient en deux gestes. Les neutres sont un gris bleu nuit (« horizon »),
pas un gris froid : l'encre `#111A2E` et la toile `#F5F7FA` donnent une allure de
produit technique sans la dureté du noir sur blanc. Et l'orange `#F97316` porte seul
l'identité et l'action — il est rare, donc il se voit.

Les ombres sont en couches très diffuses, teintées à l'encre plutôt qu'au noir : le
relief se lit sans l'effet « carton découpé » des ombres franches. Les titres sont
resserrés (`-0.025em`), ce qui donne au produit son air compact.

**Key Characteristics:**
- Densité assumée : une ligne par objet, colonnes métier explicites
- Couleur sémantique, jamais ornementale
- Orange rare et unique ; un seul bouton primaire par écran
- Gris bleu nuit partout où d'autres mettraient du gris neutre
- Chiffres en `tabular-nums`, jamais en chasse fixe

## Colors

Une toile bleu nuit très claire, un accent orange unique, et un jeu de couleurs
fonctionnelles qui servent de code de lecture.

### Primary
- **Orange Capsule** : identité et action. Boutons primaires, barre latérale, liens
  d'action, focus. Sa rareté est ce qui le rend lisible — au-delà d'un bouton primaire
  par écran, il cesse de désigner quoi que ce soit.
- **Orange braise** : survol du primaire, et nom de session (`--sess`) dans les listes.

### Secondary
Les accents fonctionnels ne sont pas une palette secondaire libre : chacun a un sens
fixe, et l'employer pour autre chose casse la lecture.
- **Rose** : les personnes (apprenants, formateurs, contacts).
- **Bleu** : le temps (séances, dates, planning).
- **Violet** : Qualiopi, et lui seul — indicateurs, audits, supports à valider.
- **Émeraude** : l'argent encaissé, le validé, le conforme.
- **Ambre** : l'alerte qui n'est pas encore un échec (en attente, à traiter).
- **Rouge** : l'échec, le refus, le retard, la suppression.

### Tertiary
- **Vert jauge** (`#10B981`) et **ambre plein** (`#D98A00`) : réservés aux graphiques
  — l'arc de conformité Qualiopi et la barre de remplissage d'une séance complète. Plus
  soutenus que les accents d'interface, parce qu'ils doivent tenir sur quelques pixels
  de trait.
- **Sarcelle, indigo, framboise, bleu ciel** : identité d'une formation, attribuée dans
  l'ordre de création et conservée quand d'autres s'ajoutent. Palette validée pour les
  daltonismes. Aucune formation ne reçoit d'orange.

### Neutral
- **Encre** : texte principal, et teinte de toutes les ombres.
- **Toile** : fond d'application.
- **Horizon 100 à 300** : bordures, séparateurs, fonds de survol.
- **Horizon 400** : texte désactivé ou décoratif uniquement — son contraste sur fond
  clair (2,7:1) le disqualifie pour du texte à lire.
- **Horizon 500 à 700** : texte secondaire, libellés, légendes. `horizon-500` est le
  plancher lisible sur toile et sur fonds teintés en `-50` (5:1).

### Named Rules

**La règle de l'orange unique.** Un seul bouton primaire orange par écran. L'orange
appartient à la marque et à l'action ; aucune formation, aucun statut, aucune donnée ne
l'emprunte.

**La règle du sens.** Une couleur d'accent ne se choisit pas parce qu'elle va bien : elle
se choisit parce qu'elle dit quoi. Si deux éléments de nature différente portent la même
couleur sur un écran, l'un des deux se trompe.

**La règle du 500.** Sur un fond teinté (`-50` ou `-100`), le texte ne descend jamais
sous `horizon-500`. `horizon-400` et `horizon-300` y tombent sous 3:1.

## Typography

**Display Font:** Manrope (avec ui-sans-serif, system-ui)
**Body Font:** Manrope
**Label/Mono Font:** Geist Mono — réservé aux identifiants et aux codes

**Character:** Manrope porte seule l'identité : géométrique sans être froide, lisible à
11px comme à 30px. Resserrée sur les titres, elle donne l'allure compacte d'un produit
technique ; à taille de corps elle reste ouverte et neutre.

### Hierarchy
- **Display** (extrabold, 30px, interligne 1, `-0.025em`) : titre de page, hero uniquement.
- **Headline** (bold, 20px, `-0.025em`) : titres de section majeurs.
- **Title** (bold, 15px, `-0.015em`) : titres de carte, noms d'objets dans les listes.
- **Body** (normal ou medium, 13px) : texte courant, libellés de formulaire, boutons.
- **Label** (bold, 11px, `0.06em`, majuscules) : en-têtes de tableau, sur-titres de section.
- **Code** (normal, 11px, Geist Mono) : références de dossier, identifiants, types techniques.

Tailles autorisées : 11, 12, 13, 15, 17, 20, 24, et 30 pour le hero seul. Rien entre.

### Named Rules

**La règle du chiffre aligné.** Dates, heures, montants, compteurs et pourcentages
s'écrivent en sans avec `tabular-nums`. Jamais en chasse fixe : le mono sur une date
donne un air de terminal, qui n'est pas celui du produit.

**La règle du gras interdit.** `font-bold` est proscrit comme réglage par défaut ;
`font-semibold` ne sert que sur les titres hero h1/h2. La hiérarchie se fait par la
taille et la couleur, pas par la graisse.

## Layout

Grille fluide en colonnes Tailwind, sans largeur maximale imposée : les écrans de
gestion utilisent la largeur disponible. Les pages s'articulent en sections espacées de
24 à 32px, chaque section ouverte par un sur-titre 11px majuscule.

Les tableaux affichent **une ligne par objet** et des colonnes métier nommées
explicitement — jamais un identifiant technique en première colonne. En-tête en label
11px majuscule sur fond `horizon-50`.

Le mode sombre est obligatoire sur tout écran, piloté par la classe `dark`. Toute
couleur posée doit avoir sa contrepartie sombre.

Densité : hauteur de contrôle 36px (`h-9`) pour les boutons et champs, 32px (`h-8`) pour
les boutons d'icône en fin de ligne. Rythme d'espacement par pas de 4px.

## Elevation & Depth

Le système est presque plat. La profondeur vient d'abord du fond : blanc des cartes sur
toile `#F5F7FA`, puis d'une bordure `horizon-200` à un pixel. L'ombre n'arrive qu'ensuite,
et elle est volontairement très diffuse, teintée à l'encre (`rgb(17 26 46 / 0.06)`)
plutôt qu'au noir.

### Shadow Vocabulary
- **`shadow-sm`** (`0 1px 2px -1px rgb(17 26 46 / .06), 0 1px 3px 0 rgb(17 26 46 / .04)`) : état de repos de toute carte.
- **`shadow-md`** (`0 6px 16px -4px rgb(17 26 46 / .08), 0 2px 4px -2px rgb(17 26 46 / .05)`) : survol d'une carte cliquable.
- **`shadow-lg`** (`0 16px 36px -10px rgb(17 26 46 / .14)`) : hero unique de la page d'accueil.

### Named Rules

**La règle du plafond.** `shadow-xl` et au-delà sont interdits. Une interface de gestion
n'a rien qui doive flotter à ce point.

## Shapes

Angles arrondis par échelon de fonction, jamais au jugé : `rounded-md` (6px) pour les
champs et petits boutons, `rounded-lg` (8px) pour les cartes et boutons standards,
`rounded-xl` (12px) pour une carte mise en avant, `rounded-2xl` (16px) pour les hero et
bandeaux d'accueil, `rounded-full` pour les pastilles, badges et avatars.

Les bordures sont fines et discrètes (`horizon-200` à 60-70% d'opacité). Les pictogrammes
vivent dans un carré `rounded-lg` teinté de l'accent de leur section — c'est le motif
récurrent qui donne au produit son unité.

## Components

### Buttons
- **Shape:** angles doux (`rounded-md`, 6px), hauteur 36px, texte 13px medium.
- **Primary:** fond orange `#F97316`, texte blanc, `shadow-sm`. Un seul par écran.
- **Hover / Focus:** fond orange braise `#C2410C` ; focus visible par un anneau
  orange à 30% avec décalage (`ring-2 ring-orange-500/30 ring-offset-2`).
- **Secondary:** fond encre `#111A2E`, texte blanc — l'action neutre mais engageante.
- **Ghost:** bordure `horizon-200`, texte `horizon-700`, fond au survol seulement.
- **Bouton d'icône:** 32px carré, `rounded-md`, texte `horizon-500`, fond teinté au
  survol avec changement simultané de la couleur du texte.

### Chips / Pastilles de statut
- **Style:** fond sémantique en `-50`, texte assorti en `-700`, point coloré en `-500`,
  `rounded-full`, texte 11px.
- **State:** la couleur porte le statut — émeraude conforme, ambre en attente, rouge
  en échec, bleu informatif, horizon neutre.

### Cards / Containers
- **Corner Style:** `rounded-lg` (8px) par défaut, `rounded-xl` en mise en avant,
  `rounded-2xl` pour un hero.
- **Background:** blanc en clair, `horizon-900` en sombre.
- **Shadow Strategy:** `shadow-sm` au repos, `shadow-md` au survol si cliquable.
- **Border:** `horizon-200` à 70% d'opacité, une teinte plus marquée au survol.
- **Internal Padding:** 20px.

### Inputs / Fields
- **Style:** fond blanc, bordure `horizon-200`, `rounded-lg`, hauteur 36px, texte 13px.
- **Focus:** bordure orange clair et anneau orange à 10% sur quatre pixels.
- **Error:** bordure et texte d'aide en rouge `-600`, message sous le champ.

### Navigation
Barre latérale orange pleine, pictogrammes blancs, entrée active en fond plus soutenu.
Onglets de section en dessous, soulignés par un filet orange sur l'onglet courant.
En mobile, la barre latérale passe en tiroir.

### KpiCard (composant signature)
Carte de chiffre clé teintée par accent : dégradé de l'accent `-50` vers le blanc,
bordure `-100`, pictogramme blanc sur carré plein coloré, valeur en `-700` et
`tabular-nums`. Huit accents disponibles, choisis par le sens de la donnée.

## Do's and Don'ts

### Do:
- **Do** choisir l'accent d'un élément par ce qu'il désigne : rose pour les personnes,
  bleu pour les dates, violet pour Qualiopi, émeraude pour l'argent validé.
- **Do** écrire dates, montants et compteurs en sans avec `tabular-nums`.
- **Do** rester dans l'échelle 11/12/13/15/17/20/24/30.
- **Do** donner sa contrepartie sombre à toute couleur posée.
- **Do** utiliser `horizon-500` ou plus foncé pour tout texte destiné à être lu sur un
  fond teinté.
- **Do** nommer les colonnes d'un tableau en termes métier.

### Don't:
- **Don't** poser un deuxième bouton primaire orange sur un écran.
- **Don't** donner de l'orange à une formation, un statut ou une donnée : il appartient
  à la marque et à l'action.
- **Don't** écrire une date ou un montant en chasse fixe.
- **Don't** employer `font-bold` par défaut, ni `font-semibold` ailleurs que sur un
  titre hero.
- **Don't** dépasser `shadow-lg`.
- **Don't** utiliser `horizon-400` ou `horizon-300` pour du texte à lire.
- **Don't** confondre le violet Qualiopi avec un gradient décoratif : ici le violet est
  une catégorie, pas une ambiance.
