-- ============================================================================
-- Tests pgTAP : espace formateur — relation client (0164).
-- RLS forcée, écriture réservée au service role, marque de lecture privée.
-- ============================================================================
BEGIN;
SELECT plan(14);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'app.session_resources'::regclass), 'RLS activée sur les supports');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.session_resources'::regclass), 'RLS forcée sur les supports');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'app.session_messages'::regclass), 'RLS activée sur les messages');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.session_messages'::regclass), 'RLS forcée sur les messages');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'app.session_message_reads'::regclass), 'RLS forcée sur les marques de lecture');

SELECT policies_are('app', 'session_resources',
  ARRAY['session_resources_select', 'session_resources_write'], 'policies des supports');
SELECT policies_are('app', 'session_messages',
  ARRAY['session_messages_select', 'session_messages_write'], 'policies des messages');
SELECT policies_are('app', 'session_message_reads',
  ARRAY['session_message_reads_select', 'session_message_reads_write'], 'policies des marques de lecture');

SELECT has_column('app', 'session_resources', 'is_published', 'un support peut rester brouillon');
SELECT has_column('app', 'session_messages', 'author_learner_id', 'l''apprenant sans compte est identifié par sa fiche');

-- Un support « fichier » sans chemin de stockage n'a rien à ouvrir ;
-- un « lien » sans URL non plus.
SELECT col_has_check('app', 'session_resources', ARRAY['kind', 'storage_path', 'external_url'],
  'un support sans source est refusé');

-- Membre d'un organisme A, simple formateur : aucune écriture directe, les
-- Server Actions gardées passent par le service role.
SELECT tests.set_jwt('00000000-0000-0000-0000-00000000000a'::uuid, 'formateur',
                     '00000000-0000-0000-0000-0000000000f1'::uuid);
SELECT tests.as_authenticated();

SELECT throws_ok(
  $$INSERT INTO app.session_messages (organization_id, session_id, author_kind, author_name, body)
    VALUES ('00000000-0000-0000-0000-00000000000a'::uuid, gen_random_uuid(), 'formateur', 'X', 'coucou')$$,
  '42501', NULL, 'pas d''écriture directe dans le fil');

SELECT throws_ok(
  $$INSERT INTO app.session_resources (organization_id, session_id, title, kind, external_url)
    VALUES ('00000000-0000-0000-0000-00000000000a'::uuid, gen_random_uuid(), 'x', 'lien', 'https://ex.fr')$$,
  '42501', NULL, 'pas de dépôt direct de support');

SELECT is_empty(
  $$SELECT 1 FROM app.session_message_reads WHERE user_id <> auth.uid()$$,
  'la marque de lecture d''un autre utilisateur reste invisible');

SELECT * FROM finish();
ROLLBACK;
