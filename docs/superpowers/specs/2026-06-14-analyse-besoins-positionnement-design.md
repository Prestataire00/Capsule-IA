# Module 3.3 — Analyse des besoins & Positionnement (ANB)

**Date :** 2026-06-14 · **Statut :** spec (design) — **pas d'implémentation immédiate** (zone questionnaire en chantier parallèle, cf. § Coordination). Base : `origin/main` 464fd98.

## Contexte

Étape Qualiopi obligatoire **entre la pré-inscription validée et l'envoi du dossier d'entrée**. Selon le profil, 1 ou 2 questionnaires. **~70 % du backbone existe déjà** (modèle questionnaire + page de réponse récemment câblée par la session parallèle + gate Qualiopi d'entrée). Cette spec mappe l'existant et conçoit uniquement les manques.

## Réutilisable (audit `origin/main`)

- **Modèle questionnaire** (`0011_questionnaires.sql`) : `questionnaire_templates` (`kind`, `schema` JSONB), `questionnaire_assignments` (`recipient_kind ∈ learner|trainer|company_rep`, `due_at`, `token_hash`, `status`, `reminders_sent`, `last_reminder_at`), `questionnaire_responses` (`answers` JSONB, `score`, `submitted_at`, `submitter_ip`). Index `ix_q_assignments_due` (due_at WHERE pending/in_progress) — prêt pour la relance.
- **Page de réponse câblée** (parallèle) : `apps/web/app/(apprenant)/questionnaire/[token]/page.tsx` + `features/questionnaire/question-renderer.tsx` + `schema.ts` (template-driven, submit réel). F-ANB-02/03 réutilisent ça directement.
- **Gate Qualiopi d'entrée** (`0050_qualiopi_engine.sql`) : `qualiopi_gate_stage='entry'` + règle `questionnaire_positionnement` (EXISTS assignment template kind `positionnement`) qui alimente `entry_blocking_missing`. → **la règle « ANB bloque le dossier d'entrée » (3.10) est déjà implémentée** pour le positionnement.
- **Kinds** (`questionnaire_kind`) : `positionnement, satisfaction_chaud, satisfaction_froid, opco, evaluation_acquis, custom`.
- **PDF** : `documents.kind` inclut `'questionnaire'` ; générateurs PDF existants (convention/attestation) comme modèle.
- **Email** : `shared/lib/email/resend.ts` + `templates.ts` ; cron `api/cron/transactional-emails/route.ts` déjà présent (à étendre pour F-06).

## Conception des manques

### F-ANB-01 — Questionnaire entreprise (Must)
Template avec `recipient_kind='company_rep'`. **Kind** : ajouter une valeur d'enum `analyse_besoins_entreprise` (clarté + traçabilité Qualiopi) — *ou* réutiliser `custom` avec un `code` dédié (évite la migration d'enum). **Reco : nouvel enum kind** (1 ligne de migration ALTER TYPE). Déclenché si le pilote de la formation est dirigeant/RH.

### F-ANB-02 — Questionnaire apprenant (besoins + positionnement fusionné) (Must)
Template `kind='positionnement'`, `recipient_kind='learner'`, dont le `schema` JSONB **fusionne** questions de besoins/attentes/niveau + test de positionnement (pratique recommandée). Un seul document à remplir. Satisfait le gate Qualiopi d'entrée.

### F-ANB-03 — Test de positionnement (Must)
Couvert par F-ANB-02 quand fusionné. Si réalisé séparément (au choix de l'OF), template `positionnement` distinct. Mode « 1er jour avec le formateur » → cf. F-ANB-07.

### F-ANB-04 — Logique conditionnelle (Must) — **nouveau**
Orchestrateur d'assignation `assignNeedsAnalysis(dossierId)` (Server Action + fonction pure testable pour la décision) :
- Si **chef d'entreprise = apprenant** (le pilote dirigeant/RH est aussi l'apprenant) → **un seul** questionnaire fusionné (apprenant, F-ANB-02). Pas de questionnaire entreprise séparé.
- Sinon → **deux** : entreprise (`company_rep`, F-ANB-01) + apprenant (`learner`, F-ANB-02).
Entrée de décision : le rôle du pilote + l'égalité pilote/apprenant (à dériver du dossier : `company_id`, contact pilote, learner). Fonction pure `decideNeedsAnalysisAssignments(profile) → ('fused' | 'company+learner')` avec tests.

### F-ANB-05 — Stockage + PDF horodaté Qualiopi (Must) — **nouveau (PDF)**
Réponses déjà stockées (`questionnaire_responses`). Ajouter un **générateur PDF** (modèle `generate-convention-pdf.ts`) produisant un PDF horodaté des réponses (questions + réponses + date/heure + identité), stocké dans le bucket `documents` (`kind='questionnaire'`), accessible/exportable. Route `/api/dossiers/[id]/questionnaire/[assignmentId].pdf` (gestionnaire) — calque des routes PDF existantes (avec log d'accès si #1 mergé).

### F-ANB-06 — Relance automatique (Should) — **nouveau (cron)**
Étendre `api/cron/transactional-emails/route.ts` (ou nouveau cron) : sélectionner `questionnaire_assignments` `status ∈ (pending,in_progress)` avec `due_at` dépassé (ou X jours sans réponse), envoyer un rappel via Resend (`templates.ts`), incrémenter `reminders_sent`, MAJ `last_reminder_at`, avec un **plafond** (ex. 3 relances) et un intervalle min. Idempotence via `last_reminder_at`.

### F-ANB-07 — Remplir au J1 (Should) — **nouveau**
Si les coordonnées apprenant ne sont pas connues à la signature du devis → **bascule J1** : pas d'assignation par email à l'apprenant ; à la place, l'assignation est marquée « à réaliser en séance » et **remplissable par le formateur** (espace formateur `/mes-sessions` ou `/formateur`) au 1er jour, pour le compte de l'apprenant (`recipient_kind` reste learner, saisie via le formateur authentifié). Mécanisme : un flag sur l'assignment (`metadata.fill_mode='j1_trainer'`) + une vue de saisie côté formateur.

## Règles de gestion (enforcement)

- **ANB avant dossier d'entrée** : déjà bloqué par le gate Qualiopi `entry` (positionnement requis). Étendre la règle si l'on veut aussi exiger le questionnaire entreprise quand applicable (ajout d'une règle `qualiopi_rules` conditionnelle).
- **Fusion positionnement + besoins** : pratique par défaut (un template fusionné).
- **Bascule J1** : cf. F-ANB-07.

## Modèle de données (minimal)

- (Optionnel, reco) `ALTER TYPE app.questionnaire_kind ADD VALUE 'analyse_besoins_entreprise';` (F-ANB-01).
- Sinon : **zéro nouvelle table** — tout réutilise `questionnaire_*`. Le flag J1 via `assignments.metadata`.
- Seeds : templates système ANB (entreprise + apprenant fusionné) — `questionnaire_templates` (org NULL = système) avec `schema` JSONB.

## Points ouverts (à trancher avant impl.)

1. **Enum kind** `analyse_besoins_entreprise` vs réutiliser `custom` (churn d'enum vs clarté Qualiopi). Reco : nouvel enum.
2. **Contenu des templates** (questions du schema JSONB entreprise + apprenant fusionné) — à fournir par Ismael (métier).
3. **F-ANB-06** : seuils (X jours, nb max relances, canal) à confirmer.
4. **Détection « chef d'entreprise = apprenant »** : d'où vient le rôle du pilote ? (champ contact dirigeant/RH sur l'entreprise/dossier ?) — à préciser pour F-ANB-04.

## ⚠️ Coordination (bloquant pour l'implémentation)

Les **questionnaires sont le terrain actif de la session parallèle** (PR #10 mergée : `sendFunderQuestionnaire`, page réponse template-driven, submit). Implémenter l'assignation/templates ANB maintenant = **collision frontale** (cf. le doublon déjà constaté #13/#14). **Recommandation : implémenter l'ANB après stabilisation/merge du chantier questionnaire parallèle**, en réutilisant leur machinerie de réponse. Les seules pièces isolables sans collision : **F-ANB-05 (générateur PDF)** et **F-ANB-06 (cron de relance)**.

## Ordre d'implémentation suggéré (post-coordination)
1. (si retenu) enum kind + seeds templates ANB. 2. F-ANB-04 orchestrateur (fonction pure + action). 3. F-ANB-07 mode J1. 4. F-ANB-05 PDF. 5. F-ANB-06 cron relance. 6. Règle Qualiopi entreprise conditionnelle. 7. E2E golden path (assignation → réponse → gate débloqué → PDF).
