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
`guard_dossier_transitions` *valide* les transitions mais ne les *déclenche* pas depuis les événements métier. À câbler via l'outbox `infra.domain_events` :
- Convention (dossier d'entrée) signée → `draft`/`pending_validation` → `scheduled` (ou `active`).
- Fin de formation (end_date atteinte / dernière session `done` / assiduité complète) → `completed`.
- Facture payée → `closed`.
Implémentation : handlers d'événements (`document_signatures` complétée pour kind `convention` ; `invoices` → `paid` ; complétion d'attendance / fin de sessions), respectant la machine à états existante (ajustement manuel toujours possible).

### Trou #2 — Verrou suppression si convention signée
Ajouter un garde-fou DB : `BEFORE DELETE ON app.dossiers` (et/ou interdiction du passage à `deleted_at`) qui **lève une exception si une convention signée existe** pour le dossier (`EXISTS` dans `document_signatures` `status` signé pour un `documents.kind = 'convention'` du dossier) → forcer la transition vers `archived` au lieu de la suppression. Trigger isolé, faible surface, pgTAP dédié.

## Coordination

⚠️ Au moment de cette note, une **session parallèle construit activement le tunnel mock→réel dossier/CRM** (`F-CRM-09/10/11`, formulaires apprenant/entreprise/formateur réels) et le répertoire principal était en **conflit de merge sur `dossiers/[id]/page.tsx`**. Les 2 trous touchent cette zone (notamment le moteur de statut). **Recommandation : implémenter les 2 garde-fous APRÈS le merge du tunnel parallèle**, sur une base saine, pour éviter collision et double-travail. Le trou #2 (trigger DB pur) est le plus isolable et peut être fait en premier.
