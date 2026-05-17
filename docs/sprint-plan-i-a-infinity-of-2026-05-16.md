# Sprint Plan — Capsule IA

> ⚠️ **AVERTISSEMENT (2026-05-16) — DOCUMENT OBSOLÈTE**
>
> Ce sprint plan a été rédigé sans audit du code existant. Il planifie **8 sprints de re-build** de features déjà implémentées en réalité (~70-80% de V1 déjà en prod).
>
> **NE PAS UTILISER POUR DÉMARRER LE DEV.**
>
> Plan réel à venir : `docs/sprint-plan-V2-i-a-infinity-of-2026-05-16.md` basé sur `docs/bmad-audit-i-a-infinity-of-2026-05-16.md`.

**Date :** 2026-05-16
**Scrum Master / Dev solo :** Ismael Lepennec
**Project Level :** 4 (Enterprise)
**Total Stories planifiées :** 15 détaillées (Sprint 0+1) + 6 sprints roadmap = ~55-65 stories au total V1
**Total Points estimés V1 :** ~170 SP (8 sprints × ~22 SP allouables)
**Sprints :** 8 (Sprint 0 fondations + Sprints 1-7 features)
**Status :** OBSOLÈTE — à remplacer par sprint plan V2

---

## Executive Summary

Plan de livraison V1 pilote sur **8 sprints de 2 semaines** (16 semaines = ~3.75 mois) pour un dev solo full-time. Sprint 0 sanctuarisé pour fondations infra critiques (Auth Hook, RLS, outbox, events catalog, Resend, CI). Sprints 1-7 livrent les 13 epics du PRD en respectant la séquence imposée par les dépendances (CORE Dossier sanctuarisé sur 2 sprints, EPIC-04 = 2 sprints consécutifs).

**Approche granularité :** Sprint 0 et Sprint 1 sont **détaillés** (stories + acceptance criteria + estimations). Sprints 2-7 sont en **roadmap** (epics, goal, ordre, capacité estimée) — raffinés en début de sprint à venir. Choix délibéré (CTO/Staff approach) : éviter la fiction de planning détaillé à 4 mois qui sera obsolète à 90% à l'arrivée.

**Cible :** premier OF pilote opérationnel **fin septembre 2026** avec premier dossier clos avant T+30j (cf. métrique TTFDC du PRD).

---

## Team Capacity

| Paramètre | Valeur |
|---|---|
| Dev solo | Ismael (senior, full-time) |
| Heures productives / semaine | 40h |
| Story Point | 1 SP = ~3h dev senior (incl. tests, review, déploiement) |
| Vélocité théorique / semaine | ~12 SP |
| Vélocité par sprint (2 sem) | **~24 SP** |
| Capacité allouable (utilisation 90%) | **~22 SP / sprint** (buffer 2 SP) |

⚠ **Vélocité à recalibrer après Sprint 0** : c'est une estimation a priori sans historique projet. Mesurer Sprint 0 réel et ajuster Sprints 2+ si besoin.

---

## Sprint Schedule

| Sprint | Période | Goal résumé |
|---|---|---|
| **Sprint 0** | 2026-05-18 → 2026-05-29 | **Fondations infra** : Auth Hook + RLS + Outbox + Events + Resend + CI |
| **Sprint 1** | 2026-06-01 → 2026-06-12 | **Identity + démarrage CRM** : signup OF, rôles, MFA, switch org, entreprises/contacts |
| **Sprint 2** | 2026-06-15 → 2026-06-26 | **CRM reste + Catalog** : apprenants, import CSV, formations, modules, formateurs |
| **Sprint 3** | 2026-06-29 → 2026-07-10 | **Dossier CORE part 1** : wizard 3 steps, cycle de vie, modules/formateurs/financeurs |
| **Sprint 4** | 2026-07-13 → 2026-07-24 | **Dossier CORE part 2 + Scheduling** : schedule/activate, sessions, Zoom |
| **Sprint 5** | 2026-07-27 → 2026-08-07 | **Attendance + Documents + Gotenberg** : émargement mobile, génération doc, signatures |
| **Sprint 6** | 2026-08-10 → 2026-08-21 | **Qualiopi + Questionnaires** : checklist, closing, dashboard, export audit, cycle quest. |
| **Sprint 7** | 2026-08-24 → 2026-09-04 | **Réclamations + Billing + polish + onboarding pilote** |

---

## Sprint 0 — Fondations infra (détaillé)

**Période :** 2026-05-18 → 2026-05-29
**Goal :** Poser toutes les briques techniques transverses dont dépendent les 7 sprints suivants. À la fin de Sprint 0, on doit pouvoir créer une feature métier (Identity) sans avoir à ré-écrire d'infra.
**Capacité :** 24 SP allouables — **24 SP commitments** (pile capacité, pas de buffer — sprint sanctuarisé)

### STORY-INF-001 : Setup CI minimal

**Epic :** Infrastructure (transverse)
**Priorité :** Must Have
**Estimation :** 3 SP

**User Story :**
En tant que dev, je veux un pipeline CI qui valide lint + typecheck + tests unitaires + tests pgTAP à chaque PR, pour ne jamais casser main.

**Acceptance Criteria :**
- [ ] GitHub Action `.github/workflows/ci.yml` exécute en parallèle : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm db:test`
- [ ] Build (`pnpm build`) en check séparé
- [ ] Required check sur main (impossible de merger sans CI verte)
- [ ] Cache pnpm + Supabase CLI (temps CI < 5 min)
- [ ] README documente le pipeline

**Technical Notes :** utiliser `pnpm/action-setup`, `supabase/setup-cli`. Pas de E2E Playwright en Sprint 0 (ajout Sprint 1).

**Dépendances :** —

---

### STORY-INF-002 : Auth Hook PL/pgSQL `before_token_emit`

**Epic :** Infrastructure (transverse) — fondation EPIC-01
**Priorité :** Must Have (BLOQUANT tout le reste)
**Estimation :** 5 SP

**User Story :**
En tant que dev, je veux que chaque JWT émis par Supabase Auth contienne les claims `organization_id`, `role`, `member_id` afin que toutes les policies RLS fonctionnent.

**Acceptance Criteria :**
- [ ] Migration SQL `0002_auth_hook.sql` crée `app.before_token_emit(event jsonb) RETURNS jsonb`
- [ ] Lecture depuis `profiles.active_organization_id` + `members(user_id, organization_id)` pour role/member_id
- [ ] Hook déclaré dans `supabase/config.toml` (mode `before-token-emit`)
- [ ] Test pgTAP `auth_hook_emits_claims.sql` : seed 1 user + 1 org + 1 member, force émission JWT, vérifie présence des 3 claims dans le payload
- [ ] Cas multi-org testé : 1 user dans 2 orgs, `active_organization_id` switch, second JWT a la nouvelle org
- [ ] Cas user sans org : JWT émis sans claims app (= rejet UI propre, pas crash)

**Technical Notes :** voir [ADR 0003](./architecture/adr/0003-auth-hook-pl-pgsql.md). PL/pgSQL ~30 lignes. Tests pgTAP critiques car bug ici = login down.

**Dépendances :** STORY-INF-003 (helpers RLS qui consomment les claims)

---

### STORY-INF-003 : RLS helpers SQL de base

**Epic :** Infrastructure
**Priorité :** Must Have
**Estimation :** 3 SP

**User Story :**
En tant que dev, je veux les fonctions SQL helpers (`app.current_organization_id()`, `app.has_role()`, etc.) installées en BDD pour pouvoir écrire des RLS policies dès Sprint 1.

**Acceptance Criteria :**
- [ ] Migration `0018_rls_helpers.sql` crée les 7 helpers documentés dans [05-rls-policies.md](./architecture/05-rls-policies.md) : `current_organization_id`, `current_role`, `current_member_id`, `is_org_member`, `has_role`, `is_admin_or_owner`, `is_staff`
- [ ] Tous marqués `STABLE` (perf)
- [ ] Test pgTAP `rls_helpers.sql` : pour chaque helper, set JWT mock + assert retour
- [ ] Helper `is_dossier_trainer(dossier_id)` reporté à Sprint 3 (dépend de `dossier_trainers` table)

**Dépendances :** —

---

### STORY-INF-004 : Outbox dispatcher MVP

**Epic :** EPIC-12 Automation (Infra Events)
**Priorité :** Must Have
**Estimation :** 5 SP
**FRs adressés :** FR-049 (partiel — version MVP, retry exponentiel et dead letter ajoutés Sprint 2)

**User Story :**
En tant que système, je veux dispatcher les events insérés dans `infra.domain_events` vers leurs handlers avec idempotence stricte, pour que les side-effects soient déclenchés une seule fois en async.

**Acceptance Criteria :**
- [ ] Migration : tables `infra.domain_events`, `infra.processed_events` UNIQUE (event_id, handler_name), `infra.event_dead_letter`
- [ ] RPC `claim_events_for_dispatch(p_batch int)` avec `FOR UPDATE SKIP LOCKED`
- [ ] Edge Function `dispatch-events` : claim batch 50, dispatch vers registry handlers, INSERT processed_events
- [ ] pg_cron toutes les 1 min déclenche l'Edge Fn
- [ ] Test integration : insérer 1 event, attendre 2 min, vérifier handler exécuté 1× (idempotence)
- [ ] **Reporté Sprint 2** : retry exponentiel `attempts++`, `next_retry_at`, dead-letter après 8 essais
- [ ] **Reporté Sprint 2** : métriques (events/min, taux erreur)

**Technical Notes :** MVP en Sprint 0, raffinement Sprint 2 (1 story dédiée hardening). Suffit pour démarrer Sprint 1 avec 1-2 handlers simples (email invitation).

**Dépendances :** STORY-INF-005

---

### STORY-INF-005 : Events envelope + registry + 5 events pilotes

**Epic :** EPIC-12 Automation
**Priorité :** Must Have
**Estimation :** 3 SP
**FRs adressés :** FR-050 (partiel — 5 events au lieu des 57 visés V1)

**User Story :**
En tant que dev, je veux l'infrastructure events typés (enveloppe, registry, parser Zod) en place avec 5 events pilotes pour qu'on puisse en émettre dès Sprint 1.

**Acceptance Criteria :**
- [ ] Fichier `apps/web/features/_events/envelope.ts` : helper `defineEvent`, schema Zod enveloppe
- [ ] Fichier `_events/registry.ts` : `allEventDefs`, `parseDomainEvent`, `schemaByType`
- [ ] 5 events pilotes définis : `identity.organization.created`, `identity.member.invited`, `identity.member.joined`, `identity.mfa.enabled`, `identity.organization.switched`
- [ ] Test unit : émission event invalide rejeté, événement valide parsé
- [ ] Les 52 autres events seront ajoutés au fil des epics (1 PR par event ou par groupe d'events)

**Dépendances :** —

---

### STORY-INF-006 : Resend client + 2 templates + webhook bounce

**Epic :** EPIC-13 Notification
**Priorité :** Must Have
**Estimation :** 3 SP
**FRs adressés :** FR-052 (partiel — 2 templates au lieu de tous)

**User Story :**
En tant que système, je veux un client Resend centralisé avec 2 templates email branded pour pouvoir envoyer les premiers emails (invitation member, MFA activated) dès Sprint 1.

**Acceptance Criteria :**
- [ ] `shared/notification/resend.ts` : client unique, fonction `sendEmail({to, template, data})`
- [ ] 2 templates React Email : `invitation.tsx`, `mfa-enabled.tsx`
- [ ] Branding configurable par OF (logo + couleur primaire — V1 = hardcoded brand par défaut)
- [ ] Route `/api/webhooks/resend` vérifie signature et logue bounces/complaints dans `notification_logs`
- [ ] Test E2E manuel : envoyer email à boîte test, vérifier reception
- [ ] Secret `RESEND_API_KEY` configuré dans Supabase Vault + Railway

**Dépendances :** —

---

### STORY-INF-007 : Seed data + setup README ≤ 15 min

**Epic :** Infrastructure
**Priorité :** Must Have
**Estimation :** 2 SP
**FRs adressés :** NFR-011

**User Story :**
En tant que nouveau contributeur (ou Ismael lui-même sur machine vierge), je veux pouvoir cloner le repo et avoir un environnement de dev opérationnel en moins de 15 min.

**Acceptance Criteria :**
- [ ] `supabase/seed.sql` crée 1 OF "Demo OF" + 1 owner + 1 admin + 1 formateur
- [ ] Script `pnpm setup` qui orchestre : install deps + supabase start + db reset + seed
- [ ] README section "Setup local" testée from-scratch sur machine vierge en < 15 min
- [ ] Documente les secrets nécessaires localement (avec .env.example)

**Dépendances :** STORY-INF-001 (CI), STORY-INF-002 (auth hook), STORY-INF-003 (RLS helpers)

---

### Sprint 0 récap

**Stories :** 7 — **Points commit :** 24 / 24 SP (100% utilisation, sprint sanctuarisé fondations)

**Risques :**
- Auth Hook PL/pgSQL = courbe d'apprentissage si pas familier. **Mitigation :** prévoir 1 jour d'investigation Supabase docs.
- Outbox MVP simplifié : reporter le hardening (retry/dead letter) à Sprint 2 = dette technique acceptée explicitement.

**Livrable démontable :** dev local fonctionnel + 1 user peut se loginer + JWT contient les claims + `dispatch-events` traite un event de test + email Resend envoyé.

---

## Sprint 1 — Identity complet + démarrage CRM (détaillé)

**Période :** 2026-06-01 → 2026-06-12
**Goal :** EPIC-01 Identity 100% livré + 2 premiers FRs CRM. À la fin de Sprint 1, un OF peut être créé, ses membres invités et MFA activée, et on peut commencer à saisir entreprises clientes.
**Capacité :** 22 SP allouables — **22 SP commitments**

### STORY-001 : Signup organisation + onboarding wizard

**Epic :** EPIC-01 Identity
**Priorité :** Must Have
**Estimation :** 5 SP
**FRs adressés :** FR-001

**User Story :**
En tant que fondateur d'OF, je veux créer mon organisation en moins de 5 minutes pour commencer à utiliser l'outil immédiatement.

**Acceptance Criteria :**
- [ ] Migration `0003_identity.sql` crée tables `organizations`, `profiles`, `members`, `invitations` avec RLS enabled+forced
- [ ] RLS policies pour ces 4 tables (1 par opération, pgTAP)
- [ ] Page `/onboarding/organization` (server component + form RHF+Zod) : nom, SIRET (validation format + appel INSEE optionnel), adresse, NDA Qualiopi
- [ ] Server Action `signupOrganizationAction` : crée org + member owner + UPDATE `profiles.active_organization_id`
- [ ] Refresh JWT côté client après création (claims org/role posés)
- [ ] Event `identity.organization.created` émis (handler stub Sprint 1, logique métier ajoutée Sprint 6 pour Qualiopi init)
- [ ] Première connexion sans org → redirect onboarding (middleware)

**Technical Notes :** valider unicité SIRET au niveau DB (UNIQUE constraint) avec message d'erreur user-friendly.

**Dépendances :** STORY-INF-002, STORY-INF-003

---

### STORY-002 : Matrice rôles + permissions

**Epic :** EPIC-01 Identity
**Priorité :** Must Have
**Estimation :** 3 SP
**FRs adressés :** FR-002

**User Story :**
En tant qu'owner, je veux que chaque rôle (owner, admin, gestionnaire, formateur, comptable) ait des permissions strictement définies au niveau DB pour qu'il n'y ait aucune fuite cross-rôle.

**Acceptance Criteria :**
- [ ] Enum Postgres `member_role` (5 valeurs) — créé en STORY-001 mais on documente ici
- [ ] Documentation matrice permissions : `docs/architecture/roles-matrix.md` (qui peut quoi par opération sur quelle ressource)
- [ ] Tests pgTAP : 1 fichier par rôle (`rls_owner.sql`, `rls_admin.sql`, etc.) qui assert chaque opération critique
- [ ] Composant React `<Can role="..." />` ou `<Can anyOf={[...]} />` dans `shared/ui/`
- [ ] Server Actions wrappées via `requireRoles([...])` helper

**Dépendances :** STORY-001, STORY-INF-003

---

### STORY-003 : Invitations email avec lien sécurisé

**Epic :** EPIC-01 Identity
**Priorité :** Must Have
**Estimation :** 3 SP
**FRs adressés :** FR-003

**User Story :**
En tant qu'owner, je veux inviter un membre par email avec un lien valable 7 jours pour qu'il rejoigne mon OF.

**Acceptance Criteria :**
- [ ] Page `/team/invite` : formulaire email + role select
- [ ] Server Action `inviteMemberAction` : INSERT `invitations` (token HMAC JWT TTL 7j, single-use)
- [ ] Email envoyé via Resend template `invitation.tsx` (STORY-INF-006)
- [ ] Page `/invitation/[token]` : vérif token, affiche nom OF + rôle, bouton "Accepter"
- [ ] Acceptation : crée user Supabase (si pas existant) + member + UPDATE invitation
- [ ] Event `identity.member.joined` émis
- [ ] Token consommé via INSERT dans `processed_events` (idempotence)

**Dépendances :** STORY-002, STORY-INF-006, STORY-INF-004

---

### STORY-004 : MFA TOTP obligatoire pour owner/admin/comptable

**Epic :** EPIC-01 Identity
**Priorité :** Must Have
**Estimation :** 5 SP
**FRs adressés :** FR-004

**User Story :**
En tant qu'owner/admin/comptable, je veux activer un second facteur TOTP pour sécuriser mon accès au compte.

**Acceptance Criteria :**
- [ ] Page `/security/mfa` : génère secret TOTP via Supabase Auth + QR code (lib `qrcode`)
- [ ] Vérification du premier code avant activation
- [ ] Génération de 10 codes de récupération, téléchargeables 1 fois (PDF ou TXT)
- [ ] Middleware : si rôle ∈ {owner, admin, comptable} ET MFA pas activé ET membre >7j → bloquer accès dashboard, redirect `/security/mfa`
- [ ] Désactivation MFA : audit log + email à tous les owners de l'OF
- [ ] Event `identity.mfa.enabled` émis (handler stub)
- [ ] Email Resend "MFA activée" envoyé (template STORY-INF-006)

**Technical Notes :** Supabase Auth supporte TOTP nativement depuis `@supabase/supabase-js` v2.27+ → utiliser API officielle, pas re-implémenter.

**Dépendances :** STORY-002, STORY-INF-006

---

### STORY-005 : Switch organisation multi-org

**Epic :** EPIC-01 Identity
**Priorité :** Should Have (mais inclus V1 pour cohérence Auth Hook)
**Estimation :** 3 SP
**FRs adressés :** FR-005

**User Story :**
En tant que consultant rattaché à plusieurs OF, je veux basculer entre mes organisations sans me reconnecter.

**Acceptance Criteria :**
- [ ] Dropdown header liste les orgs actives de l'utilisateur (query `members WHERE user_id = auth.uid()`)
- [ ] Server Action `switchOrganizationAction(org_id)` : UPDATE `profiles.active_organization_id`
- [ ] Côté client : `supabase.auth.refreshSession()` puis `router.refresh()` pour recharger toutes les queries server avec le nouveau contexte
- [ ] Test pgTAP : 1 user dans 2 orgs, switch, query `dossiers` retourne bien le bon scope par org après switch
- [ ] Event `identity.organization.switched` émis (handler stub)

**Dépendances :** STORY-001, STORY-INF-002

---

### STORY-006 : CRUD entreprises clientes

**Epic :** EPIC-02 CRM
**Priorité :** Must Have
**Estimation :** 3 SP
**FRs adressés :** FR-006

**User Story :**
En tant que gestionnaire, je veux gérer mes entreprises clientes (créer, éditer, archiver, rechercher) pour avoir un référentiel à jour.

**Acceptance Criteria :**
- [ ] Migration `0004_crm.sql` crée `companies` (+ RLS)
- [ ] Pages : `/crm/entreprises` (liste paginée + recherche full-text + filtres) et `/crm/entreprises/[id]` (fiche)
- [ ] Server Actions `createCompanyAction`, `updateCompanyAction`, `archiveCompanyAction` (soft delete)
- [ ] Recherche full-text via `tsvector` sur raison sociale + SIRET
- [ ] Export CSV des entreprises filtrées (Server Action stream)
- [ ] Tests pgTAP RLS : cross-tenant + permissions par rôle

**Dépendances :** STORY-001, STORY-002

---

### STORY-007 : CRUD contacts entreprise

**Epic :** EPIC-02 CRM
**Priorité :** Must Have
**Estimation :** 2 SP (réutilise pattern STORY-006)
**FRs adressés :** FR-007

**User Story :**
En tant que gestionnaire, je veux gérer plusieurs contacts par entreprise (RH, manager, comptable) avec leurs préférences de réception.

**Acceptance Criteria :**
- [ ] Migration `contacts` (+ RLS)
- [ ] Sur fiche entreprise : section "Contacts" avec CRUD inline
- [ ] Flags `receives_invoices`, `receives_certificates`, `receives_planning` (3 booleans)
- [ ] Invariant : au moins 1 contact actif par entreprise (warning si supprimer le dernier)
- [ ] Helper `getCompanyContactFor(company_id, type)` qui sélectionne le bon contact selon le flag

**Dépendances :** STORY-006

---

### Sprint 1 récap

**Stories :** 7 — **Points commit :** 24 / 22 SP (légèrement au-dessus capacité, 4 SP de risque)

⚠ **Surcharge identifiée** : 24 SP commit vs 22 SP capacité. Options :
- (a) Pousser STORY-005 (switch org, Should Have) à Sprint 2
- (b) Réduire scope STORY-004 (MFA codes de récup en V1.1) à 3 SP
- (c) Accepter le risque (planning glissé d'1-2 jours)

**Recommandation :** garder commit à 22 SP en repoussant STORY-005 → ré-évaluation Sprint 2.

**Livrable démontable Sprint 1 :** un OF peut s'inscrire, sécuriser son accès (MFA), inviter ses collaborateurs, et commencer à saisir ses entreprises clientes.

---

## Sprints 2-7 — Roadmap (à raffiner début de chaque sprint)

### Sprint 2 — CRM reste + Catalog (~22 SP)

**Période :** 2026-06-15 → 2026-06-26
**Goal :** CRM complet (apprenants + import CSV) + Catalogue formations utilisable.

**Stories haut-niveau (à raffiner) :**
- STORY-005 (switch org reportée Sprint 1) [3]
- STORY-008 CRUD apprenants (FR-008) [3]
- STORY-009 Import CSV apprenants (FR-009, Should Have) [5]
- STORY-010 Création formations + versioning (FR-010) [3]
- STORY-011 Modules (FR-011) [2]
- STORY-012 Formateurs + compétences (FR-012) [3]
- STORY-INF-008 Outbox hardening (retry exp + dead letter) (FR-049 reste) [3]

Total : 22 SP.

---

### Sprint 3 — Dossier CORE part 1 (~22 SP) **SPRINT À RISQUE**

**Période :** 2026-06-29 → 2026-07-10
**Goal :** Wizard 3-steps fonctionnel + agrégat Dossier en mémoire avec invariants + cycle de vie en BDD.

**Stories haut-niveau :**
- STORY-013 Domain Dossier complet (entité + VO + invariants + events TS) — déjà partiellement écrit dans `features/dossier/domain/` selon doc 03 [5]
- STORY-014 RPC `save_dossier` atomicité agrégat + outbox [5]
- STORY-015 Wizard 3-steps + brouillon `dossier_drafts` (FR-013, FR-020) [5]
- STORY-016 Cycle de vie + machine à états + trigger `guard_dossier_transitions` (FR-014) [5]
- STORY-017 Ajout modules dossier (FR-015) [2]

Total : 22 SP.

⚠ **Risque élevé** : Dossier = CORE produit, complexité métier max. Prévoir 1-2 jours d'imprévus.

---

### Sprint 4 — Dossier CORE part 2 + Scheduling (~22 SP)

**Période :** 2026-07-13 → 2026-07-24
**Goal :** Cycle de vie Dossier complet (schedule, activate, close, reopen) + sessions générées + Zoom.

**Stories haut-niveau :**
- STORY-018 Assignation formateurs (FR-016) [3]
- STORY-019 Financeurs (FR-017) [3]
- STORY-020 `scheduleDossierAction` + handlers events (FR-018) [5]
- STORY-021 `activateDossierAction` + handler kickoff (FR-019) [2]
- STORY-022 Sessions par défaut + calendrier formateur PWA (FR-021, FR-022) [5]
- STORY-023 Zoom integration V1.5 (FR-023) [3]
- STORY-024 Replanification + notif (FR-024, Should Have) [1]

Total : 22 SP.

---

### Sprint 5 — Attendance + Documents + Gotenberg (~24 SP) **SPRINT TENDU**

**Période :** 2026-07-27 → 2026-08-07
**Goal :** Émargement mobile QR fonctionnel bout-en-bout + génération documentaire + signature électronique + déploiement Gotenberg pour PDF Qualiopi.

**Stories haut-niveau :**
- STORY-025 Déploiement Gotenberg Railway + secret + test (ADR-0004) [3]
- STORY-026 Ouverture feuille émargement + tokens JWT (FR-025) [3]
- STORY-027 Edge Fn `sign-document` complète (FR-026 + FR-032 mutualisés) [5]
- STORY-028 Vue temps réel Realtime émargement (FR-027) [2]
- STORY-029 Finalisation feuille + PDF preuve via Gotenberg (FR-028) [3]
- STORY-030 Templates DOCX + upload Storage (FR-029) [2]
- STORY-031 Edge Fn `generate-document` (docxtemplater + hash + Gotenberg conditionnel) (FR-030) [5]
- STORY-032 Demande signature + email + attachement preuve Qualiopi (FR-031, FR-033) [3]

Total : 26 SP — ⚠ **surcharge 4 SP**.

**Options descope :**
- Reporter STORY-024 (replanification) à Sprint 6 si pas fait Sprint 4
- Considérer FR-027 (Realtime) optionnel V1.5
- Accepter glissement 2-3 jours

---

### Sprint 6 — Qualiopi + Questionnaires (~22 SP)

**Période :** 2026-08-10 → 2026-08-21
**Goal :** Cœur de la promesse produit : conformité Qualiopi outillée bout-en-bout + cycle questionnaires complet.

**Stories haut-niveau :**
- STORY-033 Seed 32 indicateurs Qualiopi + checklist par dossier (FR-034) [3]
- STORY-034 `ClosingChecklist` + port `QualiopiReadinessPort` (FR-035) [5]
- STORY-035 Dashboard Qualiopi `/qualiopi` (FR-036) [3]
- STORY-036 Export audit annuel ZIP (FR-037) [5]
- STORY-037 Notif preuves manquantes cron (FR-038, Should Have) [2]
- STORY-038 Templates questionnaires + 3 templates système (FR-039) [2]
- STORY-039 Assignation automatique sur events (FR-040) [3]
- STORY-040 Page apprenant réponse questionnaire (FR-041) [2]
- STORY-041 Relances cron + expiration (FR-042, Should Have) [2]

Total : 27 SP — ⚠ **surcharge 5 SP**.

**Décision V1 :** reporter STORY-037 et STORY-041 (Should Have) en V1.1 si nécessaire → 23 SP.

---

### Sprint 7 — Réclamations + Billing + onboarding pilote (~22 SP)

**Période :** 2026-08-24 → 2026-09-04
**Goal :** Boucler les epics restants (réclamations, billing manuel) + polish UI + préparer onboarding du 1ʳᵉ OF pilote.

**Stories haut-niveau :**
- STORY-042 Ouverture réclamation + investigation (FR-043, FR-044) [3]
- STORY-043 Export réclamations dans audit annuel (FR-045) [1]
- STORY-044 Génération facture sur close dossier (FR-046) [3]
- STORY-045 Édition + validation facture (FR-047) [3]
- STORY-046 Suivi paiement manuel (FR-048) [2]
- STORY-047 Notifications in-app (FR-053, Should Have) [3]
- STORY-048 Handlers métier des 6 parcours intégrés (FR-051 reste) [3]
- STORY-049 Polish UI + accessibilité Axe pass + audit RLS final [3]
- STORY-050 Onboarding 1ʳᵉ OF pilote (docs, accompagnement, hotfixes) [2]

Total : 23 SP — tient.

---

## Epic Traceability

| Epic ID | Epic Name | Stories | Total SP est. | Sprints |
|---|---|---|---|---|
| EPIC-01 | Identity & multi-tenant | STORY-001 à 005 (+ Auth Hook INF-002) | 19 SP | 0-1 |
| EPIC-02 | CRM | STORY-006 à 009 | 13 SP | 1-2 |
| EPIC-03 | Catalogue formations | STORY-010 à 012 | 8 SP | 2 |
| EPIC-04 | Dossier (CORE) | STORY-013 à 021 (+ STORY-016) | 30 SP | 3-4 |
| EPIC-05 | Planification & sessions | STORY-022 à 024 | 9 SP | 4 |
| EPIC-06 | Émargement mobile | STORY-026 à 029 | 13 SP | 5 |
| EPIC-07 | Documents & signature | STORY-025, 030 à 032 | 13 SP | 5 |
| EPIC-08 | Conformité Qualiopi | STORY-033 à 037 | 18 SP | 6 |
| EPIC-09 | Questionnaires | STORY-038 à 041 | 9 SP | 6 |
| EPIC-10 | Réclamations | STORY-042, 043 | 4 SP | 7 |
| EPIC-11 | Facturation | STORY-044 à 046 | 8 SP | 7 |
| EPIC-12 | Automation & events infra | STORY-INF-004, INF-005, INF-008, STORY-048 | 14 SP | 0-2, 7 |
| EPIC-13 | Notifications | STORY-INF-006, STORY-047 | 6 SP | 0, 7 |
| (Transverse) | Infra (CI, RLS helpers, Seed, polish) | INF-001, INF-003, INF-007, STORY-049, 050 | 13 SP | 0, 7 |
| **TOTAL** | | **~50 stories** | **~177 SP** | **8 sprints** |

**Couverture FRs :** 53/53 (toutes adressées).

---

## Risks and Mitigation

### Risques HAUTS

**R1 — Sprint 3 Dossier CORE sous-estimé**
- Probabilité : Haute
- Impact : Décale tous les sprints suivants
- Mitigation : domain `features/dossier/domain/` déjà partiellement écrit (doc 03). Si dérapage, descoper STORY-024 (replanification) Sprint 4 ou reporter STORY-005 plus loin.

**R2 — Vélocité initiale surestimée (24 SP/sprint hypothétique)**
- Probabilité : Moyenne
- Impact : Toute la planification décale
- Mitigation : recalibrer après Sprint 0 (mesure réelle). Si vélocité réelle = 18 SP au lieu de 24, ajouter Sprint 8 et reporter onboarding pilote à mi-octobre.

**R3 — Auth Hook PL/pgSQL bug en prod = login down**
- Probabilité : Faible
- Impact : Catastrophique
- Mitigation : tests pgTAP exhaustifs en CI, procédure de rollback rapide documentée dans `docs/runbooks/deployment.md` (à compléter Sprint 0).

### Risques MOYENS

**R4 — Sprints 5 et 6 en surcharge (26+ SP commit vs 22 capacité)**
- Probabilité : Haute
- Impact : Décalage 2-5 jours
- Mitigation : descoper Should Have (FR-037 notif manquantes, FR-041 relances) en V1.1 si nécessaire. Documenter explicitement la décision en début de sprint.

**R5 — Émargement mobile bug iOS Safari**
- Probabilité : Moyenne
- Impact : Élevé (l'argument de vente n°1)
- Mitigation : POC précoce iOS Safari Sprint 5 (1 demi-journée dédiée), fallback "signature texte" si bug bloquant.

**R6 — Gotenberg single point of failure**
- Probabilité : Faible
- Impact : Élevé (preuves Qualiopi non livrables)
- Mitigation : retry + dead-letter event + livraison DOCX provisoire (cf. ADR-0004). Health-check monitoring Sprint 5.

### Risques BAS

**R7 — Coûts infra dérapent**
- Probabilité : Faible V1
- Impact : Modéré
- Mitigation : dashboard coûts mensuel, cible <200 €/mois (NFR-012). Estimation actuelle ~55-85 $/mois, marge confortable.

**R8 — Pilote demande feature hors scope**
- Probabilité : Haute
- Impact : Modéré
- Mitigation : Out of Scope V1 documenté dans PRD, backlog V2 visible, dire "non, V2" sans culpabiliser.

---

## Dependencies (externes)

| Dépendance | Critique ? | Mitigation |
|---|---|---|
| Templates DOCX initiaux (Qualiopi-compliant) | Oui Sprint 5+ | À récupérer auprès d'OF pilote ou créer en Sprint 4 |
| API Resend opérationnelle | Oui Sprint 1+ | Account créé Sprint 0, monitoring |
| API Zoom V1.5 stable | Non | Fallback : lien manuel |
| Compte Railway production | Oui Sprint 0 | À provisionner avant Sprint 0 |
| Domaine i-a-infinity.com (ou autre) | Oui Sprint 7 | À acheter au plus tard Sprint 6 |
| OF pilote(s) recruté(s) | Oui Sprint 7 | **À démarrer maintenant** en parallèle du dev |

---

## Definition of Done (par story)

Pour qu'une story soit considérée DONE :
- [ ] Migration SQL appliquée (si applicable)
- [ ] Code implémenté (domain → application → infrastructure → ui)
- [ ] Tests : domain 100%, RLS pgTAP, intégration repos critiques, E2E golden path (Sprint 4+)
- [ ] Lint + typecheck + format pass
- [ ] PR reviewée (auto-revue serrée en solo, checklist écrite)
- [ ] Documentation : commentaires sur invariants non-triviaux + update doc archi si décision structurante
- [ ] Déployée en staging (Railway preview) + smoke test manuel
- [ ] Déployée en prod via merge `main` + smoke test post-deploy
- [ ] Acceptance criteria validés à la main

---

## Sprint Cadence (rituels solo)

- **Lundi semaine 1** (start sprint) : Sprint planning (1h max — review carry-over + raffinement stories sprint courant)
- **Quotidien** : stand-up perso 5 min (note vocale ou bullet écrit : "fait hier / fait aujourd'hui / blocages")
- **Vendredi semaine 1** (mid-sprint) : revue de progression (ajustement scope si dérapage évident)
- **Vendredi semaine 2** (end sprint) : Sprint review (démo perso ou à un proche dev) + Sprint retro 30 min (3 bullets : keep/stop/start)

---

## Next Steps

**Immédiat (avant Sprint 0) :**
1. Provisionner compte Railway production
2. Créer compte Resend + obtenir API key
3. Vérifier accès Supabase project (membres équipe si applicable)
4. Recruter 1 OF pilote en parallèle du dev (commercial, pas tech)

**Sprint 0 (2026-05-18) :**
- Lancer `/bmad:create-story STORY-INF-001` pour générer doc story détaillé (optionnel — les stories sont déjà détaillées dans ce sprint plan)
- OU directement `/bmad:dev-story STORY-INF-002` pour attaquer la story Auth Hook (bloquante)

**À chaque début de sprint suivant :**
- Raffiner les stories haut-niveau du sprint en stories détaillées (acceptance criteria + estimation revue)
- Mesurer vélocité réelle vs estimée, ajuster
- Décider explicitement le scope final du sprint

---

*Ce plan a été créé via BMAD Method v6 — Phase 4 (Implementation Planning).*
*Pour suivi : `/bmad:workflow-status` ou consulter `docs/sprint-status.yaml`.*
