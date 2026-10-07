-- ============================================================================
-- Tests pgTAP : une facture réglée émet billing.invoice.paid (0219).
-- ============================================================================
BEGIN;
SELECT plan(3);

INSERT INTO app.organizations (id, name, slug, contact_email) VALUES
  ('00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa219', 'OF A', 'of-a-219', 'contact@of-a-219.test');
INSERT INTO app.learners (id, organization_id, first_name, last_name) VALUES
  ('1e1e1e1e-0000-0000-0000-000000000219', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa219', 'Léa', 'Zola');
INSERT INTO app.formations (id, organization_id, code, title, slug, default_duration_hours) VALUES
  ('f0f0f0f0-0000-0000-0000-000000000219', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa219', 'F219', 'Formation', 'formation-219', 7);
INSERT INTO app.dossiers (id, organization_id, reference, learner_id, formation_id, formation_snapshot, modality, start_date, end_date, total_hours) VALUES
  ('d0d0d0d0-0000-0000-0000-000000000219', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa219', 'DOS-219', '1e1e1e1e-0000-0000-0000-000000000219',
   'f0f0f0f0-0000-0000-0000-000000000219', '{}'::jsonb, 'presentiel', '2026-10-01', '2026-10-02', 7);
INSERT INTO app.invoices (id, organization_id, reference, dossier_id, status) VALUES
  ('1a1a1a1a-0000-0000-0000-000000000219', '00aaa000-aaaa-aaaa-aaaa-aaaaaaaaa219', 'FAC-219', 'd0d0d0d0-0000-0000-0000-000000000219', 'issued');

UPDATE app.invoices SET status = 'partially_paid' WHERE id = '1a1a1a1a-0000-0000-0000-000000000219';
SELECT is((SELECT count(*) FROM infra.domain_events WHERE aggregate_id = '1a1a1a1a-0000-0000-0000-000000000219')::int, 0,
  'un règlement partiel n’émet rien');

UPDATE app.invoices SET status = 'paid', paid_at = now() WHERE id = '1a1a1a1a-0000-0000-0000-000000000219';
SELECT is((SELECT count(*) FROM infra.domain_events WHERE aggregate_id = '1a1a1a1a-0000-0000-0000-000000000219' AND type = 'billing.invoice.paid')::int, 1,
  'la facture soldée émet billing.invoice.paid');
SELECT is((SELECT payload->>'dossier_id' FROM infra.domain_events WHERE aggregate_id = '1a1a1a1a-0000-0000-0000-000000000219'),
  'd0d0d0d0-0000-0000-0000-000000000219', 'avec son dossier');

SELECT * FROM finish();
ROLLBACK;
