# Suivi heures réelles vs payées + abandon (risque financeur) — Design

> Statut : validé en brainstorming, prêt pour plan.
> Date : 2026-06-14 · Contexte borné : `attendance`/`dossier`.
> **Dépendance** : réutilise `computeAssiduite` (branche `feat/espace-ressources-tracabilite`, non encore mergée) → **implémentation après son merge**.

## 1. Problème

Pas de suivi des **heures réellement dispensées vs prévues**, ni de gestion temps réel des
**absences/abandons**. Risque : **finir une formation sous les heures payées par le financeur**
(non-paiement des heures manquantes).

## 2. Constat d'audit (recouvrement à éviter)

- La branche parallèle `feat/espace-ressources-tracabilite` fournit déjà une fonction **pure**
  `computeAssiduite(sessions)` → `{ heuresSignees, heuresPlanifiees, taux }`
  (`apps/web/features/attendance/assiduite.ts`). Elle couvre **réel vs planifié au niveau
  session**.
- `app.dossiers.total_hours NUMERIC(8,2) NOT NULL` = heures **contractuelles/payées**.
- `app.sessions.duration_hours` (générée), reliées au dossier via `session_dossiers` (M2M,
  migration 0052) ; présence par apprenant via `attendance_signatures.status`.
- **Aucun** calcul « vs payées », **aucun** concept d'**abandon** (`dossier_status` ne l'a pas).

→ Le socle assiduité étant en cours côté parallèle, **on ne le redéveloppe pas**. Cette feature
ajoute uniquement la **couche métier nouvelle** : comparaison vs **payées**, **abandon**,
**alerte de risque**.

## 3. Décisions (brainstorming)

| Décision | Choix |
|---|---|
| Périmètre | **Couche nouvelle seulement** (vs payées + abandon + alerte) ; réutilise `computeAssiduite` |
| Abandon | **Champs additifs** `dossiers.abandoned_at` + `abandon_reason` (pas de nouveau statut enum) |
| Architecture | **Approche B** : fonction pure `computeHoursRisk` (extension de `computeAssiduite`) + query + dashboard |
| Séquençage | Implémentation **après merge** de `feat/espace-ressources-tracabilite` |

### Hors périmètre (YAGNI)
- Pas de re-développement de l'assiduité (réutilisée).
- Pas de nouveau statut `dossier_status` (champs additifs).
- Pas d'alerte e-mail proactive (dashboard d'abord ; activable plus tard via outbox).
- Détection auto d'abandon par séries d'absences = non (abandon explicite, daté, traçable financeur).

## 4. Architecture & flux

```
app.dossiers.total_hours (payé) ─┐
sessions via session_dossiers (durée, done) ─┤  query hours-status ──► computeHoursRisk(pur)
attendance_signatures (présent) ─┤                                      │
dossiers.abandoned_at ───────────┘                                      ▼
   { paid, delivered, scheduledRemaining, projected, gapVsPaid, atRisk, abandoned }
                                                                        │
                              Dashboard « risque heures » + action Marquer abandon
```
Recalcul à la lecture (= temps réel à la consultation). Réutilise `computeAssiduite` pour la
part signé/planifié.

## 5. Composant — Migration (additive)

```sql
ALTER TABLE app.dossiers
  ADD COLUMN abandoned_at   TIMESTAMPTZ,
  ADD COLUMN abandon_reason TEXT;
COMMENT ON COLUMN app.dossiers.abandoned_at IS
  'Date d''abandon de la formation par l''apprenant (NULL = en cours). Exclut le restant planifié de la projection.';
```
Numéro ≥ `0060` (après le `0059` mergé) — vérifier le prochain libre au plan. RLS dossier héritée.

## 6. Composant — Fonction pure `computeHoursRisk`

`apps/web/features/attendance/hours-risk.ts` :
```
type RiskSession = { durationHours: number; signed: boolean; done: boolean };
type HoursRisk = {
  delivered: number;            // Σ durationHours des sessions signées présentes
  scheduledRemaining: number;   // Σ durationHours des sessions non `done` ; 0 si abandon
  projected: number;            // delivered + scheduledRemaining
  gapVsPaid: number;            // paidHours − projected
  atRisk: boolean;              // gapVsPaid > 0
};
computeHoursRisk(args: { paidHours: number; sessions: RiskSession[]; abandoned: boolean }): HoursRisk
```
Réutilise la logique de `computeAssiduite` pour `delivered` (cohérence avec l'assiduité). Pure
→ testable. Invariants : `gapVsPaid` peut être négatif (sur-doté) ; `atRisk` strictement `> 0`.

## 7. Composant — Action abandon

`markDossierAbandoned({ dossierId, reason })` + `reactivateDossier({ dossierId })`
(`authActionClient` + Zod partagé). Écrit/efface `abandoned_at`/`abandon_reason` via
`ctx.supabase` (RLS). Seuls staff (owner/admin/gestionnaire) — garde + RLS.

## 8. Composant — Query statut heures

`features/attendance/hours-status.query.ts` : pour un dossier (ou liste org), charge
`total_hours`, `abandoned_at`, et les sessions du dossier (via `session_dossiers`) avec
`duration_hours`, statut `done`, et présence de l'apprenant (`attendance_signatures.status =
'present'`). Mappe en `RiskSession[]` puis appelle `computeHoursRisk`. Renvoie le `HoursRisk`
enrichi (`paid`, `abandoned`).

## 9. Composant — Dashboard / alerte

Page (ou section dashboard) listant les dossiers **à risque** (`atRisk`) : payé / délivré /
projeté / **écart**, badge rouge si `gapVsPaid > 0`, marqueur « abandonné » ; bouton **Marquer
abandon**. Archétype `command`, charte v3.
> ⚠️ Caveat : pages dossier/dashboard partiellement **en mock** → bout-en-bout tributaire de leur
> câblage réel (comme les features précédentes).

## 10. Tests
- **Vitest** : `computeHoursRisk` — délivré/restant/projeté/écart/atRisk ; abandon → restant=0 →
  écart s'aggrave ; cas « 100% assiduité mais sessions planifiées < payé → atRisk vrai » ; cas
  sur-doté → `gapVsPaid < 0`, `atRisk` faux.
- **pgTAP** : `abandoned_at`/`abandon_reason` écrits par staff de l'org, isolés cross-tenant
  (RLS dossier) ; un autre org ne peut pas marquer l'abandon.
- **Manuel** : dossier sous-doté → « à risque » ; marquer abandon → écart augmente.

## 11. Ordre de développement (CLAUDE.md)
> **Pré-requis : merge de `feat/espace-ressources-tracabilite`** (pour `computeAssiduite`).
1. Migration (`abandoned_at`/`abandon_reason`).
2. pgTAP (champs + RLS abandon).
3. `computeHoursRisk` pur + tests Vitest (réutilise `computeAssiduite`).
4. Query statut heures.
5. Action abandon (+ réactivation).
6. Dashboard/alerte.
7. Golden path manuel.

Couche additive, réutilise l'assiduité parallèle. Golden path : un dossier dont le projeté <
payé ressort « à risque » avant la fin ; marquer un abandon aggrave l'écart et le rend visible
à temps pour réagir (re-planifier ou ajuster la facturation financeur).
