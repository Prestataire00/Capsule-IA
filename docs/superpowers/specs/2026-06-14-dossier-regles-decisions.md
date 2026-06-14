# Agrégat Dossier — règles de gestion, décisions & garde-fous manquants

**Date :** 2026-06-14 · **Statut :** décisions actées (Ismael). **Note d'audit + décisions — PAS un plan d'implémentation immédiat** (zone en chantier parallèle, cf. § Coordination).

## Règles de gestion (rappel) et état d'implémentation (audit `origin/main`)

| Règle | État | Ancrage code |
|---|---|---|
| Le dossier porte le triplet Apprenant + Entreprise + Formation et ses ramifications (documents, émargements, factures) | ✅ Fait | `app.dossiers` (`learner_id` NOT NULL, `company_id` nullable, `formation_id` NOT NULL, `formation_snapshot`) ; documents/attendance/invoices → `dossier_id` |
| Une même formation → plusieurs dossiers parallèles, dates d'entrée/sortie et modules différents | ✅ Fait | `app.dossiers` (start/end par dossier) + `app.dossier_modules` (snapshot par dossier : `position`, `duration_hours`, dates propres). `formation_id` partagé entre dossiers |
| Le statut évolue automatiquement à certaines étapes (signature, fin, paiement) et peut être ajusté manuellement | 🟡 Partiel | `app.guard_dossier_transitions()` (0015) valide la machine à états + `app.dossier_status_history`. **Manque le déclenchement automatique** (cf. trou #1) |
| Pas de suppression après convention signée — archivage uniquement (traçabilité Qualiopi) | 🟡 Partiel | Soft-delete (`deleted_at`) + RLS par statut. **Manque le verrou explicite** (cf. trou #2) |

Enum statut : `draft, pending_validation, scheduled, active, completed, closed, archived, cancelled`.

## Décisions sur les points ouverts

**1. Modèle catalogue = hybride guidé.** Le schéma encode déjà les deux options (`formations` ↔ `formation_modules` avec `is_optional`/`position` ↔ `modules` bibliothèque ; `dossier_modules` snapshot par dossier). **Décision : on part du template de la formation (modules, certains optionnels) et on autorise ajout/retrait par dossier.** Ce n'est donc pas un changement de schéma mais une orientation UX de composition. On NE contraint PAS `dossier_modules` aux seuls modules de la formation (souplesse par cohorte voulue).

**2. Apprenant indépendant = sans entreprise (`company_id NULL`).** `learners.company_id` et `dossiers.company_id` sont nullables. **Décision : l'indépendant = absence d'entreprise.** Pas de fiche dédiée, pas de fausse entreprise mono-apprenant (éviterait de polluer le carnet entreprises). Déjà supporté tel quel.

## Garde-fous manquants (à implémenter — séquencé)

### Trou #1 — Transitions de statut automatiques
`guard_dossier_transitions` *valide* les transitions mais ne les *déclenche* pas depuis les événements métier. **Vérifié sur `origin/main` (0751c74)** : le registre `HANDLERS` du dispatcher d'outbox [`apps/web/app/api/cron/dispatch-events/route.ts`] ne contient AUCUN handler de transition de statut — `document.signed` → `recompute-qualiopi` seulement (pas de changement de statut), et `billing.invoice.paid` est un event défini **mais sans handler** (jamais consommé). Les entrées `'dossier.scheduled'` / `'dossier.closed'` sont en commentaire (« à étoffer »).

À câbler (ajouter des handlers au registre existant) :
- Convention (dossier d'entrée) signée (`document.signed`, kind `convention`) → `draft`/`pending_validation` → `scheduled` (ou `active`).
- Fin de formation (end_date atteinte / dernière session `done` / assiduité complète) → `completed`.
- Facture payée (`billing.invoice.paid` — handler à créer) → `closed`.
Implémentation : nouveaux handlers idempotents dans le registre du dispatcher, faisant un `UPDATE app.dossiers SET status = …` qui passe par `guard_dossier_transitions` (donc transitions invalides rejetées ; ajustement manuel toujours possible). Le point d'ancrage est précis et **distinct** du tunnel CRM mock→réel → faible collision.

### Trou #2 — Verrou suppression si convention signée
Ajouter un garde-fou DB : `BEFORE DELETE ON app.dossiers` (et/ou interdiction du passage à `deleted_at`) qui **lève une exception si une convention signée existe** pour le dossier (`EXISTS` dans `document_signatures` `status` signé pour un `documents.kind = 'convention'` du dossier) → forcer la transition vers `archived` au lieu de la suppression. Trigger isolé, faible surface, pgTAP dédié.

## Coordination

⚠️ Une **session parallèle construit le tunnel mock→réel dossier/CRM** (`F-CRM-03/09/10/11`, formulaires apprenant/entreprise/formateur réels, prix par module). Le conflit de merge sur `dossiers/[id]/page.tsx` observé lors de l'audit est désormais **résolu** (`origin/main` à 0751c74, working tree propre). Les 2 trous sont **isolables** du tunnel (trou #1 = registre de handlers du dispatcher ; trou #2 = trigger DB pur) → collision faible, mais **vérifier `git fetch` + le dernier numéro de migration avant d'écrire** (numéros de migration en mouvement rapide, cf [[project_ia_infinity_migration_collisions]]). Ordre conseillé : trou #2 d'abord (le plus isolé), puis trou #1.
