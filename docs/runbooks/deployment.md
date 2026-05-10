# Déploiement — GitHub + Supabase + Railway

Stack défini au livrable #1 : Railway pour le web Next.js, Supabase pour Postgres+Auth+Storage+Edge Fns.

## 1. Pré-requis CLI (à installer une seule fois)

```bash
brew install gh                    # GitHub CLI (push auto)
brew install --cask docker         # Docker Desktop (Supabase local)
brew install supabase/tap/supabase # Supabase CLI
brew install railway               # Railway CLI (optionnel — UI web suffit)
```

Authentifier :

```bash
gh auth login
supabase login
railway login
```

## 2. Push sur GitHub

```bash
cd ~/i-a-infinity-of
gh repo create i-a-infinity-of --private --source=. --remote=origin --push
```

(Ou via l'UI : crée le repo sur github.com, puis `git remote add origin ... && git push -u origin main`.)

## 3. Provisionner Supabase

### Option A — Cloud (recommandé pour le déploiement Railway)

1. Sur [app.supabase.com](https://app.supabase.com), crée un projet.
2. Récupère les clés dans **Project Settings → API** : `Project URL`, `anon key`, `service_role key`.
3. Joue les migrations en local d'abord (étape 4) puis push vers le cloud :
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```

### Option B — Local (dev)

```bash
cd ~/i-a-infinity-of
supabase start              # démarre Postgres+Auth+Storage en Docker
supabase db reset --local   # joue les 24 migrations + seed Qualiopi
supabase status             # affiche les clés locales
```

## 4. Configurer Railway

### Via UI web

1. [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo** → choisir `i-a-infinity-of`.
2. **Settings → Source** : Root Directory = `/` (la `nixpacks.toml` à la racine prend le relais).
3. **Variables** : ajouter les env vars (cf. ci-dessous).
4. **Deploy**. Railway build avec nixpacks (pnpm + Next.js).
5. **Settings → Domains** : génère un domaine `*.up.railway.app` ou ajoute le custom.

### Variables d'environnement Railway

À copier dans **Railway → Variables** (depuis tes valeurs Supabase + secrets générés) :

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service_role>
TOKEN_SIGNING_KEY=<openssl rand -base64 32>
CRON_SECRET=<openssl rand -base64 32>
NODE_ENV=production
```

(Resend, Zoom, Stripe : à ajouter quand tu activeras ces intégrations.)

## 5. Configurer le déploiement Edge Functions Supabase

Edge Fns vivent dans `supabase/functions/`. Quand le code sera implémenté :

```bash
supabase functions deploy dispatch-events --no-verify-jwt
supabase functions deploy generate-document --no-verify-jwt
# ... etc
supabase secrets set CRON_SECRET=<même valeur que Railway>
supabase secrets set TOKEN_SIGNING_KEY=<même valeur que Railway>
```

## 6. Vérifier le déploiement

```bash
# Web sur Railway
curl https://<your>.up.railway.app/api/health
# Devrait retourner 200 (à implémenter dans apps/web/app/api/health/route.ts)

# DB sur Supabase
supabase migration list --linked    # confirme les 24 migrations
```

## 7. Pipeline CI/CD (Phase 1 — minimal)

À ajouter dans `.github/workflows/ci.yml` :

```yaml
name: CI
on: [pull_request, push]
jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
```

Railway re-déploie automatiquement à chaque push sur `main`.

## 8. Coût estimé V1

- **Supabase Pro** : ~$25/mois (DB + Storage + Auth + Edge Fns).
- **Railway** : ~$5–20/mois (Hobby plan suffit en V1, scale selon trafic).
- **Resend** : free tier jusqu'à 3000 emails/mois.

Total V1 : ~$30–50/mois.
