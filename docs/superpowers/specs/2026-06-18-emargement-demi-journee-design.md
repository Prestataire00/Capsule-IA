# Émargement demi-journée — branchement complet & modality-aware

**Date :** 2026-06-18
**Statut :** design validé
**Zone :** `apps/web/features/attendance/**` (chaude), `app/(dashboard)/dossiers/[id]/emargements/**`, `app/(formateur)/emarger/**`

## Problème

L'émargement par demi-journée (matin/après-midi) — exigence financeurs (OPCO/FAF/AGEFIPH) et Qualiopi (indicateur I22) — a un back-end fonctionnel mais l'UI ne l'expose pas :

- Les feuilles `attendance_sheets` matin/après-midi sont **auto-générées** par trigger ([0082](../../../supabase/migrations/0082_attendance_halfday_slots.sql)) à la (re)planification des séances (frontière 13h00 Europe/Paris).
- **MAIS** la page détail d'émargement par séance — dashboard `app/(dashboard)/dossiers/[id]/emargements/[sessionId]/page.tsx` ET formateur `app/(formateur)/emarger/[id]/page.tsx` — est **entièrement en mock** (`@/shared/mock/data`, données en dur). Elle n'affiche pas les vraies feuilles et n'appelle aucune action réelle.
- Les composants réels existent (`participants-list.tsx`, `finalize-button.tsx`, `zoom-import-panel.tsx`) et les Server Actions réelles aussi (`actions.ts` : `generateParticipantSignatureLink`, `finalizeAttendanceSheet`, `importZoomCsv`) — mais ils sont **orphelins** (non composés par la page mock).
- L'action legacy `ensureAttendanceSheet` crée une feuille **`'full'`** (modèle journée), ce qui **entre en conflit** avec le modèle demi-journée (0082 refuse de créer matin/après-midi si une `'full'` existe). Deux modèles cohabitent.

## Objectif

Rendre l'émargement par séance **entièrement branché et fonctionnel**, standardisé sur le modèle demi-journée, avec une UI **adaptée à la modalité** de la séance (présentiel / distanciel / hybride / afest).

## Fonctionnement par modalité (rappel du socle)

- **Socle commun** : une feuille par demi-journée ; chaque signature porte une `evidence_source` (`manual`, `qr`, `zoom_csv`, `zoom_api`, `trainer_override`).
- **Présentiel** : preuve = signature manuscrite via lien/QR par participant (`/signer/[token]`), PNG stocké + hashé.
- **Distanciel** : preuve = connexion Zoom. Auto via `cron/zoom-sync` (`zoom_api`) ou import CSV (`zoom_csv`). Statut `present` si durée ≥ 75 % de la séance, sinon `late`.
- **Hybride** : les deux (signature en salle + Zoom pour les distants).
- **AFEST** : signature manuelle.

## Approche retenue (A) — page séance avec blocs demi-journée

### 1. Modèle de données — standardisation demi-journée

- **Source unique de création** : RPC `app.materialize_attendance_slots(session_id)` (existante, idempotente). Le trigger 0082 couvre les nouvelles séances ; la page détail appelle la RPC au chargement pour garantir l'existence des feuilles (séances anciennes incluses).
- **Abandon du chemin `'full'`** : `ensureAttendanceSheet` est remplacée par `ensureSessionSheets(sessionId)` qui appelle la RPC et renvoie les feuilles matin/après-midi (ou la `'full'` de repli dégénéré pour une séance pile à 13h).
- **Séances legacy avec feuille `'full'`** :
  - Si **vierge** (0 signature, non finalisée) → action « convertir en demi-journées » : supprime la `'full'` puis RPC.
  - Si **signatures présentes ou finalisée** → intouchable (preuve légale), affichée telle quelle.

### 2. Page détail dashboard `[sessionId]/page.tsx` (de-mock)

Server Component :
1. Charge la vraie séance (`sessions` : modality, starts_at/ends_at, location, trainer, title).
2. `ensureSessionSheets(sessionId)` → feuilles matin/après-midi.
3. Charge `session_participants` (learners + trainer) et `attendance_signatures` par feuille.
4. Rendu : en-tête séance + **un bloc `HalfDaySheetBlock` par demi-journée**.

Scoping org via `supabaseServer()` (RLS) pour la lecture ; les Server Actions de mutation gardent `supabaseAdmin` avec scoping explicite par `sheetId` (modèle existant).

### 3. Composant `HalfDaySheetBlock`

Réutilise les composants réels existants. Panneaux pilotés par une fonction pure `panelsForModality(modality): { signature: boolean; zoom: boolean }` :

| Modalité | signature (participants-list) | zoom (zoom-import-panel) |
|---|---|---|
| presentiel | ✅ | — |
| distanciel | — | ✅ |
| hybride | ✅ | ✅ |
| afest | ✅ | — |

\+ `finalize-button` (→ PDF) sur chaque bloc, quelle que soit la modalité. Chaque bloc affiche le roster (statut `signé / en attente / absent`) et le compteur signé/total.

### 4. Espace formateur `/emarger/[id]` (de-mock)

Version mobile « live » de la même logique : charge la vraie séance + feuilles, gros boutons, QR par demi-journée pour signature en salle, statut rafraîchi par revalidation/refresh manuel (**pas** de websocket temps réel dans ce lot). Dépendance : si la liste formateur `mes-sessions` qui mène ici est en mock, la brancher (à vérifier ; sinon hors lot).

### 5. Génération

- Auto via `ensureSessionSheets` (RPC) au chargement.
- Empty-state (aucune feuille — cas pile-13h / legacy non convertible) : bouton explicite **« Générer les feuilles d'émargement »**.

### 6. Erreurs & tests

- Server Actions en `Result<T,E>`, **erreurs réelles remontées** + labels mappés (plus de message générique).
- Tests :
  - `panelsForModality` — Vitest (pur).
  - pgTAP idempotence `materialize_attendance_slots` : matin/aprem (9h-17h → 2), après-midi seule (14h-17h), matin seul (9h-12h), repli `'full'` (pile 13h), anti-mix (`'full'` existante → 0 création), session annulée → 0.
  - Domaines `half-day` / `attendance-split-strategy` déjà testés.

## Hors périmètre (YAGNI)

- Temps réel websocket sur l'écran formateur.
- Refonte du calcul d'assiduité (déjà couvert par `assiduite.ts`).
- Réconciliation Zoom auto (cron déjà en place).

## Coordination

Zone chaude `features/attendance/**` → claim dans `docs/coordination/CLAIMS.md`, branche `feat/emargement-demi-journee` depuis origin/main, worktree isolé. Migration éventuelle (action de conversion legacy si SQL) numérotée au push, après re-fetch.
