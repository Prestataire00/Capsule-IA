# Module 3.4 — Documents & Signature électronique

**Date :** 2026-06-14 · **Statut :** spec (design) — **pas d'implémentation immédiate** (zone documents/signature en chantier parallèle, cf. § Coordination). Base : `origin/main` fda636d.

## Contexte

Génération auto des documents Qualiopi depuis le dossier, **regroupement en un dossier d'entrée unique** et envoi en signature électronique horodatée + IP. Insight clé (Laurie Payet) : **l'apprenant signe UNE seule fois, en fin du document groupé**, pas document par document.

Une grande partie du backbone existe. Cette spec mappe l'existant et conçoit les manques.

## Réutilisable (audit `origin/main`)

- **Modèle** (`0009_documents.sql`) : `documents` (kinds : convention, programme, attestation_fin, certificat_realisation, reglement_interieur, livret_accueil, …), `document_templates`/`_versions`, **`document_signatures`** avec **tous les champs d'audit** : `signer_kind` (learner/company_rep/org_rep…), `signer_name`, `status`, `request_token_hash` + `request_expires_at` (signature par token **anticipée**), `signed_at`, `signer_ip`, `signer_user_agent`, `document_hash_at_signature`. + `document_access_log` (pour « vu »).
- **Générateurs PDF** : `generate-convention-pdf.ts` (F-DOC-01 ✅), `generate-legal-doc-pdf.ts` + `0063_org_legal_documents` (RI/CGV/livret, F-DOC-03 ✅), `generate-attestation-pdf.ts` avec `drawSignatureBlock` (signature+cachet OF auto → F-DOC-09 certificat org-signé ✅), `generate-invoice-pdf.ts`, `apply-org-signature.ts`, `persist-document.ts`.
- **Libs PDF** : `pdf-lib` (merge/copyPages/extraction) + `@react-pdf/renderer` → **F-DOC-04 et F-DOC-13 faisables**.
- **Signature électronique** : `0026_signature_electronique` (bucket `signatures` PNG), `0058` (org signature). **Validité financeur public = date+heure+IP** : intégralement capturé par `document_signatures` → **système maison suffisant, pas de DocuSign/YouSign** (conforme à la règle).
- **Heures réelles** : moteur `0062_dossier_hours_engine` (condition de l'attestation de fin, F-DOC-08 / règle).

## Cartographie F-DOC

| Réf | État | Note |
|---|---|---|
| F-DOC-01 Convention | ✅ | `generate-convention-pdf` (variables dossier) |
| F-DOC-02 Programme | ❌ **gap** | aucun générateur (le `kind='programme'` existe) |
| F-DOC-03 RI/CGV/livret | ✅ | `generate-legal-doc-pdf` + `0063` |
| F-DOC-04 Dossier d'entrée groupé | ❌ **gap (central)** | compiler les PDF en 1 via `pdf-lib`, **une seule signature en fin** |
| F-DOC-05 Signature intégrée | 🟡 | données ✅ ; **flux de signature de DOCUMENT manquant** (le `/signer` actuel ne signe que l'émargement `attendance_sheet_id`) |
| F-DOC-06 Piste d'audit | 🟡 | données dans `document_signatures` ; **PDF « piste d'audit » à générer** |
| F-DOC-07 Bouton « Envoyer le dossier d'entrée » | ❌ **gap** | orchestration generate→compile→token→email→signature |
| F-DOC-08 Attestation de fin (signée apprenant) | 🟡 | générateur attestation ✅ ; signature **apprenant** = via flux F-DOC-05 ; conditionnée aux heures (`0062`) |
| F-DOC-09 Certificat de réalisation (org seul) | ✅ | attestation générée + `drawSignatureBlock` (cachet OF), sans signature apprenant |
| F-DOC-10 Variables dynamiques | ✅ | injection depuis le dossier (convention déjà) |
| F-DOC-11 Statut signature (vu/signé) | 🟡 | `status` (pending/signed) ✅ ; « vu » via `document_access_log` (à exposer) |
| F-DOC-12 Relance signature | ❌ **gap** | cron (mutualisable avec ANB F-06) |
| F-DOC-13 Découpage convention (pages X-Y) | ❌ **gap** | extraction `pdf-lib` |

## Conception des manques

### F-DOC-04 — Dossier d'entrée groupé (central)
`compile-dossier-entree.ts` : génère chaque composant (convention F-01, programme F-02, RI/CGV/livret F-03) en mémoire, puis **merge via `pdf-lib`** (`copyPages`/`addPage`) en un seul PDF ordonné, avec une **page/cartouche de signature unique en fin**. Persiste un `documents` row **kind `dossier_entree`** (nouvelle valeur de l'enum kinds — 1 migration `ALTER … ADD`) ou `'autre'` (à trancher, cf. points ouverts) avec `file_hash`. Une seule `document_signatures` (signer_kind='learner') rattachée à ce document groupé.

### F-DOC-05 + F-DOC-07 — Signature de document + envoi
Le modèle `document_signatures` anticipe déjà la signature par token (`request_token_hash`, `request_expires_at`). Manque l'UI + l'orchestration :
- **Action gestionnaire `sendDossierEntree(dossierId)`** (F-DOC-07, `authActionClient`) : compile le dossier d'entrée (F-04), crée `documents` + `document_signatures` (génère `request_token_hash`, `request_expires_at`), envoie un email (Resend) avec le lien de signature, passe le statut → `pending`. Émet un event outbox (`document.signature_requested`).
- **Page de signature document** `apps/web/app/(apprenant)/signer-document/[token]/` (ou généralisation du `/signer` existant) : vérifie le token, affiche le PDF groupé, capture la signature (PNG → bucket `signatures`), enregistre `signed_at`, `signer_ip`, `signer_user_agent`, `document_hash_at_signature`, statut → `signed`. Émet `document.signed` (→ déjà consommé : recompute-qualiopi + transition dossier `scheduled` si la PR #14 garde-fous est mergée).

### F-DOC-06 — Piste d'audit
`generate-audit-trail-pdf.ts` : à partir d'une `document_signatures` signée, produit un PDF « piste d'audit » (date d'envoi = created_at/request, date de signature = signed_at, IP, user-agent, identifiant signataire, hash du document signé). Persisté kind `'autre'` ou `attestation_presence`-like ; lié au document signé. Généré automatiquement à la signature.

### F-DOC-02 — Programme
`generate-programme-pdf.ts` (modèle convention) : durée, lieu, identifiant, dates, horaires, prix, lien de connexion — injectés du dossier + sessions + modules.

### F-DOC-11 — Statut signature
Exposer dans la fiche dossier : `vu` (dernier `document_access_log` action=view sur le document) / `signé` (`document_signatures.status`). Composant lecture seule.

### F-DOC-12 — Relance signature
**Mutualiser avec ANB F-06** : un cron unique (`api/cron/transactional-emails`) qui relance et les questionnaires ET les signatures en attente (`document_signatures.status='pending'`, `request_expires_at`/délai), plafond + intervalle, via Resend.

### F-DOC-13 — Découpage convention
`extract-pdf-pages.ts` (pdf-lib) : extrait les pages de la convention du dossier groupé (ou régénère la convention seule) pour transmission financeur. Route/téléchargement gestionnaire.

## Règles de gestion (enforcement)

- **Validité e-sig financeur public = date+heure+IP** → couvert par `document_signatures` (système maison, pas de certificat qualifié). ✅
- **Envoi ≥ 1 mois avant démarrage** : `sendDossierEntree` enregistre la date d'envoi ; **alerte** si `< 1 mois` avant `dossiers.start_date` (la date de signature pilote l'éligibilité financement). Should : afficher l'échéance.
- **Attestation de fin conditionnée aux heures réelles saisies** : `generate-attestation` (F-08) ne s'active que si les heures réalisées sont saisies (moteur `0062`) — garde-fou à ajouter.
- **Certificat de réalisation pour tous les dossiers terminés** (indépendant de la satisfaction) : générer à la clôture, document administratif obligatoire.

## Modèle de données (minimal)
- (Reco) `ALTER TYPE … ADD VALUE 'dossier_entree'` (kind du document groupé) — sinon `'autre'`.
- **Zéro nouvelle table** : tout réutilise `documents` / `document_signatures` / `document_access_log` (la signature par token est déjà prévue).

## Points ouverts

1. **Convention pré-remplie (CRM) vs saisie manuelle entreprise** : F-DOC-10 est **Must** (« sans saisie manuelle »), donc **défaut = pré-rempli depuis le dossier**. La double-saisie manuelle (contrôle qualité de certains OF) = **option différée** (toggle par OF), à n'implémenter que si un client cible l'exige (YAGNI). **Reco : pré-rempli par défaut, manuel hors-scope v1.**
2. **kind `dossier_entree`** (nouvel enum) vs `'autre'`.
3. Page de signature : **généraliser `/signer`** (émargement + document) ou route document dédiée.

## ⚠️ Coordination (bloquant pour l'implémentation)
Documents/signature est **zone parallèle active** (`feature/documents-signature-persistance`, `0058`/`0063`, PR #15 docs conditionnels). Implémenter maintenant = collision (cf. doublon #13/#14). **Reco : implémenter après stabilisation du chantier parallèle.** Pièces les plus isolables : F-DOC-02 (générateur programme), F-DOC-13 (extraction pages), F-DOC-06 (générateur piste d'audit) — purs générateurs sans toucher au flux d'envoi/signature en cours côté parallèle.

## Ordre suggéré (post-coordination)
1. F-DOC-02 programme + F-DOC-13 extraction (générateurs isolés). 2. F-DOC-04 compile-dossier-entree. 3. F-DOC-05/07 flux signature document + sendDossierEntree. 4. F-DOC-06 piste d'audit (auto à la signature). 5. F-DOC-11 statut. 6. F-DOC-12 relance (cron mutualisé ANB). 7. garde-fous règles (≥1 mois, heures→attestation, certificat à la clôture). 8. E2E : envoyer dossier d'entrée → apprenant signe → audit trail + statut + transition dossier.
