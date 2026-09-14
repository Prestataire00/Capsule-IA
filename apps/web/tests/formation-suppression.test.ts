// Suppression d'une formation : mise à la corbeille réversible, jamais
// d'effacement — les dossiers et sessions montés gardent leur formation.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');

describe('actions de suppression', () => {
  const actions = lire('../features/formations/actions.ts');

  it('réservées aux rôles qui gèrent le catalogue, bornées à leur organisation', () => {
    expect(actions).toContain('export async function deleteFormation');
    expect(actions).toContain('export async function restoreFormation');
    // Chaque écriture (création, modification, suppression, restauration) est filtrée sur l'organisation.
    expect(actions.match(/\.eq\('organization_id', orgId\)/g)?.length).toBeGreaterThanOrEqual(6);
    expect(actions).toContain("return { ok: false, error: 'forbidden_not_admin' }");
  });

  it('supprime en corbeille et dépublie, sans effacer la ligne', () => {
    expect(actions).toContain('deleted_at: new Date().toISOString(), is_published: false');
    expect(actions).not.toContain(".delete()");
  });

  it('la restauration n’agit que sur une formation supprimée, et la laisse en brouillon', () => {
    const restore = actions.slice(actions.indexOf('export async function restoreFormation'));
    expect(restore).toContain(".not('deleted_at', 'is', null)");
    expect(restore).toContain('deleted_at: null');
    expect(restore).not.toContain('is_published: true');
  });

  it('rafraîchit aussi le catalogue public : une formation supprimée n’y reste pas', () => {
    expect(actions).toContain("revalidatePath('/catalogue-public')");
  });
});

describe('catalogue', () => {
  const page = lire('../app/(dashboard)/formations/page.tsx');

  it('supprimer et restaurer sont réservés à la gestion du catalogue', () => {
    expect(page).toContain('<ManageOnly section="catalogue">');
    expect(page).toContain('FormationDeleteButton');
    expect(page).toContain('FormationRestoreButton');
  });

  it('vue corbeille séparée, sans lien vers une fiche devenue inaccessible', () => {
    expect(page).toContain("searchParams.corbeille === '1'");
    expect(page).toContain(".not('deleted_at', 'is', null)");
    expect(page).toContain('plus consultable : pas de lien mort');
  });

  it('annonce l’usage de la formation avant de la supprimer', () => {
    expect(page).toContain('dossiers={dossiersByFormation.get(f.id) ?? 0}');
    expect(page).toContain('sessions={sessionsByFormation.get(f.id) ?? 0}');
  });
});

describe('fiche formation', () => {
  const fiche = lire('../app/(dashboard)/formations/[id]/page.tsx');

  it('propose la suppression, avec le nombre de dossiers et de sessions liés', () => {
    expect(fiche).toContain('FormationDeleteButton');
    expect(fiche).toContain('dossiers={relatedDossiers.length}');
    expect(fiche).toContain('sessions={sessions.length}');
  });
});

describe('confirmation', () => {
  const client = lire('../app/(dashboard)/formations/formation-delete.client.tsx');

  it('dit ce que la suppression touche, et qu’elle est réversible', () => {
    expect(client).toContain('est utilisée par');
    expect(client).toContain('Vous pourrez la restaurer');
    expect(client).toContain('gardent leur intitulé et leur historique');
  });

  it('ne supprime rien sans confirmation explicite', () => {
    expect(client).toContain('if (!window.confirm(confirmation(title, dossiers, sessions))) return;');
  });
});
