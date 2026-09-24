-- Un dossier signé peut aller à la corbeille. L'effacer reste interdit.
--
-- La 0073 refusait de poser `deleted_at` sur un dossier dont la convention est
-- signée, au nom de Qualiopi. Le raisonnement vaut pour un effacement, pas pour
-- ce que fait réellement l'application : la suppression y est réversible — la
-- ligne reste en base, part dans la corbeille des Paramètres, et se restaure
-- d'un clic. Aucune preuve ne disparaît. Le garde-fou interdisait donc de
-- ranger, pas de détruire, et l'écran s'entendait refuser une opération sans
-- conséquence.
--
-- Demande d'Ismael le 2026-09-24 : « je veux pouvoir supprimer n'importe quel
-- dossier ». L'écran propose désormais le choix — archiver, ou mettre à la
-- corbeille — au lieu de refuser.
--
-- Ce qui ne bouge pas : le trigger BEFORE DELETE, qui bloque tout effacement
-- réel, y compris une commande SQL passée à la main ou en service_role. C'est
-- lui qui porte l'exigence Qualiopi. Aucun écran n'expose aujourd'hui
-- d'effacement définitif ; si l'on en ajoute un, il butera dessus, ce qui est
-- exactement le but.

DROP TRIGGER IF EXISTS tg_dossier_no_soft_delete_if_signed ON app.dossiers;

COMMENT ON FUNCTION app.guard_dossier_no_delete_if_signed() IS
  'Interdit l''EFFACEMENT d''un dossier dont la convention est signée (Qualiopi : la preuve doit rester). Depuis la 0193, la mise à la corbeille — réversible, la ligne reste en base — n''est plus concernée : seul le trigger BEFORE DELETE appelle encore cette fonction.';
