# Conversion prospect → dossier (anti double-saisie) — Design

> Statut : validé en brainstorming, prêt pour plan d'implémentation.
> Date : 2026-06-13 · Contexte borné : `crm`/`dossier` (lecture `prospects`, écriture `learners`/`companies`/`dossiers`).

## 1. Problème

Saisies en double : le formulaire public `/inscription` crée un **prospect**, qu'un membre
**retape entièrement** dans le CRM (apprenant + entreprise + dossier), puis la **convention**
reprend encore ces données. → perte de temps + erreurs de retranscription.

Audit :
- `app.prospects` (migration 0025) capture déjà tout : identité, formation visée, modalité,
  date souhaitée, financement (`situation`, `company_name`, `funder_kind`), documents, et un
  champ **`converted_dossier_id`** + statut `converted` — le modèle **anticipe la conversion**.
- **Mais la conversion prospect → dossier n'est pas implémentée** (grep vide) et **il n'existe
  aucune UI de triage des prospects** dans le dashboard.
- La **convention lit déjà le CRM réel** (`generate-convention-pdf` via dossier/learner/company/
  formation) → une fois le dossier créé, la convention est automatique : **pas de 3ᵉ saisie**.
- `public.save_dossier(jsonb, jsonb[])` (migration 0024) crée le dossier de façon **atomique**
  (agrégat + outbox), mais attend des `learner_id`/`company_id` déjà existants.
- RLS `prospects_select` : visible si `organization_id = current_org OR organization_id IS NULL`
  (les pré-inscriptions « non assignées » sont visibles, et « revendiquées » au triage).

## 2. Objectif & périmètre

**Supprimer la double/triple saisie** via :
1. **Triage** — une page `/prospects` réelle pour voir et filtrer les pré-inscriptions.
2. **Conversion** — un bouton « Convertir en dossier » qui crée de **vraies** lignes
   (apprenant + entreprise + dossier brouillon) depuis le prospect, en réutilisant l'existant
   quand c'est le même, et signale les doublons potentiels.

### Décisions (brainstorming)

| Décision | Choix |
|---|---|
| UX conversion | **Auto immédiate en brouillon**, puis édition normale du dossier |
| Dédoublonnage | **Réutiliser si email identique** (apprenant) / **SIRET ou nom identique** (entreprise), sinon créer |
| Doublons | **Signaler** au membre les réutilisations + doublons potentiels (soft, sans fusion auto) |
| Architecture | **Approche A** : Server Action orchestrant en TS, réutilise `save_dossier` |

### Limite assumée (hors périmètre)
Les **pages dossier sont en mock** (`shared/mock/data`, cf. mémoire projet). La conversion crée
les vraies données et la convention fonctionne, mais l'**édition-après via l'écran dossier**
reste tributaire de la migration des pages dossier (chantier séparé). La valeur livrée ici =
**triage réel + bridge de données réel** (fin de la re-saisie + convention auto).

Aussi hors périmètre : aucune fusion automatique de doublons ; pas de refonte du formulaire
`/inscription` ; pas de workflow de statuts riche (assignation, notes) au-delà du nécessaire
au triage + conversion.

## 3. Architecture & flux

```
/prospects (triage, RÉELLE) ──[Convertir]──► convertProspect(prospectId)  (authActionClient)
  1. résout org (pattern resolveOrgId) · charge prospect (RLS)
  2. IDEMPOTENCE : prospect.converted_dossier_id ≠ null → renvoie ce dossier (no-op)
  3. Apprenant : matchLearner(email) → réutilise / crée
  4. Entreprise : matchCompany(siret, nom) → réutilise / crée (si company_name)
  5. detectPotentialDuplicates → rapport soft
  6. save_dossier(jsonb, events) → dossier 'draft' (learner+company+formation+funder+modalité+date)
  7. UPDATE prospect : converted_dossier_id, status='converted', organization_id = org (claim)
  8. renvoie { dossierId, report } → redirection /dossiers/[id] + encart rapport
```
Aucun nouvel agrégat domain ; **aucune migration** (schéma complet déjà présent). La conversion
crée de vraies lignes → la convention sort du CRM réel.

## 4. Composant — Logique de matching (pure, testée)

`apps/web/features/crm/prospect-conversion/matching.ts` :
- `matchLearner(email, learners): { action: 'reuse' | 'create'; learnerId?: string }`
  — match **email exact**, insensible à la casse/espaces.
- `matchCompany(siret, name, companies): { action: 'reuse' | 'create'; companyId?: string }`
  — **SIRET** prioritaire (si fourni), sinon **nom exact normalisé** (trim + casefold).
- `detectPotentialDuplicates(prospect, learners, companies): DuplicateSignal[]`
  — signale (sans agir) : apprenant **même nom, email différent** ; entreprise **nom proche**
  (égalité normalisée hors casse/espaces multiples). Type `DuplicateSignal = { kind: 'learner' | 'company'; reason: string; existingId: string; label: string }`.

Fonctions pures (entrée = listes déjà chargées) → testables sans DB.

## 5. Composant — Server Action `convertProspect`

`apps/web/app/(dashboard)/prospects/actions.ts`. `authActionClient.schema(z.object({ prospectId: z.string().uuid() }))`.
Étapes :
1. `orgId = resolveOrgId(ctx)` (pattern `resolveAdminOrgId` via `members`).
2. Charge le prospect via `ctx.supabase` (RLS). Absent → erreur métier.
3. Si `converted_dossier_id` non nul → `return { dossierId: converted_dossier_id, report: { alreadyConverted: true } }`.
4. Charge `learners`/`companies` de l'org (champs nécessaires au matching) ; applique `matchLearner`/`matchCompany` ; crée les manquants via insert RLS (`learners`, `companies`) ; collecte les ids.
5. `detectPotentialDuplicates` → `report.signals`.
6. Génère la **référence dossier** selon le pattern existant (vérifier au plan : format type `DOS-YYYY-NNNN`).
7. `ctx.supabase.rpc('save_dossier', { p_dossier, p_events })` avec `status='draft'`,
   `formation_id`, `modality = prospect.preferred_modality`, `start_date = prospect.preferred_start_date`,
   `learner_id`, `company_id`, funder dérivé de `funder_kind`.
8. `UPDATE app.prospects SET converted_dossier_id = <id>, status='converted', organization_id = orgId WHERE id = prospectId`.
9. `return { dossierId, report }` (réutilisations + signals).

Erreurs métier attendues → `Result`/retour structuré ; `throw` réservé aux bugs (red lines #6/#7).
`as never` toléré sur les payloads tant que `prospects`/colonnes ne sont pas dans `database.ts`
(convention repo, à nettoyer après `db:types`).

## 6. Composant — Triage UI `/prospects`

`apps/web/app/(dashboard)/prospects/page.tsx` (NEUVE, réelle, archétype `command`, charte v3) :
- Liste RLS des prospects (identité, formation visée, financement, statut, date), filtre par
  statut (query param), badge **« non assigné »** si `organization_id IS NULL`.
- Composant client `convert-button.tsx` : appelle `convertProspect` (via `useAction().executeAsync`),
  affiche le **rapport** (toast/encart : réutilisations + ⚠ doublons potentiels), puis redirige
  vers `/dossiers/[dossierId]`.
- Lien vers `/inscription` (formulaire public) en référence.

## 7. Sécurité (red lines)
- Lecture/écriture via `ctx.supabase` (RLS), jamais de `service_role` côté client (red line #1).
- Domain pur intact : matching dans `features/crm/...` (infra/app), pas de `domain/` impacté (red line #3).
- Action via `authActionClient` + Zod partagé (red lines #4/#5).
- Réutilisation de `save_dossier` (atomicité agrégat + outbox déjà gérés).

## 8. Tests
- **Vitest** : `matchLearner` (reuse email exact / create), `matchCompany` (SIRET puis nom /
  create), `detectPotentialDuplicates` (même nom diff email → signal ; entreprise nom proche →
  signal ; aucun faux positif quand emails/SIRET diffèrent nettement).
- **pgTAP** : (a) `prospects_select` — org A voit ses prospects + non assignés, **pas** ceux
  d'une org B assignée ; (b) après set `converted_dossier_id`, la jointure prospect→dossier
  tient et le `status` passe `converted`.
- **Manuel (golden path)** : `/inscription` → prospect visible dans `/prospects` → Convertir →
  dossier brouillon créé (apprenant+entreprise réutilisés si déjà présents, sinon créés) →
  rapport affiché → convention PDF générée **sans aucune ressaisie**.

## 9. Ordre de développement (CLAUDE.md)
1. Matching pur + tests Vitest.
2. (`db:types` si dispo pour typer `prospects`) Server Action `convertProspect`.
3. pgTAP prospects (isolation + lien conversion) — réutilise les policies existantes (pas de
   migration ; le test documente/verrouille le comportement).
4. Page `/prospects` + bouton de conversion + affichage du rapport.
5. Golden path manuel.

Pas de migration. Golden path : une pré-inscription se transforme en dossier réel en un clic,
sans retaper, avec signalement des doublons, et la convention en découle automatiquement.
