# Sprint Plan V2 — Capsule IA

**Date :** 2026-05-16
**Scrum Master / Dev solo :** Ismael Lepennec
**Project Level :** 4 (Enterprise — mais en finition, pas en greenfield)
**Total Sprints :** 5 (vs 8 au sprint plan v1)
**Total SP estimés :** ~112 SP
**Période :** 2026-05-18 → 2026-07-24 (~10 semaines)
**Cible pilote V1 production-ready :** fin juillet 2026

> **Pourquoi ce plan V2 :** le sprint plan v1 était basé sur l'hypothèse "projet from scratch". L'[audit code](./bmad-audit-i-a-infinity-of-2026-05-16.md) a révélé ~75% du V1 déjà fonctionnel. Ce plan V2 cible **les dettes critiques + les FRs manquants/partiels**, pas un re-build.

> **Décisions structurantes actées (2026-05-16) :**
> 1. **Edge Functions reportées V2**, Server Actions actées V1 → voir [ADR 0005](./architecture/adr/0005-server-actions-vs-edge-functions.md)
> 2. **Dettes critiques d'abord** (Sprint A "Sanctuary") puis features (Sprints B-E)
> 3. **6 features bonus intégrées au PRD V1.1** → voir [PRD Addendum V1.1](./prd-addendum-V1.1-i-a-infinity-of-2026-05-16.md)

---

## Executive Summary

5 sprints de 2 semaines pour amener Capsule IA de **~75% V1 fonctionnel** à **V1 pilote production-ready**. Sprint A est sanctuarisé sur la dette critique (tests pgTAP + Auth Hook migration + MFA + dispatcher outbox). Sprints B-E livrent les FRs manquants/partiels par groupe cohérent.

**Pilote 1ʳᵉ OF démarrable :** fin juillet 2026 (vs début septembre au plan v1 — **6 semaines plus tôt**).

---

## Capacité (rappel)

- 1 dev solo full-time, 40h/sem → ~12 SP/sem → **24 SP / sprint théorique**
- **22 SP allouables** (buffer 2 SP)
- À recalibrer après Sprint A (vélocité réelle mesurée)

---

## Schedule

| Sprint | Période | Goal résumé | SP commit |
|---|---|---|---|
| **Sprint A — Sanctuary** | 2026-05-18 → 2026-05-29 | **Dette critique** : tests pgTAP RLS + Auth Hook migration + MFA + dispatcher outbox + ADR-0005 | 24 |
| **Sprint B — Dossier orchestration** | 2026-06-01 → 2026-06-12 | Compléter FR-018 (handlers chaînés) + FR-021 (algo sessions) + wizard autosave + cascading | 22 |
| **Sprint C — Documents finition** | 2026-06-15 → 2026-06-26 | Templates DOCX + génération + Realtime émargement + notif preuves manquantes | 22 |
| **Sprint D — Qualiopi exports + Questionnaires + Activate** | 2026-06-29 → 2026-07-10 | FR-037 export audit annuel + FR-040/042 questionnaires + FR-019 activate dossier | 22 |
| **Sprint E — Finitions V1 + onboarding pilote** | 2026-07-13 → 2026-07-24 | FR-005 switch org + FR-009 import CSV + FR-024 notif + FR-053 in-app + polish + pilote | 22 |

---

## Sprint A — Sanctuary (dette critique)

**Période :** 2026-05-18 → 2026-05-29
**Goal :** sécuriser le multi-tenant (tests pgTAP), reproductibilité dev local (Auth Hook), finir MFA, débloquer l'async (dispatcher outbox), acter la décision archi.
**Capacité :** 24 SP — **24 SP commit** (sanctuaire dette tech, pas de buffer)

### STORY-A1 : Tests pgTAP RLS massifs (foundation)

**Priorité :** Must Have (CRITIQUE — NFR-001)
**Estimation :** 13 SP
**FRs adressés :** NFR-001 (multi-tenant RLS strict)

**Contexte :** actuellement 3 fichiers pgTAP pour 41 migrations dont 13 RLS. Risque de fuite cross-tenant non détectée.

**Acceptance Criteria :**
- [ ] Suite pgTAP `rls_cross_tenant_baseline.sql` : pour chaque table avec `organization_id`, vérifier qu'un user d'OF A ne lit/écrit jamais les rows d'OF B (en boucle automatique sur toutes les tables `app.*` via `information_schema`)
- [ ] 5 fichiers `rls_by_role_<role>.sql` (owner, admin, gestionnaire, formateur, comptable) : pour chaque rôle, asserter les opérations autorisées et refusées sur 6 tables critiques (`learners`, `companies`, `dossiers`, `documents`, `invoices`, `attendance_signatures`)
- [ ] Test pgTAP `rls_apprenant_token_access.sql` : valider que les RPCs publiques (`record_attendance_signature`, `get_signature_context`, `submit_learner_complaint`) refusent toute opération hors du scope du token
- [ ] Test pgTAP `rls_anonymous_writes.sql` : valider que les RPCs publiques anonymes (inscription prospect) ne peuvent qu'écrire et pas lire
- [ ] CI : `pnpm db:test` exécuté à chaque PR, échec bloque le merge
- [ ] Documentation `supabase/tests/README.md` : comment ajouter un nouveau test pgTAP

**Technical Notes :** Helper `_helpers.sql` existant (`set_jwt`, `as_authenticated`, etc.). Pour le test cross-tenant automatique, utiliser `pg_class` + `information_schema.columns` pour boucler.

**Dépendances :** —

---

### STORY-A2 : Auth Hook migration miroir + test

**Priorité :** Must Have (reproductibilité dev local + audit)
**Estimation :** 3 SP
**FRs adressés :** NFR-011, soutient toutes les RLS

**Contexte :** Auth Hook custom JWT claims configuré côté Supabase Cloud dashboard, pas en migration. Setup dev local cassé, pas de versioning.

**Acceptance Criteria :**
- [ ] Migration `0042_auth_hook.sql` crée la fonction PL/pgSQL `app.before_token_emit(event jsonb) RETURNS jsonb` (cf. [ADR 0003](./architecture/adr/0003-auth-hook-pl-pgsql.md))
- [ ] Lit depuis `members(user_id, is_default_org = true)` pour récupérer organization_id/role/member_id (ou la première membership active si pas de default)
- [ ] `supabase/config.toml` déclare le hook `[auth.hook.custom_access_token]` pointant vers cette fonction
- [ ] Test pgTAP `auth_hook_claims.sql` : seed user + member, force émission JWT, asserter les 3 claims présents
- [ ] Test pgTAP `auth_hook_multi_org.sql` : user dans 2 orgs, switch `is_default_org`, second JWT a la bonne org
- [ ] Test pgTAP `auth_hook_no_org.sql` : user sans membership, JWT émis sans claims app (pas crash)
- [ ] Comparer la fonction migrée vs celle en dashboard prod : alerter si écart

**Technical Notes :** prudence : déployer en prod **après** vérification que la version migrée est identique à celle en dashboard (sinon login down). Procédure de bascule : (1) merge code + migration en preview, (2) test E2E login OK, (3) merge main + supprimer la config dashboard.

**Dépendances :** STORY-A1 (pour avoir la suite pgTAP qui tournera)

---

### STORY-A3 : MFA TOTP complet (FR-004)

**Priorité :** Must Have
**Estimation :** 5 SP
**FRs adressés :** FR-004

**Acceptance Criteria :**
- [ ] Page `(dashboard)/security/mfa` : génère secret TOTP via Supabase Auth MFA API
- [ ] QR code rendu (lib `qrcode`)
- [ ] Vérification du premier code avant activation
- [ ] 10 codes de récupération générés + téléchargeables 1 fois (PDF ou TXT)
- [ ] Middleware Next.js : si rôle ∈ {owner, admin, comptable} ET MFA pas activé ET member.joined_at > 7j → redirect `/security/mfa`
- [ ] Désactivation MFA → entrée `audit.audit_log` + email à tous les owners de l'OF
- [ ] Tests : MFA setup happy path + recovery code + désactivation

**Dépendances :** STORY-A2 (Auth Hook stable)

---

### STORY-A4 : Dispatcher outbox Server Action + pg_cron + ADR-0005

**Priorité :** Must Have (débloque FR-018, FR-040, FR-042, etc.)
**Estimation :** 3 SP
**FRs adressés :** FR-049 (complétion), prépare FR-051

**Contexte :** `infra.domain_events` s'accumule sans handler. Cf. ADR-0005 décision (a) Server Action + pg_cron.

**Acceptance Criteria :**
- [ ] Route `/api/cron/dispatch-events` (App Router) protégée par header `Authorization: Bearer ${CRON_SECRET}`
- [ ] Implémentation : `claim_events_for_dispatch(p_batch int=50)` → boucle → dispatch vers registry handlers → INSERT `processed_events` → si erreur, retry exp `next_retry_at = now() + 2^attempts min`, après 8 essais → `event_dead_letter`
- [ ] pg_cron job : `SELECT cron.schedule('dispatch-events', '* * * * *', $$SELECT net.http_post(...)$$)` (toutes les 1 min)
- [ ] Registry handlers : initialisé avec stubs pour les 6 parcours métier (cf. [04-events-catalog.md](./architecture/04-events-catalog.md)), implémentations détaillées au fur et à mesure
- [ ] Métriques : table `infra.dispatcher_metrics` ou query d'observabilité simple (`COUNT(*) FROM domain_events WHERE next_retry_at IS NULL`, dead letter count)
- [ ] Test integration : insérer 1 event, attendre 90s, vérifier handler exécuté 1× (idempotence)
- [ ] Alerte ops si dead-letter count > 0 (à câbler simple via cron query + email)

**Dépendances :** STORY-A1 (tests RLS doivent protéger les insertions service_role en Server Action)

---

### Sprint A récap

**Stories :** 4 — **Points commit :** 24 / 24 SP (100% utilisation, sprint sanctuaire)

**Livrable démontable :**
- Couverture pgTAP RLS passe de ~2% à ~60-70% (50+ tests)
- Setup dev local 100% reproductible (Auth Hook migré)
- MFA fonctionnelle (login owner exige TOTP après 7j)
- Events `infra.domain_events` traités automatiquement (1 min de latence max)

**Risques :**
- STORY-A1 13 SP = stories la plus lourde de tout le plan V2. Si dérapage 1-2j, accepter et continuer.
- Bascule Auth Hook dashboard → migration = procédure délicate, prévoir window calme + test E2E avant prod.

---

## Sprint B — Dossier orchestration

**Période :** 2026-06-01 → 2026-06-12
**Goal :** terminer EPIC-04 (FR-013/015/018/019/020) + EPIC-05 algorithme sessions (FR-021) + replanification notif (FR-024).
**Capacité :** 22 SP — **22 SP commit**

| Story | FRs | SP | Notes |
|---|---|---|---|
| STORY-B1 Wizard dossier autosave + cleanup TTL | FR-013, FR-020 | 3 | Debounce 1s + pg_cron cleanup 7j |
| STORY-B2 Cascading recalc dates au changement modules | FR-015 | 2 | Event emission + handler recalc dates sessions |
| STORY-B3 `scheduleDossierAction` handlers chaînés | FR-018, partiel FR-040 | 8 | **Plus gros morceau** : créer sessions + envoyer convocations + assigner questionnaire positionnement + créer Zoom meeting si distanciel. Utilise dispatcher Sprint A. |
| STORY-B4 Activate dossier J jour | FR-019 | 2 | Bouton "Activer" disponible J-1, transition manuelle |
| STORY-B5 Algorithme génération sessions par défaut | FR-021 | 3 | Découpage durée totale / 7h max par jour, jours ouvrés paramétrable |
| STORY-B6 Replanification session + notif email | FR-024 | 3 | Event `session.rescheduled` + handler email Resend + update Zoom |
| STORY-B7 Tests E2E golden path "création → activation dossier" | NFR (testing) | 1 | Playwright |

**Total : 22 SP** — tient pile capacité.

**Risque :** STORY-B3 (8 SP) sous-estimé possible. Dépend de la qualité du dispatcher Sprint A.

---

## Sprint C — Documents finition

**Période :** 2026-06-15 → 2026-06-26
**Goal :** terminer EPIC-07 (FR-029 templates DOCX + FR-030 génération) + FR-027 Realtime émargement + FR-038 notif preuves manquantes.
**Capacité :** 22 SP — **22 SP commit**

| Story | FRs | SP | Notes |
|---|---|---|---|
| STORY-C1 Lib génération DOCX (docxtemplater + PizZip) + 5 templates initiaux | FR-029 | 5 | Convention, convocation, attestation, RI, programme |
| STORY-C2 `generate-document` Server Action complète (DOCX + hash + Storage + Gotenberg conditionnel) | FR-030 | 5 | Pour preuves Qualiopi terminales = appel gotenberg (déploiement = STORY-C3) |
| STORY-C3 Déploiement Gotenberg Railway + secret `GOTENBERG_URL` + healthcheck | (infra) | 3 | Cf. [ADR-0004](./architecture/adr/0004-gotenberg-pdf-qualiopi.md). Instance Railway dédiée. |
| STORY-C4 Realtime émargement vue formateur | FR-027 | 2 | Supabase Realtime subscription `attendance_signatures` filtrée par `sheet_id` |
| STORY-C5 Notif preuves Qualiopi manquantes (cron + email) | FR-038 | 3 | pg_cron daily, query `qualiopi_dossier_checklists.status='missing' AND blocking AND age > 7j` |
| STORY-C6 Handler `attach-signature-as-qualiopi-proof` | FR-033 (finition) | 2 | Réutilise dispatcher Sprint A |
| STORY-C7 Tests E2E "génération document + signature" | NFR | 2 | Playwright sur iPhone + Chrome |

**Total : 22 SP**.

**Risque :** déploiement Gotenberg + intégration peut prendre plus que 3 SP si soucis Railway. Mitigation : POC déploiement avant fin sprint B (1 demi-journée).

---

## Sprint D — Qualiopi exports + Questionnaires + Activate

**Période :** 2026-06-29 → 2026-07-10
**Goal :** FR-037 (export audit annuel — feature lourde), FR-040 assignation auto + FR-042 relances questionnaires (réutilise dispatcher Sprint A), FR-019 activate (si pas fait Sprint B).
**Capacité :** 22 SP — **22 SP commit**

| Story | FRs | SP | Notes |
|---|---|---|---|
| STORY-D1 Export audit Qualiopi annuel (ZIP) | FR-037, FR-045 (fusion réclamations) | 8 | Job async via dispatcher : sélection période → ZIP (index PDF + dossiers/ + questionnaires.csv + complaints.csv) → signed URL TTL 24h. **Plus gros morceau Sprint D.** |
| STORY-D2 Handlers assignation auto questionnaires (positionnement, satisfaction chaud/froid) | FR-040 | 5 | 3 handlers : `dossier.scheduled` → positionnement ; `dossier.completed` → satisfaction chaud + différé satisfaction froid J+90 |
| STORY-D3 Relances questionnaires + expiration cron | FR-042 | 3 | pg_cron daily, relances J+3 et J+7, expiration J+14 |
| STORY-D4 Page apprenant questionnaire (polish + tests) | FR-041 (polish) | 2 | Si dette identifiée en review |
| STORY-D5 Conversion prospect → apprenant + dossier | FR-PR-003 | 3 | Bouton conversion + pré-remplissage wizard |
| STORY-D6 Tests E2E "cycle questionnaires complet" | NFR | 1 | Playwright |

**Total : 22 SP**.

**Risque :** STORY-D1 (export) 8 SP est risqué si volume données ZIP > limites Railway. Mitigation : streaming + paginé.

---

## Sprint E — Finitions V1 + onboarding pilote

**Période :** 2026-07-13 → 2026-07-24
**Goal :** FRs résiduels (switch org, import CSV, notif in-app), polish UX + accessibilité, onboarding effectif du 1ʳᵉ OF pilote.
**Capacité :** 22 SP — **22 SP commit**

| Story | FRs | SP | Notes |
|---|---|---|---|
| STORY-E1 Switch organisation multi-org UI | FR-005 | 3 | Dropdown header + Server Action `switchOrganizationAction` + refresh JWT |
| STORY-E2 Import CSV apprenants | FR-009 | 5 | Upload + mapping colonnes + preview + import transactionnel |
| STORY-E3 Notifications in-app cloche + dropdown + Realtime | FR-053 | 3 | Composant header + subscription Realtime `app.notifications` |
| STORY-E4 Polish UI + accessibilité (audit Axe pass sur toutes pages publiques) | NFR-009 | 3 | Charte UI v3 enforced, contrast checker |
| STORY-E5 Cleanup dette technique mineure (lint warnings, dead code) | — | 2 | Hygiène |
| STORY-E6 Documentation pilote (`docs/runbooks/onboarding-pilote.md` + `docs/getting-started-OF.md`) | — | 2 | Pour Ismael + pour pilote |
| STORY-E7 Onboarding 1ʳᵉ OF pilote (accompagnement, hotfixes, support) | — | 4 | **Réservé pour réactivité réelle.** Pas du dev mais du run pilote. |

**Total : 22 SP**.

**Risque :** STORY-E7 (onboarding pilote) absorbe les imprévus inévitables au démarrage. Si pas utilisé, transférer à un sprint F de polish.

---

## Epic Traceability V2 (reste à faire)

| Epic | FRs reste à faire | SP V2 |
|---|---|---|
| EPIC-01 Identity | FR-004 MFA, FR-005 switch | 8 (A3 + E1) |
| EPIC-02 CRM | FR-009 import CSV | 5 (E2) |
| EPIC-03 Catalog | — | 0 |
| EPIC-04 Dossier | FR-013/015/018/019/020 polish + orchestration | 13 (B1-B5) |
| EPIC-05 Scheduling | FR-021/024 | 6 (B5-B6) |
| EPIC-06 Attendance | FR-027 realtime | 2 (C4) |
| EPIC-07 Documents | FR-029/030 + Gotenberg | 13 (C1-C3, C6) |
| EPIC-08 Qualiopi | FR-037 export, FR-038 notif | 11 (C5 + D1) |
| EPIC-09 Questionnaires | FR-040/042 | 8 (D2-D3) |
| EPIC-10 Complaints | FR-045 (fusion D1) | 0 (inclus D1) |
| EPIC-11 Billing | — | 0 |
| EPIC-12 Automation | Dispatcher + handlers | 3 (A4) |
| EPIC-13 Notification | FR-053 in-app | 3 (E3) |
| EPIC-14 Prospects (V1.1) | FR-PR-003 conversion | 3 (D5) |
| EPIC-15 Espace apprenant (V1.1) | — (DONE) | 0 |
| EPIC-16 Trainer experience (V1.1) | — (DONE) | 0 |
| **Dette technique** | NFR-001 RLS tests, Auth Hook migration, ADR-0005 | 19 (A1-A2 + A4 partiel + E4) |
| **TOTAL** | | **~112 SP** ✓ |

---

## Risks V2

### Risques élevés

**R1 — Sprint A pgTAP (13 SP) sous-estimé**
- Probabilité : Moyenne
- Impact : décale Sprint B
- Mitigation : démarrer par la suite cross-tenant baseline (la plus rentable) ; si dérapage, descoper les tests par rôle non-critiques au Sprint E

**R2 — Auth Hook bascule dashboard → migration casse le login en prod**
- Probabilité : Faible
- Impact : catastrophique
- Mitigation : déployer en preview Supabase d'abord, test E2E login complet, puis prod avec window calme + rollback documenté

**R3 — STORY-B3 orchestration handlers sous-estimé (8 SP)**
- Probabilité : Moyenne
- Impact : décale Sprint C
- Mitigation : démarrer dès le 1ᵉʳ jour Sprint B avec mock handlers, raffiner ensuite

### Risques moyens

**R4 — Export audit Qualiopi (STORY-D1, 8 SP) limites Railway sur ZIP volumineux**
- Mitigation : POC streaming dès Sprint C si possible
- Fallback : signed URL temporaire vers stockage S3 si > 100 Mo

**R5 — Vélocité 24 SP/sprint hypothétique**
- Recalibrer après Sprint A (mesure réelle)
- Si réel = 18 SP, ajouter Sprint F (~1 sprint), pilote → mi-août au lieu de fin juillet

---

## Definition of Done (par story)

- [ ] Migration SQL appliquée (si applicable) + appliquée localement et en preview
- [ ] Code TypeScript (domain → application → infrastructure → ui) suit conventions CLAUDE.md
- [ ] Tests : domain 100% (Vitest), RLS pgTAP, intégration repos critiques, E2E golden path si feature visible
- [ ] Lint + typecheck + format pass (CI vert)
- [ ] Self-review checklist serrée
- [ ] Documentation : commentaires invariants non-triviaux + update doc archi si décision structurante
- [ ] Déployée en staging (Railway preview) + smoke test manuel
- [ ] Merge `main` → déployé prod via Railway + smoke test post-deploy
- [ ] Acceptance criteria validés à la main

---

## Sprint Cadence (rituels solo, rappel)

- Lundi semaine 1 : sprint planning (raffinement stories sprint courant)
- Quotidien : stand-up perso 5 min
- Vendredi semaine 1 : revue mi-sprint
- Vendredi semaine 2 : sprint review + retro 30 min

---

## Next Steps

**Immédiat (avant Sprint A) :**
1. Lire ce sprint plan V2 + ADR-0005 + addendum PRD V1.1 + audit
2. Valider chiffres (capacité, dates, scope)
3. Provisionner ce qui manque côté infra : compte Resend si pas fait, secret `CRON_SECRET` à générer
4. Recruter en parallèle le 1ʳᵉ OF pilote (action commerciale)

**Sprint A (2026-05-18) :**
- Démarrer par STORY-A1 (tests pgTAP) — le plus gros morceau, à attaquer pendant que la motivation est haute
- En parallèle : STORY-A2 (Auth Hook migration) peut être faite en dev local avant bascule prod fin de sprint

**À chaque début de sprint suivant :**
- Recalibrer vélocité (réel vs estimé Sprint A)
- Raffiner stories haut-niveau
- Ajuster scope si dérapage

---

*Ce sprint plan V2 supplante `docs/sprint-plan-i-a-infinity-of-2026-05-16.md` (obsolète). Pour suivi : `docs/sprint-status.yaml` (à mettre à jour avec Sprint A).*
