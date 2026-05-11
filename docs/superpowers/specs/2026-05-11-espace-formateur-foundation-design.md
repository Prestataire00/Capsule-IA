# Espace Formateur — Foundation (Sous-projet 1/3) — Design

**Date** : 2026-05-11
**Statut** : Spec validée, prêt pour writing-plans
**Bounded context** : `identity` (extension : `trainer-self`)
**Aggregate touchés** : `Trainer` (existant, RLS étendue), `TrainerCompetency` (existant), `TrainerMembership` (read-model, RPC)

---

## 1. Problème

L'espace formateur cible un projet "Espace formateur multi-clients" qui regroupe à terme 4 piliers : (1) planning agrégé multi-OF, (2) dépôt liens Zoom, (3) NDA par dossier, (4) supports pédagogiques. Pour qu'aucun de ces piliers ne soit construit sur du sable, il faut d'abord établir une fondation propre :

- Un **formateur peut être lié à plusieurs OF** (cas freelance + interne mixte) — un `auth.users.id` ↔ N `app.trainers` (1 par OF). Aujourd'hui, `app.trainers.user_id` existe mais aucun mécanisme RLS, RPC ou UI n'expose le cross-OF.
- Le **shell `app/(formateur)/*`** existe à v0.0.1 (layout mobile-first, `mes-sessions`, `emarger`) mais n'a ni page d'accueil, ni switcher d'OF, ni page profil/CV.
- Les **compétences** (`app.trainer_competencies`) sont en base depuis 0006 mais **aucune UI** ne permet au formateur de les consulter ou éditer lui-même.
- L'**onboarding** d'un formateur invité par un OF n'est pas branché : aucun mécanisme automatique ne link une fiche `app.trainers(email=X, user_id=NULL)` à un `auth.users` après signup.

Ce sous-projet 1 livre uniquement la fondation. Le planning agrégé + Zoom est renvoyé au sous-projet 2 ; le NDA + supports au sous-projet 3.

## 2. Décisions structurantes (validées avec utilisateur)

| Sujet | Décision |
|---|---|
| Scope "multi-clients" | **Multi-OF + multi-entreprises** (un `auth.users` ↔ N `app.trainers` cross-tenant, agrégation cross-OF via RPC `security definer`) |
| Modèle UI cross-OF | **Vue agrégée par défaut + switcher optionnel** (cookie `of_focus = organization_id | "all"`) |
| Onboarding formateur | **Magic link Supabase Auth** déclenché à la création de fiche par l'admin OF + linkage `user_id` à la **première visite** de l'espace formateur (pas de trigger cross-schema sur `auth.users`). La page `(dashboard)/formateurs/nouveau` est actuellement un mock — Foundation câble l'INSERT + l'invitation. |
| Compétences cross-OF | **Statu quo (a)** : 1 row par `trainer_id` + bouton "Dupliquer vers mes autres OF". Pas de modèle global `auth.users`-scoped en V1 |
| Permissions self-edit | Le formateur peut UPDATE bio/phone/specialties/avatar uniquement ; `email`/`is_internal`/`hourly_rate_cents`/`siret`/`organization_id` réservés à l'admin OF (trigger BEFORE UPDATE) |
| Approche architecture | **DDD light** aligné CLAUDE.md : nouveau sous-context `features/identity/trainer-self/` avec les 4 couches strictes |

## 3. Architecture

### 3.1 Bounded context

`features/identity/trainer-self/` — nouveau sous-context dédié au self-service formateur, distinct de `features/identity/` qui reste à orientation admin-OF. 4 couches strictes (domain / application / infrastructure / ui), aucune dépendance externe dans `domain`.

**Ports** :
- `TrainerSelfRepository` — load/save sur la fiche `app.trainers` filtrée par `auth.uid()`
- `TrainerCompetencyRepository` — CRUD sur `app.trainer_competencies` scopé self
- `MembershipReader` — appelle la RPC `app.list_my_trainer_memberships()`
- `AvatarStorage` — upload sur bucket `avatars`
- `CompetencyStorage` — upload sur bucket `trainer-cvs`

**Adaptateurs** vers contexts voisins :
- `auth` (lecture `auth.uid()` côté Server Action via `authActionClient`)
- `notification` (V2 — pas en V1) : envoi d'un mail à l'admin OF quand un formateur complète son profil

### 3.2 Entités et value objects

```
TrainerProfile (entité, scopée par (user_id, organization_id))
├─ id: TrainerId
├─ organizationId: OrganizationId
├─ userId: UserId
├─ identity: { firstName, lastName, email (RO), phone? }
├─ bio?: string
├─ specialties: string[] (max 12)
├─ avatarPath?: string
└─ isInternal: boolean (RO)

TrainerCompetency (entité, scopée par trainer_id)
├─ id: CompetencyId
├─ trainerId: TrainerId
├─ kind: 'diploma' | 'certification' | 'experience' | 'cv'
├─ title: string
├─ issuer?: string
├─ obtainedAt?: Date
├─ expiresAt?: Date
├─ documentPath?: string
└─ status (derived): 'valid' | 'expiring_soon' (<90j) | 'expired' | 'no_expiry'

TrainerMembership (read-model, retourné par MembershipReader)
├─ organizationId: OrganizationId
├─ organizationName: string
├─ trainerId: TrainerId
├─ firstName, lastName: string
└─ isInternal: boolean
```

**Branded IDs** : `TrainerId`, `OrganizationId`, `UserId` existent déjà dans [`features/dossier/domain/ids.ts`](apps/web/features/dossier/domain/ids.ts). **`CompetencyId` à ajouter** au même fichier (ou extrait dans `shared/domain/ids.ts` si on veut découpler — décision triviale, à trancher dans le plan).

**Invariants** :
- `TrainerCompetency.expiresAt > obtainedAt` (si les deux renseignés)
- `TrainerProfile.specialties.length <= 12`
- `TrainerProfile.bio.length <= 2000`

### 3.3 Errors (Result<T, E>)

- `MembershipNotFound` — `auth.uid()` n'a aucune ligne `app.trainers`
- `ProfileFieldForbidden(field)` — tentative d'update sur un champ admin-only
- `CompetencyDateInvalid` — `expires_at <= obtained_at`
- `CompetencyNotFound` — id introuvable ou pas owned par le user
- `UploadFailed(reason)` — Storage error

## 4. Modèle de données

### 4.1 Migration `0027_trainer_multi_membership.sql`

Aucune nouvelle table. Index, contrainte, RPC, trigger.

```sql
-- 1) Index pour lookup cross-OF par user_id
CREATE INDEX ix_trainers_user_id
  ON app.trainers(user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;

-- 2) Un user ne peut pas avoir 2 fiches dans le même OF
CREATE UNIQUE INDEX ux_trainers_user_org
  ON app.trainers(user_id, organization_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;

-- 3) RPC security definer : memberships du user courant
CREATE OR REPLACE FUNCTION app.list_my_trainer_memberships()
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  trainer_id UUID,
  first_name TEXT,
  last_name TEXT,
  is_internal BOOLEAN
)
LANGUAGE sql SECURITY DEFINER SET search_path = app, public STABLE AS $$
  SELECT o.id, o.name, t.id, t.first_name, t.last_name, t.is_internal
  FROM app.trainers t
  JOIN app.organizations o ON o.id = t.organization_id
  WHERE t.user_id = auth.uid()
    AND t.deleted_at IS NULL
  ORDER BY o.name;
$$;
GRANT EXECUTE ON FUNCTION app.list_my_trainer_memberships() TO authenticated;

-- 4) Trigger autolink à l'insert/update d'app.trainers
CREATE OR REPLACE FUNCTION app.trainers_autolink_user()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = app, public AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.email IS NOT NULL THEN
    SELECT id INTO NEW.user_id FROM auth.users WHERE email = NEW.email LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tr_trainers_autolink
  BEFORE INSERT OR UPDATE OF email ON app.trainers
  FOR EACH ROW EXECUTE FUNCTION app.trainers_autolink_user();

-- 5) RPC link à la première visite (idempotente)
CREATE OR REPLACE FUNCTION app.link_my_trainer_rows()
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = app, public AS $$
DECLARE
  v_email CITEXT;
  v_count INTEGER;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL THEN RETURN 0; END IF;

  UPDATE app.trainers
  SET user_id = auth.uid(), updated_at = now()
  WHERE email = v_email AND user_id IS NULL AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION app.link_my_trainer_rows() TO authenticated;

-- 6) Trigger garde-fou self-edit
CREATE OR REPLACE FUNCTION app.trainers_self_edit_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Si l'updater est le trainer lui-même (user_id = auth.uid()),
  -- aucun des champs admin-only ne doit changer.
  IF NEW.user_id = auth.uid() AND OLD.user_id = auth.uid() THEN
    IF NEW.email           IS DISTINCT FROM OLD.email           OR
       NEW.is_internal     IS DISTINCT FROM OLD.is_internal     OR
       NEW.hourly_rate_cents IS DISTINCT FROM OLD.hourly_rate_cents OR
       NEW.siret           IS DISTINCT FROM OLD.siret           OR
       NEW.organization_id IS DISTINCT FROM OLD.organization_id
    THEN
      RAISE EXCEPTION 'forbidden field update by trainer self'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tr_trainers_self_edit_guard
  BEFORE UPDATE ON app.trainers
  FOR EACH ROW EXECUTE FUNCTION app.trainers_self_edit_guard();
```

### 4.2 Migration `0028_trainer_rls_multi_membership.sql`

Policies RLS pour permettre au formateur d'accéder à ses propres fiches cross-OF. Les policies admin OF existantes (0019) restent inchangées et coexistent (PostgreSQL combine en OR).

```sql
-- SELECT self (cross-OF)
CREATE POLICY trainers_self_select ON app.trainers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

-- UPDATE self (champs protégés par trigger 0027.6)
CREATE POLICY trainers_self_update ON app.trainers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (user_id = auth.uid());

-- trainer_competencies — full CRUD self
CREATE POLICY trainer_comps_self_select ON app.trainer_competencies
  FOR SELECT TO authenticated
  USING (trainer_id IN (
    SELECT id FROM app.trainers WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));
CREATE POLICY trainer_comps_self_modify ON app.trainer_competencies
  FOR ALL TO authenticated
  USING (trainer_id IN (
    SELECT id FROM app.trainers WHERE user_id = auth.uid() AND deleted_at IS NULL
  ))
  WITH CHECK (trainer_id IN (
    SELECT id FROM app.trainers WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));
```

### 4.3 Buckets Storage

| Bucket | Path pattern | RLS read | RLS write |
|---|---|---|---|
| `avatars` | `${user_id}/avatar.{ext}` | public | owner (path[1] = auth.uid()::text) |
| `trainer-cvs` | `${organization_id}/${trainer_id}/${competency_id}.{ext}` | trainer self + admin OF | trainer self only |

Migration `0029_buckets_trainer_self.sql` : `INSERT INTO storage.buckets`, policies sur `storage.objects`.

### 4.4 Tests pgTAP

`supabase/tests/0028_test_trainer_self_rls.sql` couvre :

- ✅ formateur SELECT ses fiches `app.trainers` cross-OF (≥2 OFs en seed)
- ✅ formateur ne SELECT pas les fiches d'un autre user
- ✅ formateur UPDATE bio/phone/specialties → OK
- ❌ formateur UPDATE email/is_internal/hourly_rate_cents/siret → raise `forbidden field update`
- ✅ admin OF garde tous ses droits sur `app.trainers` de son org
- ✅ formateur CRUD `app.trainer_competencies` sur ses trainer_ids uniquement
- ✅ RPC `list_my_trainer_memberships()` retourne N rows pour un user multi-OF, 0 pour un user sans membership
- ✅ RPC `link_my_trainer_rows()` link les fiches `user_id IS NULL && email=v_email` et est idempotente

## 5. Application layer

### 5.1 Commands

```ts
// features/identity/trainer-self/application/commands/update-trainer-profile.ts
UpdateTrainerProfile {
  input: { trainerIds: TrainerId[], patch: { phone?, bio?, specialties?, avatarPath? } }
  output: Result<void, ProfileFieldForbidden | ValidationError>
  steps:
    1. Pour chaque trainerId : load via TrainerSelfRepository.findById
       (RLS garantit auth.uid() = user_id — un trainerId non owned raise MembershipNotFound)
    2. profile.applyPatch(patch) — domain validations (bio len, specialties len, ...)
    3. TrainerSelfRepository.saveMany(profiles) — UPDATE en une transaction
}

// features/identity/trainer-self/application/commands/add-competency.ts
AddCompetency {
  input: { trainerId, kind, title, issuer?, obtainedAt?, expiresAt?, file?: File }
  output: Result<CompetencyId, CompetencyDateInvalid | UploadFailed>
  steps:
    1. Domain: new TrainerCompetency(...) — vérifie expiresAt > obtainedAt
    2. Si file : CompetencyStorage.upload(file, path) → documentPath
    3. TrainerCompetencyRepository.insert(comp)
    4. Return comp.id
}

// features/identity/trainer-self/application/commands/duplicate-competency-to-orgs.ts
DuplicateCompetencyToOrgs {
  input: { sourceCompetencyId, targetOrganizationIds: OrganizationId[] }
  output: Result<CompetencyId[], MembershipNotFound>
  steps:
    1. Load source comp + verify ownership
    2. Resolve target trainerIds via MembershipReader (filter by targetOrganizationIds)
    3. For each target trainerId : clone comp (copie de documentPath ou re-upload ?)
    4. Insert all, return new IDs
}
```

Note pour `DuplicateCompetencyToOrgs` : on **copie le `document_path` tel quel** (même fichier référencé N fois). Les policies Storage lecture autorisent le trainer self ; les fiches dupliquées appartiennent au même `auth.uid()`, donc l'accès reste valide. Économie d'I/O Storage.

### 5.2 Queries

```ts
ListMyMembershipsQuery → TrainerMembership[]
  └─ via MembershipReader.list() → RPC app.list_my_trainer_memberships()

GetMyProfileQuery({ organizationId }) → TrainerProfile
  └─ via TrainerSelfRepository

ListMyCompetenciesQuery({ trainerId }) → TrainerCompetency[] (groupées par kind, triées par obtained_at desc)

GetCompetencyAlertsQuery({ trainerId }) → { expiringSoon: number, expired: number }
  (utilisé sur le dashboard pour signaler les compétences expirant)
```

### 5.3 Server Actions (next-safe-action)

Toutes wrappées via `authActionClient` (qui injecte `auth.uid()` et un Supabase client RLS-scoped) :

```ts
// app/(formateur)/profil/actions.ts
export const updateProfileAction = authActionClient
  .metadata({ name: 'updateProfileAction' })
  .schema(TrainerProfileSchema)
  .action(async ({ parsedInput, ctx }) => {
    return ctx.commands.updateTrainerProfile.execute({
      trainerId: parsedInput.trainerId,
      patch: parsedInput.patch,
    });
  });

// app/(formateur)/cv/actions.ts
export const addCompetencyAction = ...
export const deleteCompetencyAction = ...
export const duplicateCompetencyAction = ...
```

Schémas Zod **partagés** dans `features/identity/trainer-self/ui/schemas.ts`, importés par les forms RHF et les Server Actions (règle CLAUDE.md §6).

## 6. UI

### 6.1 Arborescence

```
apps/web/app/(formateur)/
├─ layout.tsx                  # EXISTE — enrichir avec <FormateurHeader/> + provider memberships
├─ page.tsx                    # NEW — dashboard d'accueil
├─ profil/page.tsx             # NEW
├─ profil/actions.ts           # NEW
├─ cv/page.tsx                 # NEW
├─ cv/actions.ts               # NEW
├─ mes-sessions/page.tsx       # EXISTE — laissé en l'état (#2 reprend)
└─ emarger/page.tsx            # EXISTE — laissé en l'état

apps/web/features/identity/trainer-self/
├─ domain/
│  ├─ trainer-profile.ts
│  ├─ trainer-competency.ts
│  ├─ branded-ids.ts          # ré-export depuis identity/ existant
│  └─ errors.ts
├─ application/
│  ├─ ports.ts
│  ├─ commands/
│  │  ├─ update-trainer-profile.ts
│  │  ├─ add-competency.ts
│  │  ├─ remove-competency.ts
│  │  └─ duplicate-competency-to-orgs.ts
│  └─ queries/
│     ├─ list-my-memberships.ts
│     ├─ get-my-profile.ts
│     ├─ list-my-competencies.ts
│     └─ get-competency-alerts.ts
├─ infrastructure/
│  ├─ supabase-trainer-self.repository.ts
│  ├─ supabase-trainer-competency.repository.ts
│  ├─ supabase-membership.reader.ts
│  ├─ supabase-avatar.storage.ts
│  └─ supabase-competency.storage.ts
└─ ui/
   ├─ schemas.ts                       # Zod, partagés actions ↔ forms
   ├─ formateur-header.tsx             # Server Component (memberships côté serveur)
   ├─ of-switcher.tsx                  # Client — popover shadcn
   ├─ profile-form.tsx                 # Client — RHF + Zod
   ├─ competency-list.tsx              # Server Component
   ├─ competency-row.tsx               # Client (actions)
   └─ competency-upload-dialog.tsx     # Client — RHF + file input
```

### 6.2 Layout `app/(formateur)/layout.tsx`

```tsx
// ARCHETYPE: shared (mobile-first formateur)
export default async function FormateurLayout({ children }) {
  // 1. Link any pending app.trainers rows (idempotent, no-op si déjà lié)
  await supabase.rpc('link_my_trainer_rows');

  // 2. Load memberships (Server Component, RPC)
  const memberships = await listMyMembershipsQuery.execute();

  // 3. Empty state cross-OF
  if (memberships.length === 0) {
    redirect('/?reason=no-trainer-membership');
  }

  return (
    <MembershipsProvider value={memberships}>
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col">
        <FormateurHeader memberships={memberships} />
        <main className="flex-1">{children}</main>
      </div>
    </MembershipsProvider>
  );
}
```

### 6.3 Composants clés

**`FormateurHeader`** (Server Component)
- Logo `i-a-infinity OF` (lien `/`), titre "Espace formateur", `<OfSwitcher/>`, avatar du user.
- Si 1 seule membership : affiche `Chez {orgName}` en label, pas de switcher.
- Si ≥2 : `<OfSwitcher/>` actif.

**`OfSwitcher`** (Client Component)
- Popover shadcn déclenché par bouton `org_active.name` + chevron.
- Items : "Tous mes OF" (rounded badge multi-couleurs) + une ligne par OF avec puce de couleur (hash déterministe de l'`organization_id`, palette zinc/orange/rose/blue/purple/emerald, jamais bold).
- Sélection : POST sur `app/(formateur)/api/set-focus` (Route Handler) qui set le cookie `of_focus` (httpOnly, sameSite=lax, 1 an).
- `router.refresh()` après set.

**`ProfileForm`** (Client)
- RHF + Zod, défilement vertical mobile-first.
- Avatar uploader en haut (Dropzone shadcn, preview circulaire).
- Champs `firstName/lastName/phone/bio/specialties` éditables, `email/isInternal/hourlyRate/siret` en gris + tooltip "Modifiable uniquement par l'admin OF".
- Sélecteur d'OF cible si memberships.length ≥ 2 : "Appliquer à : [OF actif] [Tous mes OF]". Le toggle "Tous mes OF" passe un array `trainerIds: TrainerId[]` à `updateProfileAction` (la Server Action gère le batch côté serveur dans une transaction, pas de boucle côté UI).

**`CompetencyList`** + `CompetencyRow` + `CompetencyUploadDialog`
- Liste groupée par `kind` (4 sections collapsibles, icône lucide par kind).
- Badge statut : `Valide` (zinc-100) / `Expire dans X j` (purple-200, si <90j) / `Expirée` (red-200) / `Sans expiration` (zinc-50).
- Action menu par row : Voir le document, Modifier, **Dupliquer vers d'autres OF**, Supprimer.
- Upload dialog : kind (radio), title, issuer, dates, file input (PDF/JPG/PNG, max 10 Mo).

### 6.4 Charte UI

Respect strict de `.cursor/rules/70-ui-charter.mdc` :
- Header layout : `command` (déclaré en haut du fichier)
- Dashboard `/` : `workflow` (hero card gradient chaleureux, illustration SVG d'un formateur, max 1 bouton primaire orange "Compléter mon profil")
- `/profil` et `/cv` : `command`
- Tailles 11/12/13/15/17/20 ; 24px sur hero dashboard ; `font-bold` interdit
- Mode sombre obligatoire (testé sur les 5 écrans)

## 7. Sécurité & RLS

| Risque | Mitigation |
|---|---|
| Formateur lit les fiches d'un autre user | Policy `trainers_self_select USING (user_id = auth.uid())` + tests pgTAP positif/négatif |
| Formateur change son `hourly_rate` | Trigger `trainers_self_edit_guard` raise `42501` + test pgTAP négatif |
| Formateur lit le CV d'un autre formateur du même OF | Policy `trainer_comps_self_select` filtre par `trainer_id IN (mes trainers)` ; admin OF garde son accès via policies existantes |
| Auth bypass via cookie `of_focus` | Cookie purement UI — toute query DB passe par RLS qui ignore le cookie. Le cookie ne fait que filtrer côté serveur les lignes que RLS aurait de toute façon renvoyées. |
| Upload de fichier exécutable comme avatar | Validation MIME côté Server Action (`image/png \| image/jpeg \| image/webp`) + taille max 5 Mo |
| Race linkage : OF crée fiche pendant que user signup | Trigger `trainers_autolink_user` (insert/update) + RPC `link_my_trainer_rows` à chaque layout load → convergence garantie |
| Tentative d'appeler la RPC `list_my_trainer_memberships` non-authentifié | `GRANT EXECUTE ... TO authenticated` ; `auth.uid()` retournerait NULL et le WHERE filtre tout |

**Audit trail** : pas de changement en V1 sur la table d'audit (`infra.audit_log` existante). Les UPDATE self-edit y entrent via le trigger générique d'audit déjà en place (0015_triggers).

## 8. Domain events

Aucun event émis en V1. Les events utiles (`trainer.profile_updated`, `trainer.competency_added`) seront émis dans le sous-projet 2 ou 3 quand un consommateur (notification OF, recompute Qualiopi readiness) en aura besoin. **YAGNI strict**.

## 9. Tests

### 9.1 pgTAP (DB)

`supabase/tests/0028_test_trainer_self_rls.sql` — voir §4.4.

### 9.2 Unit (Vitest, domain layer)

`features/identity/trainer-self/domain/*.test.ts` :
- `TrainerProfile.applyPatch` rejette bio >2000 chars, specialties >12
- `TrainerCompetency` rejette `expires_at <= obtained_at`
- `TrainerCompetency.status` derive correctement par rapport à `now()`

### 9.3 Integration (Vitest, application layer avec Supabase test DB)

`features/identity/trainer-self/application/**/*.integration.test.ts` :
- `UpdateTrainerProfile` patch valide
- `UpdateTrainerProfile` rejette patch interdit (mocké via spy sur repo + RLS réelle)
- `AddCompetency` happy path + upload Storage
- `DuplicateCompetencyToOrgs` clone vers 2 OFs

### 9.4 E2E (Playwright)

`apps/web/tests/e2e/trainer-self.spec.ts` :
- **Golden path** : nouveau formateur invité, magic link, premier login → atterrit sur `/(formateur)`, voit 1 carte OF, complète profil, ajoute un CV. Toutes les assertions visuelles + RLS via inspection des `.from('trainers')` côté request.
- **Multi-OF** : seed 2 OFs avec invitations sur même email, signup, vérifier que les 2 fiches sont link, switcher fonctionne, dupliquer une compétence vers les 2 OFs.

## 10. Non-objectifs (renvoyés à #2 et #3)

- **Sous-projet 2 — Planning + Zoom** :
  - Vue calendrier/liste agrégée cross-OF des sessions du formateur
  - Édition `zoom_join_url` / `remote_url` par le formateur
  - Édition `starts_at` / `ends_at` avec audit trail + event `session.modified` consommé par notification OF
  - RPC `app.list_my_sessions(from, to, organization_id?)` security definer
- **Sous-projet 3 — NDA + Supports** :
  - Table `dossier_trainer_ndas` (par (dossier_id, trainer_id)) branchée sur le flow signature 0026
  - Table polymorphe `training_materials` (target_kind ∈ {formation, dossier, session}, target_id) avec Storage + RLS apprenants
  - Workflow upload template NDA par OF, signature par formateur via flow 0026

## 11. Estimation & séquence

| Lot | Contenu | Effort |
|---|---|---|
| L1 | Migrations 0027 + 0028 + 0029 + tests pgTAP | 0.5 j |
| L2 | Domain + application (commands + queries) + tests unit/integration | 1 j |
| L3 | Infrastructure (repositories + storage adapters) | 0.5 j |
| L4 | Shell layout + OfSwitcher + dashboard | 1 j |
| L5 | Page profil + form + Server Action | 0.5 j |
| L6 | Page CV + list + upload dialog + duplication | 1 j |
| L7 | E2E Playwright | 0.5 j |
| **Total** | | **~5 j-dev** |

Séquence : L1 → L2 → L3 → L4 → L5/L6 (parallélisables) → L7. Chaque lot = 1 commit + push origin/main (workflow Railway).
