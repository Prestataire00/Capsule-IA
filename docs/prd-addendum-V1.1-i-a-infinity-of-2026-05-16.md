# PRD Addendum V1.1 — Capsule IA

**Date :** 2026-05-16
**Auteur :** Ismael Lepennec
**Statut :** Intégration rétroactive de features déjà implémentées au PRD initial

> **Pourquoi cet addendum :** l'audit du code (`docs/bmad-audit-i-a-infinity-of-2026-05-16.md`) a révélé 6 features fonctionnelles dans la prod actuelle qui n'étaient pas listées au PRD initial. Ce doc les formalise en epics + FRs et met à jour la traçabilité.

---

## Nouveaux epics

### EPIC-14 — Prospects & pré-inscription publique

**Description :** capture des prospects/leads via page publique d'inscription, avant transformation en dossier formel.

**Stories estimées :** 3-5

**Priorité :** Must Have (déjà en prod, à pérenniser)

**Business value :** réduit la friction d'entrée pour les apprenants individuels (CPF, autofinancement) et alimente le pipeline commercial automatiquement.

### EPIC-15 — Espace apprenant tokenisé (sans compte)

**Description :** un apprenant accède à son espace personnel via lien tokenisé (pas d'authent compte), voit ses documents, sessions, questionnaires, peut déposer une réclamation.

**Stories estimées :** 3-5

**Priorité :** Must Have (déjà en prod)

**Business value :** zéro friction pour l'apprenant (pas de mdp à gérer), conforme à la doctrine "apprenants sans compte V1" du PRD initial.

### EPIC-16 — Trainer experience (extension EPIC-03)

**Description :** features avancées formateur (multi-organisme, self-edit profil/CV, vue mes-sessions PWA).

**Stories estimées :** 3-4

**Priorité :** Should Have (déjà en prod, polish à terminer)

**Business value :** retenir les formateurs externes qui interviennent pour plusieurs OF (pas besoin de comptes séparés).

---

## Nouveaux FRs

### EPIC-14 — Prospects

#### FR-PR-001 : Page publique d'inscription prospect

**Priorité :** Must Have
**État audit :** ✅ DONE (migration 0025, page `/inscription`, Server Action écriture anonyme)

**Description :** un visiteur peut s'inscrire à une formation depuis une page publique sans créer de compte. Saisit : nom, prénom, email, téléphone, formation visée, mode financement envisagé.

**Acceptance Criteria :**
- [ ] Page publique `/inscription` accessible sans authent
- [ ] Formulaire RHF + Zod
- [ ] Server Action écrit `prospects` avec status `new`
- [ ] Email confirmation envoyé au prospect
- [ ] Notification interne (email + in-app) à l'OF cible
- [ ] Anti-spam basique (rate limit IP, validation email format)

#### FR-PR-002 : Gestion pipeline prospects

**Priorité :** Must Have
**État audit :** ✅ DONE (pages dashboard prospects, status workflow)

**Description :** le gestionnaire OF voit ses prospects entrants, peut les qualifier/contacter, et les convertir en dossier formel.

**Acceptance Criteria :**
- [ ] Page `(dashboard)/prospects` (liste avec filtres par status)
- [ ] Actions : marquer contacted, qualified, refused, converted
- [ ] Bouton "Convertir en dossier" → pré-remplit le wizard EPIC-04
- [ ] Historique des changements de statut

#### FR-PR-003 : Conversion prospect → apprenant + dossier

**Priorité :** Should Have
**État audit :** 🟡 PARTIEL (à vérifier UI bouton conversion + lien apprenant)

**Description :** au moment de convertir un prospect, le système crée l'apprenant correspondant et démarre le wizard dossier avec les infos pré-remplies.

**Acceptance Criteria :**
- [ ] Bouton "Convertir" sur prospect status `qualified`
- [ ] Crée `learners` row + lien `prospect.converted_to_learner_id`
- [ ] Pré-remplit le wizard dossier (formation visée, apprenant créé)
- [ ] Update `prospects.status = 'converted'`

---

### EPIC-15 — Espace apprenant

#### FR-EA-001 : Génération + envoi du lien d'accès (welcome packet)

**Priorité :** Must Have
**État audit :** ✅ DONE (Server Action `sendWelcomePacketEmail`)

**Description :** quand un dossier passe en `scheduled` ou `active`, l'apprenant reçoit un email avec son lien d'accès personnel (token HMAC longue durée).

**Acceptance Criteria :**
- [ ] Handler event `dossier.scheduled` ou bouton manuel "Envoyer welcome packet"
- [ ] Template email "Bienvenue sur votre formation" avec lien tokenisé
- [ ] Token TTL : durée formation + 6 mois (post-formation pour récupération attestation)
- [ ] Idempotent (renvoyer le même lien si re-envoi)

#### FR-EA-002 : Vue documents apprenant

**Priorité :** Must Have
**État audit :** ✅ DONE (page `(apprenant)/espace/[token]/documents`)

**Description :** l'apprenant voit la liste des documents le concernant (convention, attestation, programme) et peut les télécharger.

**Acceptance Criteria :**
- [ ] Page liste documents accessible avec token valide
- [ ] Filtres par statut (signé / à signer)
- [ ] Téléchargement via signed URL Storage TTL 15 min
- [ ] Si document à signer : redirige vers `/signer/[doc_token]`

#### FR-EA-003 : Vue sessions + questionnaires apprenant

**Priorité :** Must Have
**État audit :** ✅ DONE (pages `(apprenant)/espace/[token]/sessions` et `questionnaires`)

**Description :** vue calendaire des sessions à venir/passées + questionnaires à remplir.

**Acceptance Criteria :**
- [ ] Vue calendrier sessions (date, horaire, lieu, formateur, modalité, lien Zoom si distanciel)
- [ ] Vue liste questionnaires (à remplir + complétés)
- [ ] Lien direct pour répondre questionnaire `/questionnaire/[token]`

#### FR-EA-004 : Dépôt de réclamation apprenant

**Priorité :** Must Have
**État audit :** ✅ DONE (page `(apprenant)/espace/[token]/reclamation`, RPC `submit_learner_complaint`)

**Description :** l'apprenant peut déposer une réclamation directement depuis son espace (Qualiopi I31).

**Acceptance Criteria :**
- [ ] Formulaire réclamation (sujet, description, fichier joint optionnel)
- [ ] Création `complaints` row + event `complaint.opened` (filed_by_learner = true)
- [ ] Confirmation visuelle + email
- [ ] L'admin OF reçoit notif (cf. FR-043)

---

### EPIC-16 — Trainer experience

#### FR-TR-001 : Formateur multi-organismes

**Priorité :** Must Have
**État audit :** ✅ DONE (migration 0029, RLS 0036)

**Description :** un formateur peut être rattaché à plusieurs OF (consultant externe), avec un seul compte user.

**Acceptance Criteria :**
- [ ] 1 user `auth.users` peut avoir plusieurs lignes `members` (1 par OF) avec rôle `formateur`
- [ ] Switch OF (cf. FR-005) fonctionne pour les formateurs aussi
- [ ] RLS scope correct : un formateur ne voit que ses sessions dans l'OF courant

#### FR-TR-002 : Formateur édite son profil + CV

**Priorité :** Should Have
**État audit :** ✅ DONE (pages `(formateur)/profil` et `cv`, RPC `trainers_self_edit_guard`)

**Description :** le formateur peut maintenir son propre profil (bio, compétences, tarifs) et uploader son CV (preuve Qualiopi).

**Acceptance Criteria :**
- [ ] Page `(formateur)/profil` : édition champs autorisés (bio, specialties, tarifs)
- [ ] Page `(formateur)/cv` : upload PDF CV dans bucket `trainer_cv`
- [ ] RPC guard interdit modification des champs sensibles (validation OF requise)

#### FR-TR-003 : Calendrier formateur PWA

**Priorité :** Must Have
**État audit :** ✅ DONE (déjà couvert par FR-022, mais c'est ici qu'on documente la PWA)

**Description :** le formateur a un espace dédié simplifié (PWA installable mobile-first) avec uniquement ses sessions.

**Acceptance Criteria :**
- [ ] Route group `(formateur)/` avec layout dédié (gros boutons, pas de sidebar)
- [ ] Manifest PWA installable
- [ ] Vue calendrier responsive

---

## Mises à jour traçabilité

### Nouveaux totaux PRD V1.1

| Métrique | V1 | V1.1 (avec addendum) |
|---|---|---|
| Epics | 13 | **16** |
| FRs | 53 | **63** (53 + 10 nouveaux : 3 prospects + 4 espace apprenant + 3 trainer experience) |
| Stories estimées | 55-79 | **65-90** |

### Tables ajoutées aux composants archi

| Composant archi | Tables additionnelles | Notes |
|---|---|---|
| C-02 CRM (étendu) | `prospects` (0025) | Nouveau bounded context "leads/prospects" possible V2 |
| C-13 Notification (étendu) | (welcome packet réutilise infra existante) | Email template + Server Action |
| Nouveau composant **C-14 Apprenant Portal** | (réutilise `documents`, `sessions`, `questionnaire_assignments`, `complaints`) | Pas de nouvelle table, juste route group `(apprenant)/` + RLS spéciale (token-based, pas user-based) |
| C-01 Identity (étendu) | `members` multi-org (déjà prévu FR-005, mais formateurs ajoutés) | Migration 0029, 0036 |

---

## Métriques de succès — ajouts V1.1

| Métrique | Cible V1.1 | Justification |
|---|---|---|
| **Conversion taux prospect → dossier** | > 30% | Mesure efficacité commerciale du funnel d'inscription |
| **Taux d'utilisation espace apprenant** | > 60% des apprenants se connectent au moins 1 fois | Adoption du portail apprenant |
| **Réclamations apprenant via portail** | > 80% des réclamations passent par le portail (vs téléphone/email) | Conformité Qualiopi I31 outillée |

---

## Impact sur le sprint plan V2

Ces features étant **déjà majoritairement DONE** (audit), elles **n'ajoutent que ~5 SP** au sprint plan V2 (finitions FR-PR-003 conversion + un peu de polish). Pas de sprint additionnel requis. Voir [sprint plan V2](./sprint-plan-V2-i-a-infinity-of-2026-05-16.md).

---

*Cet addendum complète le PRD initial pour refléter la réalité du code et formaliser des features déjà en prod.*
