# Audit code Capsule IA vs PRD BMAD

**Date :** 2026-05-16
**Méthode :** lecture des 41 migrations + arbo `apps/web/features/*` + commits récents + pages `apps/web/app/*` (via agent Explore)
**Statut :** v1 — à valider avec Ismael avant sprint plan V2

> **Pourquoi ce doc existe :** le PRD initial (`docs/prd-i-a-infinity-of-2026-05-16.md`) et le sprint plan v1 (`docs/sprint-plan-i-a-infinity-of-2026-05-16.md`) ont été rédigés sans audit du code et planifient un re-build du projet. Réalité : **~70-75% des features V1 cibles sont déjà fonctionnelles.**

---

## TL;DR

| Indicateur | Valeur |
|---|---|
| Migrations en place | **41** (0001 → 0041) |
| FRs DONE | **31 / 53** (58%) |
| FRs PARTIEL | **15 / 53** (28%) |
| FRs TODO | **7 / 53** (13%) |
| Pages Next.js | ~40 (auth, dashboard, formateur, apprenant, questionnaire publics) |
| Edge Functions implémentées | **0** (tout en Server Actions — drift archi à acter) |
| Tests pgTAP | **3 fichiers** (~2% couverture vs cible NFR-001 = 100%) |
| Features additionnelles hors PRD | **6** (prospects, welcome packet, attestation Qualiopi, trainer multi-org, trainer self-edit, espace apprenant tokenisé) |
| Reste à faire estimé V1 | **~112 SP** (~5 sprints à 22 SP) |

**Lecture :** le projet est très loin d'être à zéro. Le sprint plan v1 (8 sprints, ~177 SP) doit être remplacé par un plan ciblé sur **(1) ce qui manque** + **(2) les dettes techniques critiques** (tests RLS + décision Edge Functions).

---

## Gap analysis par epic

### EPIC-01 Identity (3/5 DONE)

| FR | État | Preuve | Commentaire |
|---|---|---|---|
| FR-001 Signup OF | ✅ DONE | `0003_identity.sql` (organizations), pages `(auth)/signup`, RLS 0016 | Champs SIRET/legal_name/contact_email présents |
| FR-002 Rôles 5 valeurs | ✅ DONE | Enum `member_role` 0002, `members` 0003, helpers `app.has_role()` 0018 | Matrice complète |
| FR-003 Invitations email | ✅ DONE | Table `invitations` 0003 (token_hash + TTL), RLS 0019, Resend confirmé en commits | HMAC + 7j TTL en place |
| FR-004 MFA TOTP | 🟡 PARTIEL | `security_settings` JSONB sur organizations, mais pas de schéma MFA dédié ni page `/security/mfa` | Framework présent, logique à câbler |
| FR-005 Switch org | 🔴 TODO | Pas de page de switch, pas de RPC visible | UI + cookie/JWT refresh logic absent |

### EPIC-02 CRM (3/4 DONE)

| FR | État | Preuve | Commentaire |
|---|---|---|---|
| FR-006 Entreprises | ✅ DONE | `companies` 0004, pages `(dashboard)/entreprises`, soft delete | Recherche full-text en place |
| FR-007 Contacts | ✅ DONE | `contacts` 0004 (is_primary, metadata) | UI non vérifiée mais schéma complet |
| FR-008 Apprenants | ✅ DONE | `learners` 0004, pages `apprenants/[nouveau]`, RQTH + accessibility (I26) | Email = clé naturelle |
| FR-009 Import CSV | 🔴 TODO | Pas d'UI d'import visible | Schéma ready, logique upload/preview à faire |

### EPIC-03 Catalog (3/3 DONE) ✅

| FR | État | Preuve |
|---|---|---|
| FR-010 Formations | ✅ DONE | `formations` 0005 (versioning, is_published, soft delete) |
| FR-011 Modules | ✅ DONE | `modules` 0005, M:M `formation_modules` |
| FR-012 Formateurs | ✅ DONE | `trainers` 0006 (interne/externe), pages `(dashboard)/formateurs/*` |

### EPIC-04 Dossier CORE (3/8 DONE, le plus partiel)

| FR | État | Preuve | Commentaire |
|---|---|---|---|
| FR-013 Wizard 3-steps | 🟡 PARTIEL | Pages `dossiers/nouveau` avec Step1/2/3, `dossier_drafts` 0007 | Composants exist, autosave/validation à vérifier |
| FR-014 Cycle de vie | ✅ DONE | Enum `dossier_status` 0002, `dossier_status_history` 0007, RPC `guard_dossier_transitions` 0024 | Machine à états complète |
| FR-015 Modules dossier | 🟡 PARTIEL | `dossier_modules` 0007, page `[id]/modules` | Pas de cascading recalc dates ni event emission |
| FR-016 Trainers dossier | ✅ DONE | `dossier_trainers` 0007 (is_lead, hourly_rate), RLS `is_dossier_trainer()` 0020 | Module-level pas géré (dossier-level seul) |
| FR-017 Financeurs | ✅ DONE | `dossier_funders` 0007, trigger `check_dossier_funders_share` ≤100% | Multi-financeurs OK |
| FR-018 Schedule + handlers | 🟡 PARTIEL | RPC transition OK, mais **handlers (sessions, convocations, questionnaire, Zoom) pas chaînés** | **BLOQUANT pour FR-021 et FR-040** |
| FR-019 Activate J | 🔴 TODO | Status existe, pas de bouton/RPC pour activation manuelle 24h-before | UX à faire |
| FR-020 Brouillon 7j | ✅ DONE | `dossier_drafts` 0007 (step + payload JSONB) | TTL cleanup pas automatique (à scripter) |

### EPIC-05 Scheduling (1/4 DONE, plusieurs PARTIEL)

| FR | État | Preuve | Commentaire |
|---|---|---|---|
| FR-021 Sessions auto-générées | 🟡 PARTIEL | `sessions` 0008 (starts_at, ends_at, duration GENERATED) | **Pas d'algorithme génération depuis dossier** |
| FR-022 Calendrier formateur | ✅ DONE | Page `(formateur)/mes-sessions`, RLS scope formateur | Vues mois/semaine/jour |
| FR-023 Zoom V1.5 | ✅ DONE | Migration 0032 (`tenant_integrations` + pgsodium config_encrypted), S2S OAuth + refresh, `meeting_id`/`zoom_join_url` sur sessions | **Implémenté en Server Action, pas Edge Fn** |
| FR-024 Replanification | 🟡 PARTIEL | Champs éditables sur sessions, event `session.rescheduled` documenté mais handler email pas câblé | Notif manquante |

### EPIC-06 Attendance (3/4 DONE)

| FR | État | Preuve | Commentaire |
|---|---|---|---|
| FR-025 Ouverture émargement | ✅ DONE | `attendance_sheets` 0008, `attendance_tokens` 0030, page `dossiers/[id]/emargements/[sessionId]` | Tokens JWT en place |
| FR-026 Signature mobile QR | ✅ DONE | RPC `record_attendance_signature` 0024, page `(apprenant)/signer/[token]`, bucket `signatures` 0026 | Capture IP + UA |
| FR-027 Vue temps réel | 🟡 PARTIEL | `attendance_signatures` queryable, mais pas de subscription Realtime/polling visible | À câbler |
| FR-028 Finalisation + PDF Qualiopi | ✅ DONE | `0033_attendance_immutability.sql`, PDF + hash en migration 0009 | Confirmé en commits |

### EPIC-07 Documents & Signature (2/5 DONE, 3 PARTIEL)

| FR | État | Preuve | Commentaire |
|---|---|---|---|
| FR-029 Templates DOCX | 🟡 PARTIEL | `document_templates` + `document_template_versions` 0009 | **Lib génération DOCX (mammoth/docxtemplater) non confirmée** |
| FR-030 Génération à la demande | 🟡 PARTIEL | `documents` 0009 (generation_input/error), page `dossiers/[id]/documents` | Server Action à vérifier complet |
| FR-031 Demande signature | ✅ DONE | `document_signatures` 0009 (request_token_hash + status enum) | Email request via Resend |
| FR-032 Signature email | ✅ DONE | RPC `get_signature_context` 0026, page `(apprenant)/signer/[token]` | Canvas + storage |
| FR-033 Preuve Qualiopi | ✅ DONE | `qualiopi_proofs` 0010, `document_hash_at_signature` 0009 | Lien document ↔ indicateur |

### EPIC-08 Qualiopi (3/5 DONE)

| FR | État | Preuve | Commentaire |
|---|---|---|---|
| FR-034 Checklist 32 indicateurs | ✅ DONE | `qualiopi_indicators` 0010 (32 rows seedées), `qualiopi_dossier_checklists` (is_ready computed) | Detail JSONB + satisfied count |
| FR-035 Closing checklist | ✅ DONE | `is_ready` lu par RPC transition `closed` | Invariant blocking_missing |
| FR-036 Dashboard Qualiopi | ✅ DONE | Page `(dashboard)/qualiopi` | Org-level view |
| FR-037 Export audit annuel | 🔴 TODO | Pas de logique export CSV/XLSX/ZIP visible | Feature à construire |
| FR-038 Notif preuves manquantes | 🟡 PARTIEL | `app.notifications` 0014 (channel email), trigger event → handler pas câblé | Handler incomplet |

### EPIC-09 Questionnaires (2/4 DONE)

| FR | État | Preuve | Commentaire |
|---|---|---|---|
| FR-039 Templates 3 types | ✅ DONE | `questionnaire_templates` 0011 (kind enum, schema JSONB), system templates org_id=NULL | Public form satisfaction en place |
| FR-040 Assignation auto events | 🟡 PARTIEL | `questionnaire_assignments` 0011, mais handlers events non câblés | Lié à FR-018 |
| FR-041 Réponse apprenant | ✅ DONE | `questionnaire_responses` 0011, page `(apprenant)/questionnaire/[token]`, NPS + answers | Token validation OK |
| FR-042 Relances auto + expiration | 🔴 TODO | Pas de pg_cron / event handler visible pour reminders | Scheduler à implémenter |

### EPIC-10 Complaints (2/3 DONE)

| FR | État | Preuve | Commentaire |
|---|---|---|---|
| FR-043 Ouverture | ✅ DONE | `complaints` 0012 (reference, severity, status), pages dashboard + `(apprenant)/espace/[token]/reclamation`, RPC `submit_learner_complaint` 0012 | Workflow apprenant en place |
| FR-044 Investigation/assignation | ✅ DONE | `complaint_events` 0012 (status changes + assignation), page `[id]` détail | assigned_to + resolution |
| FR-045 Export annuel | 🔴 TODO | Pas d'export CSV/XLSX visible | À construire (peut être inclus dans FR-037) |

### EPIC-11 Billing (3/3 DONE) ✅

| FR | État | Preuve |
|---|---|---|
| FR-046 Génération facture | ✅ DONE | `invoices` + `invoice_lines` 0013, page `(dashboard)/factures/[nouvelle]`, Server Action `createInvoice()`, référence FAC-YYYY-RANDOM |
| FR-047 Édition + validation | ✅ DONE | Status enum (draft/issued/paid/cancelled) 0013, page `(dashboard)/factures` (list + actions) |
| FR-048 Suivi paiement manuel | ✅ DONE | `payments` 0013 (method enum incl. stripe pour V2 future), UI recording payments, PDF + email confirmés en commits |

### EPIC-12 Automation (1/3 DONE, 2 PARTIEL)

| FR | État | Preuve | Commentaire |
|---|---|---|---|
| FR-049 Outbox dispatcher | ✅ DONE | `infra.domain_events` 0014, `processed_events` (idempotence UNIQUE), indexes next_retry_at, `event_dead_letter` | **Dispatcher Edge Fn pas implémenté → events s'accumulent ?** |
| FR-050 Events catalog Zod | ✅ DONE (schémas) | Doc `04-events-catalog.md` liste 57 events, payload versioning | **À vérifier que les schemas Zod sont dans le code** |
| FR-051 Handlers 6 parcours | 🟡 PARTIEL | RPCs `record_attendance_signature`, `submit_learner_complaint`, `get_apprenant_dashboard` visibles | Event-driven chaining incomplet |

### EPIC-13 Notification (1/2 DONE)

| FR | État | Preuve | Commentaire |
|---|---|---|---|
| FR-052 Email Resend | ✅ DONE | Fonction `sendEmail()` importée Server Actions, templates welcome-packet/invoices/questionnaires en commits | Confirmé |
| FR-053 Notif in-app | 🟡 PARTIEL | `app.notifications` 0014 (channel in_app), pas d'UI composant cloche/panel visible | Schema ready, frontend absent |

---

## Features additionnelles (hors PRD initial)

| Feature | État | Preuve |
|---|---|---|
| **Prospects / pré-inscription** | ✅ DONE | Migration 0025 (`prospects`, status enum new/contacted/qualified/converted), page publique `/inscription`, RLS écriture anonyme via Server Action |
| **Welcome packet email** | ✅ DONE | Server Action `sendWelcomePacketEmail()` dans `acces-apprenant/actions.ts`, tokens signés inclus |
| **Attestation Qualiopi PDF** | ✅ DONE | Génération PDF visible commits "attestation de réalisation Qualiopi", `documents.kind = 'attestation_fin'` |
| **Trainer multi-membership** | ✅ DONE | Migration 0029 (trainer dans plusieurs orgs), RLS `link_my_trainer_rows` 0036 |
| **Trainer self-edit** | ✅ DONE | Pages `(formateur)/[profil|cv]`, RPC `trainers_self_edit_guard` 0029, Server Actions profile/CV |
| **Espace apprenant tokenisé** | ✅ DONE | Route `(apprenant)/espace/[token]` (documents + sessions + questionnaires + réclamations), pas d'authent user |

→ **Ces 6 features doivent être ajoutées au PRD V2** comme epic supplémentaire ou réparties dans les epics existants.

---

## Dettes techniques majeures

### 🔴 CRITIQUE — D1 : Tests pgTAP ≈ 2% (NFR-001 violée)

**Constat :** 3 fichiers pgTAP (`0029_test_trainer_multi_membership.sql`, `0036_test_trainer_self_rls.sql`, `_helpers.sql`). Pour 41 migrations dont 13 RLS (0019-0023), c'est insuffisant.

**Risque :** fuite cross-tenant non détectée. Bug RLS = catastrophique en multi-tenant (data leak entre OF).

**Reste à faire :** minimum 50 tests pgTAP (5 rôles × 10 opérations critiques sur tables sensibles : `learners`, `companies`, `dossiers`, `documents`, `invoices`, `attendance_signatures`). Estimation : **20 SP** (10j dev).

### 🔴 CRITIQUE — D2 : Edge Functions absentes (architectural drift)

**Constat :** `docs/architecture/07-edge-functions.md` liste : `create-zoom-meeting`, `sign-document`, `generate-pdf`, `dispatch-events`, `expire-questionnaires`, `nightly-cleanup`. **Aucune n'existe dans `supabase/functions/`.** Tout est en Server Actions.

**Conséquences :**
- `service_role` utilisé depuis Server Actions = bypass RLS dans un contexte Next.js (moins isolé que Deno Edge Fn)
- Pas de scale-to-zero pour les workloads asynchrones
- Pas de dispatcher outbox → les events `infra.domain_events` s'accumulent ? (à vérifier en prod)
- Pas de cron `expire-questionnaires`, `nightly-cleanup` → preuves expirées non gérées

**À décider :** soit (a) refacto progressif vers Edge Functions, soit (b) acter le choix Server Actions et update l'archi + ADR + sécuriser les usages `service_role`. **Décision archi à prendre — Open Issue #1 dans le sprint plan V2.**

### 🟡 MOYEN — D3 : MFA TOTP incomplet (FR-004 PARTIEL)

Schéma `security_settings` JSONB présent mais pas de :
- Page `/security/mfa` (génération secret, QR, vérif)
- Codes de récupération (10 codes téléchargeables 1 fois)
- Middleware de blocage après 7j si rôle sensible sans MFA
- Audit log pour désactivation MFA + notif tous les owners

**Estimation :** 5 SP. Lib `speakeasy` ou API Supabase Auth native (depuis v2.27).

### 🟡 MOYEN — D4 : Orchestration events incomplète (FR-018 PARTIEL)

`scheduleDossierAction` valide les invariants mais ne déclenche pas les handlers : créer sessions, envoyer convocations, assigner questionnaire positionnement, créer Zoom. Bloque le golden path métier.

**Estimation :** 8 SP (algorithme génération sessions + 4 handlers chainés + tests E2E).

### 🟡 MOYEN — D5 : Auth Hook en dashboard, pas en migration

Auth Hook (custom JWT claims `organization_id`/`role`/`member_id`) configuré côté Supabase Cloud dashboard. Conséquences :
- Setup dev local impossible sans config manuelle Studio
- Pas de reproductibilité prod ↔ dev
- Difficulté à versionner le hook (1 dev fait évoluer la config sans trace git)

**Reste à faire :** créer migration miroir + test pgTAP émission JWT. **Estimation : 3 SP.**

### 🟡 MOYEN — D6 : Wizard dossier auto-save non confirmé (FR-013/020 PARTIEL)

Tables `dossier_drafts` en place mais pas de :
- Debounce 1s côté React confirmé
- pg_cron pour cleanup TTL 7j
- Test E2E reprise après crash navigateur

**Estimation :** 3 SP.

### 🟢 BAS — D7 : Notifications in-app frontend (FR-053 PARTIEL)

Table `app.notifications` en place, pas de composant cloche/dropdown/Realtime sub côté UI.

**Estimation :** 3 SP.

---

## Recap reste à faire par EPIC

| EPIC | TODO | PARTIEL | SP estimés |
|---|---|---|---|
| 01 Identity | 1 (FR-005 switch org) | 1 (FR-004 MFA) | 8 |
| 02 CRM | 1 (FR-009 import CSV) | 0 | 5 |
| 03 Catalog | 0 | 0 | 0 |
| 04 Dossier | 2 (FR-019 activate, +) | 3 (FR-013, 015, 018) | 13 |
| 05 Scheduling | 1 (FR-021 algo sessions) | 2 (FR-024 notif, FR-027) | 8 |
| 06 Attendance | 0 | 1 (FR-027 realtime) | 3 |
| 07 Documents | 0 | 3 (FR-029/030 génération) | 10 |
| 08 Qualiopi | 1 (FR-037 export audit) | 1 (FR-038 notif) | 8 |
| 09 Questionnaires | 1 (FR-042 relances) | 1 (FR-040 assignation) | 8 |
| 10 Complaints | 1 (FR-045 export, peut fusionner FR-037) | 0 | 3 |
| 11 Billing | 0 | 0 | 0 |
| 12 Automation | 0 | 2 (FR-051 handlers) | 8 |
| 13 Notification | 0 | 1 (FR-053 in-app) | 5 |
| **Dettes techniques** | — | — | **34** (D1 tests RLS = 20 SP, D2 décision Edge Fn variable) |
| **TOTAL** | 8 | 16 | **~112 SP** |

À 22 SP/sprint = **~5 sprints** pour V1 pilote production-ready.

---

## Décisions structurantes à prendre

**À arbitrer avant sprint plan V2 :**

1. **D2 — Edge Functions vs Server Actions** : refactor ou acter le drift ?
2. **Priorisation dettes vs features** : on attaque les 34 SP de dette tech avant ou après les 78 SP de features manquantes ?
3. **Scope du PRD V2** : on intègre les 6 features bonus (prospects, welcome packet, espace apprenant…) au PRD officiel ou on les garde implicites ?

→ Voir sprint plan V2 (à produire après arbitrage).

---

## Conclusion

**Le projet n'est pas "à construire from scratch". Il est à finir + sécuriser.**

- **~75% des features V1 fonctionnelles**
- **Path to pilot V1 production-ready : ~5 sprints réalistes** (vs 8 estimés à blanc dans le sprint plan v1)
- **Blocker n°1 : tests pgTAP** (sécurité multi-tenant)
- **Blocker n°2 : décision Edge Functions vs Server Actions** (architecture drift à acter ou réparer)
- **Le PRD/archi initial reste utile** comme baseline vision/scope. À traiter comme spec cible, pas comme planning.
