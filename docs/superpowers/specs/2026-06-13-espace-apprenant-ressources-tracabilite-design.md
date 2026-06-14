# Espace apprenant — Ressources & traçabilité (Qualiopi)

**Date :** 2026-06-13
**Statut :** Design validé — prêt pour plan d'implémentation
**Sous-projet 1/3** d'un chantier « espace apprenant centralisé » (cf. § Découpage)

---

## Contexte & problème

Constat initial : « aucun espace centralisé apprenant, documents par email, replays nulle part, exercices non tracés », perçu comme une mauvaise expérience et une faiblesse en cas de contrôle Qualiopi.

**L'audit du code (`main`) corrige la prémisse :** une coquille d'espace apprenant **existe déjà** et est solide :

- Route tokenisée [`(apprenant)/espace/[token]`](../../../apps/web/app/(apprenant)/espace/[token]/page.tsx) : hub + nav (documents / sessions / exercices / réclamation), layout, sidebar.
- Auth **JWT apprenant HS256, TTL 90 j** ([apprenant-token.ts](../../../apps/web/shared/lib/apprenant-token.ts)) ; génération du lien côté gestionnaire (`dossiers/[id]/acces-apprenant`).
- Dashboard réel via RPC `SECURITY DEFINER` `get_apprenant_dashboard` (migration `0028`) ; réclamations réelles (RPC + `app.complaints` / `complaint_events`).
- Documents : table `app.documents` réelle (migration `0009`), bucket privé `documents` (`0038`), génération convention/attestation.

**Trous réels identifiés (et adressés par ce sous-projet) :**

1. La RPC `get_apprenant_dashboard` **ne renvoie pas les documents** → l'espace affiche `MOCK_ADMIN_DOCS` (mock) au lieu des vrais documents du dossier.
2. **Aucun modèle de supports pédagogiques** (slides, cas pratiques…) → l'espace affiche `MOCK_SUPPORTS_BY_MODULE` (mock). Le catalog (`0005`) n'a qu'un champ texte `pedagogical_method`.
3. La table `app.document_access_log` (migration `0009`) **existe mais n'est jamais écrite** (aucun code ne l'alimente) — la traçabilité est morte. De plus elle est en `ON DELETE CASCADE`, ce qui détruit la preuve si le document est supprimé : inadéquat pour un journal d'audit.
4. L'**assiduité** (présences signées) est en base (`attendance_*`) mais n'est pas synthétisée ni exposée à l'apprenant / exportable.

**Le chantier n'est donc PAS « construire un espace apprenant ».** C'est : **finir de câbler l'existant sur du réel + un seul nouveau modèle de données (supports pédagogiques) + activer un journal d'audit unifié.**

---

## Découpage du chantier global (rappel)

| # | Sous-projet | Dépend de | Statut |
|---|---|---|---|
| **1** | **Ressources & traçabilité** (ce document) | — | conçu |
| 2 | Replays Zoom (ingestion recordings → ressource `type=replay`) | #1 | à concevoir |
| 3 | Exercices tracés (assignation → soumission → correction) | indépendant | à concevoir |

Hors chantier (flag) : évaluation des acquis par grille de compétences (le type `evaluation_acquis` existe en stub côté questionnaires).

---

## Décisions de cadrage (actées avec le porteur)

1. **Objectif** : preuve Qualiopi **et** expérience apprenant complète → on commence par le socle #1.
2. **Supports pédagogiques rattachés au module/formation** (réutilisables par cohorte), pas au dossier. Disponibilité dérivée via `dossier_modules`.
3. **Traçabilité passive** : log « mis à disposition » + « consulté / téléchargé ». Pas d'accusé de réception actif (écarté).
4. **Journal d'audit unifié polymorphe** (`resource_access_log`), append-only, sans cascade : surface unique couvrant documents + supports + replays futurs.

---

## Architecture

- **`module_resources`** → contexte **catalog** (rattaché à `app.modules`).
- **`resource_access_log`** → table d'audit **transverse**, append-only.
- L'apprenant n'a **pas** de session Supabase Auth → tout accès aux données passe par des **RPC `SECURITY DEFINER`** (modèle existant `get_apprenant_dashboard`) et le **JWT apprenant** vérifié côté serveur. Aucune lecture directe de table par l'apprenant ; aucune exposition de `service_role` au client (red line CLAUDE.md #1).
- Livraison de fichiers via **signed URLs Storage à TTL court**, derrière une route serveur qui vérifie le token et l'appartenance module↔dossier.

---

## Modèle de données

> Numéros de migration : prendre les **deux prochains numéros séquentiels disponibles** (≥ `0048` à la date de ce design — `0047` est le dernier sur `main`). **Re-vérifier après `git fetch`** au moment d'implémenter : des sessions parallèles peuvent avoir consommé des numéros.

### Migration `NNNN_module_resources.sql` (contexte catalog)

```sql
CREATE TABLE app.module_resources (
  id               UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  module_id        UUID NOT NULL REFERENCES app.modules(id)        ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  storage_path     TEXT NOT NULL,
  mime_type        TEXT NOT NULL,
  file_size_bytes  BIGINT,
  file_hash        TEXT,
  position         INT NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_published     BOOLEAN NOT NULL DEFAULT true,   -- visibilité côté apprenant
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES auth.users(id),
  deleted_at       TIMESTAMPTZ NULL
);

CREATE INDEX ix_module_resources_org_module
  ON app.module_resources(organization_id, module_id)
  WHERE deleted_at IS NULL;

ALTER TABLE app.module_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.module_resources FORCE ROW LEVEL SECURITY;
-- Policies : CRUD réservé aux membres de l'organisation (organization_id = org courante).
-- L'apprenant n'accède JAMAIS en direct → uniquement via RPC SECURITY DEFINER.
```

### Migration `NNNN_resource_access_log.sql` (audit transverse, append-only)

```sql
CREATE TABLE app.resource_access_log (
  id               UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id  UUID NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  target_kind      TEXT NOT NULL CHECK (target_kind IN ('document','module_resource','replay')),
  target_id        UUID NOT NULL,                                  -- référence SOUPLE (pas de FK : la preuve survit à la suppression de la cible)
  dossier_id       UUID REFERENCES app.dossiers(id)  ON DELETE SET NULL,
  learner_id       UUID REFERENCES app.learners(id)  ON DELETE SET NULL,
  actor_kind       TEXT NOT NULL CHECK (actor_kind IN ('learner_token','user','system')),
  action           TEXT NOT NULL CHECK (action IN ('view','download')),
  ip               INET,
  user_agent       TEXT,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_resource_access_log_org_dossier
  ON app.resource_access_log(organization_id, dossier_id, occurred_at DESC);
CREATE INDEX ix_resource_access_log_target
  ON app.resource_access_log(target_kind, target_id);

ALTER TABLE app.resource_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.resource_access_log FORCE ROW LEVEL SECURITY;
-- Policies : SELECT par les membres de l'org (lecture d'audit) ;
-- INSERT réservé au service_role (via Server Action / RPC) — pas d'INSERT client.
```

- `app.document_access_log` (0009) est **laissée dormante** (non supprimée pour ne pas casser de migration), non utilisée par le nouveau flux. Tout est journalisé dans `resource_access_log`.

### Storage

- Nouveau bucket privé **`pedagogical`** : MIME autorisés PDF / PPTX / XLSX / DOCX / PNG / JPEG ; limite ~50 Mo. (Le bucket `documents` reste PDF-only 20 Mo, inchangé.)
- Policy lecture : membres authentifiés de l'org ; l'apprenant passe par signed URL générée serveur.

---

## Backend

### RPC `get_apprenant_resources(p_learner_id uuid)` — `SECURITY DEFINER`

Renvoie, pour le dossier de l'apprenant, un JSONB :

- `documents` : documents réels du dossier (`app.documents`, filtrés par `kind`/`status`, non supprimés) — titre, kind, `generated_at`, taille, et un **statut d'affichage dérivé** : `signed` si une `document_signatures` complétée existe, sinon `available` si `documents.status = 'ready'`, sinon `pending` (statuts `pending`/`generating`). (L'enum DB `app.document_status` reste `pending`/`generating`/`ready`/`failed`/`archived` ; le statut d'affichage est calculé dans la RPC.)
- `supports` : supports par module — jointure `dossier_modules → modules → module_resources` (`is_published = true`, `deleted_at IS NULL`), groupés par module, ordonnés par `position`.
- `assiduite` : `{ heures_signees, heures_planifiees }` (cf. calcul ci-dessous).

### Calcul d'assiduité (fonction pure, domain, testable)

`heures_signees / heures_planifiees` pour le dossier :
- `heures_planifiees` = Σ durées des sessions du dossier (statut planifié/fait).
- `heures_signees` = Σ durées des sessions où il existe une `attendance_signatures` de l'apprenant avec `signed_at IS NOT NULL` (statut signé).

### Server Action `logResourceAccess({ token, targetKind, targetId, action })`

- Exécutée avec `service_role` (serveur uniquement).
- Vérifie le JWT apprenant → résout `learner_id`, `dossier_id`, `organization_id` depuis le payload.
- Insère une ligne `resource_access_log` (`actor_kind = 'learner_token'`, `ip`, `user_agent`).
- Idempotence douce : un `view` n'est pas dédupliqué (le journal reflète chaque consultation) ; pas de contrainte d'unicité.

### Livraison de fichiers

- **Supports** : nouvelle route serveur `/api/espace/[token]/resource/[id]` → vérifie le token + l'appartenance `module_resource.module_id ∈ modules(dossier de l'apprenant)` → génère une **signed URL** (`pedagogical`, TTL court) → log `download` → redirige.
- **Documents admin** : routes existantes (`/api/dossiers/[id]/convention.pdf`, `…/attestation.pdf`) → ajouter l'appel `logResourceAccess` (`download`).

### Gestionnaire

- **Upload supports** : sur la fiche module du catalogue — liste + upload (drag-drop) vers `pedagogical`, toggle `is_published`, suppression (soft delete). Server Actions via `authActionClient` ; schémas Zod partagés form/action.
- **Traçabilité** : section sur la fiche dossier — timeline `resource_access_log` filtrée dossier + **export CSV** (preuve Qualiopi).

---

## Sécurité / RLS

- Isolation tenant par `organization_id` sur les deux nouvelles tables (RLS enable + force, policies par opération).
- Apprenant : accès uniquement via RPC `SECURITY DEFINER` + signed URLs courtes ; jamais de table en direct, jamais de `service_role` côté client.
- `resource_access_log` : INSERT service_role only ; SELECT membres org.
- pgTAP obligatoire sur les deux tables (cf. red line CLAUDE.md #2).

---

## UI

### Espace apprenant (câblage du mock existant — la coquille reste)

- [`espace/[token]/documents/page.tsx`](../../../apps/web/app/(apprenant)/espace/[token]/documents/page.tsx) : remplace `MOCK_ADMIN_DOCS` + `MOCK_SUPPORTS_BY_MODULE` par les données de `get_apprenant_resources`. Docs admin réels (statut depuis `app.documents.status`), supports groupés par module. `view` loggé au montage (Server Component → Server Action) ; téléchargement via route signée (`download`).
- [`espace/[token]/page.tsx`](../../../apps/web/app/(apprenant)/espace/[token]/page.tsx) (hub) : compteurs réels (nb docs disponibles, **assiduité X h / Y h**) au lieu des dérivés mock.
- Suppression des constantes `MOCK_ADMIN_DOCS` / `MOCK_SUPPORTS_BY_MODULE` de [`_lib.ts`](../../../apps/web/app/(apprenant)/espace/[token]/_lib.ts) une fois le câblage fait.

### Gestionnaire (2 surfaces nouvelles)

- Fiche module catalogue → gestion des supports (upload / publier / supprimer).
- Fiche dossier → section **Traçabilité** : timeline d'accès + bouton export CSV.

Charte UI v3 respectée (archétype `command`/`workflow` déclaré en tête de fichier, primitives existantes réutilisées).

---

## Ordre d'implémentation (suit CLAUDE.md)

1. Migrations `module_resources` + `resource_access_log` + bucket `pedagogical` (+ RLS enable).
2. RPC `get_apprenant_resources` + fonction pure d'assiduité (+ tests unit).
3. RLS policies + pgTAP.
4. Server Actions (`logResourceAccess`, upload supports) + route signée `/api/espace/[token]/resource/[id]`.
5. Câblage UI espace apprenant (documents + hub) ; suppression des mocks.
6. UI gestionnaire (upload supports + traçabilité + export CSV).
7. E2E golden path : gestionnaire upload support → apprenant consulte document + support → lignes d'audit créées + visibles côté gestionnaire → export CSV.

---

## Tests

- **pgTAP** : isolation tenant `module_resources` + `resource_access_log` ; apprenant sans accès direct ; INSERT log refusé hors `service_role`.
- **Unit (Vitest)** : résolution token→learner ; calcul d'assiduité (fonction pure) ; mapping RPC→UI.
- **E2E (Playwright)** : golden path ci-dessus.
- **Vérification** : `next build` (le `pnpm typecheck` n'est pas fiable sur ce repo). `db:test`/`db:reset` exigent Docker/Supabase local ; si indisponible → migrations en **write-only** et statut **PENDING** explicitement signalé (pas de fausse validation de la DB).

---

## Critères de succès

- Un apprenant voit ses **vrais** documents administratifs et les supports pédagogiques **par module** dans son espace (plus aucun mock).
- Chaque consultation/téléchargement (document ou support) laisse une trace horodatée et nominative dans `resource_access_log`.
- Le gestionnaire exporte, par dossier, un **journal d'accès + synthèse d'assiduité** présentable lors d'un audit Qualiopi.

---

## Hors-scope (assumé)

- Replays / ingestion des recordings Zoom → **sous-projet #2** (`target_kind='replay'` déjà prévu dans le log).
- Accusé de réception actif (« j'ai pris connaissance ») → écarté (choix : passif).
- Exercices : assignation / soumission / correction → **sous-projet #3**.
- Évaluation des acquis par grille de compétences → ultérieur.
