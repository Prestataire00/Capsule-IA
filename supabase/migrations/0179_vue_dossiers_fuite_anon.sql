-- 0179 — URGENT : `app.v_dossiers_overview` était lisible par la clé anonyme
--
-- Constat (audit de production du 19/09/2026, vérifié en base) : une requête
-- PostgREST avec la seule clé `anon` — publique par nature, présente dans le
-- bundle navigateur — renvoyait les dossiers réels de l'organisme, avec
-- `learner_full_name`, `learner_email`, `company_name` et
-- `total_amount_cents`. Soit une violation de données personnelles.
--
-- Cause : la vue a été recréée par la 0095 (« recrée les vues à l'identique »)
-- sans `WITH (security_invoker = true)`. Une vue sans ce drapeau s'exécute avec
-- les droits de son PROPRIÉTAIRE (`postgres`, qui contourne la RLS) et non ceux
-- de l'appelant : les policies de `app.dossiers` ne s'appliquaient plus. Le
-- schéma `app` étant exposé à PostgREST, la vue devenait un contournement
-- complet de l'isolation multi-tenant. Les quatre autres vues du dépôt portent
-- bien le drapeau (0056, 0060, 0067, 0085) — c'était un oubli, pas un choix.
--
-- Règle : toute vue de ce dépôt DOIT déclarer `security_invoker = true`. Une
-- vue est une lecture de tables protégées par RLS ; sans ce drapeau, elle perce
-- la protection au lieu de la relayer.

ALTER VIEW app.v_dossiers_overview SET (security_invoker = true);

-- Le rôle anonyme n'a rien à lire ici, même une fois la RLS rétablie.
REVOKE ALL ON app.v_dossiers_overview FROM anon;

COMMENT ON VIEW app.v_dossiers_overview IS
  'Vue de synthèse des dossiers. security_invoker OBLIGATOIRE : sans lui la vue contourne la RLS et expose tous les organismes (incident du 19/09/2026). Ne jamais la recréer sans ce drapeau.';

-- ── reports.mv_org_kpis : supprimée ─────────────────────────────────────────
-- Vue MATÉRIALISÉE agrégeant le chiffre d'affaires et le NPS de tous les
-- organismes. Une matview ne peut porter aucune policy : la RLS ne s'y applique
-- jamais, quel que soit le drapeau. Son seul rempart est l'absence de GRANT, ce
-- qui ne tient pas dès qu'un schéma est exposé depuis le tableau de bord
-- Supabase — et le schéma `reports` l'est (supabase/config.toml).
-- Elle est morte par ailleurs : la 0067 l'a remplacée par `app.v_org_kpis`
-- (vue live, security_invoker), et elle n'a jamais été rafraîchie ni lue par
-- l'application. On la supprime plutôt que de la garder sous surveillance.
DROP MATERIALIZED VIEW IF EXISTS reports.mv_org_kpis;
