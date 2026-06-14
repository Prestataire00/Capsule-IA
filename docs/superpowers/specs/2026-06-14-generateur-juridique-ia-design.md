# Design — Générateur de documents juridiques assisté par IA (RI / CGV / livret)

**Date** : 2026-06-14
**Statut** : validé (brainstorming) — à transformer en plan d'implémentation
**Scope** : génération assistée par Claude des documents juridiques niveau organisme (règlement intérieur, CGV, livret d'accueil), ancrée sur les sources officielles via Légifrance, avec relecture/validation humaine et rendu PDF brandé.

> Sous-système **B** du chantier « génération docs Qualiopi ». Le sous-système **A** (générateurs déterministes *programme* + *certificat de réalisation*) fait l'objet d'une spec séparée.

## Problème

Les documents juridiques d'un OF (règlement intérieur des stagiaires, CGV, livret
d'accueil) doivent exister pour Qualiopi mais ne sont pas générés. L'OF veut une
**rédaction assistée par IA ancrée sur les sources légales officielles** (pas du
boilerplate générique ni de la saisie manuelle), avec relecture avant usage.

## Constat d'audit

- **Aucune IA dans le repo** : pas de `@anthropic-ai/sdk`, pas d'`ANTHROPIC_API_KEY`,
  aucun usage Claude. **Première intégration IA.**
- **Aucune intégration Légifrance/PISTE.**
- Infra de documents **réutilisable** : `generate-convention-pdf.ts` (pdf-lib),
  `apply-org-signature.ts` (`drawSignatureBlock`), `load-org-branding.ts`,
  `persist-document.ts` (persistance content-addressed), bucket `documents`.
- `document_templates.kind` CHECK contient déjà `reglement_interieur`, `livret_accueil`
  (pas `cgv`).

## Décisions de cadrage (validées)

1. **Contenu généré par IA** (Claude), pas saisi ni boilerplate.
2. **Ancrage** : **API Légifrance (PISTE)** — texte officiel exact des articles cités.
3. **Flux** : brouillon IA (sources citées) → **relecture/édition** par l'OF →
   **validation explicite** → figé + brandé + daté, avec trace (modèle, éditeur, sources).
4. **Niveau organisme** (une fois par OF ; régénération si la loi change).
5. **Modèle** : `claude-opus-4-8` (qualité juridique).

## Dépendances externes (à fournir)

- `ANTHROPIC_API_KEY` (env).
- `LEGIFRANCE_CLIENT_ID` / `LEGIFRANCE_CLIENT_SECRET` (PISTE OAuth, env).
- Sans elles : DB + flux + PDF vérifiables sur staging ; **appels Claude/Légifrance
  en live = PENDING** (comme Resend pour les emails).

## Modèle de données

### Migration
- `ALTER` du CHECK `document_templates.kind` : ajout de `'cgv'`.
- Table **`app.org_legal_documents`** :
```
id UUID PK, organization_id UUID NOT NULL FK,
kind TEXT NOT NULL CHECK (kind IN ('reglement_interieur','cgv','livret_accueil')),
status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validated')),
content_md TEXT,                 -- contenu éditable (markdown)
sources_used JSONB NOT NULL DEFAULT '[]',  -- [{ref, title, url, extrait}]
generated_model TEXT,
generated_at TIMESTAMPTZ,
validated_by UUID REFERENCES auth.users(id),
validated_at TIMESTAMPTZ,
pdf_storage_path TEXT,
version INT NOT NULL DEFAULT 1,
created_at, updated_at,
UNIQUE (organization_id, kind)
```
RLS : `organization_id = app.current_organization_id()` (lecture/écriture org).

## Module Légifrance (`apps/web/shared/lib/legifrance/`)

- `client.ts` : OAuth `client_credentials` PISTE → access token (caché en mémoire,
  TTL). `fetchArticle(code, numero)` → `{ ref, title, url, texte }`.
- `mapping.ts` : par `kind`, la liste des articles à récupérer.
  - `reglement_interieur` → Code du travail **R6352-1 à R6352-15** (+ L6352-3/4/5) :
    discipline, sanctions, garanties disciplinaires, hygiène/sécurité, représentation
    des stagiaires (formations > 200h).
  - `cgv` → articles pertinents (vente de prestations) + cadrage Qualiopi.
  - `livret_accueil` → cadrage Qualiopi (information du bénéficiaire) + accessibilité.
- Cache des extraits (la loi bouge peu) ; `server-only`.

## Génération IA (`apps/web/shared/lib/ai/`)

- `client.ts` : instance `@anthropic-ai/sdk` (clé env ; renvoie `null` si absente,
  comme `resend.ts`).
- `generate-legal-doc.ts` (`server-only`) : `buildLegalPrompt(kind, org, sources)`
  **pur** (testable) + `generateLegalDoc(...)` qui appelle Claude `claude-opus-4-8`,
  température basse, consigne stricte : **rédiger en français en ne s'appuyant QUE sur
  les extraits légaux fournis, citer les références d'articles telles que fournies, ne
  rien inventer ; signaler les points à compléter par l'OF**. Renvoie
  `{ contentMd, sources }`.

## Server Actions (`apps/web/app/(dashboard)/parametres/documents-legaux/actions.ts`)

Service-role, org-scopé.
- `generateLegalDocDraft(kind)` : `fetchArticle(...)` (mapping) → `generateLegalDoc(...)`
  → upsert `org_legal_documents` (`status='draft'`, `content_md`, `sources_used`,
  `generated_model`, `generated_at`). Erreurs lisibles si clés manquantes.
- `saveLegalDocEdit(kind, contentMd)` : met à jour `content_md` (reste `draft`).
- `validateLegalDoc(kind)` : `status='validated'`, `validated_by/at`, incrémente
  `version`, **génère le PDF brandé** (`generate-legal-doc-pdf` + branding +
  `persist-document`), set `pdf_storage_path`.

## PDF (`apps/web/features/documents/generate-legal-doc-pdf.ts`)

Rend `content_md` validé en PDF brandé (en-tête OF : nom, NDA, adresse ; titre du doc ;
corps markdown → titres/paragraphes/listes ; footer mention RGPD ; bloc signature via
`drawSignatureBlock`). Réutilise `load-org-branding` + `persist-document`.

## UI — `parametres/documents-legaux/page.tsx`

Server Component async (`supabaseServer()`, prod-safe). Pour chacun des 3 documents :
- statut (Brouillon / Validé), date.
- bouton **Générer (IA)** → `generateLegalDocDraft`.
- zone d'édition (`content_md`) + **Enregistrer** → `saveLegalDocEdit`.
- **Valider** → `validateLegalDoc` ; **Télécharger PDF** si validé.
- encart **Sources légales citées** (`sources_used`) pour la traçabilité audit.
- mention « aide à la rédaction, pas un conseil juridique — validation OF requise ».

## RLS & tests

- `org_legal_documents` : RLS org-scopée + test cross-tenant (pgTAP).
- Transitions de statut (draft → validated) + persistance `sources_used` (pgTAP).
- `buildLegalPrompt` testé en **pur** (Vitest) : inclut les extraits, interdit
  l'invention, structure attendue.
- Appels Claude/Légifrance **mockés** en tests ; live PENDING (clés).

## Hors scope (V2)

- Sous-système A (programme / certificat de réalisation) — spec séparée.
- Versionnement complet/historique des documents légaux (V1 : 1 courant + compteur).
- Détection automatique des changements de loi (re-génération sur alerte Légifrance).
- Traduction / multi-langue.
