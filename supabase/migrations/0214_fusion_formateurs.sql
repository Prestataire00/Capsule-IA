-- ============================================================================
-- 0214 — Fusionner deux fiches d'un même formateur
-- ============================================================================
-- Audit du point Capsule IA (2026-10-06) : une même personne pouvait avoir
-- deux fiches formateur (deux adresses, ou une saisie en double), sans rien
-- pour s'en apercevoir ni pour les réunir. Ismael en a deux.
--
-- `fusionner_formateurs(garde, doublon)` rattache à la fiche gardée tout ce
-- qui pointait vers le doublon — dans TOUTES les tables qui la référencent,
-- relevées dans le catalogue plutôt que listées à la main (une table ajoutée
-- demain sera couverte). Quand la fiche gardée a déjà le même lien (le même
-- formateur deux fois sur une séance), la ligne du doublon est retirée au lieu
-- d'être dupliquée. Le compte de connexion du doublon passe à la fiche gardée
-- si elle n'en a pas. Le doublon part à la corbeille. Tout ou rien.

CREATE OR REPLACE FUNCTION app.fusionner_formateurs(p_garde UUID, p_doublon UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_garde   app.trainers%ROWTYPE;
  v_doublon app.trainers%ROWTYPE;
  r         RECORD;
  ligne     RECORD;
  v_moves   INT := 0;
  v_retires INT := 0;
BEGIN
  IF p_garde IS NULL OR p_doublon IS NULL OR p_garde = p_doublon THEN
    RAISE EXCEPTION 'fusion_impossible: deux fiches différentes sont attendues' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_garde FROM app.trainers WHERE id = p_garde AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO v_doublon FROM app.trainers WHERE id = p_doublon AND deleted_at IS NULL FOR UPDATE;
  IF v_garde.id IS NULL OR v_doublon.id IS NULL THEN
    RAISE EXCEPTION 'fusion_impossible: fiche introuvable' USING ERRCODE = '22023';
  END IF;
  IF v_garde.organization_id <> v_doublon.organization_id THEN
    RAISE EXCEPTION 'fusion_impossible: fiches de deux organismes' USING ERRCODE = '22023';
  END IF;

  -- Toutes les clés étrangères à une colonne vers app.trainers.
  FOR r IN
    SELECT con.conrelid::regclass AS tbl, att.attname AS col
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND con.confrelid = 'app.trainers'::regclass
      AND array_length(con.conkey, 1) = 1
  LOOP
    FOR ligne IN EXECUTE format('SELECT ctid FROM %s WHERE %I = $1', r.tbl, r.col) USING p_doublon LOOP
      BEGIN
        EXECUTE format('UPDATE %s SET %I = $1 WHERE ctid = $2', r.tbl, r.col) USING p_garde, ligne.ctid;
        v_moves := v_moves + 1;
      EXCEPTION WHEN unique_violation THEN
        -- La fiche gardée a déjà ce lien : celui du doublon ferait double emploi.
        EXECUTE format('DELETE FROM %s WHERE ctid = $1', r.tbl) USING ligne.ctid;
        v_retires := v_retires + 1;
      END;
    END LOOP;
  END LOOP;

  -- Les références posées dans les métadonnées des documents (espace formateur).
  UPDATE app.documents
     SET metadata = jsonb_set(metadata, '{trainer_id}', to_jsonb(p_garde::text))
   WHERE metadata ->> 'trainer_id' = p_doublon::text;

  -- Le compte de connexion suit la personne, pas la fiche.
  IF v_garde.user_id IS NULL AND v_doublon.user_id IS NOT NULL THEN
    UPDATE app.trainers SET user_id = NULL WHERE id = p_doublon;
    UPDATE app.trainers SET user_id = v_doublon.user_id WHERE id = p_garde;
  END IF;

  -- Ce que la fiche gardée n'avait pas, le doublon le lui apporte.
  UPDATE app.trainers g
     SET phone = COALESCE(g.phone, v_doublon.phone),
         siret = COALESCE(g.siret, v_doublon.siret),
         bio = COALESCE(g.bio, v_doublon.bio),
         hourly_rate_cents = COALESCE(g.hourly_rate_cents, v_doublon.hourly_rate_cents),
         updated_at = now()
   WHERE g.id = p_garde;

  UPDATE app.trainers
     SET deleted_at = now(),
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('fusionne_dans', p_garde, 'fusionne_le', now())
   WHERE id = p_doublon;

  RETURN jsonb_build_object('liens_deplaces', v_moves, 'liens_en_double_retires', v_retires);
END;
$$;

REVOKE ALL ON FUNCTION app.fusionner_formateurs(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.fusionner_formateurs(UUID, UUID) TO service_role;

COMMENT ON FUNCTION app.fusionner_formateurs(UUID, UUID) IS
  'Fusionne deux fiches d''un même formateur (0214) : liens rattachés à la fiche gardée, doublon à la corbeille. Réservée au service role, appelée après vérification du rôle.';

NOTIFY pgrst, 'reload schema';
