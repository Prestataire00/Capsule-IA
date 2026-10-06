-- ============================================================================
-- 0216 — Fusionner deux fiches d'un même apprenant
-- ============================================================================
-- Audit du point Capsule IA (2026-10-06) : « permettre la suppression
-- d'apprenants en doublon dans le dossier ». Retirer le doublon perdait ce
-- qu'il portait (signatures, fiche de positionnement, questionnaires), et le
-- titulaire ne pouvait pas être retiré. Même mécanique que les formateurs
-- (0214) : tout ce qui pointe vers le doublon, dans toutes les tables qui le
-- référencent, passe sur la fiche gardée ; un lien déjà présent n'est pas
-- dupliqué ; le doublon part à la corbeille. Tout ou rien.

CREATE OR REPLACE FUNCTION app.fusionner_apprenants(p_garde UUID, p_doublon UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, public
AS $$
DECLARE
  v_garde   app.learners%ROWTYPE;
  v_doublon app.learners%ROWTYPE;
  r         RECORD;
  ligne     RECORD;
  v_moves   INT := 0;
  v_retires INT := 0;
BEGIN
  IF p_garde IS NULL OR p_doublon IS NULL OR p_garde = p_doublon THEN
    RAISE EXCEPTION 'fusion_impossible: deux fiches différentes sont attendues' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_garde FROM app.learners WHERE id = p_garde AND deleted_at IS NULL FOR UPDATE;
  SELECT * INTO v_doublon FROM app.learners WHERE id = p_doublon AND deleted_at IS NULL FOR UPDATE;
  IF v_garde.id IS NULL OR v_doublon.id IS NULL THEN
    RAISE EXCEPTION 'fusion_impossible: fiche introuvable' USING ERRCODE = '22023';
  END IF;
  IF v_garde.organization_id <> v_doublon.organization_id THEN
    RAISE EXCEPTION 'fusion_impossible: fiches de deux organismes' USING ERRCODE = '22023';
  END IF;

  FOR r IN
    SELECT con.conrelid::regclass AS tbl, att.attname AS col
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND con.confrelid = 'app.learners'::regclass
      AND array_length(con.conkey, 1) = 1
  LOOP
    FOR ligne IN EXECUTE format('SELECT ctid FROM %s WHERE %I = $1', r.tbl, r.col) USING p_doublon LOOP
      BEGIN
        EXECUTE format('UPDATE %s SET %I = $1 WHERE ctid = $2', r.tbl, r.col) USING p_garde, ligne.ctid;
        v_moves := v_moves + 1;
      EXCEPTION WHEN unique_violation THEN
        -- La fiche gardée a déjà ce lien (même dossier, même séance) : pas de double.
        EXECUTE format('DELETE FROM %s WHERE ctid = $1', r.tbl) USING ligne.ctid;
        v_retires := v_retires + 1;
      END;
    END LOOP;
  END LOOP;

  IF v_garde.user_id IS NULL AND v_doublon.user_id IS NOT NULL THEN
    UPDATE app.learners SET user_id = NULL WHERE id = p_doublon;
    UPDATE app.learners SET user_id = v_doublon.user_id WHERE id = p_garde;
  END IF;

  UPDATE app.learners g
     SET phone = COALESCE(g.phone, v_doublon.phone),
         birth_date = COALESCE(g.birth_date, v_doublon.birth_date),
         birth_place = COALESCE(g.birth_place, v_doublon.birth_place),
         company_id = COALESCE(g.company_id, v_doublon.company_id),
         position = COALESCE(g.position, v_doublon.position),
         updated_at = now()
   WHERE g.id = p_garde;

  -- Le doublon libère son adresse (unique par organisme parmi les fiches actives).
  UPDATE app.learners
     SET deleted_at = now(),
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('fusionne_dans', p_garde, 'fusionne_le', now())
   WHERE id = p_doublon;

  RETURN jsonb_build_object('liens_deplaces', v_moves, 'liens_en_double_retires', v_retires);
END;
$$;

REVOKE ALL ON FUNCTION app.fusionner_apprenants(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.fusionner_apprenants(UUID, UUID) TO service_role;

COMMENT ON FUNCTION app.fusionner_apprenants(UUID, UUID) IS
  'Fusionne deux fiches d''un même apprenant (0216) : liens rattachés à la fiche gardée, doublon à la corbeille. Réservée au service role.';

NOTIFY pgrst, 'reload schema';
