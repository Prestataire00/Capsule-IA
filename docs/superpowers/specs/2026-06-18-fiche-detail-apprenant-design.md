# Fiche détail apprenant (`/apprenants/[id]`) — Design

**Date** : 2026-06-18
**Projet** : i-a-infinity-of (Capsule IA)
**Statut** : Validé (brainstorming), prêt pour plan d'implémentation

## Problème

Le carnet apprenants ([apps/web/app/(dashboard)/apprenants/page.tsx](../../../apps/web/app/(dashboard)/apprenants/page.tsx))
affiche une grille de cards branchées sur Supabase réel, mais le lien de détail est un
stub (`href="#"`). On ne peut donc pas cliquer sur un apprenant pour voir tout ce qui le
concerne (formations suivies, sessions, documents, heures réalisées, évaluations…).

## Objectif

Permettre de cliquer une card apprenant et d'atterrir sur une fiche qui synthétise tout
son parcours, avec drill-down vers le détail de chaque dossier.

## Décisions de cadrage (validées)

1. **Projet** : i-a-infinity-of.
2. **Organisation** : synthèse apprenant en en-tête + détail regroupé par dossier.
   Rappel modèle : l'agrégat racine est le **Dossier** ; un apprenant a N dossiers, et
   sessions / documents / heures / exercices / questionnaires sont rattachés au *dossier*,
   pas directement à l'apprenant.
3. **Périmètre v1** : les 4 blocs (identité+accessibilité, formations+heures/assiduité,
   sessions+documents, évaluations pédago).
4. **Structure** : la fiche apprenant est un **hub** = synthèse + grille de cards dossiers.
   Cliquer une card ouvre la page **`/dossiers/[id]` existante** (qui porte déjà les onglets
   Sessions / Documents / Heures / Évaluations + toutes les actions). → zéro duplication.
5. **Actionnable** : l'actionnable « par parcours » est déjà fourni par les pages dossier.
   Sur la fiche apprenant, uniquement les actions **niveau apprenant**.
6. **Back-link** : simple lien retour `← Apprenant` vers `/apprenants/[id]` depuis la page
   dossier (pas de param d'état).

## Architecture

### Route & navigation

- Nouvelle route server component : `apps/web/app/(dashboard)/apprenants/[id]/page.tsx`.
- Débranchement du stub dans `apps/web/app/(dashboard)/apprenants/page.tsx` :
  `href="#"` → `href={\`/apprenants/${l.id}\`}`.
- `notFound()` si l'apprenant n'existe pas ou est hors organisation (la RLS renvoie 0 ligne).
- Bandeau RGPD + vue réduite si `anonymized_at` est rempli.
- Lien retour `← Apprenant` ajouté sur la page dossier vers `/apprenants/[id]`.

### Accès données — sans nouvelle migration (choix volontaire)

Motivation : la base de connaissance du repo signale des risques SQL récurrents (collisions
de numéros de migration, SECURITY DEFINER manquant, citext/search_path, drift de migrations
en prod → 500). On reste donc sur le pattern de la fiche dossier (`supabaseServer()` +
embeds PostgREST), **aucun nouveau RPC ni migration**, en ~2-3 requêtes RLS-scopées :

1. `learners` (+ `companies`) — l'apprenant.
2. `dossiers` du learner (+ snapshot formation, `dossier_hours_tracking`, statut, dates,
   modalité, montant).
3. Compteurs de synthèse complémentaires si nécessaire (ex. documents en attente de
   signature) — via `count` ou dérivé en JS.

Toutes les requêtes sont scopées `organization_id` par la RLS native (aucune fuite inter-org).

### Fonction pure d'assemblage

`buildLearnerSummary(rows)` : à partir des lignes récupérées, calcule les totaux d'en-tête :

- heures cumulées réalisées / prévues,
- nombre de formations (dossiers),
- taux d'assiduité moyen,
- nombre de dossiers « à risque ».

Cette fonction est pure (aucun I/O) → **unité de test principale (TDD)**.

### UI (composants)

- `apprenants/[id]/_components/learner-header.tsx` (client) : identité, contact, entreprise,
  statut (salarié/dirigeant/indépendant), **RQTH + notes d'accessibilité**, naissance/CPF ;
  rangée de **StatCards de synthèse** ; barre d'actions niveau apprenant.
- `apprenants/[id]/_components/dossier-card.tsx` : référence, formation, statut, dates,
  modalité, **heures x/y**, **assiduité %**, badge ⚠ « à risque » → `Link` vers `/dossiers/[id]`.
- Empty state si l'apprenant n'a aucun dossier.
- Réutilisation des composants UI existants (StatCard / MiniStat, badges de statut).

### Actions (niveau apprenant uniquement)

- `updateLearner` — édition identité / contact / accessibilité (dialog). Nouvelle server action.
- `anonymizeLearner` — RGPD, positionne `anonymized_at`. **À vérifier au plan** : une logique
  d'effacement/anonymisation existe peut-être déjà
  (cf. `docs/superpowers/specs/2026-06-15-rgpd-effacement-design.md`) → réutiliser plutôt que recréer.
- « + Nouveau dossier » → lien vers la création de dossier pré-remplie avec l'apprenant.

Le par-dossier (générer doc, relancer signature, assigner questionnaire, émargement…) reste
sur les pages dossier existantes → pas de duplication de logique.

## Gestion des erreurs & états

- Apprenant introuvable / hors org → `notFound()` (404).
- Apprenant anonymisé → bandeau + vue réduite (pas de données personnelles détaillées).
- 0 dossier → empty state explicite.
- Erreur de requête Supabase → page d'erreur Next.

## Sécurité

- RLS `organization_id` native sur toutes les requêtes (aucun accès inter-organisme).
- Server actions soumises aux mêmes contrôles d'org que le reste du dashboard.

## Tests & vérification

- `pnpm typecheck` n'est jamais vert sur ce repo → validation de build via **`next build`**.
- Test unitaire sur `buildLearnerSummary` (pure, sans Docker ni DB).
- Aucune migration requise → pas de risque de drift prod / collision de numéros.

## Hors périmètre (v1)

- Sous-pages thématiques transversales apprenant (`/apprenants/[id]/documents`, `/sessions`…).
- Re-implémentation du détail par dossier côté apprenant (on réutilise `/dossiers/[id]`).
- Actions par-dossier sur la fiche apprenant.

## Git

- Branche : `feature/fiche-detail-apprenant` (créée depuis `origin/main`).
- Commit + push `origin` après tâche (Railway déploie depuis GitHub).
- Re-vérifier la session parallèle avant merge (collisions fréquentes sur main).
