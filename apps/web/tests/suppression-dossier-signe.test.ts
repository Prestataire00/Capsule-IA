// « Je n'arrive pas à supprimer certains dossiers, pourquoi ? » — Ismael,
// 24/09/2026.
//
// Ce n'était pas une panne : un dossier dont la convention est signée ne se
// supprime pas. La règle est volontaire — Qualiopi impose de garder la preuve —
// et tenue par un garde-fou en base depuis la 0073, qui couvre aussi bien le
// soft-delete que tout DELETE direct.
//
// Le défaut était le message : le refus remontait en « La suppression a
// échoué », qui laisse croire à une panne et fait réessayer. Relevé en base le
// jour même : un seul dossier concerné, DOS-2026-019F0F99, sur huit actifs.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const ACTIONS = lire('../features/corbeille/actions.ts');
const BOUTON = lire('../features/corbeille/ui/delete-entity-button.client.tsx');
const GARDE = lire('../../../supabase/migrations/0073_dossier_delete_guard.sql');

describe('le garde-fou', () => {
  it('bloque les deux chemins, pas seulement celui de l’écran', () => {
    // Un DELETE direct en SQL contournerait un contrôle applicatif.
    expect(GARDE).toContain('BEFORE DELETE ON app.dossiers');
    expect(GARDE).toContain('BEFORE UPDATE ON app.dossiers');
  });

  it('ne se déclenche qu’au moment où l’on supprime', () => {
    // Sans cette condition, toute modification d'un dossier déjà en corbeille
    // — une restauration, par exemple — serait refusée elle aussi.
    expect(GARDE).toContain('NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL');
  });

  it('parle en violation de contrainte, ce que le code peut reconnaître', () => {
    expect(GARDE).toContain("USING ERRCODE = 'check_violation'");
  });
});

describe('le refus remonte tel quel', () => {
  it('l’action distingue ce refus d’une panne', () => {
    expect(ACTIONS).toContain("error.code === '23514'");
    expect(ACTIONS).toContain("/convention sign/i");
    expect(ACTIONS).toContain("error: 'convention_signee'");
  });

  it('et l’écran dit la règle, et le geste qui la respecte', () => {
    // « La suppression a échoué » ne disait ni pourquoi, ni quoi faire.
    expect(BOUTON).toContain('convention_signee:');
    expect(BOUTON).toMatch(/convention est signée[\s\S]{0,160}Archivez le dossier/);
  });

  it('sans effacer le message générique, qui sert aux autres cas', () => {
    expect(BOUTON).toContain("suppression_impossible: 'La suppression a échoué.'");
  });
});
