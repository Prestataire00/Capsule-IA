-- 0184 — Limitation de débit des points d'entrée publics
--
-- Constat (audit du 19/09/2026) : aucune limitation nulle part. Le formulaire
-- d'inscription public écrit en base avec la clé service role, sans captcha ni
-- pot de miel ; le proxy SIRENE relaie vers une API de l'État au nom de notre
-- serveur ; l'import de conventions déclenche des appels Claude de 300 s
-- acceptant 20 Mo de PDF. C'est la voie la plus directe vers du spam, du
-- remplissage de base, un quota public consommé et une facture d'IA.
--
-- Le compteur vit en base, pas en mémoire : l'application tourne derrière un
-- répartiteur et peut avoir plusieurs instances, où un compteur local ne
-- compte que sa propre part.
--
-- Fenêtre glissante par paliers : la fenêtre est alignée sur un multiple de sa
-- durée, ce qui suffit à arrêter une boucle sans stocker chaque appel.

CREATE TABLE IF NOT EXISTS app.rate_limits (
  cle            TEXT        NOT NULL,
  fenetre_debut  TIMESTAMPTZ NOT NULL,
  compteur       INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (cle, fenetre_debut)
);

ALTER TABLE app.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.rate_limits FORCE ROW LEVEL SECURITY;

-- Aucune policy : la table n'est jamais lue ni écrite depuis un client. Seule
-- la fonction ci-dessous y touche, et elle est SECURITY DEFINER.
COMMENT ON TABLE app.rate_limits IS
  'Compteurs de limitation de débit. Aucune policy : accès par app.consommer_quota() uniquement.';

/**
 * Consomme une unité de quota. Renvoie vrai si l'appel est autorisé.
 *
 * L'incrément et la décision sont dans la même instruction : deux requêtes
 * simultanées ne peuvent pas lire le même compteur et passer toutes les deux.
 */
CREATE OR REPLACE FUNCTION app.consommer_quota(
  p_cle TEXT,
  p_limite INT,
  p_fenetre_secondes INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
DECLARE
  v_debut TIMESTAMPTZ;
  v_compteur INT;
BEGIN
  IF p_limite <= 0 OR p_fenetre_secondes <= 0 THEN
    RETURN TRUE;
  END IF;

  v_debut := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / p_fenetre_secondes) * p_fenetre_secondes
  );

  INSERT INTO app.rate_limits (cle, fenetre_debut, compteur)
  VALUES (p_cle, v_debut, 1)
  ON CONFLICT (cle, fenetre_debut)
    DO UPDATE SET compteur = app.rate_limits.compteur + 1
  RETURNING compteur INTO v_compteur;

  -- Purge opportuniste : une fois sur cent, on efface les fenêtres closes
  -- depuis plus d'un jour. Évite une tâche planifiée de plus.
  IF random() < 0.01 THEN
    DELETE FROM app.rate_limits WHERE fenetre_debut < now() - INTERVAL '1 day';
  END IF;

  RETURN v_compteur <= p_limite;
END;
$$;

COMMENT ON FUNCTION app.consommer_quota(TEXT, INT, INT) IS
  'Incrémente et décide dans la même instruction : deux appels simultanés ne peuvent pas passer tous les deux. Renvoie TRUE si l''appel est autorisé.';

-- Appelée par le serveur applicatif uniquement, jamais par un navigateur.
REVOKE ALL ON FUNCTION app.consommer_quota(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.consommer_quota(TEXT, INT, INT) TO service_role;
