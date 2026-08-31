# Capsule IA — constats d'audit

Point de référence : commit `3f20c03` · production `capsule-ia.up.railway.app` · 2026-08-30
Sévérité : **Critique** (données exposées ou perdues) · **Majeur** (le métier dysfonctionne) · **Mineur** · **Info**
Étiquettes : `[CONSTATÉ]` preuve à l'appui · `[DÉDUIT]` raisonnement · `[À VÉRIFIER]`

---

## Critiques — exploitables aujourd'hui en production

### CAP-01 — La facturation d'un dossier est lisible par n'importe quel compte, y compris d'un autre organisme

**[CONSTATÉ]** `apps/web/app/(dashboard)/dossiers/[id]/facturation/page.tsx`

- ligne 65 : client construit avec `SUPABASE_SERVICE_ROLE_KEY` → la RLS est contournée ;
- aucune garde de rôle dans le fichier (ni `requireAccess`, ni `getCurrentMember`) ;
- ligne 72 : `.from('dossiers').eq('id', dossierId)` — **filtre sur l'identifiant du dossier uniquement**, aucun `organization_id` ;
- lignes 85-98 : lecture de `dossier_funders`, `invoices`, `funders` sur le même périmètre.

La matrice de rôles donne pourtant `billing: 'none'` aux rôles `commercial` et `formateur`
(`shared/lib/auth/permissions.ts:41,45`), et la sidebar masque l'entrée — mais le masquage n'est
pas un contrôle : l'URL tapée directement fonctionne.

**Impact métier** : un formateur, un commercial — ou un utilisateur d'un **autre organisme** — qui
connaît l'identifiant d'un dossier lit les montants facturés, les financeurs et l'état des règlements.
Fuite financière inter-organismes.

**Correctif appliqué (2026-08-30, `77ef9ec`)** : `await requireAccess('billing')` en tête de page et
`.eq('organization_id', …)` sur les trois requêtes. Puis la garde centrale (CAP-05) rend l'oubli
impossible sur les pages suivantes. Test `tests/page-service-role-guard.test.ts`.

---

### CAP-02 — Toutes les réclamations, tous organismes confondus, sont listées sans aucun filtre

**[CONSTATÉ]** `apps/web/app/(dashboard)/reclamations/page.tsx`

- ligne 28 : client `SUPABASE_SERVICE_ROLE_KEY` ;
- aucune garde de rôle ;
- ligne 75-79 : `.from('complaints').select('id, reference, subject, status, severity, reporter_name, reporter_email, created_at, metadata').order('created_at')` — **aucun `eq()`**, donc aucun filtre d'organisation.

Même situation sur `/reclamations/[id]`.

**Impact métier** : la page liste les réclamations de **tous les organismes de la plateforme**, avec
le **nom et l'e-mail du réclamant**. Ce sont des données personnelles, dans un contexte
(réclamation) où elles sont sensibles. Accessible à tout compte authentifié, y compris `commercial`
et `formateur` à qui la matrice donne `qualiopi: 'none'` (`permissions.ts:41`).

**Correctif appliqué (2026-08-30, `77ef9ec`)** : `requireAccess('qualiopi')` et filtre d'organisation
sur la liste comme sur le détail.

- **Correctif cible restant** : repasser ces pages sur le client RLS plutôt que `service_role`. **1 j**

---

### CAP-03 — Quatre autres pages sans garde ni filet RLS

**[CONSTATÉ]** Même profil (aucune garde de rôle + `service_role`), impact non encore qualifié
individuellement :

```
/agenda
/formations/[id]/programme
/parametres/integrations/google-calendar
```
(`/reclamations/[id]` est traitée en CAP-02.)

**Résolu (2026-08-30)** — vérification page par page :

- `/formations/[id]/programme` : garde et filtre d'organisation ajoutés (`77ef9ec`).
- `/agenda` et `/parametres/integrations/google-calendar` : **sans danger**, contrairement à ce que
  je supposais. Les deux bornent leur lecture au seul utilisateur connecté (`.eq('user_id', user.id)`
  après `auth.getUser()`) — un membre n'y voit que sa propre intégration. Elles sont exemptées
  explicitement dans `tests/page-service-role-guard.test.ts`, et couvertes depuis par la garde
  centrale (CAP-05).

---

### CAP-20 — Les signatures manuscrites de tous les organismes étaient lisibles par n'importe quel compte

**[CONSTATÉ]** Quatre policies de lecture sur `storage.objects` n'avaient pour seule condition que
le nom du seau :

```sql
CREATE POLICY "signatures_member_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'signatures');
```

Aucune borne d'organisation, aucune borne d'utilisateur. Les seaux sont pourtant **privés** — ce que
j'avais vérifié et jugé suffisant en clôturant CAP-11. Ça ne l'est pas : « privé » signifie seulement
qu'il n'existe pas d'URL publique, la lecture reste gouvernée par ces policies.

| Seau | Contenu |
|---|---|
| `signatures` | images de **signature manuscrite** des apprenants et des formateurs |
| `prospect-documents` | pièces jointes des prospects (identité, justificatifs de financement) |
| `pedagogical` | supports de cours — le fonds de commerce de l'organisme |
| `zoom_imports` | CSV de présence Zoom, avec noms et adresses des participants |

**[DÉDUIT]** Et il n'y avait pas même d'identifiant à deviner : `storage.list()` s'appuie sur ce même
`SELECT`. Un membre de n'importe quel organisme pouvait **énumérer** puis télécharger l'intégralité
de ces quatre seaux, pour toute la plateforme.

**Impact métier** : une signature manuscrite est réutilisable — son exposition affaiblit directement
la valeur probante de l'émargement, alors même que le reste du dispositif est solide (CAP-11). S'y
ajoutent des données personnelles de prospects et les supports pédagogiques, lisibles par des
organismes concurrents hébergés sur la même plateforme.

**Correctif appliqué (2026-08-31)** : migration `0133`. Chaque chemin d'objet commence par un
identifiant permettant de remonter à l'organisation — feuille d'émargement, prospect, ou
l'organisation elle-même pour `pedagogical` — les quatre policies s'appuient dessus, selon l'idiome
déjà utilisé par la policy d'écriture de `pedagogical` (migration `0077`). Vérifié : les lectures
applicatives passent toutes par le service role, aucun parcours n'est cassé. Test
`tests/storage-policy-scope.test.ts`.

**Le code est déployé ; la migration reste à appliquer** (cf. CAP-04).

---

### CAP-13 — L'expiration des liens apprenant ne protège rien : quatre RPC répondent à Internet sans jeton

**[CONSTATÉ]** `supabase/migrations/0028_apprenant_rpcs.sql:102,142`, `0078:115`, `0081:57`, `0026:92`

Cinq fonctions `SECURITY DEFINER` — donc affranchies de la RLS — sont accordées à `anon` :

```
app.get_apprenant_dashboard(UUID)      app.get_apprenant_resources(UUID)
app.get_learner_complaints(UUID)       app.get_apprenant_exercises(UUID)
app.get_signature_context(UUID, UUID, TEXT)
```

Leur seule autorisation est la connaissance d'un UUID. Or la clé `anon` est publique — elle est
embarquée dans le bundle navigateur. Vérification directe sur la base de production le 2026-08-30,
depuis un simple `curl` sans session :

```
get_apprenant_dashboard  → HTTP 200   get_apprenant_resources  → HTTP 200
get_learner_complaints   → HTTP 200   get_apprenant_exercises  → HTTP 200
```

**Ce qui rend le défaut exploitable** : la charge utile d'un JWT est du base64, **pas du chiffré**.
L'UUID de l'apprenant (`sub`) est donc lisible en clair par quiconque détient un lien d'espace
apprenant — y compris un lien **transféré**, **capturé en image**, ou **déjà expiré**.

**Impact métier** : toute personne ayant vu passer un lien apprenant lit, depuis n'importe où et
**sans limite de durée**, le tableau de bord de cet apprenant (identité, dossier, sessions,
formateur), ses réclamations, ses ressources et ses exercices. La fenêtre de 90 jours du jeton est
contournable en décodant le jeton lui-même : elle ne borne rien.

- **Correctif appliqué (2026-08-30)** : les quatre appelants légitimes (`_lib.ts`, `exercises.ts`,
  `resources.ts`, `signer/[token]/page.tsx`) passent au service role, ce qui rend la vérification du
  jeton en amont *seule* voie d'accès ; migration `0130_revoke_anon_learner_rpcs.sql` retirant
  `EXECUTE` à `anon` ; test `tests/anon-rpc-grants.test.ts` qui échoue si une RPC non déclarée
  publique redevient anonyme. **Le code est déployé ; la migration reste à appliquer** (cf. CAP-04).
- **Correctif cible** : passer les RPC apprenant en `SECURITY INVOKER` avec une RLS fondée sur le
  jeton, plutôt que sur l'UUID en argument. **2 j**
- **Priorité** : appliquer la migration 0130 en priorité sur toute autre.

---

## Majeurs

### CAP-14 — Aucun lien envoyé à un apprenant ne peut être révoqué

**[CONSTATÉ]** Sept familles de jetons génèrent un identifiant unique (`jti`) et le renvoient…
sans que rien ne le stocke ni ne le vérifie. Seul le jeton de signature fait exception
(`app.attendance_token_jtis`, migration `0030`, usage unique + 24 h).

| Famille | Durée de vie | Révocable |
|---|---|---|
| espace apprenant | **90 jours** | non |
| analyse du besoin · questionnaire · satisfaction · satisfaction formateur | 60 jours | non |
| signature de document | 30 jours | non |
| signature d'émargement | 24 h | **oui** (usage unique) |

**Impact métier** : un lien envoyé à la mauvaise adresse, transféré par erreur ou lié à un apprenant
qui quitte la formation reste actif jusqu'à son terme. Le seul moyen de le couper est de changer
`TOKEN_SIGNING_KEY` — ce qui invalide **tous** les liens de **tous** les organismes. En cas de
demande d'effacement RGPD, il n'existe aucun moyen de fermer l'accès déjà distribué.

**Correctif appliqué (2026-08-30)** — on ne révoque pas un jeton, on révoque un **dossier** :
l'organisme ne connaît pas les `jti`, qui ne lui sont affichés nulle part, alors qu'il raisonne
naturellement en dossier. Une révocation pose une date butoir ; tout jeton émis avant est refusé,
tout lien réémis ensuite fonctionne.

- table `app.link_revocations` (migration `0131`, RLS activée, pas de policy `DELETE` : on lève une
  révocation en réémettant un lien, pas en effaçant la trace) ;
- contrôle intégré aux **six** fonctions `verify*`, seul point de passage couvrant à la fois les
  pages et les Server Actions — 25 appelants sinon ;
- `.setIssuedAt()` ajouté aux jetons qui en manquaient ; un jeton **sans** `iat` face à un dossier
  révoqué est refusé, puisqu'il est nécessairement antérieur à la date butoir ;
- bouton « Révoquer les liens déjà envoyés » sur `/dossiers/[id]/acces-apprenant`, avec confirmation ;
- 6 tests sur la logique de comparaison (`shared/lib/link-revocation.test.ts`).

**Défaut ouvert assumé** : si la base est injoignable ou la migration non appliquée, le contrôle
laisse passer et journalise. Fermer n'apporterait rien — la page qui suit interroge la même base et
ne peut donc rien afficher — et priverait les apprenants légitimes de leur espace. Un délai de garde
de 2 s empêche par ailleurs une base lente de bloquer le rendu.

**Le code est déployé ; la migration 0131 reste à appliquer** (cf. CAP-04) : jusque-là, le bouton
renvoie une erreur et aucune révocation n'est possible.

**Décision (2026-08-30)** : les durées de vie sont **validées telles quelles** et ne seront pas
raccourcies — 90 jours pour l'espace apprenant, 60 pour les questionnaires et la satisfaction,
30 pour la signature de document, 24 h à usage unique pour l'émargement. Elles correspondent à la
durée réelle d'un dossier de formation ; un lien qui expire en cours de formation crée plus de
frictions qu'il n'évite de risques. **La révocation est le levier retenu à la place** : elle permet
de couper un lien précis quand c'est nécessaire, sans pénaliser les autres.

---

### CAP-16 — Cinq fonctionnalités interrogeaient une table qui n'existe pas

**[CONSTATÉ]** Cinq écrans lisaient `app.memberships`. Cette table n'apparaît dans aucune migration,
et la production répond `HTTP 404 / PGRST205 « Perhaps you meant the table… »`. La table réelle est
`app.members`.

Le motif était partout le même :

```ts
const { data } = await sb.schema('app').from('memberships')
  .select('organization_id').eq('user_id', user.id).maybeSingle();
const orgId = (data as ...)?.organization_id;
if (!orgId) return notFound();   // ← toujours vrai
```

`supabase-js` ne lève pas d'exception : l'erreur part dans `{ error }`, ignoré, et `data` vaut
`null`. Les cinq fonctionnalités échouaient donc **en silence**, sans message ni trace :

| Écran | Effet réel |
|---|---|
| `/formations/[id]/supports` (page) | **404 pour tout le monde** |
| `/formations/[id]/supports` (dépôt de fichier) | dépôt impossible |
| `/dossiers/[id]/exercices` (actions) | exercices inopérants |
| `/dossiers/[id]/sessions` (enregistrements) | enregistrements inopérants |
| `/parametres/integrations/zoom` | toute action Zoom échouait en « no_membership » |

**C'est la vraie cause du « Ressources à venir »** affiché aux apprenants : CAP-07 avait identifié
l'absence de lien entrant vers la page des supports, mais même atteinte, la page renvoyait 404.

**Impact métier** : les supports pédagogiques ne peuvent pas être déposés, donc l'espace apprenant
n'a rien à afficher. Sur un contrôle Qualiopi, les ressources mises à disposition des apprenants
sont un attendu.

**Correctif appliqué (2026-08-30)** : les cinq sites passent par `getCurrentMember()`, le lecteur
déjà en place sur `app.members`. Test `tests/table-exists.test.ts` : tout `.from()` doit viser une
relation créée par une migration (vérifié : il détecte bien `memberships`).

**Pourquoi ça n'avait pas été vu** : le typecheck signalait ces cinq appels — mais noyés dans
140 erreurs tenues en bloc pour du bruit de types périmés (cf. CAP-06). Un compteur d'erreurs qu'on
renonce à ramener à zéro cesse d'être un signal.

---

### CAP-18 — Aucun e-mail automatique n'est parti depuis le 17 août

**[CONSTATÉ]** `gh run list --workflow=transactional-emails.yml` : dernière exécution réussie le
**2026-08-17**, puis **quatorze échecs consécutifs**, un par jour, jusqu'au 2026-08-30. Les
exécutions échouent en quelques secondes sans démarrer la moindre étape — c'est le blocage de
facturation GitHub Actions (cf. CAP-04), pas un défaut du code.

Ce que cette tâche quotidienne envoie (`app/api/cron/transactional-emails/route.ts`) :

- les **convocations J-7** aux apprenants avant chaque séance ;
- les **enquêtes de satisfaction** à la fin d'un dossier ;
- les **attestations de fin de formation** et **certificats de réalisation** ;
- les **envois programmés** (`app.email_schedules`), c'est-à-dire toutes les règles créées depuis
  l'écran Programmation.

**Impact métier** : depuis deux semaines, aucun apprenant n'est convoqué, aucune enquête de
satisfaction n'est envoyée — donc les indicateurs Qualiopi affichés sur les fiches publiques ne se
mettent plus à jour — et aucune attestation ne part automatiquement. La plateforme paraît
fonctionner : rien ne signale l'absence d'envoi, ni dans l'interface ni ailleurs.

**Atténuation [CONSTATÉ]** : la production ne contient que des données d'essai (2 dossiers,
3 apprenants), donc il est probable qu'aucun envoi n'était réellement dû sur la période. Le
mécanisme n'en est pas moins mort, et il le resterait à l'arrivée du premier dossier réel.

**Correctif appliqué (2026-08-30)** : le workflow ouvre désormais une issue à chaque échec, en
indiquant ce qui n'est pas parti et la commande de repli manuel.

- **Correctif cible** : sortir la planification de GitHub Actions. La pile inclut déjà `pg_cron`
  côté Supabase : un `cron.schedule` appelant l'endpoint via `pg_net`, avec le secret rangé dans
  Supabase Vault, supprime la dépendance à la facturation Actions. **1 j**
- **Priorité** : bloquant dès le premier dossier réel.

---

### CAP-04 — Deux fonctionnalités livrées sont inertes : les migrations 0128 et 0129 ne sont pas appliquées

**[CONSTATÉ]** `gh run list --workflow=db-migrate.yml` → les deux exécutions du 2026-08-17 sont en
`failure`, aucune depuis. Vérification en production : 0125, 0126 et 0127 sont bien appliquées
(`trainers.cv_path` lisible, RPC `get_published_formation_indicators` en HTTP 200).

**Impact métier** : les notes de suivi d'une demande restent invisibles aux commerciaux, et les
règles d'envoi « à la signature du devis » sont refusées à l'enregistrement. Deux fonctionnalités
payées et non rendues.

**Cause** : blocage de facturation GitHub Actions — hors du code.

- **Correctif minimal** : jouer les deux fichiers dans l'éditeur SQL Supabase (≈ 40 lignes). **0,25 j**
- **Correctif cible** : rétablir la facturation, et ajouter une alerte quand le workflow de migration échoue (aujourd'hui l'échec est silencieux). **0,5 j**
- **Priorité** : bloquant.

---

### CAP-05 — L'autorisation par rôle n'est appliquée que sur 17 pages sur 97

**[CONSTATÉ]** `app/(dashboard)/layout.tsx` ne contient aucune garde ; `sectionForPath()` n'a qu'un
appelant, `sidebar-rail.tsx:163`, qui filtre l'affichage du menu ; 17 pages seulement appellent
`requireAccess`.

**Impact métier** : le cloisonnement par rôle repose sur le fait que l'utilisateur ne devine pas
les URL. Pour les 64 pages servies par le client RLS, la base limite les dégâts ; pour les 6 autres,
il n'y a rien (CAP-01 à CAP-03). Surtout, **le prochain écran écrit sans garde reproduira la faille** :
le défaut du système est ouvert, pas fermé.

**Correctif appliqué (2026-08-30, `7fba53a`)** : garde d'autorisation **dans le middleware** plutôt
que dans le layout — le middleware couvre aussi les routes qu'un layout ne voit pas. Elle refuse une
section dont la matrice donne `none` au rôle et redirige vers l'accueil.

- `ROUTE_SECTION` complété : dix racines n'étaient associées à aucune section (`/bpf`, `/emails`,
  `/agenda`, `/sessions`, `/fiches-besoin`, `/tracabilite`…) et n'étaient donc cloisonnées pour
  personne ;
- une simulation rôle par rôle avant déploiement a évité deux régressions (`/programmation` fermé aux
  gestionnaires, `/notifications` fermé aux commerciaux) ;
- **défaut ouvert assumé** sur l'absence du claim `role` : si le hook JWT cessait de le renseigner,
  bloquer tout le monde serait pire que le risque couvert ;
- test `tests/route-section-coverage.test.ts` : toute nouvelle racine doit être associée à une
  section, ou déclarée ouverte explicitement.

---

### CAP-06 — Le typecheck était éteint sur 91 fichiers par une déclaration manquante

**[CONSTATÉ]** `pnpm typecheck` → 140 erreurs (2026-08-30, après les correctifs du jour).
**91 d'entre elles — 65 % — venaient d'une seule cause** : `env.mjs` est un module JavaScript sans
déclaration de types. Sous `noImplicitAny`, TypeScript refuse chaque import, et **tout fichier
important `env` perdait sa vérification de types**. Ce n'est pas la cause que l'audit du 16/08 avait
retenue (« types Supabase périmés ») : celle-ci n'explique que le reste.

Les 49 erreurs restantes relèvent bien de `shared/types/database.ts`, non régénéré depuis le
2026-06-26 et ignorant 16 tables. Le build passe grâce à `ignoreBuildErrors: true`.

**Impact métier** : une variable d'environnement mal orthographiée ou un usage incorrect passait sans
alerte dans 91 fichiers — dont l'envoi d'e-mails, les jetons signés et les intégrations.

**Correctif appliqué (2026-08-30)** : `apps/web/env.d.ts` déclare le module au reflet exact du schéma
zod (requis = `string`, `.optional()` = `string | undefined`). **140 → 43 erreurs.**

**Suite (2026-08-30)** : la déclaration d'`env.mjs` a ramené le compte de 140 à 43, puis deux
corrections de fond ont ramené à 21 : le type du client Supabase est désormais **inféré** de sa
fabrique (`shared/lib/supabase/client-type.ts`) au lieu d'être figé sur `SupabaseClient<Database>`,
dont l'arité de génériques a changé au fil des versions ; et les cinq appels à la table inexistante
`memberships` ont été corrigés (CAP-16). Les 21 restantes visent bien les 16 tables absentes des
types générés.

- **Reste à faire** : régénérer `database.ts`. Impossible depuis ce poste — ni Docker (pour
  `--local`), ni projet lié, ni mot de passe de base (pour `--db-url`). À faire depuis une machine
  liée au projet : `pnpm db:types:linked`. **0,25 j**
- **Correctif cible** : régénération en intégration continue + retrait de `ignoreBuildErrors`. **2 j**
- **Priorité** : sous 30 jours.

---

### CAP-17 — Une écriture Supabase sur deux ne regarde pas son erreur

**[CONSTATÉ]** 61 écritures (`insert`, `update`, `upsert`, `delete`) ne récupèrent pas `error` ;
70 lectures non plus. `supabase-js` ne lève jamais d'exception : une requête refusée par la RLS,
visant une colonne renommée ou une table absente renvoie `{ data: null, error }` et le code
poursuit. C'est le mécanisme exact de CAP-16, resté invisible cinq mois.

**Vérification des chemins critiques** — ils tiennent :

- enregistrement d'une signature d'émargement et de document : `error` contrôlé ;
- insertion des réponses de questionnaire : `error` contrôlé, redirection vers une page d'erreur ;
- l'`update` signalé dans la signature de document ne concerne que la bascule « expiré ».

**Ce qui ne tenait pas** : la bascule d'une assignation en `completed`, sur les **cinq** parcours de
questionnaire. La réponse est bien enregistrée, mais si la bascule échoue, l'assignation reste « en
attente » : le destinataire est relancé, et l'indicateur Qualiopi sous-compte les réponses — un
écart entre les réponses réelles et le taux affiché sur les fiches publiques.

**Correctif appliqué (2026-08-30)** : les cinq bascules journalisent leur échec.

- **Correctif cible** : une règle de lint interdisant d'ignorer `error` sur une écriture, puis
  reprise des 56 autres sites. **2 j**
- **Priorité** : sous 30 jours.

---

### CAP-22 — Un comptage d'émargement interrogeait la base une fois par demi-journée

**[CONSTATÉ]** `features/sessions/load-session.ts:135` exécutait une requête **par feuille
d'émargement**, dans une boucle, pour un simple comptage de signatures. Une formation de cinq jours
compte dix demi-journées, donc dix allers-retours en base à chaque affichage de la séance.

**[CONSTATÉ]** Deux colonnes très filtrées par le code n'avaient par ailleurs aucun index :

- `attendance_sheets(session_id)` — « les feuilles de cette séance », la lecture la plus fréquente du
  module émargement (7 sites). Seul `dossier_id` était indexé ; or depuis la migration `0106`, une
  feuille de session de groupe a `dossier_id NULL` — pour ces sessions, l'index existant ne sert à
  rien ;
- `questionnaire_responses(assignment_id)` — 10 sites.

**Impact métier** : aucun aujourd'hui, la base contient quelques dizaines de lignes. Ces lectures
croissent avec le nombre de séances et de questionnaires, donc avec l'activité de l'organisme.

**Correctif appliqué (2026-08-31)** : la boucle est repliée en une requête unique suivie d'un
regroupement en mémoire, avec contrôle de l'erreur au passage (CAP-17) ; migration `0134` pour les
deux index.

**Écartés après vérification** : `dossiers.status` et `documents.kind`, de faible cardinalité et
toujours filtrés avec `organization_id` déjà indexé ; `session_participants(session_id)`, déjà servi
par la première colonne de sa clé primaire. Le reste du code ne contient **aucun autre** motif de
requête en boucle.

---

## Mineurs

### CAP-19 — Une ligne « sans organisation » ouvrait les prospects à tous les organismes

**[CONSTATÉ]** Trois policies de `app.prospects` acceptaient `organization_id IS NULL`, rendant une
telle ligne lisible **et modifiable** par tout utilisateur authentifié, quel que soit son organisme.
Un prospect porte des données personnelles : identité, e-mail, téléphone, date de naissance, RQTH,
situation, pièces jointes.

Ce motif est légitime sur neuf autres policies — gabarits de documents, règles Qualiopi, playbooks
financeurs, drapeaux de fonctionnalité : une ligne sans organisation y désigne un modèle fourni par
la plateforme et partagé par tous. Il ne l'est pas pour une personne physique.

**Faille latente [CONSTATÉ]** : aucun chemin du code ne crée de prospect sans organisation — le
formulaire public la déduit de la formation — et la production n'en contient aucun. La colonne
l'autorise pourtant : un import ou une insertion manuelle suffirait.

**Correctif appliqué (2026-08-31)** : migration `0132`, les trois policies exigent l'organisation
courante.

---



### CAP-21 — Les trois tests de bout en bout n'avaient jamais pu s'exécuter

**[CONSTATÉ]** `apps/web/tests/e2e/` contient trois specs Playwright, et `pnpm test:e2e` figure dans
`CLAUDE.md`. Mais **aucun `playwright.config.ts` n'existait** : la commande lançait `playwright test`
sans configuration, l'outil balayait tout le dépôt, tombait sur les fichiers Vitest, et terminait sur

```
Listing tests:
Total: 0 tests in 0 files
```

Aucun de ces tests n'était par ailleurs joué en intégration continue.

**Impact métier** : trois specs qui donnent l'apparence d'une couverture — dont
`attendance-presentiel.spec.ts`, qui joue précisément le parcours d'émargement de bout en bout
(signature par lien QR, capture de l'IP et du navigateur, jeton invalide) — sans avoir jamais tourné.
C'est ce qui manquait à **CAP-12**.

**[CONSTATÉ] Danger annexe** : les specs se sèment elles-mêmes, créant organisations, utilisateurs et
dossiers via le service role, dans la base pointée par l'environnement. Or le seul fichier
d'environnement du poste pointe la **production**. La commande, si elle avait fonctionné, aurait
écrit dans la base de production.

**Correctif appliqué (2026-08-31)** :

- `playwright.config.ts` : `testDir`, serveur de développement démarré automatiquement, chargement
  de `.env.test.local` puis `.env.local`. Les 7 tests des 3 fichiers sont désormais découverts ;
- garde-fou `refuse-production.ts` : la suite s'interrompt si la cible est le projet de production.
  Il s'exécute au chargement de la configuration, et pas seulement dans `globalSetup`, car Playwright
  exécute la portée module des specs dès la collecte ;
- job `e2e` en intégration continue, calqué sur le job pgTAP existant : instance Supabase locale,
  clés exportées depuis `supabase status`, rapport archivé en cas d'échec. En `continue-on-error`
  tant que la suite n'est pas stabilisée.

**[À VÉRIFIER]** Les tests sont découverts et la configuration est valide, mais la suite **n'a pas
encore été exécutée** : il faut Docker pour une instance Supabase locale, absent de ce poste. La
première exécution réelle reste à faire.

---

### CAP-07 — Trois pages inatteignables depuis l'interface

**[CONSTATÉ]** Aucun lien entrant dans tout le code (analyse sur les 130 pages) :
`/formations/[id]/supports`, `/formations/apercu-programme`, `/dossiers/[id]/tracabilite`.

**Impact métier** : `/formations/[id]/supports` gère les supports pédagogiques que l'espace
apprenant consomme — la fonctionnalité est donc morte côté organisme, ce qui explique le
« Ressources à venir » affiché aux apprenants.

**Correctif appliqué (2026-08-30)** — décision prise page par page :

- `/formations/[id]/supports` : bouton « Supports » ajouté sur la fiche formation, à côté de
  « Programme ». C'est la fonctionnalité qui alimente les ressources de l'espace apprenant : elle
  était inatteignable, d'où le « Ressources à venir » affiché aux apprenants.
- `/dossiers/[id]/tracabilite` : onglet « Traçabilité » ajouté à la navigation du dossier.
- `/formations/apercu-programme` : **supprimée**, avec son jeu de données d'exemple
  (`sample-capsule.ts`). Son propre commentaire la décrivait comme un contrôle visuel du gabarit
  « avant branchement sur les vraies données » — branchement fait depuis, la page ne servait plus
  qu'à afficher des données fictives dans le dashboard.

---

### CAP-08 — Secrets de production en clair sur le poste de développement

**[CONSTATÉ]** `apps/web/.env.local` (récupéré le 2026-08-30 depuis l'ancien clone) contient
10 variables dont `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_SIGNING_KEY`, `CRON_SECRET`,
`RESEND_API_KEY`, `STRIPE_WEBHOOK_SECRET`. Le fichier est bien ignoré par git (`.gitignore:29`).

**Impact métier** : la perte ou le vol du poste donne un accès complet à la base de production et
la capacité de forger des jetons de signature.

**Vérification (2026-08-30)** : recherche sur tout le poste (fichiers `.env*`, `.json`, `.txt`,
`.sh` jusqu'à cinq niveaux) d'une portion discriminante de la clé — l'en-tête d'un JWT Supabase
étant identique pour tous les projets, un test naïf donne des faux positifs. **La clé `service_role`
de Capsule n'existe qu'à un seul endroit**, `apps/web/.env.local`, et aucun autre projet du poste ne
référence `asocsynsvryroovdittc`. L'exposition est donc bornée à ce fichier.

*Hors périmètre Capsule, constaté au passage* : `/Users/anissa/rfc-/.env` contient une clé
`service_role` d'un autre projet Supabase.

- **Correctif minimal** : chiffrer le disque (probablement déjà le cas). **0,1 j**
- **Correctif cible** : jeu de secrets de développement distinct de la production ; rotation des clés actuelles. **0,5 j**
- **Priorité** : sous 30 jours.

---

### CAP-15 — Le lien apprenant n'affiche pas forcément le dossier pour lequel il a été émis

**[CONSTATÉ]** Le jeton porte un claim `dos` (identifiant de dossier), mais
`app.get_apprenant_dashboard` ne le reçoit pas : elle sélectionne
`WHERE d.learner_id = p_learner_id ORDER BY d.start_date DESC LIMIT 1`
(`0028_apprenant_rpcs.sql:55-57`).

**Impact métier** : un apprenant qui suit deux formations voit son ancien lien basculer
silencieusement sur le dossier le plus récent. Les sous-pages (`sessions`, `resources`, dépôt de
réclamation) utilisent bien le claim `dos` : l'espace peut donc afficher un dossier en en-tête et
les séances d'un autre.

**Correctif appliqué (2026-08-30)** : l'espace refuse d'afficher un dossier qui n'est pas celui du
lien (`_lib.ts`) — défaut fermé, plutôt qu'un affichage silencieusement faux.

- **Correctif cible** : passer `p_dossier_id` à la RPC et filtrer dessus, pour que le lien affiche
  son dossier au lieu d'être refusé. **0,25 j** (nécessite une migration)

---

## Vérifié conforme

**Espace formateur (5 pages)** — `[CONSTATÉ]` Aucune faille trouvée. Le layout du groupe
(`app/(formateur)/layout.tsx:9-17`) exige une session **et** un rattachement formateur avant tout
rendu ; les pages passent par le client RLS ; `ensureSessionSheets` est précédé de
`assertSessionAccess`, qui teste la visibilité de la séance avec le client RLS (donc le cloisonnement
multi-organisme est bien appliqué en base, `actions.ts:385-394`).

**Intégrité des données de production (CAP-10 clos)** — `[CONSTATÉ]` Comptages en lecture seule le
2026-08-30 : 1 organisme, 5 membres, 3 apprenants, 2 dossiers, 6 séances, 20 documents,
3 factures, 0 signature d'émargement. Aucune facture hors dossier, aucune feuille hors séance,
aucun dossier sans formation. Les 5 séances « sans dossier » relèvent du modèle et non d'un défaut :
depuis la migration `0106`, une session de groupe se rattache à une formation, avec une contrainte
`CHECK (dossier_id IS NOT NULL OR formation_id IS NOT NULL)`. La production ne contient à ce jour
que des données d'essai — ce contrôle sera à refaire sur des volumes réels.

**Valeur probante de l'émargement (CAP-11 clos)** — `[CONSTATÉ]` Le dispositif tient :

- le condensat enregistré lie l'image de la signature, l'adresse IP, le navigateur, l'horodatage et
  l'identifiant du jeton (`signer/[token]/actions.ts:55-64`) — un élément modifié invalide le tout ;
- le jeton de signature est le seul à être **à usage unique**, avec un registre en base
  (`app.attendance_token_jtis`, migration `0030`) et une durée de vie de 24 h ;
- **aucune policy `UPDATE` ni `DELETE`** n'existe sur `app.attendance_signatures` : avec `FORCE ROW
  LEVEL SECURITY`, une signature ne peut être ni modifiée ni effacée depuis l'application. Aucun code
  applicatif n'en modifie non plus (seul un nettoyage de test E2E le fait) ;
- le bucket `signatures` est **privé** ; seuls `avatars` et `trainer-photos` sont publics, et c'est
  voulu (photos affichées au catalogue).

**Réserve levée le 2026-08-31** : « privé » ne suffisait pas. La policy de lecture du seau
n'imposait aucune borne d'organisation, ce qui exposait les images de signature de toute la
plateforme — voir **CAP-20**. Le dispositif d'émargement lui-même reste conforme ; c'était son
stockage qui ne l'était pas.

**Accès horizontal dans l'espace apprenant** — `[CONSTATÉ]` Les ressources désignées par un
identifiant d'URL sont correctement rattachées au porteur du jeton :
`/api/espace/[token]/document/[id]` refuse un document dont `dossier_id` diffère du claim du jeton
(`route.ts:34-42`) ; `/espace/[token]/questionnaires/[assignmentId]` renvoie un état `forbidden`
traité en 404. Changer l'identifiant dans l'URL ne donne rien.

---

## À qualifier (phase 1)

| ID | Sujet | Pourquoi ça compte |
|---|---|---|
| CAP-12 | Parcours de bout en bout **exécuté** | Le câblage est vérifié dans le code, et la suite E2E qui joue l'émargement est désormais exécutable (CAP-21) — mais elle n'a pas encore tourné, faute de Docker sur ce poste. |
