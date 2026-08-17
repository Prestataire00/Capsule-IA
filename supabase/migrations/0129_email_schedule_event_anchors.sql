-- 0129 — Déclencheurs événementiels pour les règles d'envoi programmé
--
-- Les règles ne pouvaient se caler que sur des dates (début/fin de formation,
-- première session). Or l'essentiel du suivi commercial se déclenche sur des
-- ÉVÉNEMENTS : la signature d'un devis, celle de la convention, le règlement
-- d'une facture. On étend l'ancre plutôt que d'ajouter une table : l'événement
-- fournit simplement la date à laquelle le décalage en jours s'applique.

ALTER TABLE app.email_schedules DROP CONSTRAINT IF EXISTS email_schedules_anchor_check;

ALTER TABLE app.email_schedules
  ADD CONSTRAINT email_schedules_anchor_check CHECK (anchor IN (
    -- Ancres calendaires (existantes)
    'first_session_start',
    'dossier_start',
    'dossier_end',
    -- Ancres événementielles
    'last_session_end',
    'dossier_created',
    'devis_signed',
    'convention_signed',
    'invoice_paid'
  ));

COMMENT ON COLUMN app.email_schedules.anchor IS
  'Point de départ du décalage : date (début/fin de formation, 1re session, fin de la dernière session) ou événement (création du dossier, signature du devis ou de la convention, règlement de la facture).';

NOTIFY pgrst, 'reload schema';
