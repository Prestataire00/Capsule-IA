# Product Requirements Document — Capsule IA

> ⚠️ **AVERTISSEMENT (2026-05-16) — DOCUMENT À REPRENDRE**
>
> Ce PRD a été rédigé sans audit préalable du code existant. Le projet est en réalité **déjà ~70-80% des features V1 cibles** implémenté (41 migrations, factures/attestations/Zoom/signature électronique en place).
>
> Ce document décrit la **vision cible**, pas un état "à construire from scratch". Il doit être lu comme une référence de scope total V1, **PAS comme une roadmap implémentation.**
>
> **Pour la roadmap réelle** = voir l'audit (`docs/bmad-audit-i-a-infinity-of-2026-05-16.md`) et le sprint plan V2 (`docs/sprint-plan-V2-i-a-infinity-of-2026-05-16.md`) à venir.

**Date :** 2026-05-16
**Auteur :** Ismael Lepennec
**Version :** 1.0 (à reprendre)
**Type de projet :** web-app
**Niveau projet :** 4 (Enterprise, 40+ stories)
**Statut :** Draft — baseline cible (pas roadmap implémentation)

---

## Document Overview

Ce PRD définit les exigences fonctionnelles (FR) et non-fonctionnelles (NFR) de **Capsule IA**, SaaS B2B multi-tenant pour organismes de formation (OF) français orientés Qualiopi. Il consolide la matière existante (CLAUDE.md, `docs/architecture/01-09-*.md`, `.cursor/rules/`) en format produit et sert de source de vérité pour les Phases 3 (architecture) et 4 (sprint planning).

**Documents liés :**
- Vision architecture : `docs/architecture/01-vision-architecture.md`
- Schéma SQL : `docs/architecture/02-schema-sql.md` (35 tables)
- Modèles domaine : `docs/architecture/03-domain-models.md`
- Catalogue events : `docs/architecture/04-events-catalog.md` (57 events)
- Politiques RLS : `docs/architecture/05-rls-policies.md`
- Frontend : `docs/architecture/06-frontend.md`
- Edge Functions : `docs/architecture/07-edge-functions.md`
- Workflows métier : `docs/architecture/08-workflows.md` (6 parcours)
- Wireframes : `docs/architecture/09-wireframes.md` (8 écrans)
- Charte UI : `.cursor/rules/70-ui-charter.mdc`

---

## Executive Summary

**Capsule IA** est un SaaS B2B multi-tenant qui outille les organismes de formation français pour la **gestion opérationnelle quotidienne** (CRM, planification, émargement, facturation) **et la conformité Qualiopi** (preuves horodatées, audit trail, indicateurs, exports auditeur). Le produit s'oppose à un LMS : il ne diffuse pas de contenu pédagogique, il pilote le cycle de vie administratif et qualité d'un dossier de formation.

**Promesse cœur :** un OF qui utilise Capsule IA doit pouvoir passer son audit Qualiopi du premier coup, sans ressortir un tableur, sans recoller des PDF à la main.

**Concept structurant :** le **Dossier** (aggregate racine) — instance de formation pour un apprenant donné, qui relie entreprise, formation, formateur, financeur, sessions, émargements, documents, questionnaires, et preuves Qualiopi. Pas de "session générique" : chaque dossier porte ses propres dates, modules, modalités.

**MVP V1 (pilote, T+3 mois, 1-3 OF early adopters) :** les 13 bounded contexts couverts, à scope ajusté — billing manuelle (pas de Stripe), automation limitée aux 6 parcours métier intégrés (pas de no-code custom).

---

## Product Goals

### Business Objectives

1. **Valider le product/market fit** sur 1-3 OF amis/early adopters d'ici T+3 mois (lancement pilote).
2. **Tenir la promesse Qualiopi** : chaque OF pilote passe son audit annuel sans incident attribuable à un manque de preuve traçable dans l'outil.
3. **Sortir l'OF des tableurs** : remplacer les outils dispersés actuels (Excel, dossiers Drive, mails) par un système de référence unique pour le cycle de vie d'un dossier.
4. **Préparer la trajectoire SaaS** : architecture multi-tenant, RLS strict, events outbox dès V1 pour éviter une refonte au moment du passage à 10-20 OF payants (V2).

### Success Metrics

| Métrique | Cible V1 | Justification |
|---|---|---|
| **TTFDC** (Time To First Dossier Closed) | < 30 jours après onboarding OF | Indicateur d'activation : si l'OF n'a pas clôturé un dossier en 30j, il n'a pas adopté l'outil |
| **NPS Qualiopi-readiness** | > 50 (audits réussis 1er passage) | Mesure la promesse cœur du produit |
| **Rétention M3** | > 90% des OF actifs | Standard SaaS B2B sur un périmètre TMS (faible churn attendu) |
| **Taux émargement numérique** | > 95% des sessions | Adoption du workflow QR mobile vs feuille papier — proxy de l'adoption opérationnelle quotidienne |

---

## Functional Requirements

Chaque FR : ID, priorité MoSCoW, description testable, critères d'acceptance, dépendances. Les FRs s'appuient sur les 6 workflows métier (`08-workflows.md`) et les 13 bounded contexts (`01-vision-architecture.md`).

---

### Identity & multi-tenant (EPIC-01)

#### FR-001 : Création d'un organisme (signup OF)

**Priorité :** Must Have

**Description :** Un fondateur d'OF peut créer son organisation (nom légal, SIRET, NDA Qualiopi, adresse), devenir `owner` automatiquement, et inviter ses collaborateurs.

**Acceptance Criteria :**
- [ ] Formulaire `/onboarding/organization` avec validation SIRET (format + unicité)
- [ ] L'utilisateur créateur obtient le rôle `owner` sur l'organisation créée
- [ ] L'`organization_id` est injecté dans le JWT custom claim et utilisé par toutes les policies RLS
- [ ] Première connexion : redirect onboarding si pas d'organisation rattachée

**Dépendances :** —

---

#### FR-002 : Gestion des rôles utilisateurs

**Priorité :** Must Have

**Description :** Le système supporte 5 rôles : `owner`, `admin`, `gestionnaire`, `formateur`, `comptable`. Chaque rôle a un périmètre RLS distinct.

**Acceptance Criteria :**
- [ ] Matrice de permissions documentée et testée pgTAP (1 test par rôle × opération critique)
- [ ] `owner` et `admin` peuvent inviter/désactiver des membres
- [ ] `formateur` ne voit que ses propres sessions (RLS)
- [ ] `comptable` ne voit que la facturation (RLS)
- [ ] Changement de rôle audité dans `audit.audit_log`

**Dépendances :** FR-001

---

#### FR-003 : Invitations par email avec lien sécurisé

**Priorité :** Must Have

**Description :** Un `owner`/`admin` invite un membre par email. L'invité reçoit un lien à usage unique TTL 7 jours pour créer son compte et rejoindre l'organisation.

**Acceptance Criteria :**
- [ ] Token HMAC + JWT TTL 7j, single-use (table `infra.processed_events`)
- [ ] Email envoyé via Resend avec template branded
- [ ] Page `/invitation/[token]` affiche nom OF, rôle proposé, accepter/refuser
- [ ] Acceptation crée le user + lien `org_members`, émet event `identity.member.joined`

**Dépendances :** FR-001, FR-002

---

#### FR-004 : MFA TOTP obligatoire pour rôles sensibles

**Priorité :** Must Have

**Description :** Les rôles `owner`, `admin`, `comptable` doivent activer un second facteur TOTP (Google Authenticator, 1Password, etc.) à la première connexion ou dans les 7 jours suivant l'attribution du rôle.

**Acceptance Criteria :**
- [ ] Page `/security/mfa` génère un secret TOTP + QR code
- [ ] Vérification du premier code avant activation
- [ ] Codes de récupération (10) générés et téléchargeables 1 seule fois
- [ ] Blocage de la session après 7j si MFA non configuré pour ces rôles
- [ ] Désactivation MFA → audit + notification email à tous les `owner`

**Dépendances :** FR-002

---

#### FR-005 : Switch d'organisation (multi-org pour superviseurs)

**Priorité :** Should Have

**Description :** Un utilisateur rattaché à plusieurs OF (cas consultant, comptable externe) peut basculer entre ses organisations sans se reconnecter.

**Acceptance Criteria :**
- [ ] Dropdown header liste les organisations actives de l'utilisateur
- [ ] Switch met à jour le JWT custom claim `org_id` et recharge le contexte
- [ ] Toutes les requêtes RLS post-switch utilisent le nouveau contexte (testé pgTAP)

**Dépendances :** FR-001

---

### CRM (EPIC-02)

#### FR-006 : Gestion entreprises clientes

**Priorité :** Must Have

**Description :** CRUD entreprises clientes : raison sociale, SIRET, adresse, contacts, secteur d'activité, taille. Vue liste + fiche détail + historique des dossiers liés.

**Acceptance Criteria :**
- [ ] Création/édition/archivage (soft delete) d'une entreprise
- [ ] Recherche full-text sur raison sociale + SIRET
- [ ] Fiche entreprise affiche tous les dossiers et apprenants liés
- [ ] Export CSV des entreprises filtrées

**Dépendances :** FR-001

---

#### FR-007 : Gestion contacts entreprise

**Priorité :** Must Have

**Description :** Une entreprise a plusieurs contacts (RH, manager, comptabilité). Chaque contact a un rôle métier et reçoit ou non les communications selon le type.

**Acceptance Criteria :**
- [ ] CRUD contacts attachés à une entreprise
- [ ] Flag `receives_invoices`, `receives_certificates`, `receives_planning`
- [ ] Sélection automatique du contact destinataire selon le type de communication
- [ ] Au moins 1 contact actif par entreprise (invariant)

**Dépendances :** FR-006

---

#### FR-008 : Gestion apprenants

**Priorité :** Must Have

**Description :** CRUD apprenants : nom, prénom, email, téléphone, entreprise de rattachement (optionnelle pour individuel), date naissance, accessibilité (handicap), niveau pré-formation.

**Acceptance Criteria :**
- [ ] Création depuis fiche entreprise ou autonome (individuel/CPF)
- [ ] Champ accessibilité conforme Qualiopi indicateur 26
- [ ] Historique des dossiers de l'apprenant
- [ ] Anti-doublon : alerte si email/téléphone déjà présent dans l'OF
- [ ] Email = identifiant naturel pour signatures et questionnaires

**Dépendances :** FR-006

---

#### FR-009 : Import CSV apprenants en masse

**Priorité :** Should Have

**Description :** Import CSV d'apprenants pour bootstrap d'un nouvel OF migrant depuis Excel. Mapping colonnes guidé, validation, preview avant import.

**Acceptance Criteria :**
- [ ] Upload CSV jusqu'à 5 MB / 5000 lignes
- [ ] Mapping colonnes interactif (drag-drop)
- [ ] Preview avec erreurs ligne par ligne (format email, SIRET, doublons)
- [ ] Import transactionnel : tout ou rien
- [ ] Rapport import téléchargeable

**Dépendances :** FR-008

---

### Catalogue formations (EPIC-03)

#### FR-010 : Création formation (template)

**Priorité :** Must Have

**Description :** Une `Formation` est un template réutilisable : titre, durée standard, prérequis, objectifs pédagogiques, modules, modalités (présentiel/distanciel/mixte).

**Acceptance Criteria :**
- [ ] CRUD formation avec versioning (une formation peut être éditée sans casser les dossiers existants qui la référencent)
- [ ] Objectifs pédagogiques structurés (liste, conformes Qualiopi I12)
- [ ] Modalités cochables avec contraintes (e.g. distanciel → durée Zoom requise)
- [ ] Soft delete : formation supprimée reste accessible aux dossiers historiques

**Dépendances :** FR-001

---

#### FR-011 : Catalogue modules (sous-éléments d'une formation)

**Priorité :** Must Have

**Description :** Une formation est décomposée en `modules` (chapitres). Chaque module a un titre, durée, objectifs, méthodes pédagogiques, évaluation prévue.

**Acceptance Criteria :**
- [ ] CRUD modules attachés à une formation
- [ ] Réordonnancement drag-drop
- [ ] Somme des durées modules = durée totale formation (invariant ou warning)
- [ ] Modules réutilisables entre formations (templates partagés)

**Dépendances :** FR-010

---

#### FR-012 : Bibliothèque de formateurs

**Priorité :** Must Have

**Description :** CRUD formateurs : compétences (tags), tarif horaire/journalier, disponibilité indicative, statut actif/archivé. Un formateur peut être interne (user lié) ou externe (entité référencée sans accès).

**Acceptance Criteria :**
- [ ] Formateur interne = lien vers `user_id` (rôle `formateur`)
- [ ] Formateur externe = entité standalone (nom, email, tarif, sans compte)
- [ ] Recherche par compétence (tags)
- [ ] Historique des dossiers où le formateur est intervenu

**Dépendances :** FR-002

---

### Dossier (EPIC-04, CORE)

#### FR-013 : Wizard création dossier en 3 étapes

**Priorité :** Must Have

**Description :** Création d'un dossier guidée en 3 steps avec brouillon persistant (`dossier_drafts`) : (1) apprenant + entreprise + financeur, (2) formation + modules + dates, (3) formateurs + modalités + récap.

**Acceptance Criteria :**
- [ ] Brouillon auto-sauvegardé à chaque step (résilience perte connexion)
- [ ] Validation Zod incrémentale par step
- [ ] Possibilité de quitter et reprendre dans les 7 jours (brouillon expiré au-delà)
- [ ] Validation finale → `createDossierAction` → RPC `save_dossier` → event `dossier.created`

**Dépendances :** FR-006, FR-008, FR-010, FR-012

---

#### FR-014 : Cycle de vie dossier (états et transitions)

**Priorité :** Must Have

**Description :** Le dossier suit la machine à états `draft → pending_validation → scheduled → active → completed → closed`. Chaque transition émet un event, certaines vérifient des invariants bloquants.

**Acceptance Criteria :**
- [ ] Implémentation pure dans `features/dossier/domain` (testée Vitest, 100% des transitions)
- [ ] Transition `scheduled` exige `modules.length > 0 && trainers.length > 0`
- [ ] Transition `closed` exige `ClosingChecklist.isReady === true` (voir FR-035)
- [ ] Historique des transitions tracé dans `dossier_status_history` (audit)
- [ ] UI : badge état + actions contextuelles par état

**Dépendances :** FR-013

---

#### FR-015 : Ajout/retrait modules à un dossier

**Priorité :** Must Have

**Description :** Sur un dossier `draft` ou `pending_validation`, ajouter/retirer des modules. Une fois `scheduled`, modification bloquée (sauf cas exceptionnel `admin`).

**Acceptance Criteria :**
- [ ] Sélection depuis catalogue ou création ad-hoc
- [ ] Event `dossier.module.added` / `dossier.module.removed`
- [ ] Recalcul automatique de la durée totale et des dates de sessions par défaut
- [ ] Modification post-`scheduled` réservée `admin` + audit trail enrichi

**Dépendances :** FR-014, FR-011

---

#### FR-016 : Assignation formateurs au dossier

**Priorité :** Must Have

**Description :** Assigner 1 ou plusieurs formateurs à un dossier. Chaque formateur peut être assigné à des modules spécifiques ou à tout le dossier.

**Acceptance Criteria :**
- [ ] Sélection depuis bibliothèque formateurs
- [ ] Assignation au niveau dossier ou module
- [ ] Event `dossier.trainer.assigned`
- [ ] Notification email au formateur (si interne avec compte)
- [ ] Couverture vérifiée : tous les modules ont au moins 1 formateur avant `scheduled`

**Dépendances :** FR-014, FR-012

---

#### FR-017 : Gestion financeurs (OPCO, CPF, employeur, autofinancement)

**Priorité :** Must Have

**Description :** Un dossier peut être financé par 0..N financeurs avec répartition. Statuts : `pending`, `approved`, `refused`. Champs : montant, n° de prise en charge, dates.

**Acceptance Criteria :**
- [ ] CRUD financeurs sur un dossier
- [ ] Types : OPCO, CPF, Pôle Emploi, employeur, autofinancement
- [ ] Champs spécifiques selon type (e.g. n° dossier OPCO obligatoire)
- [ ] Total financements ≥ coût formation (warning si écart)
- [ ] Event `dossier.funder.added` / `dossier.funder.status_changed`

**Dépendances :** FR-014

---

#### FR-018 : Validation et planification dossier (transition `scheduled`)

**Priorité :** Must Have

**Description :** Action `scheduleDossierAction` qui vérifie invariants, crée les sessions par défaut, déclenche convocations, questionnaire positionnement, et création Zoom si distanciel.

**Acceptance Criteria :**
- [ ] Invariants stricts (modules > 0, formateurs > 0, dates cohérentes)
- [ ] Handlers déclenchés : créer sessions, envoyer convocations apprenant + formateur, assigner questionnaire positionnement, créer meeting Zoom (si distanciel)
- [ ] Idempotence : ré-exécution n'envoie pas en double (table `processed_events`)
- [ ] Rollback transactionnel si un handler échoue (sauf side-effects externes : tracés en dead-letter)

**Dépendances :** FR-014, FR-015, FR-016

---

#### FR-019 : Activation dossier jour J

**Priorité :** Must Have

**Description :** Bouton manuel "Activer" disponible 24h avant la première session. Transition `scheduled → active`, déclenche handlers de kickoff (rappel formateur, vérification présence apprenants attendus).

**Acceptance Criteria :**
- [ ] Bouton actif si `now() >= first_session.start - 24h`
- [ ] Transition manuelle (pas auto, pour laisser l'admin annuler/reporter)
- [ ] Event `dossier.activated`
- [ ] Notif formateur "Votre dossier démarre demain"

**Dépendances :** FR-018

---

#### FR-020 : Brouillon dossier (persistance wizard)

**Priorité :** Should Have

**Description :** Le wizard 3-steps sauvegarde chaque modification dans `dossier_drafts` (TTL 7j). Permet de reprendre après crash navigateur ou interruption.

**Acceptance Criteria :**
- [ ] Sauvegarde debounce 1s
- [ ] Liste des brouillons accessible depuis `/dossiers/nouveaux`
- [ ] Suppression auto à J+7
- [ ] Validation finale supprime le brouillon

**Dépendances :** FR-013

---

### Planification & sessions (EPIC-05)

#### FR-021 : Sessions par défaut générées à partir du dossier

**Priorité :** Must Have

**Description :** À la transition `scheduled`, le système génère 1 session par "journée pédagogique" prévue (basé sur modules.durée + dates dossier). Sessions modifiables ensuite.

**Acceptance Criteria :**
- [ ] Algorithme de découpage : durée totale / 7h max par jour
- [ ] Sessions placées sur jours ouvrés par défaut (paramétrable)
- [ ] Édition manuelle possible (split, fusion, déplacement)
- [ ] Event `session.created`

**Dépendances :** FR-018

---

#### FR-022 : Calendrier vue formateur

**Priorité :** Must Have

**Description :** Vue calendrier `/mes-sessions` affichant toutes les sessions du formateur connecté. Filtres : période, dossier, statut.

**Acceptance Criteria :**
- [ ] Vue mois + semaine + jour
- [ ] Clic session ouvre détail (dossier, apprenant, lieu, modalité)
- [ ] Boutons "Ouvrir feuille d'émargement" si session active
- [ ] RLS : formateur ne voit que ses propres sessions

**Dépendances :** FR-021, FR-002

---

#### FR-023 : Création Zoom V1.5 (distanciel)

**Priorité :** Must Have

**Description :** Pour les sessions en distanciel, création automatique d'un meeting Zoom via API V1.5 au moment de la planification du dossier.

**Acceptance Criteria :**
- [ ] Edge Function `create-zoom-meeting` appelée par handler d'event
- [ ] URL meeting + ID + passcode stockés sur la session
- [ ] Renvoi du lien dans la convocation apprenant
- [ ] Gestion erreur API : retry x3, sinon dead-letter + alerte
- [ ] Token Zoom rafraîchi automatiquement (refresh token)

**Dépendances :** FR-021

---

#### FR-024 : Gestion changements de planning

**Priorité :** Should Have

**Description :** Modifier date/heure d'une session déjà planifiée : envoi automatique d'un email de notification au formateur et aux apprenants.

**Acceptance Criteria :**
- [ ] Modal édition session avec champs date/heure/lieu/modalité
- [ ] Event `session.rescheduled` avec ancien et nouveau créneau
- [ ] Email envoyé via Resend à tous les participants
- [ ] Mise à jour Zoom si distanciel
- [ ] Trace dans audit log

**Dépendances :** FR-021

---

### Émargement (EPIC-06)

#### FR-025 : Ouverture feuille d'émargement (formateur)

**Priorité :** Must Have

**Description :** Le formateur ouvre la feuille d'émargement d'une session active depuis `/mes-sessions`. Le système génère 1 token JWT par participant attendu.

**Acceptance Criteria :**
- [ ] Bouton actif si session `active` et `now()` ∈ [start - 30min, end + 1h]
- [ ] INSERT `attendance_sheets(status='open')`
- [ ] 1 JWT signé par participant (TTL = durée session + 2h)
- [ ] QR code généré (1 global avec sélection nom OU 1 par apprenant)

**Dépendances :** FR-019, FR-021

---

#### FR-026 : Signature mobile apprenant via QR

**Priorité :** Must Have

**Description :** L'apprenant scanne le QR projeté → page mobile `/signer/[token]` → signe sur canvas → POST Edge Function `sign-document` scope `sign-attendance`.

**Acceptance Criteria :**
- [ ] Page mobile-first optimisée smartphone (375px min)
- [ ] Canvas signature avec doigt ou stylet
- [ ] Validation : signature non vide, dessin > 50 points
- [ ] Vérif token HMAC + expiration + single-use (`processed_events`)
- [ ] Confirmation visuelle après signature
- [ ] Event `attendance.signature.captured`
- [ ] IP + user-agent loggés (preuve Qualiopi)

**Dépendances :** FR-025

---

#### FR-027 : Vue temps réel des signatures (formateur)

**Priorité :** Must Have

**Description :** Pendant l'émargement, le formateur voit la liste des participants avec leur statut signé/en attente en temps réel via Supabase Realtime.

**Acceptance Criteria :**
- [ ] Subscription Realtime sur `attendance_signatures` filtrée par `sheet_id`
- [ ] Liste participants avec coche verte / sablier orange
- [ ] Bouton "Finaliser" actif quand 100% ou explicite `admin` override
- [ ] Reconnexion automatique si perte de socket

**Dépendances :** FR-026

---

#### FR-028 : Finalisation feuille + PDF preuve Qualiopi

**Priorité :** Must Have

**Description :** Finalisation par le formateur → status `completed` → handler `generate-attendance-document` génère un PDF preuve Qualiopi (liste signataires, IP, horodatages, signatures rasterisées).

**Acceptance Criteria :**
- [ ] Bouton "Finaliser" → transition `open → completed`
- [ ] Event `attendance.sheet.finalized`
- [ ] PDF généré via Edge Function (docxtemplater + conversion PDF)
- [ ] Hash SHA-256 du PDF stocké sur la feuille (preuve immuabilité)
- [ ] PDF attaché comme preuve Qualiopi sur le dossier (I22/I23)

**Dépendances :** FR-027

---

### Documents & signature électronique (EPIC-07)

#### FR-029 : Templates documents (DOCX)

**Priorité :** Must Have

**Description :** Bibliothèque de templates DOCX (convention, convocation, attestation, programme, règlement intérieur) avec variables Jinja-style remplies à la génération.

**Acceptance Criteria :**
- [ ] Upload template DOCX dans Storage (path `org_id/templates/`)
- [ ] Parser variables disponibles (catalogue de placeholders documenté)
- [ ] Preview rendu sur un dossier test
- [ ] Versioning : une nouvelle version ne casse pas les documents déjà générés

**Dépendances :** FR-001

---

#### FR-030 : Génération document à la demande

**Priorité :** Must Have

**Description :** Depuis un dossier, déclencher la génération d'un document (convention, convocation, etc.). Edge Function combine template + données + docxtemplater + PizZip.

**Acceptance Criteria :**
- [ ] Action `requestDocumentGenerationAction` côté UI
- [ ] Edge Fn `generate-document` synchrone (< 5s p95)
- [ ] Hash SHA-256 calculé et stocké
- [ ] Event `documents.document.generated`
- [ ] Document accessible via signed URL (TTL 15min)
- [ ] Possibilité de re-générer (versioning)

**Dépendances :** FR-029, FR-013

---

#### FR-031 : Demande de signature électronique

**Priorité :** Must Have

**Description :** Sur un document généré, demander signature de l'apprenant ou du formateur. Email envoyé avec lien single-use.

**Acceptance Criteria :**
- [ ] Action `requestSignatureAction`
- [ ] INSERT `document_signatures(status='pending')`
- [ ] Token HMAC + JWT TTL 30j
- [ ] Email Resend avec template + lien `/signer/[token]`
- [ ] Event `documents.signature.requested`

**Dépendances :** FR-030

---

#### FR-032 : Signature document via lien email

**Priorité :** Must Have

**Description :** Le signataire clique le lien → page `/signer/[token]` → canvas signature → POST Edge Function `sign-document` qui vérifie token, hash document au moment de la signature, upload PNG, marque signé.

**Acceptance Criteria :**
- [ ] Vérif HMAC + JWT + single-use
- [ ] Affichage du document avant signature (preview PDF)
- [ ] Canvas signature
- [ ] Hash document = hash original (sinon refus + alerte tampering)
- [ ] Upload PNG signature dans Storage
- [ ] UPDATE `document_signatures(status='completed', signed_at, ip, user_agent)`
- [ ] Event `documents.signature.completed`

**Dépendances :** FR-031

---

#### FR-033 : Attachement signature comme preuve Qualiopi

**Priorité :** Must Have

**Description :** À la signature complétée d'un document Qualiopi-pertinent (convention, attestation, RI), handler attache automatiquement la preuve sur le dossier et l'indicateur concerné.

**Acceptance Criteria :**
- [ ] Mapping document_type → indicateur Qualiopi documenté
- [ ] Handler `attach-signature-as-qualiopi-proof`
- [ ] UPDATE `qualiopi_dossier_checklists` correspondante
- [ ] Recompute du flag `is_ready` global du dossier

**Dépendances :** FR-032, FR-035

---

### Conformité Qualiopi (EPIC-08)

#### FR-034 : Checklist Qualiopi par dossier (32 indicateurs)

**Priorité :** Must Have

**Description :** Chaque dossier porte une checklist des 32 indicateurs Qualiopi avec statut `missing`, `present`, `na` (non applicable). Auto-populée par events au fil de la vie du dossier.

**Acceptance Criteria :**
- [ ] Table `qualiopi_dossier_checklists(dossier_id, indicator_id, status, evidence_url)`
- [ ] Vue UI sur le dossier : tableau 32 lignes avec statut coloré
- [ ] Recompute automatique sur events pertinents (signature, questionnaire, document généré)
- [ ] Marquage manuel `na` avec justification obligatoire

**Dépendances :** FR-013

---

#### FR-035 : Closing checklist bloquante

**Priorité :** Must Have

**Description :** À la tentative de transition `completed → closed`, calcul de la `ClosingChecklist` qui vérifie : indicateurs Qualiopi bloquants présents, signatures toutes complétées, émargements finalisés, questionnaires positionnement + satisfaction chaud complétés. Bloque si manquant.

**Acceptance Criteria :**
- [ ] Port `QualiopiReadinessPort` implémenté dans `features/qualiopi/infrastructure`
- [ ] Liste des indicateurs bloquants vs non-bloquants configurable
- [ ] UI affiche la liste des manquants avec lien direct pour résoudre
- [ ] `dossier.close()` retourne `Result.err({ code: 'closing_blocked', reasons: [...] })` si non prêt

**Dépendances :** FR-014, FR-034

---

#### FR-036 : Tableau de bord Qualiopi global

**Priorité :** Must Have

**Description :** Vue `/qualiopi` : matrice de conformité de tous les dossiers actifs/clôturés de l'OF. Permet de voir d'un coup d'œil où il manque des preuves.

**Acceptance Criteria :**
- [ ] Tableau dossiers × 32 indicateurs (heatmap colorée)
- [ ] Filtres : période, statut dossier, indicateur
- [ ] Drill-down : clic case → fiche dossier sur l'indicateur
- [ ] Export PDF du tableau pour le responsable qualité

**Dépendances :** FR-034

---

#### FR-037 : Export audit Qualiopi annuel

**Priorité :** Must Have

**Description :** Génération d'un export complet (ZIP) pour audit Qualiopi annuel : tous les dossiers de la période, leurs preuves, questionnaires agrégés, réclamations.

**Acceptance Criteria :**
- [ ] Edge Function `qualiopi-audit-export` async (job)
- [ ] Sélection période + filtres (formations, contextes)
- [ ] ZIP contenant : index PDF, dossiers/ avec preuves, questionnaires.csv, complaints.csv
- [ ] Event `qualiopi.audit.exported`
- [ ] Téléchargement signed URL TTL 24h
- [ ] Limite : 1 export en cours max par OF

**Dépendances :** FR-034, FR-039, FR-043

---

#### FR-038 : Notification preuves manquantes

**Priorité :** Should Have

**Description :** Cron quotidien qui détecte les dossiers `active` ou `completed` avec preuves manquantes depuis > 7j et notifie l'admin.

**Acceptance Criteria :**
- [ ] Cron pg_cron quotidien
- [ ] Détection : `qualiopi_dossier_checklists.status='missing'` AND blocking AND age > 7j
- [ ] Notification email + notification in-app
- [ ] Lien direct vers le dossier concerné

**Dépendances :** FR-034

---

### Questionnaires (EPIC-09)

#### FR-039 : Templates questionnaires (positionnement, satisfaction chaud, satisfaction froid)

**Priorité :** Must Have

**Description :** Bibliothèque de templates de questionnaires (Likert, choix multiples, texte libre). 3 templates système livrés : positionnement (I10), satisfaction chaud (I26), satisfaction froid (I27).

**Acceptance Criteria :**
- [ ] CRUD templates avec questions configurables
- [ ] Types de question : single choice, multi choice, Likert 1-5, texte
- [ ] Templates système non éditables (clonage autorisé)
- [ ] Preview rendu apprenant

**Dépendances :** FR-001

---

#### FR-040 : Assignation automatique questionnaires sur events dossier

**Priorité :** Must Have

**Description :** Handlers d'events qui assignent automatiquement les questionnaires aux apprenants : positionnement à `dossier.scheduled`, satisfaction chaud à `dossier.completed`, satisfaction froid à `dossier.completed + 90j` (event différé).

**Acceptance Criteria :**
- [ ] Handler `assign-positioning-questionnaire`
- [ ] Handler `assign-hot-satisfaction-questionnaire`
- [ ] Handler `schedule-cold-satisfaction-questionnaire` (event différé via pg_cron)
- [ ] INSERT `questionnaire_assignments(token, expires_at)`
- [ ] Email avec lien `/questionnaire/[token]`

**Dépendances :** FR-018, FR-039

---

#### FR-041 : Réponse questionnaire apprenant

**Priorité :** Must Have

**Description :** L'apprenant clique le lien → page `/questionnaire/[token]` → remplit → soumet. Vérif token, single-use, INSERT réponses, event.

**Acceptance Criteria :**
- [ ] Page mobile-first
- [ ] Vérif HMAC + JWT + single-use
- [ ] Sauvegarde brouillon (résilience)
- [ ] Soumission → INSERT `questionnaire_responses` + `questionnaire_response_items`
- [ ] Event `questionnaire.completed`
- [ ] Confirmation visuelle

**Dépendances :** FR-040

---

#### FR-042 : Relances automatiques questionnaires non remplis

**Priorité :** Should Have

**Description :** Cron quotidien : relance email à J+3 et J+7 si questionnaire non rempli. Expiration à J+14 (statut `expired`, sortie du calcul NPS).

**Acceptance Criteria :**
- [ ] pg_cron quotidien
- [ ] 2 relances max espacées
- [ ] Statut `expired` après TTL
- [ ] Event `questionnaire.expired`
- [ ] Stats accessibles : taux de réponse par campagne

**Dépendances :** FR-040, FR-041

---

### Réclamations (EPIC-10, Qualiopi I31)

#### FR-043 : Ouverture réclamation

**Priorité :** Must Have

**Description :** L'admin enregistre une réclamation reçue (par téléphone, mail, ou via formulaire public futur). Champs : réclamant, dossier lié (optionnel), nature, description, gravité.

**Acceptance Criteria :**
- [ ] Formulaire `/reclamations/nouvelle`
- [ ] INSERT `complaints` + `complaint_events(kind='comment')`
- [ ] Event `complaint.opened`
- [ ] Handler `notify-quality-team` (email responsable qualité)
- [ ] Réclamation visible dans Qualiopi dashboard

**Dépendances :** FR-001

---

#### FR-044 : Investigation et assignation

**Priorité :** Must Have

**Description :** Assignation à un responsable, ajout de commentaires d'investigation chronologiques, changement de statut (`open → in_progress → resolved`).

**Acceptance Criteria :**
- [ ] Action `assignComplaint` + event `complaint.assigned`
- [ ] Commentaires via `complaint_events(kind='comment')`
- [ ] Action `resolveComplaint(resolution)` + event `complaint.resolved`
- [ ] Handler `notify-reporter` à la résolution
- [ ] Auto-clôture J+30 si pas de retour réclamant

**Dépendances :** FR-043

---

#### FR-045 : Export réclamations pour audit annuel

**Priorité :** Must Have

**Description :** Inclus dans l'export Qualiopi annuel (FR-037) : liste de toutes les réclamations de la période avec délai de traitement et résolution.

**Acceptance Criteria :**
- [ ] CSV `complaints.csv` dans le ZIP audit
- [ ] Colonnes : date, réclamant, dossier, nature, statut, délai_résolution, résolution
- [ ] Event `qualiopi.audit.exported` inclut comptes réclamations

**Dépendances :** FR-037, FR-044

---

### Facturation (EPIC-11)

> **Note V1 :** Stripe explicitement hors scope. Facturation V1 = génération PDF + suivi manuel paiement.

#### FR-046 : Génération facture depuis dossier

**Priorité :** Must Have

**Description :** Sur un dossier `closed`, génération automatique d'une facture en draft depuis les données dossier + financeurs (handler `issue-final-invoice`).

**Acceptance Criteria :**
- [ ] Handler déclenché par event `dossier.closed`
- [ ] Calcul automatique : prix dossier × répartition financeurs
- [ ] N° facture séquentiel par OF (compteur `infra.invoice_counters`)
- [ ] Génération PDF via template DOCX
- [ ] Statut `draft` éditable avant validation

**Dépendances :** FR-035, FR-017

---

#### FR-047 : Édition et validation facture

**Priorité :** Must Have

**Description :** Le comptable édite (lignes, mentions légales, conditions) puis valide la facture. Une fois validée, immuable (sauf avoir).

**Acceptance Criteria :**
- [ ] CRUD lignes de facture
- [ ] Bouton "Valider" → status `validated` + figement
- [ ] Envoi email automatique au contact `receives_invoices`
- [ ] PDF final attaché au dossier comme preuve

**Dépendances :** FR-046, FR-007

---

#### FR-048 : Suivi paiements manuel

**Priorité :** Must Have

**Description :** Le comptable marque une facture comme payée (date, mode : virement/chèque, référence). Pas d'intégration bancaire en V1.

**Acceptance Criteria :**
- [ ] Bouton "Marquer payée" sur facture validée
- [ ] Champs : date, montant, mode, référence, commentaire
- [ ] Statut `paid` + event `billing.invoice.paid`
- [ ] Vue "Factures impayées" avec filtre âge
- [ ] Export CSV pour relances

**Dépendances :** FR-047

---

### Automation (EPIC-12)

> **Note V1 :** Workflows custom no-code = V2. V1 = 6 parcours métier intégrés (docs 08).

#### FR-049 : Outbox dispatcher (infra core)

**Priorité :** Must Have

**Description :** Infrastructure de dispatch des events stockés dans `infra.domain_events` vers leurs handlers (Edge Functions). Idempotence + retry exponentiel + dead-letter.

**Acceptance Criteria :**
- [ ] pg_cron toutes les 30s appelle Edge Function `dispatch-events`
- [ ] Idempotence via `infra.processed_events(event_id, handler_name)` UNIQUE
- [ ] Retry exponentiel `attempts++, next_retry_at = now() + 2^attempts min`, max 8 tentatives
- [ ] Au-delà → `infra.event_dead_letter` + alerte ops
- [ ] Métriques : events traités/min, taux erreur, dead-letter count

**Dépendances :** —

---

#### FR-050 : Catalogue d'events typés Zod

**Priorité :** Must Have

**Description :** Tous les events métier (57 types) sont définis dans `apps/web/features/_events/<context>.events.ts` avec schema Zod. Validation au runtime, type-safety au compile.

**Acceptance Criteria :**
- [ ] Registre central des events
- [ ] Schema Zod par event
- [ ] Validation à l'insertion dans `domain_events`
- [ ] Test : émission event invalide → rejet + log

**Dépendances :** —

---

#### FR-051 : Handlers métier intégrés (6 parcours)

**Priorité :** Must Have

**Description :** Implémentation des handlers pour les 6 workflows métier décrits dans `08-workflows.md` (création dossier, signature, émargement, questionnaires, clôture Qualiopi, réclamations).

**Acceptance Criteria :**
- [ ] 1 handler = 1 Edge Function nommée explicitement
- [ ] Tests unitaires de chaque handler
- [ ] Documentation : événement déclencheur, side-effects, erreurs possibles
- [ ] Métriques par handler (succès/échecs)

**Dépendances :** FR-049, FR-050

---

### Notifications (EPIC-13)

#### FR-052 : Email via Resend

**Priorité :** Must Have

**Description :** Intégration Resend pour tous les emails sortants (invitations, convocations, signatures, relances questionnaires, notifications).

**Acceptance Criteria :**
- [ ] Client Resend dans `shared/notification/resend.ts`
- [ ] Templates email centralisés (React Email)
- [ ] Branding OF (logo, couleurs) configurable par organisation
- [ ] Logs envois dans `notification_logs`
- [ ] Webhook Resend pour tracking bounce/complaint

**Dépendances :** —

---

#### FR-053 : Notifications in-app

**Priorité :** Should Have

**Description :** Cloche notification dans le header avec compteur. Stockage en BDD, mark as read, sub Realtime.

**Acceptance Criteria :**
- [ ] Table `user_notifications`
- [ ] Realtime subscription dans header
- [ ] Mark as read individuel ou bulk
- [ ] Filtrage par type (qualiopi, planning, billing)

**Dépendances :** —

---

## Non-Functional Requirements

---

### NFR-001 : Sécurité — Multi-tenant RLS strict

**Priorité :** Must Have

**Description :** Toute table métier porte `organization_id`. Toutes les tables ont RLS `enabled + forced`. Aucune query client ne peut traverser les frontières d'organisation.

**Acceptance Criteria :**
- [ ] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY; FORCE ROW LEVEL SECURITY;` sur 100% des tables métier (vérifié par script CI)
- [ ] 1 policy par opération (SELECT/INSERT/UPDATE/DELETE) avec test pgTAP
- [ ] Aucun usage de `service_role` côté client (lint custom)
- [ ] Test cross-tenant : user de OF A ne lit/écrit jamais données de OF B

**Rationale :** Mono-tenancy logique impossible à rajouter après coup. Erreur d'isolation = fuite RGPD majeure.

---

### NFR-002 : Conformité Qualiopi — Preuves immuables

**Priorité :** Must Have

**Description :** Toute preuve Qualiopi générée (signature, document, attestation) porte un hash SHA-256 stocké en BDD. Audit trail complet append-only via triggers Postgres.

**Acceptance Criteria :**
- [ ] Hash SHA-256 calculé à la génération et stocké
- [ ] Vérification hash à la consultation (mismatch → alerte)
- [ ] `audit.audit_log` append-only (REVOKE UPDATE/DELETE)
- [ ] Soft delete par défaut, hard delete uniquement via Edge Fn anonymisation RGPD

**Rationale :** Auditeur Qualiopi exige immuabilité démontrable des preuves.

---

### NFR-003 : RGPD — Droit à l'oubli outillé

**Priorité :** Must Have

**Description :** Edge Function d'anonymisation d'un apprenant : remplace données identifiantes par hash anonyme, conserve les enregistrements pour conformité Qualiopi mais sans réversibilité.

**Acceptance Criteria :**
- [ ] Action réservée `owner`
- [ ] Champs anonymisés : nom, prénom, email, téléphone → `anonymized_<uuid>`
- [ ] Signatures rasterisées : effacement définitif du PNG
- [ ] Conservation : statistiques + références obligatoires Qualiopi
- [ ] Audit trail de la demande + exécution

**Rationale :** Demande d'effacement RGPD vs preuves Qualiopi (6 ans obligatoires) — équilibre légalement défendable.

---

### NFR-004 : Performance — Server Actions p95 < 300 ms

**Priorité :** Should Have

**Description :** 95% des Server Actions (hors génération documentaire) répondent en moins de 300 ms.

**Acceptance Criteria :**
- [ ] Tracing OpenTelemetry sur toutes les actions
- [ ] Dashboard temps de réponse p50/p95/p99
- [ ] Optimisations : RPCs Postgres (pas N+1), TanStack Query cache
- [ ] Alerte si p95 > 500ms pendant 5 min

**Rationale :** Sensation de fluidité pour utilisateurs admin/gestionnaire qui font 100+ actions/jour.

---

### NFR-005 : Performance — Génération documentaire p95 < 5 s

**Priorité :** Must Have

**Description :** Génération d'un document (convention, attestation, facture) < 5 s p95 en synchrone. Au-delà : asynchrone avec notification.

**Acceptance Criteria :**
- [ ] Edge Function `generate-document` mesurée et alertée
- [ ] Fallback async si timeout 8s (job + notif)

**Rationale :** UX : utilisateur attend, doit voir le résultat sans bascule visuelle.

---

### NFR-006 : Mobile-first signatures et émargement

**Priorité :** Must Have

**Description :** Toutes les pages publiques (signature, émargement, questionnaire) sont optimisées smartphone (375px min). Layout, polices, canvas dimensionnés tactile.

**Acceptance Criteria :**
- [ ] Test Playwright sur viewports 375/414/768 px
- [ ] Canvas signature taille minimum 250×100 px sur mobile
- [ ] Boutons touch-targets ≥ 44×44 px
- [ ] Test sur iOS Safari + Chrome Android (BrowserStack ou manuel)

**Rationale :** Apprenants signent depuis leur téléphone en salle de formation, jamais d'ordinateur.

---

### NFR-007 : Disponibilité — SLO 99.5% jours ouvrés

**Priorité :** Should Have

**Description :** SLO 99.5% uptime sur les jours ouvrés (lun-ven 8h-19h CET). Disponibilité best-effort en soirée/week-end.

**Acceptance Criteria :**
- [ ] Monitoring uptime (Better Stack ou équivalent)
- [ ] Health endpoint `/api/health` (DB + Storage + Edge Fn ping)
- [ ] Page status publique
- [ ] Runbook incident dans `docs/runbooks/`

**Rationale :** SaaS B2B utilisé en journée. Coût d'une SLO 99.99% disproportionné au stade pilote.

---

### NFR-008 : Idempotence outbox & tokens

**Priorité :** Must Have

**Description :** Tous les handlers d'events + tous les tokens single-use (signature, questionnaire, invitation) sont idempotents : 2× même requête = même résultat, jamais de side-effect double.

**Acceptance Criteria :**
- [ ] Table `infra.processed_events(event_id, handler_name)` UNIQUE
- [ ] Tokens HMAC + JWT consommés via INSERT dans `processed_events` avant action
- [ ] Tests : replay event 10× → 1 seul side-effect

**Rationale :** Réseaux instables (mobile), retry HTTP, click double — sans idempotence = données corrompues.

---

### NFR-009 : Accessibilité WCAG AA pour pages publiques

**Priorité :** Should Have

**Description :** Pages publiques (signature, questionnaire) respectent WCAG 2.1 niveau AA. Contrastes, labels ARIA, navigation clavier.

**Acceptance Criteria :**
- [ ] Audit Axe DevTools : 0 erreur sur pages publiques
- [ ] Labels explicites sur tous les champs
- [ ] Focus visible
- [ ] Alternative texte signature pour utilisateur malvoyant (signature audio future, hors V1)

**Rationale :** Qualiopi indicateur 26 (accessibilité PSH). Risque légal RGAA.

---

### NFR-010 : I18n FR-first

**Priorité :** Must Have

**Description :** V1 français uniquement. Architecture i18n prévue (clés de traduction extractibles) pour ouvrir EN en V2 sans refonte.

**Acceptance Criteria :**
- [ ] Strings centralisées (i18next ou next-intl)
- [ ] Aucun string hardcodé dans le code (lint custom)
- [ ] Formats date/nombre via `Intl`

**Rationale :** Marché initial 100% FR. Préparer EN sans le faire = bon ratio coût/option.

---

### NFR-011 : Reproductibilité dev local

**Priorité :** Must Have

**Description :** Tout développeur peut lancer l'environnement complet localement : `pnpm install && pnpm supabase:start && pnpm dev` → app fonctionnelle avec données de seed.

**Acceptance Criteria :**
- [ ] Supabase CLI local (Postgres + Auth + Storage + Edge Fn)
- [ ] Seed scripts (`supabase/seed.sql`) avec 1 OF + 2 dossiers exemples
- [ ] `pnpm db:test` lance tous les tests pgTAP
- [ ] README `docs/runbooks/` setup en moins de 15 min depuis machine vierge

**Rationale :** Onboarding rapide nouveaux contributeurs. Reproductibilité bugs en local plutôt que prod.

---

### NFR-012 : Coûts MVP — Budget infrastructure < 200 €/mois

**Priorité :** Should Have

**Description :** En V1 (1-3 OF pilotes), coûts infra mensuels ≤ 200 €. Cible : Supabase Pro (~25$), Railway (~20$), Resend (~20$), domaine (~1€).

**Acceptance Criteria :**
- [ ] Dashboard coûts mensuel suivi
- [ ] Alerte si dépassement 250 € (signal d'optimisation requise)
- [ ] Pas de provider à coût exponentiel non prévu

**Rationale :** Avant product/market fit, coûts d'infra doivent rester négligeables vs valeur. Au-delà du pilote, modèle économique recalibré.

---

## Epics

---

### EPIC-01 : Identity & multi-tenant

**Description :** Fondations du multi-tenant. Création OF, rôles, invitations, MFA. Tout le reste en dépend.

**FRs :** FR-001, FR-002, FR-003, FR-004, FR-005

**Story estimate :** 5-7

**Priorité :** Must Have

**Business value :** Sans isolation propre, on ne livre rien. RLS ratée = perte de tous les clients en cascade.

---

### EPIC-02 : CRM (entreprises, contacts, apprenants)

**Description :** Référentiel des entités humaines et corporate. Pré-requis pour créer un dossier.

**FRs :** FR-006, FR-007, FR-008, FR-009

**Story estimate :** 4-6

**Priorité :** Must Have

**Business value :** Bootstrap d'un nouvel OF = importer son existant. Sans ça, friction d'onboarding rédhibitoire.

---

### EPIC-03 : Catalogue formations

**Description :** Templates de formations, modules, formateurs. Réutilisables entre dossiers.

**FRs :** FR-010, FR-011, FR-012

**Story estimate :** 3-5

**Priorité :** Must Have

**Business value :** L'OF a 5-50 formations qu'il revend des dizaines de fois. Sans templating = ressaisie permanente.

---

### EPIC-04 : Dossier (CORE)

**Description :** L'agrégat racine du produit. Création (wizard 3-steps), cycle de vie, invariants, états.

**FRs :** FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020

**Story estimate :** 8-12

**Priorité :** Must Have

**Business value :** **C'est le produit.** Tout le reste tourne autour. Investir disproportionné est justifié.

---

### EPIC-05 : Planification & sessions

**Description :** Sessions générées automatiquement, vue calendrier formateur, intégration Zoom V1.5.

**FRs :** FR-021, FR-022, FR-023, FR-024

**Story estimate :** 4-6

**Priorité :** Must Have

**Business value :** Sans planification, pas d'émargement, pas de Qualiopi. Maillon central du workflow.

---

### EPIC-06 : Émargement mobile

**Description :** Formateur ouvre, projette QR, apprenants signent sur smartphone, formateur finalise, PDF preuve généré.

**FRs :** FR-025, FR-026, FR-027, FR-028

**Story estimate :** 4-5

**Priorité :** Must Have

**Business value :** L'argument de vente n°1. Remplace la feuille papier + saisie manuelle post-session.

---

### EPIC-07 : Génération documentaire & signature électronique

**Description :** Templates DOCX, génération, demande signature, signature canvas avec hash + audit.

**FRs :** FR-029, FR-030, FR-031, FR-032, FR-033

**Story estimate :** 5-7

**Priorité :** Must Have

**Business value :** Conventions, attestations, RI : auparavant générés à la main, source d'erreurs et de perte de temps. Argument de vente n°2.

---

### EPIC-08 : Conformité Qualiopi

**Description :** Checklist 32 indicateurs, closing checklist bloquante, dashboard global, export audit annuel.

**FRs :** FR-034, FR-035, FR-036, FR-037, FR-038

**Story estimate :** 6-8

**Priorité :** Must Have

**Business value :** Promesse cœur du produit. Différenciation vs concurrents généralistes.

---

### EPIC-09 : Questionnaires

**Description :** Cycle complet (positionnement, satisfaction chaud, froid J+90). Templates, assignation auto par events, réponse apprenant, relances.

**FRs :** FR-039, FR-040, FR-041, FR-042

**Story estimate :** 4-5

**Priorité :** Must Have

**Business value :** Indicateurs Qualiopi 10, 26, 27 obligatoires. Sans automatisation = 1h de boulot par dossier en moins.

---

### EPIC-10 : Réclamations

**Description :** Indicateur Qualiopi 31. Ouverture, investigation, résolution, export annuel.

**FRs :** FR-043, FR-044, FR-045

**Story estimate :** 3-4

**Priorité :** Must Have

**Business value :** Sans outillage = "tableur réclamations" = preuve Qualiopi fragile à l'audit.

---

### EPIC-11 : Facturation

**Description :** Génération facture à la clôture, édition, validation, suivi paiement manuel. **Stripe = V2.**

**FRs :** FR-046, FR-047, FR-048

**Story estimate :** 4-6

**Priorité :** Must Have *(scope V1 manuel)*

**Business value :** OF ne peut pas se passer de facturer. Mais paiement en ligne n'est pas critique en V1.

---

### EPIC-12 : Automation & infrastructure events

**Description :** Outbox dispatcher, catalogue events typés, handlers des 6 parcours métier intégrés. **Workflows custom no-code = V2.**

**FRs :** FR-049, FR-050, FR-051

**Story estimate :** 3-5

**Priorité :** Must Have *(scope V1 intégré, custom V2)*

**Business value :** Infrastructure invisible mais critique : c'est ce qui rend le produit cohérent et fiable.

---

### EPIC-13 : Notifications

**Description :** Email transactionnel via Resend, notifications in-app, templates branded.

**FRs :** FR-052, FR-053

**Story estimate :** 2-3

**Priorité :** Must Have

**Business value :** Sans email = produit cassé (signatures, convocations, relances). Transverse à tous les autres epics.

---

## User Stories (High-Level)

Stories détaillées créées en Phase 4 (`/bmad:sprint-planning`). Exemples d'orientation par epic :

- **EPIC-01 :** *« En tant que fondateur d'OF, je veux créer mon organisation en moins de 5 minutes pour démarrer immédiatement. »*
- **EPIC-04 :** *« En tant que gestionnaire, je veux créer un dossier en moins de 3 minutes via le wizard 3-steps pour ne pas perdre de temps sur l'administratif. »*
- **EPIC-06 :** *« En tant que formateur, je veux ouvrir l'émargement et projeter le QR en 10 secondes pour que mes apprenants signent sans casser le rythme du cours. »*
- **EPIC-08 :** *« En tant que responsable qualité, je veux voir d'un coup d'œil les dossiers à risque Qualiopi pour intervenir avant l'audit. »*

---

## User Personas

### Persona 1 — Fondateur/Directeur OF (`owner`)
Profil : entrepreneur, 35-55 ans, formation à la pédagogie ou métier d'origine. **Peu technique.** Drivers : conformité Qualiopi (audit dans X mois), temps économisé, image pro. Bloqueurs : friction onboarding, peur de la data lost. Utilise : 30 min/jour.

### Persona 2 — Gestionnaire administratif (`gestionnaire`)
Profil : assistant(e) admin, 25-45 ans, à l'aise avec Excel/Drive. Drivers : ne plus jongler entre 5 outils, ne plus ressaisir, ne plus oublier d'envoyer convocations. Bloqueurs : process rigide, manque de souplesse. Utilise : 3-5h/jour (utilisateur le plus intensif).

### Persona 3 — Formateur (`formateur`)
Profil : intervenant interne ou externe, 30-65 ans, **techno-réticent typique.** Drivers : émarger vite, ne pas perdre de temps administratif. Bloqueurs : tout ce qui demande plus de 30s. Utilise : 5 min/session.

### Persona 4 — Apprenant (utilisateur public, sans compte)
Profil : adulte en formation continue. Drivers : signer rapidement, ne pas créer de compte. Bloqueurs : pop-up cookies, formulaires lourds, lien expiré. Utilise : 2 min × N (1 par signature/questionnaire).

### Persona 5 — Comptable (`comptable`)
Profil : interne ou cabinet externe. Drivers : générer factures, suivre impayés. N'a pas besoin de voir les apprenants. Utilise : 1-2h/semaine.

---

## User Flows

### Flow 1 — Onboarding nouvel OF
`Signup → création organisation (FR-001) → MFA owner (FR-004) → invitations team (FR-003) → import apprenants CSV (FR-009) → création 1er catalogue formation (FR-010) → création 1er dossier (FR-013).`

**Goal :** TTFDC < 30 jours = ce flow + 1er parcours complet à la suite.

### Flow 2 — Cycle de vie d'un dossier (golden path)
`Création wizard (FR-013) → ajout modules + formateurs + financeurs (FR-015..017) → schedule (FR-018) → convocations envoyées (FR-052) → 1ʳᵉ session : émargement (FR-025..028) → questionnaire positionnement répondu (FR-040..041) → toutes sessions complétées → questionnaire satisfaction chaud → closing checklist OK (FR-035) → close dossier → attestation générée → facture draft (FR-046).`

**Goal :** zéro intervention manuelle hors actions explicites de l'admin.

### Flow 3 — Audit Qualiopi annuel
`Dashboard Qualiopi (FR-036) → identification dossiers à risque → résolution preuves manquantes → export audit annuel (FR-037) → ZIP transmis à l'auditeur.`

**Goal :** auditeur reçoit l'export en < 24h après demande, qualité preuve auto-suffisante.

---

## Dependencies

### Internal Dependencies
- Supabase (Postgres + Auth + Storage + Edge Functions + Realtime + pg_cron) — bloquant tout
- Next.js 14 App Router stack (`apps/web`) — bloquant tout
- Templates DOCX initiaux fournis par Ismael ou OF pilote

### External Dependencies
- **Resend** (email transactionnel) — bloquant FR-003, 024, 031, 040, 052
- **Zoom API V1.5** (création meetings distanciel) — bloquant FR-023 ; fallback : lien manuel
- **Railway** (hosting Next.js) — bloquant prod
- **Supabase cloud** (DB + Edge Fn) — bloquant prod
- **Stripe** : **hors V1 explicite**
- **API SIRET (INSEE)** : nice-to-have pour validation FR-001 ; fallback : saisie manuelle non vérifiée

---

## Assumptions

1. **Pilote opérationnel** : 1-3 OF early adopters acceptent d'utiliser un MVP avec bugs et de remonter du feedback dans la durée pilote (3 mois).
2. **Audit Qualiopi externe** : aucun pilote n'a d'audit prévu dans les 3 premiers mois (sinon risque produit non-prêt à temps).
3. **Stack Supabase tient la charge** pour 3 OF × ~100 dossiers/an chacun = ~300 dossiers/an, scope V1 confortable.
4. **Templates DOCX** Qualiopi-compliant fournis par Ismael ou OF pilote ; pas de génération from scratch.
5. **Conformité légale signature électronique** : signature canvas + hash + audit trail = niveau "signature simple" eIDAS, suffisant pour conventions de formation. Pas de niveau avancé/qualifié visé.
6. **Email Resend** : pas de blocage technique pour envoyer 1000 emails/mois en V1.
7. **Ismael est dev solo principal** sur le projet ; capacité de livraison réelle calibrée en conséquence.

---

## Out of Scope (V1)

- **LMS / diffusion de contenu pédagogique** (vidéos, quizz, parcours e-learning) — pas le métier.
- **Paiement Stripe** (abonnement OF + paiement clients) — V2.
- **Workflows custom no-code** (utilisateur configure ses propres règles d'automation) — V2.
- **Multi-langues UI** (EN, ES) — architecture i18n prévue, mais V1 = FR seul.
- **App mobile native** (iOS/Android) — web responsive suffit pour V1.
- **Intégrations comptables** (Sage, EBP, etc.) — export CSV manuel en V1.
- **Portail apprenant authentifié** (espace perso historisé) — V1 = liens token only.
- **Portail client entreprise** (vue cliente sur ses formations) — V2.
- **SMS / WhatsApp** — V2.
- **Notifications push** — V2.
- **Marketplace formateurs** (matching, paiement) — pas roadmap.
- **CRM commercial avancé** (pipeline ventes, scoring) — V2 si demandé.

---

## Open Questions

1. **Templates Qualiopi initiaux** : qui les fournit ? Ismael ou pilotes ? À clarifier avant kickoff.
2. **N° factures séquentiel** : reset annuel ou continu ? Convention française à valider auprès des pilotes comptables.
3. **Conservation données après churn** : un OF qui résilie doit pouvoir exporter ses données (RGPD + Qualiopi). Format ? Délai ? — à spécifier.
4. **Pricing V1 pilote** : gratuit ou symbolique (10 €/mois) ? Décision business non tranchée.
5. **Backup/restore** : politique Supabase backup quotidien suffit-elle ? Restauration point-in-time PaymentRequired plan supérieur — à arbitrer si critique.
6. **Tests E2E charge** : volume à simuler ? 100 dossiers / 5000 émargements simulés en CI ?

---

## Risques de scope (V1, 3 mois pilote)

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Sous-estimation Epic 04 (Dossier CORE) | Haute | Critique | Sanctuariser 50% du dev sur cet epic ; pas de feature creep |
| Génération documentaire complexe (templates DOCX divers) | Moyenne | Élevé | Limiter V1 à 5 templates système, le reste en V1.1 |
| Émargement mobile sur navigateurs hétérogènes (iOS Safari) | Moyenne | Élevé | Test BrowserStack early, prévoir fallback signature texte |
| Bug RLS critique en prod | Faible | Catastrophique | Tests pgTAP exhaustifs en CI, audit RLS avant chaque release |
| Pilote demande feature hors scope | Haute | Moyen | "Won't do en V1" documenté, backlog V2 visible |
| Coûts Supabase explosent (Storage signatures × 100 OF futurs) | Faible (V1) | Élevé (V2) | Monitoring storage, plan migration S3 si > X Go |

---

## Approval & Sign-off

### Stakeholders
- **Ismael Lepennec** — Fondateur, owner produit, dev lead
- **OF pilote 1-3** — Validateurs terrain (à recruter)

### Approval Status
- [ ] Product Owner (Ismael)
- [ ] Tech Lead (Ismael — auto)
- [ ] OF pilote(s) (à recueillir post-démo)

---

## Revision History

| Version | Date | Auteur | Changements |
|---------|------|--------|-------------|
| 1.0 | 2026-05-16 | Ismael Lepennec | PRD initial issu de consolidation `docs/architecture/01-09-*.md` + interview directrice produit |

---

## Next Steps

### Phase 3 : Architecture

Lancer `/bmad:architecture`. **Spécificité projet :** une architecture détaillée existe déjà (`docs/architecture/01-09-*.md`). Le workflow BMAD architecture doit **consolider** et formaliser au format BMAD, pas réinventer. Apport BMAD = vue produit-aligned (traçabilité FR → composant archi).

### Phase 4 : Sprint Planning

Après architecture, `/bmad:sprint-planning`. Découper en stories Vertical Slice par epic. Priorité de séquencement V1 suggérée :

1. **Sprint 0** (fondations) : EPIC-01, EPIC-13 (notifications), EPIC-12 (outbox)
2. **Sprint 1** : EPIC-02, EPIC-03
3. **Sprint 2-3** : EPIC-04 (CORE, 2 sprints)
4. **Sprint 4** : EPIC-05, EPIC-06
5. **Sprint 5** : EPIC-07, EPIC-09
6. **Sprint 6** : EPIC-08, EPIC-10
7. **Sprint 7** : EPIC-11, polish, beta pilote

---

*Ce document a été créé via BMAD Method v6 — Phase 2 (Planning).*
*Pour suite : `/bmad:workflow-status` ou `/bmad:architecture`.*

---

## Appendix A : Requirements Traceability Matrix

| Epic ID | Epic Name | Functional Requirements | Story Count (Est.) |
|---------|-----------|-------------------------|--------------------|
| EPIC-01 | Identity & multi-tenant | FR-001, FR-002, FR-003, FR-004, FR-005 | 5-7 |
| EPIC-02 | CRM | FR-006, FR-007, FR-008, FR-009 | 4-6 |
| EPIC-03 | Catalogue formations | FR-010, FR-011, FR-012 | 3-5 |
| EPIC-04 | Dossier (CORE) | FR-013, FR-014, FR-015, FR-016, FR-017, FR-018, FR-019, FR-020 | 8-12 |
| EPIC-05 | Planification & sessions | FR-021, FR-022, FR-023, FR-024 | 4-6 |
| EPIC-06 | Émargement mobile | FR-025, FR-026, FR-027, FR-028 | 4-5 |
| EPIC-07 | Documents & signature | FR-029, FR-030, FR-031, FR-032, FR-033 | 5-7 |
| EPIC-08 | Conformité Qualiopi | FR-034, FR-035, FR-036, FR-037, FR-038 | 6-8 |
| EPIC-09 | Questionnaires | FR-039, FR-040, FR-041, FR-042 | 4-5 |
| EPIC-10 | Réclamations | FR-043, FR-044, FR-045 | 3-4 |
| EPIC-11 | Facturation | FR-046, FR-047, FR-048 | 4-6 |
| EPIC-12 | Automation & events infra | FR-049, FR-050, FR-051 | 3-5 |
| EPIC-13 | Notifications | FR-052, FR-053 | 2-3 |
| **TOTAL** | | **53 FRs** | **55-79 stories** |

---

## Appendix B : Prioritization Details

**Functional Requirements (53 total)**
- Must Have : 47
- Should Have : 6 (FR-005, FR-009, FR-020, FR-024, FR-038, FR-042, FR-053)
- Could Have : 0
- Won't Have V1 : Stripe, no-code workflows, app mobile, multi-langues UI, portails (cf. Out of Scope)

**Non-Functional Requirements (12 total)**
- Must Have : 8 (NFR-001, 002, 003, 005, 006, 008, 010, 011)
- Should Have : 4 (NFR-004, 007, 009, 012)

**Lecture :** la quasi-totalité des FRs sont Must Have parce qu'on a déjà ajusté à la baisse le scope à l'étape de découpage epics (Stripe, no-code, app mobile = Won't V1). Le travail de priorisation a été fait en amont, pas via MoSCoW sur les FRs individuels. Les Should Have restants sont des features de confort qui peuvent glisser en V1.1.
