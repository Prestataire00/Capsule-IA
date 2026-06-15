# Sécurité & RGPD — checklist d'actions (config / infra / juridique)

> **Pourquoi ce doc et pas du code ?** Le Module 8 « Sécurité & RGPD » est à ~90 %
> de la **configuration de plateforme** (Supabase Auth, backups), de l'**infra** (chiffrement,
> rétention) et du **juridique/process** (DPO, registre, DPA). La part *codable* est **déjà faite**
> dans le repo (voir §0). Ce fichier liste ce qu'il reste à **actionner à la main**, hors code.
>
> Légende statut : ☐ à faire · ☑ fait · 🔁 récurrent · ⚖️ juridique.
> Responsable par défaut : **Ismael** (gérant = responsable de traitement).

---

## 0. Déjà couvert par le code (rien à faire — référence)

| Exigence Module 8 | Où c'est dans le repo |
|---|---|
| Authentification email + mot de passe (hash bcrypt) | Supabase Auth (natif) |
| **2FA / MFA** (TOTP) admin & commercial | `apps/web/app/(dashboard)/parametres/securite/mfa/**` |
| Magic link apprenant (accès sans mot de passe) | espace apprenant via token signé (`jose`) |
| **Journalisation des actions sensibles** (suppression dossier, modif post-signature, changement de rôle) | table d'audit (`0023_*`) + triggers + garde-fous Server Actions |
| **Log des envois d'emails** (traçabilité notifications) | `email_log` (migration `0083`) + `shared/lib/email/resend.ts` |
| **Isolation multi-tenant testée** (RLS) | RLS `force` sur toutes les tables + **24 fichiers pgTAP** (`supabase/tests/**`) |

> ⚠️ **Le seul vrai gap code** = le **droit à l'effacement RGPD** (anonymisation des données
> personnelles d'un apprenant/prospect sur demande). Transverse (toutes les tables PII), sensible,
> à cadrer séparément. Voir §3.4 — **non inclus ici**, c'est une feature, pas de la config.

---

## 1. Configuration Supabase Auth (Dashboard → Authentication)

> Aucune ligne de code : tout se règle dans le dashboard Supabase du projet de prod.

### 1.1 Politique de mot de passe
*(Authentication → Sign In / Providers → Email, et → Policies)*

- ☐ **Longueur minimale = 10** (`Minimum password length`).
- ☐ **Exigences de complexité** = `Lowercase, uppercase, digits and symbols`
  (couvre la règle « 1 majuscule, 1 chiffre, 1 caractère spécial »).
- ☐ **Leaked password protection = ON** (vérification HaveIBeenPwned ; refuse les mots de passe compromis).

> ℹ️ Il n'y a **pas de formulaire mot de passe applicatif** à valider côté code (l'inscription/réinit
> passe par Supabase Auth). C'est pour ça que la politique se règle ici et non via un schéma Zod.
> Si un jour un form « définir mot de passe » maison apparaît → y rajouter le **même** schéma Zod partagé.

### 1.2 Sessions
*(Authentication → Sessions + Tokens)*

- ☐ **Time-box user sessions = 7 jours** (`Session timebox` → expiration absolue, oblige re-login hebdo).
- ☐ **Inactivity timeout = 30 jours** (`Inactivity timeout` → déconnexion après 30 j sans activité).
- ☐ **JWT expiry = 3600 s** (1 h) + **Refresh token rotation = ON** + **Reuse interval court** (détection de vol de refresh token).

> ℹ️ `Time-box` et `Inactivity timeout` sont des réglages plan **Pro** — vérifier que le projet de prod est bien en Pro.

### 1.3 MFA
*(Authentication → Multi-Factor)*

- ☑ **TOTP activé** (déjà branché côté app).
- ☐ Décider si la MFA est **obligatoire** pour les rôles `owner`/`admin` (enforcement = règle d'app à ajouter
  si voulu ; aujourd'hui c'est *opt-in* via `parametres/securite/mfa`). ➜ choix produit, pas bloquant Qualiopi.

### 1.4 Divers
- ☐ **Confirm email = ON** (pas de compte sans email vérifié).
- ☐ **Secure email change = ON** (double confirmation lors d'un changement d'email).
- ☐ **Redirect URLs** : limiter la liste blanche aux domaines de prod (anti open-redirect).
- ☐ **CAPTCHA** (hCaptcha/Turnstile) sur signup/login si exposition publique du signup.

---

## 2. Infrastructure (Supabase + Railway) — 🔁 à vérifier au déploiement

- ☑ **Chiffrement au repos** : Postgres Supabase chiffré (AES-256) — natif, rien à faire.
- ☑ **Chiffrement en transit** : TLS partout (Supabase API, Railway) — natif.
- ☐ **Backups / PITR** : activer **Point-in-Time Recovery** (plan Pro) ; sinon vérifier que les
  **daily backups** sont actifs + tester une **restauration** une fois (cf. `docs/runbooks/backup-recovery.md`).
- ☐ **Rétention des backups** : noter la durée (7 j PITR par défaut) ; décider si suffisant vs. obligations.
- ☐ **Storage** : buckets en **privé** (pas de bucket public exposant des PJ apprenants) + policies d'accès.
- ☐ **Secrets** : `service_role`, clés Resend/Zoom/OpenAI uniquement en variables d'env Railway / Edge Functions,
  jamais côté client. Rotation : cf. `docs/runbooks/token-key-rotation.md`. 🔁
- ☐ **Logs d'accès** : conserver les logs Railway/Supabase (qui a accédé, quand) — durée raisonnable, non éternelle.

---

## 3. RGPD — registre, bases légales, sous-traitants ⚖️

### 3.1 Gouvernance
- ☐ Désigner le **responsable de traitement** (= la société / Ismael) dans les mentions.
- ☐ **DPO** : désignation non obligatoire ici (pas de traitement à grande échelle de données sensibles),
  mais **nommer un référent RGPD interne** + une adresse de contact (`rgpd@…` ou `privacy@…`).
- ☐ **Politique de confidentialité** + **mentions légales** publiées sur le site (qui, quoi, finalités, durées, droits, contact).
- ☐ **CGU / CGV** à jour (mention de la sous-traitance et des transferts).

### 3.2 Registre des traitements (art. 30 RGPD) — trame à remplir
*(1 ligne par traitement ; à stocker hors repo, ex. doc partagé)*

| Traitement | Finalité | Base légale | Catégories de données | Personnes | Durée de conservation | Destinataires / sous-traitants |
|---|---|---|---|---|---|---|
| Gestion des apprenants & dossiers de formation | Exécuter & tracer la formation (Qualiopi) | Contrat / obligation légale | Identité, coordonnées, émargements, résultats | Apprenants | **3 ans** (Qualiopi/CRF) après fin d'action ; pièces compta **10 ans** | Supabase, Railway, formateurs |
| CRM / prospection | Gérer prospects & devis | Intérêt légitime / consentement | Identité pro, échanges | Prospects/contacts | **3 ans** après dernier contact | Supabase, Railway, Resend |
| Émargement & présence | Preuve d'assiduité | Obligation légale (financeurs) | Présence, signatures, horodatage | Apprenants/formateurs | **3 ans** | Supabase, Zoom |
| Facturation | Obligations comptables | Obligation légale | Identité, montants | Clients/financeurs | **10 ans** | Supabase, expert-comptable |
| Emails transactionnels | Notifier (convocations, relances) | Exécution du contrat | Email, contenu | Apprenants/clients | durée du dossier + logs courts | Resend |
| Comptes & authentification | Accès sécurisé | Exécution du contrat | Email, hash mdp, MFA | Utilisateurs internes | durée du compte | Supabase Auth |

> Ajuster les **durées** avec l'expert-comptable / Qualiopi : règle usuelle **3 ans** (dossiers de formation,
> art. L6353-9 / exigences CRF) et **10 ans** pour les **pièces comptables**.

### 3.3 DPA (Data Processing Agreements) à signer/archiver — ☐ par sous-traitant
*(chaque sous-traitant qui touche des PII doit avoir un DPA signé ou des CGU intégrant un DPA)*

- ☐ **Supabase** (hébergement BDD + Auth + Storage) — DPA Supabase + localiser la **région** (UE de préférence ; sinon clauses contractuelles types).
- ☐ **Railway** (hébergement app) — DPA + **région** du déploiement.
- ☐ **Resend** (emails) — DPA.
- ☐ **Zoom** (visio / émargement distanciel) — DPA + sous-traitance.
- ☐ **OpenAI / Anthropic** (si génération IA de questionnaires/programmes) — DPA + vérifier qu'aucune PII apprenant
  n'est envoyée sans base légale ; privilégier des données anonymisées dans les prompts. ⚠️
- ☐ Tenir une **liste des sous-traitants** à jour (publiée dans la politique de confidentialité).

> ⚠️ **Transferts hors UE** : Supabase/Railway/OpenAI/Anthropic peuvent héberger hors UE.
> Choisir les régions UE quand c'est possible, sinon documenter les **Clauses Contractuelles Types (CCT/SCC)**.

### 3.4 Droits des personnes — process (pas de code, sauf effacement)
- ☐ **Accès / portabilité** : un export du dossier apprenant existe côté espace apprenant (lot //) — documenter la procédure.
- ☐ **Rectification** : modifiable via l'app (paramètres / fiche apprenant).
- ☐ **Effacement / anonymisation** : 🟡 **pas encore industrialisé** → aujourd'hui = procédure manuelle
  (soft-delete `deleted_at` + anonymisation SQL ponctuelle). ➜ **À transformer en feature** si volume (cadrage dédié).
- ☐ **Opposition / consentement** (prospection) : prévoir un lien de désinscription dans les emails marketing.
- ☐ Définir un **délai de réponse** (1 mois RGPD) et une **boîte de réception** dédiée.

---

## 4. Plan d'action minimal (par où commencer)

1. **Supabase Auth** (§1.1 + §1.2) — 15 min, impact immédiat sur la conformité « politique mdp + sessions ».
2. **Backups / PITR** (§2) — vérifier + 1 test de restauration.
3. **Politique de confidentialité + mentions légales** (§3.1) — publier.
4. **Registre des traitements** (§3.2) — remplir la trame (1 page).
5. **DPA** (§3.3) — récupérer/signer, en commençant par Supabase, Railway, Resend.

> Tout le reste (chiffrement, RLS, journalisation, MFA, logs email) est **déjà en place** (§0).
