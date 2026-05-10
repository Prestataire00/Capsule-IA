# 08 — Workflows métier

6 parcours qui font la valeur du SaaS. Chaque parcours = séquence acteur → système avec events émis et points d'échec.

## A — Création → planification → activation d'un dossier

**Acteurs** : `gestionnaire` ou `admin`.
**Statut** : `draft → pending_validation → scheduled → active`.

Étapes :
1. Wizard 3 steps avec brouillon (`dossier_drafts`).
2. `createDossierAction` → `createDossier` use case → RPC `save_dossier` → event `dossier.created` → handlers (génération convention, init Qualiopi, notif).
3. Ajouter modules / formateurs / financeurs (events module-added, trainer-assigned, funder-added).
4. `submitDossierAction` (optionnel) → notif validateur.
5. `scheduleDossierAction` → invariants stricts (modules.length > 0, trainers.length > 0) → handlers (sessions par défaut, convocations, positionnement, Zoom).
6. `activateDossierAction` (manuel jour J) → handler kickoff.

## B — Génération + signature électronique

**Acteurs** : `gestionnaire` (déclenche), `apprenant` (signe via token email).

Étapes :
1. `requestDocumentGenerationAction` → Edge Fn `generate-document` (docxtemplater + PizZip + hash) → event `documents.document.generated`.
2. `requestSignatureAction` → INSERT `document_signatures` pending → event `documents.signature.requested` → handler `send-signature-link` (Resend).
3. Apprenant clique le lien → page `/signer/[token]` → POST Edge Fn `sign-document` :
   - Vérifie HMAC + expiration JWT
   - INSERT `processed_events` (jti) → single-use
   - Upload PNG signature
   - Hash document au moment de la signature
   - UPDATE signature, émet `documents.signature.completed`
4. Handler attache la signature comme preuve Qualiopi.

## C — Émargement (formateur QR → apprenants signent mobile)

**Acteurs** : `formateur` (ouvre, projette QR), `apprenants` (scannent + signent).

Étapes :
1. Formateur ouvre `/mes-sessions`, clique "Ouvrir feuille" → INSERT `attendance_sheets` + génère 1 token JWT par participant.
2. QR code projeté (1 par apprenant ou 1 global avec choix nom).
3. Apprenant scanne → page mobile `/signer/[token]` → canvas signature → POST Edge Fn `sign-document` (scope sign-attendance).
4. INSERT `attendance_signatures` + event `attendance.signature.captured`.
5. Le formateur voit live (Realtime).
6. Click "Finaliser" → status `completed` → handler `generate-attendance-document` (PDF preuve Qualiopi).

## D — Cycle questionnaires (positionnement → satisfaction chaud → froid)

3 moments clés, déclenchés automatiquement par events :
- **`dossier.scheduled`** → handler assigne questionnaire de positionnement (preuve Qualiopi I10).
- **`dossier.completed`** → handler assigne satisfaction à chaud (I26) ; programme satisfaction à froid à end_date+90j (event différé).
- Cron expire les questionnaires non remplis et envoie relances.

Apprenant clique le lien → page `/questionnaire/[token]` → POST Edge Fn → INSERT `questionnaire_responses` → event `questionnaire.completed` → handler attache comme preuve Qualiopi + update NPS.

## E — Clôture Qualiopi-ready + génération attestation finale

**Acteurs** : `admin` ou `owner`.

1. Admin clique "Clôturer" sur dossier `completed`.
2. Server Action calcule la `ClosingChecklist` (port `QualiopiReadinessPort`) à partir de :
   - `qualiopi_dossier_checklists.blocking_missing`
   - `document_signatures` toutes signed
   - `attendance_sheets` toutes finalisées
   - questionnaires positionnement + satisfaction chaud completed
3. `dossier.close(checklist)` :
   - Si blockers → `Result.err({ code: 'closing_blocked', reasons: [...] })` → UI affiche la liste.
   - Si OK → status `closed`, event `dossier.closed`.
4. Handler `generate-attestation-fin` → PDF officiel.
5. Handler `issue-final-invoice` → facture draft (si funder approved).

**Réouverture** : `reopenDossierAction` réservé `owner`/`admin`, `reason` obligatoire, audit trail dans `dossier_status_history`.

## F — Réclamation → résolution (Qualiopi indicateur 31)

**Acteurs** : `admin` (enregistre + résout), responsable qualité (assigné), réclamant.

1. `openComplaintAction` → INSERT `complaints` + `complaint_events(kind='comment')` → event `complaint.opened` → handler notify-quality-team.
2. `assignComplaint` → UPDATE assigned_to + `complaint_events(kind='assignment')` → event `complaint.assigned`.
3. Investigation : commentaires via `complaint_events`.
4. `resolveComplaint` → status `resolved` + resolution → event `complaint.resolved` → handler notify-reporter.
5. J+30 : auto-clôture si pas de retour.

**Export Qualiopi annuel** : `qualiopi.audit.exported` liste toutes les réclamations (preuve I31).
