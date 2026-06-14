# Design — Playbooks financeurs (envoi assisté par financeur)

**Date** : 2026-06-12
**Statut** : validé (brainstorming) — à transformer en plan d'implémentation
**Scope** : Phase 1 du moteur de playbook financeur

## Problème

Chaque financeur (OPCO, FAF-CA, AGEFIPH, CPF, Pôle Emploi, Région…) a son
propre process : documents à fournir, calendrier d'envoi, conventions
collectives à joindre. Aujourd'hui l'email au financeur est rédigé
**manuellement à chaque dossier** → charge mentale + **risque d'erreur/oubli**.

## Décisions de cadrage (validées)

1. **Niveau d'automatisation** : brouillon assisté + validation humaine (envoi
   en 1 clic, l'humain garde la main — pas d'envoi 100 % auto).
2. **Source des règles** : bibliothèque centrale (système) + override par OF.
3. **Calendrier** : relatif au cycle de vie du dossier/session (ancre + offset).
4. **Conventions collectives** : PDF à joindre, sélectionné par le playbook.
5. **Transport documents** : pièces jointes par défaut, fallback lien
   signed-URL si la taille dépasse un seuil (limite Resend ~40 MB).

## Existant réutilisé (audité)

- `app.funders` (enum `funder_kind`) + `app.dossier_funders` (cofinancement,
  `share_percent`).
- `app.document_templates` : **idiome `organization_id NULL = système` +
  `is_system` GENERATED + `UNIQUE(organization_id, code)`** → c'est exactement
  le pattern « bibliothèque centrale + override par OF ». On le calque.
- `app.documents` / `document_template_versions` + bucket storage `documents`
  (versioning, file_hash) → réutilisé pour la bibliothèque CCN.
- Outbox : `infra.domain_events` → cron `dispatch-events` (retry exponentiel,
  dead-letter, idempotence `processed_events`) → backbone du calendrier.
- `app.notifications` → rappels d'échéance.
- `apps/web/shared/lib/email/templates.ts` + Resend → rendu/envoi email.

## Modèle de données

### Extension enum
`app.funder_kind` += `faf_ca`, `agefiph` (migration dédiée, `ALTER TYPE ADD
VALUE`, hors transaction d'usage).

### `app.funder_playbooks` (calqué sur `document_templates`)
```
id, organization_id (NULL = système), is_system GENERATED ALWAYS,
funder_kind, code, title, description, is_active, version,
created_at, updated_at, deleted_at,
UNIQUE(organization_id, code)
```
Résolution : une ligne org override la ligne système de même `funder_kind`/`code`.

### `app.funder_playbook_steps`
```
id, playbook_id FK, organization_id (denormalisé RLS), step_order INT,
anchor ENUM(dossier_created | session_start | session_end | enrollment | manual),
offset_days INT (signé : -15, 0, +7),
email_subject_template TEXT,
email_body_template TEXT,           -- variables {{stagiaire}}, {{financeur}}, {{dossier}}…
required_document_kinds TEXT[],      -- kinds de document_templates (convention, programme…)
reference_document_codes TEXT[],    -- CCN par IDCC (bibliothèque)
is_required BOOL, notes TEXT
```

### Bibliothèque CCN
Nouveau kind `convention_collective` dans le CHECK de `document_templates`,
`code = IDCC`. Réutilise bucket `documents` + versioning. **Pas de nouvelle table.**

### `app.dossier_funder_tasks` (instance matérialisée = checklist + brouillon)
```
id, organization_id, dossier_id FK, funder_id FK, playbook_step_id FK,
due_date DATE,                      -- calculée : ancre + offset_days
status ENUM(pending|ready|drafted|sent|done|skipped),
draft_subject TEXT, draft_html TEXT,
resolved_attachments JSONB,         -- [{document_id|template_code, path, bytes, transport}]
sent_at, sent_by, resend_message_id, notes,
UNIQUE(dossier_id, funder_id, playbook_step_id)
```

## Orchestration

1. Rattachement financeur (`dossier_funders` via `save_dossier`) → émet
   `domain_event` `dossier.funder_attached`.
2. Handler `materialize_funder_playbook` (registry `dispatch-events`) : résout
   le playbook (override org → sinon système, par `funder_kind`), crée les
   `dossier_funder_tasks`, `due_date = ancre(dates dossier/session) +
   offset_days`. **Idempotent** (UNIQUE + `processed_events`).
3. `session.rescheduled` → recalcule `due_date` des tasks non envoyées.
4. Rappel : quand `due_date` approche, crée une `app.notifications`
   « X à préparer pour [financeur] ».

## Brouillon assisté + envoi

- Server Action `prepareFunderTaskDraft(taskId)` : rend `email_*_template` avec
  les données dossier/financeur/stagiaire ; **résout les pièces jointes**
  (docs `required_document_kinds` du dossier + CCN `reference_document_codes`) →
  `status=drafted`.
- UI : section **Financeurs** dans la page dossier
  (`apps/web/app/(dashboard)/dossiers/[id]/page.tsx`) — par financeur : liste
  des tasks (échéance, statut, docs résolus), boutons « Préparer » puis « Envoyer ».
- Server Action `sendFunderTask(taskId)` : Resend avec PJ (fallback lien
  signed-URL si > seuil) → `status=sent`, `resend_message_id`, `audit_log`,
  émet `dossier.funder_document_sent`.
- Email funder-aware : `email_subject_template`/`email_body_template` du step,
  rendus dans le wrapper HTML existant de `templates.ts` (respecte
  configurable + override, sans dupliquer de template par funder_kind).

## RLS & tests

- Isolation org stricte (pattern existant). Playbooks/steps système (org NULL) :
  lecture pour tous, écriture service-role/seed uniquement. Tasks org-scoped.
- pgTAP : RLS (cross-tenant), résolution playbook (override > système), calcul
  `due_date`, idempotence handler.
- Server Actions : assemblage brouillon (résolution PJ), envoi (statut +
  message_id + fallback lien).

## Hors scope (phase 2+)

- Envoi 100 % automatisé sans validation humaine.
- Configurateur UI des playbooks (phase 1 = seed système + override DB).
- Suivi des accusés de réception / réponses financeur.
- Détection auto de l'IDCC depuis l'employeur du stagiaire.
