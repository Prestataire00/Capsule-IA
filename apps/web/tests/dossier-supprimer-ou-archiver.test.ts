// « Je veux pouvoir supprimer n'importe quel dossier » puis « je dois avoir un
// message qui indique Archiver ? quand je veux cliquer sur supprimer, et je
// dois décider oui ou non » — Ismael, 24/09/2026.
//
// Un garde-fou (0073) refusait de poser `deleted_at` sur un dossier dont la
// convention est signée, au nom de Qualiopi. Or la suppression est réversible
// ici : la ligne reste en base et se restaure depuis la corbeille, qui ne
// propose que « Restaurer » — aucun écran n'efface. Le garde-fou interdisait
// donc de ranger, pas de détruire.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const MIGRATION = lire('../../../supabase/migrations/0193_dossier_signe_va_a_la_corbeille.sql');
const GARDE_ORIGINE = lire('../../../supabase/migrations/0073_dossier_delete_guard.sql');
const DIALOGUE = lire('../app/(dashboard)/dossiers/[id]/supprimer-ou-archiver.client.tsx');
const LAYOUT = lire('../app/(dashboard)/dossiers/[id]/layout.tsx');
const CORBEILLE = lire('../app/(dashboard)/parametres/corbeille/page.tsx');

describe('ce que la migration lève, et ce qu’elle garde', () => {
  it('ouvre la corbeille à tout dossier', () => {
    expect(MIGRATION).toContain('DROP TRIGGER IF EXISTS tg_dossier_no_soft_delete_if_signed');
  });

  it('mais ne touche pas à l’interdiction d’effacer', () => {
    // C'est ce trigger-là qui porte l'exigence Qualiopi, et il bloque même un
    // DELETE passé à la main en service_role.
    expect(MIGRATION).not.toContain('tg_dossier_no_delete_if_signed');
    expect(GARDE_ORIGINE).toContain('BEFORE DELETE ON app.dossiers');
  });

  it('ce qui reste sûr parce que rien n’efface', () => {
    // Le raisonnement tient tant que la corbeille ne propose que de restaurer.
    // Si une purge apparaît un jour, elle butera sur le trigger BEFORE DELETE.
    expect(CORBEILLE).toContain('RestoreEntityButton');
    expect(CORBEILLE).not.toMatch(/définitivement|purger|vider la corbeille/i);
  });
});

describe('le choix posé à l’écran', () => {
  it('pose la question au lieu de trancher', () => {
    expect(DIALOGUE).toContain('Archiver ce dossier ?');
    expect(DIALOGUE).toContain('Oui, archiver');
    expect(DIALOGUE).toContain('Non, mettre à la corbeille');
    expect(DIALOGUE).toContain('Annuler');
  });

  it('conseille sans interdire quand la convention est signée', () => {
    // La signature change ce qui est recommandé, pas ce qui est permis.
    expect(DIALOGUE).toContain('conventionSignee');
    expect(DIALOGUE).toMatch(/convention est signée[\s\S]{0,200}Qualiopi/);
  });

  it('dit pourquoi l’archivage échoue quand il échoue', () => {
    // `changeDossierStatus` n'autorise `archived` que depuis « clôturé » :
    // proposer le geste sans expliquer son refus reproduirait le défaut qu'on
    // vient de corriger.
    expect(DIALOGUE).toContain('invalid_transition:');
    expect(DIALOGUE).toContain('clôturez d’abord le dossier');
  });
});

describe('la fiche du dossier', () => {
  it('sait si la convention est signée', () => {
    expect(LAYOUT).toContain('const conventionSignee =');
    expect(LAYOUT).toContain("eq('kind', 'convention')");
    expect(LAYOUT).toContain("eq('status', 'signed')");
  });

  it('et pose le choix derrière le bouton Supprimer', () => {
    expect(LAYOUT).toContain('<SupprimerOuArchiver');
    expect(LAYOUT).not.toContain('<DeleteEntityButton');
  });
});
