# 09 — Wireframes des écrans clés

Les wireframes complets en ASCII (basse fidélité, focus sur structure et flow) ont été produits dans la conversation initiale. Ce document liste les 8 écrans avec leur intention et les composants shadcn/ui à mobiliser. À expanser quand les sessions de design haute fidélité auront lieu.

## 1. Dashboard home (`/`)

- 4 KPI cards : dossiers actifs, Qualiopi ready, émargements manquants, documents en attente
- Liste "À traiter aujourd'hui" + "Tendances 30j" (NPS + Qualiopi)
- "Sessions de la semaine"
- Composants : `Card`, `Badge`, `Skeleton`, `Sparkline`

## 2. Liste dossiers (`/dossiers`)

- Filtres URL state (status, formation, période, recherche)
- Table desktop / cards mobile
- Pagination cursor
- Empty state guidé (CTA "Créer dossier")
- Composants : `Input`, `MultiSelect`, `DateRangePicker`, `Table`, `Badge`, `Pagination`

## 3. Vue 360° dossier (`/dossiers/[id]`)

- Header sticky : référence, status, actions
- Quick stats (période, heures, modalité)
- Tabs sticky : Vue, Modules, Sessions, Émargements, Documents, Questionnaires, Qualiopi, Facturation
- Vue = grid 2×3 de cards résumant chaque sous-section
- Realtime via `RealtimeBridge`
- Composants : `Tabs`, `Card`, `Badge`, `DropdownMenu`, `AlertDialog`

## 4. Wizard création dossier (`/dossiers/nouveau?step=N`)

- Step 1 : contexte (apprenant, formation, période, modalité)
- Step 2 : modules + formateurs (drag & drop)
- Step 3 : finance (montant + financeurs avec parts)
- Auto-save brouillon avec indicateur
- Composants : `Steps`, `Combobox`, `DatePicker`, `RadioGroup`, `Sortable`

## 5. Page Qualiopi par dossier (`/dossiers/[id]/qualiopi`)

- Bandeau global : score (X/24), bloquants, exporter audit
- Par critère : collapsible avec liste indicateurs et état (✓ ✗ ⚠)
- Actions contextuelles par indicateur bloquant
- Composants : `Progress`, `Collapsible`, `Card`, `FileUploader`, `Dialog`

## 6. Espace formateur — émargement mobile

- Layout `(formateur)/`, mobile-first, gros boutons
- Liste participants live avec status signature
- Modale "Afficher QR" plein écran
- Bouton "Finaliser" désactivé tant que tous statuts non couverts
- Composants : `Card`, `Button` (large), `Dialog`, `Badge`

## 7. Page apprenant — signature mobile (`/(apprenant)/signer/[token]`)

- Layout minimal, pas de nav
- Aperçu document + checkbox "j'ai pris connaissance"
- Canvas signature tactile + bouton effacer
- Confirmation après succès
- États gérés : token expiré, déjà signé, erreur réseau
- Composants : `Card`, `Button`, `Canvas` (HTML5 natif)

## 8. Réclamations (`/reclamations` + `[id]`)

- Liste filtrable (sévérité, statut, source)
- Détail = card "Détails" + timeline "Suivi" + zone "Résolution"
- Lien dossier associé
- Composants : `Card`, `Badge`, `Timeline` (custom), `Textarea`, `Combobox`

## Notes

- **Mobile-first** pour les écrans externes (formateur, apprenant). Desktop-first pour OF (dashboard, listes).
- **Empty states** = CTA guidée, jamais "aucun résultat" sec.
- **Loading states** = skeleton à la forme du contenu attendu, pas de spinner central.
- **A11y AA** : clavier partout, contrastes, `aria-*` sur les states dynamiques.
- **System de design** : Storybook à mettre en place dès qu'un composant partagé apparaît dans 3+ écrans.
