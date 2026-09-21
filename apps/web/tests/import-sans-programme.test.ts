// Beaucoup d'affaires intra sont signées avant que le programme soit écrit, et
// une formation sur mesure n'a rien à faire au catalogue : elle est propre au
// client. L'import échouait pourtant sans programme annexé — `formation_id` est
// NOT NULL sur le dossier, donc rien n'était créé du tout.
// Demande d'Ismael du 21/09/2026.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const APPLY = lire('../features/import/apply-convention.ts');
const LAYOUT = lire('../app/(dashboard)/dossiers/[id]/layout.tsx');

describe('importer une convention sans programme', () => {
  it('ouvre quand même une formation, faute de quoi rien n’est créé', () => {
    // `dossiers.formation_id` est NOT NULL : sans formation, l'insertion du
    // dossier échoue et l'import entier ne produit rien.
    expect(APPLY).toContain('let formationId = resume.formations[0]?.id ?? null;');
    expect(APPLY).toContain('if (!formationId) {');
  });

  it('la nomme d’après l’objet écrit dans la convention', () => {
    // Une convention énonce toujours son objet : c'est le titre le plus juste
    // dont on dispose sans rien inventer.
    expect(APPLY).toContain("payload.dossier.objective || ''");
    expect(APPLY).toContain("`Formation sur mesure — ${payload.client.name.trim() || 'client'}`");
  });

  it('la tient hors du catalogue', () => {
    const bloc = APPLY.slice(APPLY.indexOf('if (!formationId) {'), APPLY.indexOf('// ── Apprenants nommés'));
    expect(bloc).toContain('is_published: false');
    expect(bloc).toContain("importedFrom: 'convention'");
  });

  it('marque le programme comme restant à écrire', () => {
    const bloc = APPLY.slice(APPLY.indexOf('if (!formationId) {'), APPLY.indexOf('// ── Apprenants nommés'));
    expect(bloc).toContain('programmeACompleter: true');
  });

  it('le dit dans le compte rendu d’import, sans le cacher', () => {
    expect(APPLY).toContain('Aucun programme dans la convention');
    expect(APPLY).toContain('à compléter depuis le dossier');
  });

  it('signale l’échec plutôt que de créer un dossier bancal', () => {
    expect(APPLY).toContain("La formation du dossier n'a pas pu être ouverte");
  });
});

describe('écrire le programme ensuite, depuis le dossier', () => {
  it('la fiche du dossier mène au programme de sa formation', () => {
    expect(LAYOUT).toContain('href={`/formations/${d.formation.id}/programme`}');
  });

  it('et le réclame visiblement quand il reste à écrire', () => {
    expect(LAYOUT).toContain('programmeACompleter');
    expect(LAYOUT).toContain('Programme à écrire');
  });

  it('lit le drapeau sans supposer la forme des métadonnées', () => {
    // Une formation d'avant cet import n'a pas ce chemin : l'accès optionnel
    // évite de faire tomber la bannière de tous les dossiers.
    expect(LAYOUT).toContain('d.formation?.metadata?.catalog?.programmeACompleter');
  });
});
