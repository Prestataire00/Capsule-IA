# Registre de coordination — instances Claude parallèles

> Ismael fait souvent tourner **2 instances Claude en parallèle** sur le même repo
> (`/Users/anissa/i-a-infinity-of`, même `main` → Railway). Ce registre évite le travail
> en double et les collisions (migrations, fichiers UI partagés).

## Protocole (résumé — détail dans CLAUDE.md § Coordination)
1. **Avant** de démarrer une feature : `git fetch` + lire ce fichier + `git log origin/main --oneline -20`.
2. **Claimer** sa zone ci-dessous (1 ligne) + commit/push, avant de coder.
3. **Juste avant push/PR** : re-`fetch`, re-lire ce fichier, comparer `git show origin/main:<fichier>` à sa version.
4. **Libérer** la ligne (statut `mergé`) une fois la PR mergée.

## Zones « chaudes » (une seule instance à la fois)
`apps/web/app/inscription/**` · pages dossier UI (`app/(dashboard)/dossiers/**`) ·
`apps/web/features/attendance/**` · `app/(dashboard)/page.tsx` (home) · `supabase/migrations/**` (numéros).

## Claims actifs

| Instance | Module / chemins | Branche | Depuis | Statut |
|----------|------------------|---------|--------|--------|
| Opus (doc-categories) | Catégories de modèles de documents : **migration 0093** (`document_categories` + RLS + `document_templates.category_id`, appliquée prod+staging), actions create/delete catégorie, select dans l'éditeur, regroupement par catégorie dans `documents/modeles`. Zone docs (mienne). | feat/document-categories | 2026-06-18 | en cours |
| Opus (docs-phase3) | Docs phase 3 final : (A) envoi PDF par email (`dossiers/[id]/documents` email-actions, attache PDF persisté via SMTP), (B) héritage formation→modèle (**migration 0092** `document_templates.formation_id`, select dans éditeur `documents/modeles`, picker filtré), (C) génération document par IA (`features/documents/templates/generate-with-ai.ts` + action + UI dans onglet documents). Zone docs (déjà mienne). | feat/documents-phase3-final | 2026-06-18 | mergé (PR #54) |
| Opus (e-signature) | E-signature de documents par lien token : helper `shared/lib/document-signature-token.ts`, demande staff `documents/[id]/apercu/signature-actions.ts` + panneau, page publique `(apprenant)/signer/document/[token]` + canvas + action soumission, statut/audit via `document_signatures` existant. **Sans migration.** | feat/document-esignature | 2026-06-18 | mergé (PR #52) |
| Opus (doc-templates) | Système de modèles de documents éditables (façon sosafe) : **migration 0089** (`document_templates.content_html` + `documents.content_html`), moteur de variables/rendu `features/documents/templates/**`, éditeur `(dashboard)/documents/modeles/**`, génération depuis modèle dans `dossiers/[id]/documents/**` (zone chaude — je viens de la livrer en PR #47), page aperçu/impression `(dashboard)/documents/[id]/apercu`. **Migration 0089 appliquée prod+staging.** | feat/document-templates | 2026-06-18 | mergé (PR #48) |
| Opus (cable-dossier) | Câblage réel création de dossier (de-mock wizard `dossiers/nouveau/**` — zone chaude : schema Zod + Server Action `createDossierAction` → RPC `save_dossier`, options Supabase réelles learners/formations+modules/trainers/funders, form RHF 3 étapes) + onglet documents actionnable (`dossiers/[id]/documents/page.tsx` : boutons générer/télécharger via routes PDF existantes). **Sans migration.** | feat/cable-dossier-creation | 2026-06-18 | mergé (PR #47) |
| Opus (logo-capsule) | Nouveau logo Capsule IA (capsule + toque, détouré) partout : assets `public/logo-capsule{,-full}.png` + favicon `app/icon.png` ; `shared/ui/logo.tsx` (icône carrée → sidebars OF + apprenant + login + header formateur) ; 3 templates email. **Sans migration.** | (push direct main) | 2026-06-18 | mergé |
| Opus (lien-inscription) | Lien d'inscription niveau organisme (`/inscription?org=<id>`) + page `parametres/inscription` (lien + snippet bouton) : `app/inscription/page.tsx` (zone chaude), `features/catalog/public-catalog.ts`, `parametres/**`. **Sans migration, mode lien (pas d'iframe).** | feature/lien-inscription-org | 2026-06-15 | mergé (PR #36) |
| Opus (qst-module) | Module Questionnaires F-QST-01/02/04/06/07/08 : éditeur templates (`(dashboard)/questionnaires/**`), affectation apprenant + saisie manuelle (`dossiers/[id]/questionnaires/**` — zone chaude), export PDF, stats, génération IA. **Sans migration.** | feature/questionnaires-module | 2026-06-15 | mergé (PR #34) |
| Opus (F-FAC) | export CSV + payeur subrogation | feature/factures-export | 2026-06-15 | mergé (PR #32) |
| Opus (F-AUT-08) | logs d'envoi email | feature/email-log | 2026-06-15 | mergé (PR #30) |
| Opus (real-login) | Vraie auth email+mot de passe : de-mock `app/(auth)/login/**` (form + actions `login`/`logout` via `signInWithPassword`) + bouton déconnexion dans `shared/components/layout/topbar.tsx`. **Sans migration.** | feature/real-login | 2026-06-17 | mergé (PR #41) |
| Opus (rgpd) | Effacement RGPD (anonymisation apprenants+prospects) : **migration 0087** (`anonymize_learner`/`anonymize_prospect` + `prospects.anonymized_at`), `app/(dashboard)/rgpd/**`, branchement boutons listes apprenants/prospects. **Transverse PII** (lecture seule des autres zones). | feature/rgpd-effacement | 2026-06-15 | mergé (PR #39) |
| _(exemple)_ | `apps/web/app/inscription/**` | `feature/xxx` | 2026-06-14 | libéré |
| Opus (de-mock) | financeurs (de-mock) | feature/financeurs-reels | 2026-06-14 | mergé (PR #21) |
| Opus (de-mock) | de-mock dashboards (apprenants/membres/organisation/questionnaires) | feature/demock-dashboards | 2026-06-15 | mergé (PR #24) |
| Opus (de-mock) | /qualiopi + /mes-sessions | feature/demock-qualiopi-sessions | 2026-06-15 | mergé (PR #26) |
| Opus (éditable+KPI) | paramètres éditables + KPI cliquables | feature/parametres-editables, feature/kpi-clickable | 2026-06-15 | mergé (PR #27, #29) |
| Opus (catalog+dossier) | `dispatch-events/route.ts` + migrations 0073/0074 (garde-fous dossier) ; déjà mergé : prix module, contrat formateur, snapshot prix, catalogue formations, /inscription (org-scopé) | (push direct main) | 2026-06-14 | mergé |
| Opus (catalog+dossier) | `shared/ui/logo.tsx` → wordmark « Capsule IA / par IA infinity » (PR #22 n'avait changé que l'alt, image PNG dit encore IA INFINITY) | (push direct main) | 2026-06-15 | mergé |
| Opus (catalog+dossier) | F-DOC-09 certificat de réalisation : `features/documents/generate-certificat-pdf.ts` + `api/dossiers/[id]/certificat.pdf` + stub espace câblé (sous-lot 3.4, reste = instance //) | (push direct main) | 2026-06-15 | mergé |
| Opus (catalog+dossier) | F-EMA-01 créneaux demi-journée : migration 0082 (RPC `materialize_attendance_slots` + trigger sessions + backfill, DB-only). UI émargement (emarger/mes-sessions) = instance // | (push direct main) | 2026-06-15 | mergé |
| Opus (catalog+dossier) | F-EMA-08 alerte signature manquante : cron `transactional-emails` + `shared/lib/email/attendance-reminder.ts` (notif in-app + email, dédup via notifications, sans migration) | (push direct main) | 2026-06-15 | mergé |
| Opus (catalog+dossier) | F-EMA-04 QR par créneau (backend) : `shared/lib/qr.ts` + endpoint `api/attendance/[sheetId]/qr` (PNG du lien de signature personnalisé, auth RLS, sans migration). UI emarger (`<img>`) = instance // | (push direct main) | 2026-06-15 | mergé |
| Opus (catalog+dossier) | Réconciliation Zoom↔demi-journée : `cron/zoom-sync/route.ts` + `features/attendance/half-day-window.ts` (émargement Zoom par créneau matin/après-midi, sans migration) | (push direct main) | 2026-06-15 | mergé |
| Opus (form-formation) | Formulaire création/édition formation façon SoSafe (5 sections accordéon, extras en `metadata.catalog`) : `features/formations/**`, `app/(dashboard)/formations/nouvelle`+`[id]/edit`, `shared/ui/{accordion-section,rich-text}`. **Sans migration.** | feature/formation-form-sosafe | 2026-06-15 | mergé (PR #28) |
| Opus (form-formation) | Gaps Espace Apprenant F-APP-11 (questionnaire persistant), F-APP-05 (lien Zoom dashboard/sessions), F-APP-04 (signature docs depuis l'espace) : `app/(apprenant)/espace/[token]/**` (questionnaire, sessions, documents) + RPC éventuel. Zone partagée espace = coordonner. **Sans migration.** | feature/espace-apprenant-gaps | 2026-06-15 | mergé (PR #31) |
| Opus (catalog+dossier) | F-FOR-10 satisfaction formateur : migration 0084 (enum), token + `/questionnaire/formateur/[token]`, cron `transactional-emails` (assignation+email), email isolé. Réutilise infra questionnaire. | (push direct main) | 2026-06-15 | mergé |
| Opus (catalog+dossier) | Module 3.12 Reporting (couche données) : migration 0085 vue `v_org_reporting` (7 KPIs : pipeline prospects, dossiers actifs, conformité Qualiopi %, retour questionnaires %, heures réelles vs prévues, CA facturé/encaissé/à encaisser, réclamations). UI home/reporting = instance // | (push direct main) | 2026-06-15 | mergé |
| Opus (catalog+dossier) | RBAC 4.1 : rôles `commercial` (→is_staff) + `referent` (lecture seule, policies SELECT additives) — migration 0086. ⚠️ enum `member_role` étendu → UI `parametres/membres` (instance //) à mettre à jour pour exposer les rôles. | (push direct main) | 2026-06-15 | mergé |
| Opus (catalog+dossier) | 2FA admin (4.1) : gate enforcement dans `shared/lib/supabase/middleware.ts` (AAL2 requis pour admin/owner → redirige vers le flux `/parametres/securite/mfa` existant). Piloté par env `ENFORCE_ADMIN_MFA` (**OFF par défaut** → inerte). Sans migration, sans doublon. | (push direct main) | 2026-06-15 | mergé |
| Opus (catalog+dossier) | Suite audit (disjoint) : pages `/reporting` (consomme `v_org_reporting`) + `/notifications` (table `notifications`) + 2 liens sidebar ; feedback `apprenants/nouveau` (erreurs+loading) ; empty states `apprenants`+`entreprises`. **Sans migration.** Évite home/documents/planning/émargement (instance //). | (push direct main) | 2026-06-15 | mergé |
| Opus (catalog+dossier) | Suite audit 2 (disjoint) : `/reclamations/nouvelle` (saisie réelle + action) → fin du lien mort ; `shared/ui/form-submit.tsx` ; feedback `entreprises/nouvelle` ; sidebar « Réglages »→« Paramètres ». **Sans migration.** | (push direct main) | 2026-06-15 | mergé |
| Opus (fix-404) | Liens 404 « page not found » : liens mock codés en dur (`/dossiers/d-1…`) dans home `(dashboard)/page.tsx`, `/documents`, `/planning`, wizard `nouveau/step-3` → repointés sur listes réelles ; onglet Émargements de-mocké (liste réelle `attendance_sheets` + empty state, lecture seule). **Sans migration.** Détail émargement (câblage composants réels) laissé à l'instance attendance. | fix/demock-404-links | 2026-06-15 | actif |
| Opus (fix-404) | De-mock `/documents` (app.documents + onglets dérivés du statut réel) et `/planning` (calendrier hebdo app.sessions). **Sans migration.** | feature/demock-documents-planning | 2026-06-15 | actif |
| Opus (prod-hardening) | Gate auth dans `shared/lib/supabase/middleware.ts` (visiteur non connecté → /login, routes publiques exemptées) + fix typo `app.memberships`→`members` (page Zoom) + workflow CI `db-migrate.yml` (applique migrations prod sur merge main). **Sans migration.** | fix/prod-hardening | 2026-06-17 | actif |

> Convention numéros de migration : avant d'écrire `supabase/migrations/NNNN_*.sql`,
> prendre `(dernier numéro sur origin/main) + 1` au moment du push, pas du brainstorm.
