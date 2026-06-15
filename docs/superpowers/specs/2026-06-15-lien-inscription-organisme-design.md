# Lien d'inscription au niveau organisme + bouton à intégrer

**Date** : 2026-06-15
**Statut** : Design approuvé
**Cible** : `i-a-infinity-of` (Capsule IA)

## Problème
L'OF veut un lien d'inscription à mettre derrière un bouton sur son site web. Le tunnel
public existe (`/inscription?formation=<id>`) mais n'est adressable **que par formation** :
pas de lien stable « niveau organisme » montrant tout le catalogue. (`getPublicCatalog`
renvoie `[]` sans paramètre — anti-fuite multi-tenant volontaire.)

## Décisions (validées)
- **Mode lien/bouton** (pas d'iframe → aucun changement d'en-têtes X-Frame/CSP).
- **Identifiant = id organisme** dans l'URL (`?org=<id>`) → zéro migration.

## Design

### 1. `/inscription` adressable par organisme
- `app/inscription/page.tsx` : `searchParams: { formation?: string; org?: string }`.
- `features/catalog/public-catalog.ts` : nouvelle entrée `getPublicCatalogByOrg(orgId)` qui
  appelle la RPC existante `list_published_formations(p_org)` (0071, SECURITY DEFINER, `anon`,
  **publiées uniquement**). `getPublicCatalog(formationId?)` inchangé. La page choisit :
  `org` présent → `getPublicCatalogByOrg(org)` ; sinon → `getPublicCatalog(formation)`.
- Résultat : `…/inscription?org=<id>` ouvre tout le catalogue publié de l'OF ; l'apprenant
  choisit sa formation dans le tunnel existant (aucun changement du tunnel).

### 2. Page Paramètres → « Lien d'inscription »
- `app/(dashboard)/parametres/inscription/page.tsx` (server) : résout l'`organization_id`
  du membre courant (query `app.members`, RLS), passe l'id au client.
- `app/(dashboard)/parametres/inscription/inscription-link.tsx` (client) :
  - construit l'URL absolue `` `${window.location.origin}/inscription?org=${orgId}` `` (même
    technique que `shared/ui/copy-inscription-link.tsx`),
  - affiche le lien + bouton **Copier**,
  - affiche un **snippet HTML** de bouton autonome (styles inline, fond orange-500,
    `target="_blank" rel="noopener"`) + bouton **Copier le code**,
  - note d'aide : « publiez au moins une formation pour qu'elle apparaisse ».
- Entrée « Lien d'inscription » ajoutée à l'index `parametres/page.tsx`.

### 3. Snippet fourni
```html
<a href="https://…/inscription?org=<id>" target="_blank" rel="noopener"
   style="display:inline-block;padding:12px 20px;background:#f97316;color:#fff;
          border-radius:10px;font-weight:600;font-family:sans-serif;text-decoration:none">
  S'inscrire à une formation
</a>
```

## Sécurité
- `list_published_formations` n'expose que les formations **publiées** → aucun risque de
  fuite inter-OF même avec un id arbitraire.
- Aucun assouplissement d'en-tête (pas d'iframe).

## Fichiers
- `features/catalog/public-catalog.ts` (étendu)
- `app/inscription/page.tsx` (param `org`)
- `app/(dashboard)/parametres/inscription/page.tsx` (nouveau)
- `app/(dashboard)/parametres/inscription/inscription-link.tsx` (nouveau)
- `app/(dashboard)/parametres/page.tsx` (entrée)

## Hors scope
Iframe/embed, slug lisible, refonte du tunnel d'inscription. **Aucune migration.**

## Tests
- Unitaire/build : `getPublicCatalogByOrg` renvoie la liste publiée d'un org ; `[]` si org inconnu.
- Build Next vert (typecheck non bloquant sur ce repo).
- Vérif manuelle : `/inscription?org=<id>` liste le catalogue ; copie lien + snippet.
