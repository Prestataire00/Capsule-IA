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

- **Correctif minimal** : `await requireAccess('billing')` en tête de page + `.eq('organization_id', …)` sur les trois requêtes. **0,5 j**
- **Correctif cible** : garde d'autorisation appliquée par le layout du groupe `(dashboard)` à partir de `sectionForPath()`, pour que l'oubli devienne impossible. **2 j**
- **Priorité** : bloquant.

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

- **Correctif minimal** : `requireAccess('qualiopi')` + `.eq('organization_id', membre.organizationId)`. **0,5 j**
- **Correctif cible** : idem CAP-01 (garde centralisée) + repasser ces pages sur le client RLS plutôt que `service_role`. **2 j**
- **Priorité** : bloquant.

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

`/parametres/integrations/google-calendar` est la plus préoccupante *a priori* : la section
`settings` est réservée à `owner`/`admin` dans la matrice, et la page manipule un rattachement de
compte externe. **[À VÉRIFIER]** en phase 1.

- **Correctif minimal** : garde + filtre d'organisation sur chacune. **0,5 j**
- **Priorité** : bloquant (au moins pour la page paramètres).

---

## Majeurs

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

- **Correctif minimal** : ajouter `requireAccess` aux pages des sections sensibles (facturation, paramètres, qualiopi, BPF). **1 j**
- **Correctif cible** : garde centralisée dans le layout du groupe `(dashboard)` via `sectionForPath()`, + un test de non-régression sur le modèle de `api-service-role-guard.test.ts` (qui n'inspecte aujourd'hui **que** les routes API et les Server Actions, pas les pages — c'est cet angle mort qui a laissé passer CAP-01 et CAP-02). **2 j**
- **Priorité** : sous 30 jours.

---

### CAP-06 — 135 erreurs de typecheck, types de base périmés

**[CONSTATÉ]** `pnpm typecheck` → 135 erreurs (2026-08-30). Origine identifiée le 16/08 :
`shared/types/database.ts` n'a pas été régénéré depuis le 2026-06-26 et ignore 16 tables.
Le build passe grâce à `ignoreBuildErrors: true`.

**Impact métier** : aucun filet de type sur les modules concernés (dépenses, exercices, e-mails
programmés, intégrations). Une colonne renommée ne casse rien au build et échoue en production.

- **Correctif minimal** : régénérer les types depuis une machine liée au projet (`pnpm db:types:linked`). **0,25 j**
- **Correctif cible** : régénération en intégration continue + retrait de `ignoreBuildErrors`. **2 j**
- **Priorité** : sous 30 jours.

---

## Mineurs

### CAP-07 — Trois pages inatteignables depuis l'interface

**[CONSTATÉ]** Aucun lien entrant dans tout le code (analyse sur les 130 pages) :
`/formations/[id]/supports`, `/formations/apercu-programme`, `/dossiers/[id]/tracabilite`.

**Impact métier** : `/formations/[id]/supports` gère les supports pédagogiques que l'espace
apprenant consomme — la fonctionnalité est donc morte côté organisme, ce qui explique le
« Ressources à venir » affiché aux apprenants.

- **Correctif minimal** : remettre une entrée d'onglet vers `supports`. **0,25 j**
- **Correctif cible** : décider (rebrancher ou supprimer) et supprimer le code mort. **0,5 j**
- **Priorité** : dette.

---

### CAP-08 — Secrets de production en clair sur le poste de développement

**[CONSTATÉ]** `apps/web/.env.local` (récupéré le 2026-08-30 depuis l'ancien clone) contient
10 variables dont `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_SIGNING_KEY`, `CRON_SECRET`,
`RESEND_API_KEY`, `STRIPE_WEBHOOK_SECRET`. Le fichier est bien ignoré par git (`.gitignore:29`).

**Impact métier** : la perte ou le vol du poste donne un accès complet à la base de production et
la capacité de forger des jetons de signature.

- **Correctif minimal** : chiffrer le disque (probablement déjà le cas) et vérifier qu'aucune copie ne traîne ailleurs. **0,1 j**
- **Correctif cible** : jeu de secrets de développement distinct de la production ; rotation des clés actuelles. **0,5 j**
- **Priorité** : sous 30 jours.

---

## À qualifier (phase 1)

| ID | Sujet | Pourquoi ça compte |
|---|---|---|
| CAP-09 | Les 13 pages de l'espace apprenant et 5 de l'espace formateur, une à une | L'accès y repose sur des jetons signés : expiration, révocation, portée d'un jeton volé restent à éprouver. |
| CAP-10 | Intégrité des données réelles | Orphelins, doublons, dossiers sans session, factures sans ligne — requêtes d'agrégat à exécuter en lecture seule. |
| CAP-11 | Valeur probante de l'émargement | Horodatage, non-modifiabilité a posteriori, traçabilité des corrections — cœur d'un contrôle Qualiopi. |
| CAP-12 | Parcours de bout en bout | Inscription → émargement → attestation → facture, avec les cas limites. |
