-- ============================================================================
-- 0047 — Playbooks système (organization_id NULL). Override possible par OF.
-- ============================================================================
-- Variables des templates email rendues par renderFunderEmail :
-- {{stagiaire}}, {{financeur}}, {{dossier}}, {{date_debut}}, {{date_fin}}, {{organisme}}.

INSERT INTO app.funder_playbooks (id, organization_id, funder_kind, code, title, description)
VALUES
  ('d0000000-0000-0000-0000-0000000000a1', NULL, 'opco',    'sys-opco-v1',    'OPCO — standard', 'Process OPCO par défaut'),
  ('d0000000-0000-0000-0000-0000000000a2', NULL, 'agefiph', 'sys-agefiph-v1', 'AGEFIPH — standard', 'Process AGEFIPH par défaut'),
  ('d0000000-0000-0000-0000-0000000000a3', NULL, 'faf_ca',  'sys-fafca-v1',   'FAF-CA — standard', 'Process FAF-CA par défaut')
ON CONFLICT (organization_id, code) DO NOTHING;

-- OPCO : dossier de prise en charge à J-15, attestation de fin à J+0.
INSERT INTO app.funder_playbook_steps
  (playbook_id, organization_id, step_order, anchor, offset_days,
   email_subject_template, email_body_template, required_document_kinds, reference_document_codes)
VALUES
  ('d0000000-0000-0000-0000-0000000000a1', NULL, 1, 'session_start', -15,
   'Dossier de prise en charge — {{stagiaire}}',
   E'Bonjour,\n\nVeuillez trouver ci-joint le dossier de prise en charge pour {{stagiaire}} (formation du {{date_debut}} au {{date_fin}}).\n\nCordialement,\n{{organisme}}',
   ARRAY['devis','programme','convention'], ARRAY[]::text[]),
  ('d0000000-0000-0000-0000-0000000000a1', NULL, 2, 'session_end', 0,
   'Attestation de fin de formation — {{stagiaire}}',
   E'Bonjour,\n\nLa formation de {{stagiaire}} est terminée. Vous trouverez ci-joint l''attestation de fin et le certificat de réalisation.\n\nCordialement,\n{{organisme}}',
   ARRAY['attestation_fin','certificat_realisation'], ARRAY[]::text[])
ON CONFLICT (playbook_id, step_order) DO NOTHING;

-- AGEFIPH : dossier à J-15.
INSERT INTO app.funder_playbook_steps
  (playbook_id, organization_id, step_order, anchor, offset_days,
   email_subject_template, email_body_template, required_document_kinds, reference_document_codes)
VALUES
  ('d0000000-0000-0000-0000-0000000000a2', NULL, 1, 'session_start', -15,
   'Demande de financement AGEFIPH — {{stagiaire}}',
   E'Bonjour,\n\nCi-joint le dossier de demande de financement pour {{stagiaire}}.\n\nCordialement,\n{{organisme}}',
   ARRAY['devis','programme','convention'], ARRAY[]::text[])
ON CONFLICT (playbook_id, step_order) DO NOTHING;

-- FAF-CA : dossier à J-15.
INSERT INTO app.funder_playbook_steps
  (playbook_id, organization_id, step_order, anchor, offset_days,
   email_subject_template, email_body_template, required_document_kinds, reference_document_codes)
VALUES
  ('d0000000-0000-0000-0000-0000000000a3', NULL, 1, 'session_start', -15,
   'Demande de prise en charge FAF-CA — {{stagiaire}}',
   E'Bonjour,\n\nCi-joint la demande de prise en charge pour {{stagiaire}}.\n\nCordialement,\n{{organisme}}',
   ARRAY['devis','programme','convention'], ARRAY[]::text[])
ON CONFLICT (playbook_id, step_order) DO NOTHING;
