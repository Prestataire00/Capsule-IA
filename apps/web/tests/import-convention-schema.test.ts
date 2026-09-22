// « Quand j'importe une convention ça met un échec » — signalé le 21/09/2026,
// reproduit le 22 sur le PDF même de l'utilisateur.
//
// La cause n'était ni le PDF ni la clé API : l'appel partait avec un schéma
// unique, et l'API le refusait avant toute lecture — « the compiled grammar is
// too large, simplify your tool schemas ». Le décodage contraint compile le
// schéma en grammaire, et la nôtre débordait. Aucune convention n'était donc
// importable, quel que soit le document. L'écran, lui, accusait le PDF d'être
// une image scannée illisible : le message désignait la mauvaise cause, ce qui
// a coûté l'essentiel du temps de diagnostic.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_CONVENTION, SCHEMA_FORMATIONS } from '../features/import/extract-convention';
import type { ConventionImport } from '../features/import/convention-types';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const SOURCE = lire('../features/import/extract-convention.ts');
const ROUTE = lire('../app/api/import/convention/route.ts');
const ECRAN = lire('../app/(dashboard)/import-convention/import-client.tsx');

describe('la découpe du schéma', () => {
  it('sépare le contenu pédagogique du reste', () => {
    // C'est lui qui faisait déborder : modules imbriqués, listes de phrases.
    expect(Object.keys(SCHEMA_FORMATIONS.properties)).toEqual(['formations']);
    expect(Object.keys(SCHEMA_CONVENTION.properties)).not.toContain('formations');
  });

  it('n’a rien perdu en chemin : les deux réunis couvrent la fiche entière', () => {
    // Le risque propre à cette correction : un champ tombé entre les deux
    // appels s'y perdrait sans bruit — la fiche se remplirait à moitié.
    const attendues: ReadonlyArray<keyof ConventionImport> = [
      'client',
      'formations',
      'sessions',
      'pricing',
      'participants',
      'dossier',
      'notes',
    ];
    const couvertes = [
      ...Object.keys(SCHEMA_CONVENTION.properties),
      ...Object.keys(SCHEMA_FORMATIONS.properties),
    ];
    expect(couvertes.sort()).toEqual([...attendues].sort());
  });

  it('chaque schéma reste loin du poids qui a fait déborder la grammaire', () => {
    // Relevé du 22/09/2026 : 2 963 + 1 289 caractères sérialisés. Réunis, ils
    // étaient refusés ; séparés, chacun compile. La mesure est un garde-fou
    // grossier — seule l'API juge vraiment — mais elle signale une reprise du
    // schéma qui le referait grossir.
    expect(JSON.stringify(SCHEMA_CONVENTION).length).toBeLessThan(3600);
    expect(JSON.stringify(SCHEMA_FORMATIONS).length).toBeLessThan(1800);
  });

  it('les deux lectures partent ensemble, pas l’une après l’autre', () => {
    // Enchaînées, elles doubleraient une attente déjà proche de la minute.
    expect(SOURCE).toMatch(/await Promise\.all\(\[\s*\n\s*lireAvecSchema\(client, pdfs, SCHEMA_CONVENTION/);
    expect(SOURCE).toContain('normalizeImport({ ...convention, ...formations })');
  });
});

describe('un refus reste lisible', () => {
  it('l’extraction rend le message de l’API, pas seulement son échec', () => {
    expect(SOURCE).toContain('function detailLisible');
    expect(SOURCE).toContain("detail: detailLisible(error)");
  });

  it('la route le transmet et l’écran l’affiche', () => {
    expect(ROUTE).toContain('detail: res.detail');
    expect(ECRAN).toContain('setDetail(json.detail ?? null)');
    expect(ECRAN).toContain('{detail}');
  });
});
