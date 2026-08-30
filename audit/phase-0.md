# Capsule IA — Phase 0 : terrain réel et branchements

**Projet** : Capsule IA — `/Users/anissa/ia-of` · dépôt `Prestataire00/i-a-infinity-of` · production `capsule-ia.up.railway.app`
**Point de référence** : commit `3f20c03` (2026-08-18), `main`, aligné avec `origin/main`
**Date** : 2026-08-30
**Méthode** : lecture du dépôt + requêtes **lecture seule** sur l'API de production (aucune écriture, aucune donnée nominative extraite).

---

## 1. Terrain

| Élément | Valeur | Source |
|---|---|---|
| Framework | Next.js 14 App Router, TypeScript strict | `apps/web/package.json` |
| Base | Supabase PostgreSQL, schéma `app`, RLS | `supabase/migrations/` (125 fichiers) |
| Authentification | Supabase Auth (cookies SSR) + middleware | `apps/web/middleware.ts` |
| Hébergement | Railway (déploiement sur push `main`) | `railway.json`, API deployments GitHub |
| Tâches planifiées | GitHub Actions (`transactional-emails`, quotidien) | `.github/workflows/` |
| Pages | **130** (97 dashboard, 13 apprenant, 5 formateur, 15 autres) | `find app -name page.tsx` |
| Routes API | 28 | `find app/api -name route.ts` |
| Server Actions | 77 fichiers | `grep -rl "^'use server'"` |
| Tests | 45 fichiers / **228 tests, tous verts** | `pnpm test` (2026-08-30) |
| Typecheck | **135 erreurs** (types Supabase périmés, cf. audit du 16/08) | `pnpm typecheck` |

---

## 2. Branchement base ↔ code : deux migrations manquantes en production

**[CONSTATÉ]** Le dépôt contient 125 migrations, jusqu'à `0129_email_schedule_event_anchors.sql`.
Les deux dernières **ne sont pas appliquées** : le workflow d'application a échoué le 2026-08-17
et n'a plus tourné depuis (blocage de facturation GitHub Actions).

```
$ gh run list --workflow=db-migrate.yml --limit 6
2026-08-17 failure — feat(programmation): déclencheurs événementiels…   ← 0129
2026-08-17 failure — feat(demandes): notes de suivi sur une fiche demande ← 0128
2026-08-16 success — feat(qualiopi): indicateurs de résultats…          ← 0127
```

Vérification directe en production (lecture seule, service_role) :

```
get_published_formation_full        → HTTP 200   (0126 appliquée ✓)
get_published_formation_indicators  → HTTP 200   (0127 appliquée ✓)
trainers.cv_path                    → [{"cv_path":null}]  (0125 appliquée ✓)
```

**Conséquence métier [CONSTATÉ]** : deux fonctionnalités sont présentes dans le code mais **inertes** :

| Migration | Fonctionnalité livrée | État réel en production |
|---|---|---|
| `0128` | Notes de suivi d'une demande lisibles/écrivables par le rôle *commercial* | Un commercial ouvre la fiche mais **ne voit aucune note** (policies encore limitées à `is_staff()`). |
| `0129` | Déclencheurs événementiels des envois programmés (« à la signature du devis »…) | Les nouveaux choix s'affichent dans le formulaire mais **l'enregistrement est refusé par la contrainte de la base**. |

---

## 3. Autorisation : le point structurant

**[CONSTATÉ]** Le contrôle d'accès repose sur trois éléments, et un seul bloque réellement :

1. **`middleware.ts`** — vérifie l'**authentification** seulement. Un visiteur sans session est
   redirigé vers `/login` ; `/api` est explicitement exempté (`path.startsWith('/api')` → `isPublic`).
   Il ne vérifie **aucun rôle**.
2. **`app/(dashboard)/layout.tsx`** — **aucune garde**. C'est une coquille visuelle : sidebar,
   topbar, assistant IA. Vérifié ligne à ligne, le fichier ne contient ni `requireAccess`,
   ni `getCurrentMember`, ni `redirect`.
3. **`sectionForPath()`** (`shared/lib/auth/permissions.ts`) — associe une route à une section de
   permissions. **Son seul appelant est `sidebar-rail.tsx:163`**, qui filtre les entrées de menu.
   C'est donc du **masquage d'interface**, pas du contrôle d'accès.

**[CONSTATÉ]** Sur les 97 pages du dashboard, **17 seulement** appellent `requireAccess`.
Les 80 autres sont accessibles à **tout membre authentifié, quel que soit son rôle**, en tapant l'URL.

Le risque est modulé par le client de données utilisé :

| Situation | Nombre | Filet |
|---|---|---|
| Page gardée par `requireAccess` | 17 | rôle vérifié |
| Sans garde, mais client RLS (`supabaseServer`) | 64 | la RLS filtre en base — exposition limitée au périmètre du rôle en base |
| **Sans garde ET `service_role`** | **6** | **aucun filet** |

Les six pages sans aucun filet :

```
/agenda
/dossiers/[id]/facturation
/formations/[id]/programme
/parametres/integrations/google-calendar
/reclamations
/reclamations/[id]
```

Deux d'entre elles ont été vérifiées en détail — voir `findings.md`, **CAP-01** et **CAP-02** :
elles n'appliquent **aucun filtre d'organisation**, ce qui les rend exploitables au-delà du
simple contournement de rôle.

---

## 4. Inventaire des pages — synthèse

| Groupe | Pages | Observation |
|---|---|---|
| `(dashboard)` | 97 | 17 gardées, 80 non gardées (§3) |
| `(apprenant)` | 13 | accès par jeton signé — gardes à vérifier une à une en phase 1 |
| `(formateur)` | 5 | idem |
| `(auth)` + public | 15 | `/login`, `/inscription`, `/catalogue`, `/questionnaire/*` — publiques par conception |

**[CONSTATÉ] Pages orphelines** (aucun lien entrant dans tout le code) — inchangé depuis l'audit du 16/08 :
`/formations/[id]/supports`, `/formations/apercu-programme`, `/dossiers/[id]/tracabilite`.
La première gère les supports pédagogiques que l'espace apprenant consomme : elle est inatteignable
depuis l'interface, donc la fonctionnalité est morte côté organisme.

---

## 5. Ce que la phase 0 n'a pas couvert

- **Les 13 pages de l'espace apprenant et les 5 de l'espace formateur**, une à une : la garde y
  repose sur des jetons signés, dont la robustesse (expiration, révocation, portée) reste à éprouver.
- **Les 28 routes API et les 77 fichiers de Server Actions** : deux tests de non-régression
  existent depuis le 16/08 (`api-service-role-guard`, `use-server-exports`) et passent, mais ils
  ne couvrent pas les **pages**, angle mort qui a produit CAP-01 et CAP-02.
- **L'intégrité des données réelles** (orphelins, doublons, statuts incohérents) : nécessite des
  requêtes d'agrégat sur la production — faisables en lecture seule, avec ton accord.
- **Les parcours de bout en bout** (inscription → émargement → attestation → facture).
- **Les 135 erreurs de typecheck** : leur nature exacte (types générés périmés) est connue, leur
  impact fonctionnel réel ne l'est pas.
