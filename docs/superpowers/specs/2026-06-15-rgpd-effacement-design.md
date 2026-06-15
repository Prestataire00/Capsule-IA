# Droit à l'effacement RGPD (anonymisation) — Design

> Statut : validé en brainstorming, prêt pour plan.
> Date : 2026-06-15 · Contextes bornés : `identity`/`crm` (learners, prospects) + transverse PII.
> Module produit : 8 « Sécurité & RGPD » — voir `docs/securite/checklist-rgpd-config.md` (§3.4).

## 1. Problème

Un apprenant ou un prospect peut exercer son **droit à l'effacement** (art. 17 RGPD). Aujourd'hui
il n'existe **aucune feature** : l'opération serait manuelle (SQL ponctuel), risquée et non tracée.
Il faut une commande **admin-only, journalisée, atomique** qui efface les données personnelles
d'une personne tout en respectant les **obligations légales de conservation** qui priment sur
l'effacement (art. 17.3.b RGPD) : émargements/assiduité (3 ans Qualiopi/financeurs), pièces
comptables (10 ans).

## 2. Constat d'audit

- `app.learners.anonymized_at TIMESTAMPTZ NULL` **existe déjà** (`0004_crm.sql:65`) avec son index
  unique conditionnel `ux_learners_org_email … WHERE deleted_at IS NULL AND anonymized_at IS NULL`
  → le marqueur est prêt, il manque la logique.
- `app.prospects` est soft-deletable (`deleted_at`) mais **n'a pas** de `anonymized_at` → à ajouter.
- Audit prêt : `audit.audit_log` (`0023_rls_billing_infra_audit.sql:119`), policy `is_admin_or_owner()`.
- Helpers RLS : `app.is_admin_or_owner()`, `app.current_organization_id()`, `app.current_role()`
  (`0018_rls_helpers.sql`).
- Pattern de purge SQL programmée déjà en place : cron IP-retention `0040_attendance_ip_retention.sql`
  (UPDATE … SET signer_ip = NULL …) → modèle réutilisé.
- Server Action de référence (admin + résolution org) : `convertProspect` dans
  `apps/web/app/(dashboard)/prospects/actions.ts` (`resolveAdminOrgId`, Zod partagé, `authActionClient`).
- Surface PII (roots + tables liées) cartographiée : voir §4.

## 3. Décisions (brainstorming)

| Décision | Choix |
|---|---|
| Sémantique | **Anonymisation en place** : scrub des identifiants directs, conservation des enregistrements légaux pseudonymisés. Irréversible. |
| Périmètre personnes V1 | **Apprenants + prospects** (formateurs/contacts plus tard) |
| Dossier actif | **Bloquer** l'anonymisation tant qu'un dossier `status='active'` existe |
| Point d'entrée | **Action contextuelle** sur la fiche apprenant & prospect (admin-only, AlertDialog, saisie du nom) |
| Preuve | **Entrée `audit.audit_log` seule** (pas de certificat PDF en V1) |
| Architecture | **Fonction Postgres `SECURITY DEFINER` + Server Action wrapper** (atomicité multi-tables) |
| Nom sur conventions signées | **Conservé** (`document_signatures.signer_name` = partie au contrat exécuté) |
| Réponses questionnaires (`answers`) | **Conservées** pseudonymisées (pas de scrub free-text V1) |

### Hors périmètre (YAGNI, assumé)
- Certificat PDF d'anonymisation ; page « Demandes RGPD » centralisée.
- Anonymisation formateurs/contacts ; scrub du free-text dans `answers` ; cascade prospect→apprenant auto.

## 4. Politique de scrub (qu'efface-t-on / que garde-t-on)

Principe : **effacer les identifiants directs + métadonnées de surveillance (IP/UA) ; conserver les
enregistrements à valeur légale, pseudonymisés.**

### 4.1 Apprenant (`app.learners` = root)

| Table | Action |
|---|---|
| `learners` | **Scrub** : `first_name`→`'Apprenant anonymisé'`, `last_name`→`'#' || substr(id::text,1,8)`, et `email`/`phone`/`birth_date`/`birth_place`/`nationality`/`gender`/`address`/`position`/`education_level`/`cpf_number`/`accessibility_notes`/`notes` → `NULL` si nullable, sinon **tombstone non-identifiant** (ex. `email` `NOT NULL` → `'anon+' || id || '@anonymized.invalid'`). Set `anonymized_at = now()`. |
| `dossiers`, `sessions`, `documents` | **Garde** + scrub d'éventuels **snapshots dénormalisés** nom/email présents dans `metadata` (le plan vérifiera quelles colonnes/clés existent). |
| `attendance_signatures` | **Nullify** `signer_ip`, `signer_user_agent`, `signer_country`. **GARDE** `signature_image_path`, `signature_hash`, `signed_at` (preuve d'assiduité). |
| `document_signatures` | **Nullify** `signer_ip`, `signer_user_agent`. **GARDE** `signer_name`, `signer_email`, image (contrat exécuté). |
| `questionnaire_assignments` | **Nullify** `recipient_email`, `recipient_name` (garde lien `recipient_learner_id`). |
| `questionnaire_responses` | **Nullify** `submitter_ip`, `submitter_user_agent`. **Garde** `answers` (pseudonymisé). |
| `complaints` | **Nullify** `reporter_name`, `reporter_email` (garde la réclamation). |
| `email_log` | **Nullify** `recipient` des lignes de la personne. |
| `notifications` | **Suppression** des lignes référençant la personne (transient, sans valeur légale). |
| `document_access_log`, `resource_access_log` | **Nullify** `ip`, `user_agent`. |
| `exercise_submissions` | **Supprime le blob storage** + nullify `file_path` ; garde `content` (pseudonymisé). |

### 4.2 Prospect (`app.prospects`)

Scrub de tous les champs PII (`first_name`, `last_name`, `email`, `phone`, `birth_date`, `civility`,
`company_name`, `company_siret`, `company_address`, `referent_name`, `referent_email`, `referent_phone`,
`ip_address`, `user_agent`) → `NULL`/tombstone ; set nouveau `anonymized_at = now()`.
Si le prospect est **converti** (a un `converted_dossier_id`/apprenant lié) → on anonymise **seulement
le prospect** et on **affiche un avertissement** côté UI (« converti en apprenant X — à anonymiser
séparément si demandé »). Pas de cascade automatique.

### 4.3 Storage
- **Supprimés** (best-effort, hors transaction) : buckets `prospect-documents`, `learner-submissions`.
- **Conservés** : bucket `signatures` (preuve légale).

## 5. Architecture & flux

```
Fiche apprenant/prospect (admin) ── bouton "Anonymiser (RGPD)" ── AlertDialog (saisir le nom)
        ▼
Server Action  anonymizeLearner / anonymizeProspect   (authActionClient + Zod partagé)
   1. resolveAdminOrgId(ctx.userId)        → Result err forbidden_not_admin si non admin/owner
   2. confirmName === personne.last_name   → name_mismatch sinon
   3. rpc('app.anonymize_learner', { p_learner_id })   ── TRANSACTION ATOMIQUE ──
        ├─ re-check is_admin_or_owner() + org == current_organization_id()   (RAISE)
        ├─ check aucun dossier status='active'                               (RAISE active_dossier)
        ├─ scrub des tables (cf. §4)
        ├─ set anonymized_at = now()
        └─ INSERT audit.audit_log (action='update', before/after/diff, actor_user_id)
   4. storage.remove() best-effort : prospect-documents / learner-submissions
        (échec → console.error, n'annule PAS l'anonymisation DB committée)
   5. revalidatePath(fiche)
        ▼
Result<{ ok }, ErrCode>   → UI succès ou message d'erreur traduit
```

**Atomicité** : tout le scrub DB est dans la fonction = 1 transaction (un scrub partiel est impossible).
Le storage est best-effort post-commit (intrinsèquement non-transactionnel) → résidu loggé si échec.

## 6. Composants

### 6.1 Migration `NNNN_rgpd_anonymization.sql`
> Numéro = `(dernier sur origin/main) + 1` **au moment du push** (collisions fréquentes ; ~0086 au 2026-06-15, à re-vérifier).

- `ALTER TABLE app.prospects ADD COLUMN anonymized_at timestamptz;`
- `app.anonymize_learner(p_learner_id uuid) RETURNS jsonb` — `SECURITY DEFINER`, `SET search_path = app, audit, pg_temp` :
  - garde rôle : `IF NOT app.is_admin_or_owner() THEN RAISE EXCEPTION … ERRCODE='P0401'; END IF;`
  - garde org : la ligne doit appartenir à `app.current_organization_id()` sinon `RAISE … ERRCODE='P0404'`.
  - garde dossier actif : `IF EXISTS(SELECT 1 FROM app.dossiers WHERE learner_id=p_learner_id AND status='active' AND deleted_at IS NULL) THEN RAISE … ERRCODE='P0409'; END IF;`
  - idempotence : si `anonymized_at IS NOT NULL` → retourne `jsonb_build_object('status','already_anonymized')` sans rien refaire.
  - scrub (§4.1) en `UPDATE`/`DELETE` ; capture `before`/`after` pour l'audit.
  - `INSERT INTO audit.audit_log(...)` avec `actor_user_id = app.current_user_id()`.
  - `RETURN jsonb_build_object('status','anonymized', 'tables', <counts>);`
- `app.anonymize_prospect(p_prospect_id uuid) RETURNS jsonb` — mêmes gardes (sans la garde dossier actif), scrub §4.2.
- `GRANT EXECUTE ON FUNCTION app.anonymize_learner(uuid), app.anonymize_prospect(uuid) TO authenticated;`

### 6.2 pgTAP `tests/NNNN_rgpd_anonymization.sql`
1. non-admin (rôle `gestionnaire`) → exception `P0401`.
2. admin d'une autre org sur un learner d'org B → `P0404` (isolation cross-tenant).
3. learner avec dossier `active` → `P0409`.
4. golden : après appel, `learners.first_name='Apprenant anonymisé'` + `anonymized_at` non NULL ;
   `attendance_signatures.signer_ip IS NULL` **ET** `signature_image_path` **inchangé** ;
   1 ligne `audit.audit_log` (action='update', row_id=learner) ; `prospects.anonymized_at` set sur le path prospect.
5. ré-appel → `status='already_anonymized'`, pas de seconde ligne d'audit, scrub non rejoué.

### 6.3 App
- `apps/web/app/(dashboard)/<apprenants|prospects>/rgpd-schema.ts` — Zod partagé :
  `AnonymizeLearnerSchema = z.object({ learnerId: z.string().uuid(), confirmName: z.string().min(1) })`
  (idem `AnonymizeProspectSchema` avec `prospectId`).
- `…/rgpd-actions.ts` — `anonymizeLearner` / `anonymizeProspect` :
  - `authActionClient.schema(...)`, `resolveAdminOrgId(ctx.userId)` (réutilise le helper existant),
  - lecture de la personne (org-scopée) pour comparer `confirmName` au `last_name` → `name_mismatch`,
  - `ctx.supabase.schema('app').rpc('anonymize_learner', { p_learner_id })`, mapping `ERRCODE`→`ErrCode`,
  - storage cleanup best-effort via `supabaseAdmin()` (`prospect-documents`/`learner-submissions`) : `try/catch` qui **logge** et ne renvoie pas d'erreur bloquante,
  - `revalidatePath(...)`, retourne `Result<{ ok: true }, ErrCode>`.
- `…/anonymize-dialog.tsx` — AlertDialog admin-only : explique **gardé** (émargements/conventions = preuve légale) vs **effacé** (identité), champ « saisir le nom de famille pour confirmer », bouton destructif désactivé tant que la saisie ≠ nom. Avertissement « prospect converti » le cas échéant.
- Branchement du bouton dans les fiches **apprenant** et **prospect** existantes (section admin-only).

## 7. Erreurs (`Result<T, ErrCode>`, `throw` réservé aux bugs)

| `ErrCode` | Origine | ERRCODE SQL | Message UI |
|---|---|---|---|
| `forbidden_not_admin` | appelant ≠ owner/admin | `P0401` | « Réservé aux administrateurs » |
| `not_found` | personne inexistante / autre org | `P0404` | « Introuvable » |
| `active_dossier_exists` | ≥1 dossier `active` | `P0409` | « Clôturez/annulez d'abord le(s) dossier(s) en cours » |
| `already_anonymized` | `anonymized_at` déjà set | (retour `jsonb`) | « Déjà anonymisé le … » (no-op) |
| `name_mismatch` | saisie ≠ `last_name` | (action) | « Le nom saisi ne correspond pas » |

Les gardes critiques (`forbidden`, `active_dossier`, cross-tenant) sont re-vérifiées **dans la fonction
SQL**, pas seulement dans l'action, pour qu'un appel RPC direct ne les contourne pas.

## 8. Tests
- **pgTAP** : cf. §6.2 (5 scénarios) — tournent en CI sur vraie Supabase.
- **Vitest** (purs) : validation `AnonymizeLearnerSchema`/`AnonymizeProspectSchema` ; helper comparaison
  nom (trim + insensible à la casse) ; mapping `ErrCode`→message.
- **Manuel (golden path)** : admin ouvre une fiche apprenant clôturé → « Anonymiser (RGPD) » → saisit le
  nom → confirme → fiche affiche « Apprenant anonymisé », émargements toujours visibles (preuve),
  `audit.audit_log` contient l'entrée. Idem prospect (fichiers `prospect-documents` supprimés).

## 9. Ordre de développement (CLAUDE.md)
1. Migration : `prospects.anonymized_at` + fonctions `anonymize_learner` / `anonymize_prospect` (gardes + scrub + audit).
2. pgTAP (5 scénarios §6.2).
3. `pnpm db:types` (mode write-only si Docker indispo → validé en CI).
4. Zod schemas + helper comparaison nom + tests Vitest.
5. Server Actions `anonymizeLearner`/`anonymizeProspect` (RPC + storage best-effort + mapping erreurs).
6. AlertDialog + branchement bouton dans les fiches apprenant & prospect.
7. Golden path manuel.

## 10. Coordination
Feature transverse touchant des tables partagées (`learners`, `prospects`, signatures, questionnaires) :
**claimer** dans `docs/coordination/CLAIMS.md` avant de coder ; brancher depuis `origin/main` ;
re-vérifier le **numéro de migration** libre au push (collisions fréquentes). Aucune zone chaude UI
modifiée en profondeur (ajout d'un bouton/section admin sur les fiches existantes).

Golden path : un OF reçoit une demande d'effacement RGPD, ouvre la fiche de la personne, lance
l'anonymisation en un clic confirmé, et obtient une opération **atomique, tracée et conforme** qui
efface l'identité tout en préservant les preuves légales exigées par Qualiopi et la comptabilité.
