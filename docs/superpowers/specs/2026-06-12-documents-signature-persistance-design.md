# Génération documentaire — Slice 1 : Fondation signature/cachet + persistance

> Statut : validé en brainstorming, prêt pour plan d'implémentation.
> Date : 2026-06-12 · Contexte borné : `documents` (+ lecture `identity`/org, `dossier`).

## 1. Contexte & problème

Les documents Qualiopi (convention, programme, RI, CGV, livret d'accueil, attestation,
certificat) sont en partie **rédigés à la main** : temps consommé et **risque d'incohérence
entre les documents et le CRM**.

Audit de l'existant :
- **3 générateurs `pdf-lib` sourcés CRM** : convention, attestation, facture
  (`apps/web/features/documents/generate-*-pdf.ts` + routes `app/api/.../*.pdf`).
- Tables **`app.document_templates`** (versionnées, `variables_schema`), **`app.documents`**
  (instances générées : `status`, `storage_path`, `generation_input`, `file_hash`),
  **`app.document_signatures`** (workflow e-signature) — déjà créées (migration 0009).
- `app.document_status` = `pending | generating | ready | failed | archived`.
- Bucket privé **`documents`** déjà créé (migration 0038, RLS membre).
- `app.organizations` a `name, legal_name, siret, declaration_activite, address, logo_path`
  — **ni représentant, ni signature, ni cachet**.
- Le générateur attestation dessine déjà un **cadre « Signature et cachet de l'organisme »
  vide** ; les générateurs acceptent `representativeName` mais aucune image de signature.
- Le panneau Documents par dossier existe mais est **en mock** (`@/shared/mock/data`).

## 2. Périmètre global (décomposé en slices)

La demande complète : édition par **blocs structurés** des docs boilerplate (RI/CGV/livret),
**5 générateurs** manquants, **auto-signature/cachet OF**, **persistance** dans `app.documents`.
Découpé en 4 slices indépendantes (chacune spec → plan → impl) :

| Slice | Contenu |
|---|---|
| **1 (ce doc)** | Réglages org signature+cachet · couche d'apposition auto partagée · helper de persistance `app.documents` · branchés sur les 3 générateurs existants |
| 2 | Templates éditables par blocs/clauses (RI/CGV/livret) + leurs générateurs |
| 3 | Générateurs CRM `programme` + `certificat de réalisation` |
| 4 | Panneau Documents réel (remplace le mock) |

**Cette slice ne couvre que la Slice 1.** Les slices 2-4 sont hors périmètre ici.

## 3. Décisions prises (brainstorming)

| Décision | Choix |
|---|---|
| Édition boilerplate (slices ultérieures) | Blocs/clauses structurés, défauts Qualiopi |
| Signature | **Cachet + signature de l'OF auto-apposés** (pas d'e-signature contrepartie dans cette slice) |
| Intégration génération | **Approche A** : inline dans les routes GET existantes (préserve « toujours frais depuis le CRM ») |
| Stockage signature/représentant | Colonnes sur `app.organizations` (pas de nouvelle table) |
| Idempotence persistance | **Content-addressed** : `UNIQUE (organization_id, file_hash)` |

### Hors périmètre (YAGNI)
- Aucune e-signature de la contrepartie (apprenant/entreprise) — `document_signatures` non touché.
- Aucun nouveau générateur (slices 3/2).
- Le panneau Documents reste en mock (slice 4) ; cette slice ajoute juste la traçabilité
  côté table `app.documents` et l'auto-signature aux PDF téléchargés.

## 4. Architecture & flux

```
parametres/organisation  ──(upload PNG + repr.)──►  org_assets/{org}/signature.png, stamp.png
                                                     app.organizations.{representative_name,
                                                       representative_title, signature_path, stamp_path}
                                                                    │
GET /api/.../<doc>.pdf ──► route :                                  │
  1. charge dossier/CRM (existant)                                  │
  2. charge org signature/cachet ◄──────────────────────────────────┘
  3. generate*PDF(Input + signaturePng/stampPng)  ──► drawSignatureBlock() appose
  4. persistGeneratedDocument()  ──► documents/{org}/{dossier}/{kind}/{hash}.pdf
                                     + insert app.documents (status ready)  [best-effort]
  5. renvoie les bytes PDF
```

## 5. Composant — Migration `0045_org_signature_and_document_persistence.sql`

> Numéro : `0045`. La branche `feature/emargement-consolide-zoom` (PR #1) occupe déjà
> `0043`/`0044` ; on prend le suivant pour éviter la collision. Vérifier le prochain numéro
> libre au moment du plan.

Contenu :
1. `ALTER TABLE app.organizations ADD COLUMN representative_name TEXT, ADD COLUMN
   representative_title TEXT, ADD COLUMN signature_path TEXT, ADD COLUMN stamp_path TEXT;`
2. Bucket privé `org_assets` (`INSERT INTO storage.buckets ... public=false`,
   `allowed_mime_types = ['image/png']`, taille limite ~2 Mo).
3. Policies RLS sur `storage.objects` pour `org_assets` : un membre authentifié de l'org peut
   `SELECT`/`INSERT`/`UPDATE`/`DELETE` les objets dont le 1ᵉʳ segment de path = son
   `organization_id` (via la claim JWT `organization_id`). Suivre le pattern des buckets
   existants (`documents` 0038, `zoom_imports` 0032).
4. Index d'idempotence : `CREATE UNIQUE INDEX ux_documents_org_filehash ON app.documents
   (organization_id, file_hash) WHERE file_hash IS NOT NULL AND deleted_at IS NULL;`

## 6. Composant — Réglages org (UI + Server Actions)

**Page** : `app/(dashboard)/parametres/organisation` (existe). Ajouter une section
« Signature & cachet » : champs `representative_name`, `representative_title` ; upload
signature PNG ; upload cachet PNG ; aperçu des images courantes.

**Schéma Zod partagé** (`features/.../org-branding.schema.ts`) entre form et action (red line #5).

**Server Actions** (`authActionClient`, red line #4) :
- `updateOrgRepresentative({ representativeName, representativeTitle })` → update colonnes.
- `uploadOrgSignature(file)` / `uploadOrgStamp(file)` → upload `org_assets/{org}/signature.png`
  (resp. `stamp.png`), puis update `signature_path`/`stamp_path`.

**Autorisation** : seuls `owner`/`admin` (RLS org existante + garde dans l'action). Le
`organization_id` vient de la session (jamais du client).

## 7. Composant — Couche d'apposition `features/documents/apply-org-signature.ts`

Interface :
```
type SignatureAssets = {
  signaturePng: Uint8Array | null;
  stampPng: Uint8Array | null;
  representativeName: string | null;
  representativeTitle: string | null;
  place: string | null;   // ville de l'org (depuis address)
  date: Date;
};
drawSignatureBlock(pdfDoc, page, fonts, anchor: { x; y; width; height }, assets): void
```
Comportement : `pdfDoc.embedPng` pour signature et cachet, `drawImage` avec scaling pour tenir
dans l'ancre (cachet semi-transparent derrière/à côté de la signature) ; légende
« Fait à {place}, le {date} » + nom et qualité du représentant. **Dégradation gracieuse** :
si `signaturePng`/`stampPng` est `null`, ne dessine que le cadre/légende (comportement actuel
inchangé). Pure vis-à-vis du réseau (reçoit les bytes déjà chargés). Unité testable : on peut
vérifier qu'elle ne jette pas et que le nombre d'images embarquées correspond aux assets fournis.

Les 3 générateurs exposent leur ancre de cadre signature et appellent `drawSignatureBlock`.
Leur `Input` gagne `signaturePng`/`stampPng`/`place` (en plus de `representativeName` déjà présent).

## 8. Composant — Helper de persistance `features/documents/persist-document.ts`

```
persistGeneratedDocument(sb, {
  organizationId, dossierId, kind, title, bytes: Uint8Array, generationInput: unknown
}): Promise<{ documentId: string; created: boolean }>
```
Étapes :
1. `file_hash = sha256(bytes)` (helper pur, testable).
2. SELECT `app.documents` where `(organization_id, file_hash)` et `deleted_at IS NULL` → si
   trouvé, renvoyer `{ documentId, created: false }` (no-op idempotent).
3. Sinon : upload bytes vers `documents/{organizationId}/{dossierId}/{kind}/{file_hash}.pdf`
   (`upsert: true`), puis INSERT `app.documents` (`kind`, `title`, `dossier_id`, `status='ready'`,
   `storage_path`, `mime_type='application/pdf'`, `file_size_bytes`, `file_hash`,
   `generated_at=now()`, `generation_input`). Renvoyer `{ documentId, created: true }`.

`kind` : valeurs alignées sur l'enum `document_templates.kind` (`convention`,
`attestation_fin`, `facture`). Pour facture, `dossier_id` provient de l'invoice.

## 9. Composant — Branchement des routes existantes

`app/api/dossiers/[id]/convention.pdf/route.ts`, `.../attestation.pdf/route.ts`,
`app/api/invoices/[id]/facture.pdf/route.ts` :
1. Après le chargement org existant, lire `signature_path`/`stamp_path`/`representative_*`.
2. `sb.storage.from('org_assets').download(path)` → `Uint8Array` (ou `null` si absent).
3. Passer bytes + représentant + `place` (ville org) dans l'`Input`.
4. Après `generate*PDF(...)`, appeler `persistGeneratedDocument` en **best-effort**
   (try/catch qui log et n'empêche pas la réponse PDF — exception tolérée ici car c'est de la
   traçabilité non bloquante ; ne pas avaler silencieusement, logguer l'erreur).
5. Retourner les bytes (comportement actuel).

## 10. Sécurité (red lines)

- `service_role` reste cantonné aux routes API (pattern existant, conforme red line #1).
- Nouveau bucket `org_assets` + index : **RLS pgTAP** d'isolation cross-tenant (red line #2).
- Domain pur intact : la couche d'apposition et le helper vivent dans `features/documents`
  (infra), pas dans un `domain/` (red line #3).
- Actions via `authActionClient`, Zod partagé (red lines #4/#5).

## 11. Tests

- **pgTAP** : (a) un membre de l'org A ne peut pas lire/écrire les objets `org_assets` de l'org
  B ; (b) `UNIQUE (organization_id, file_hash)` empêche le doublon ; (c) insert `app.documents`
  autorisé pour `owner`/`admin`/`gestionnaire`, refusé hors org.
- **Vitest** : `sha256` pur ; idempotence de `persistGeneratedDocument` (sb mocké : 2ᵉ appel
  même hash → `created:false`, pas de 2ᵉ insert) ; `drawSignatureBlock` ne jette pas avec un
  PNG factice et gère `null` (0 image embarquée).
- **Manuel** : uploader signature+cachet dans paramètres → télécharger convention → signature
  apposée dans le cadre ; vérifier une ligne `status=ready` dans `app.documents` ; re-télécharger
  → pas de doublon (même hash).

## 12. Ordre de développement (CLAUDE.md)

1. Migration `0045` (colonnes org + bucket `org_assets` + RLS + index idempotence).
2. pgTAP (isolation `org_assets` + unicité hash + insert documents par rôle).
3. `pnpm db:types` puis helpers purs : `sha256`, `persist-document.ts` + tests Vitest.
4. `apply-org-signature.ts` + test Vitest.
5. Réglages org : schéma Zod + Server Actions + section UI paramètres.
6. Branchement des 3 routes (signature + persistance).
7. Golden path manuel.

Read/écriture mêlés mais pas de nouvel agrégat domain (c'est de l'infra documentaire +
réglages). Golden path : un OF règle sa signature une fois → tous ses documents partent
auto-signés et tracés, sans ressaisie, cohérents avec le CRM par construction.
