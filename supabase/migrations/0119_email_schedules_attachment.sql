-- ============================================================================
-- 0119 — app.email_schedules : pièce jointe optionnelle (envoi de documents)
-- ============================================================================
-- Permet de programmer l'envoi d'un DOCUMENT (pas seulement un email texte) :
-- attachment_kind = le `kind` de document (app.documents) à joindre automatiquement.
-- À l'envoi, le cron récupère le document le PLUS RÉCENT de ce type pour le dossier
-- (storage bucket 'documents') et l'attache. NULL = aucune pièce jointe.
-- Exemples de kind : 'convention', 'attestation', 'certificat', ou un type de
-- document généré par IA. Volontairement sans CHECK pour rester ouvert aux
-- nouveaux types de documents.

ALTER TABLE app.email_schedules ADD COLUMN attachment_kind TEXT;
