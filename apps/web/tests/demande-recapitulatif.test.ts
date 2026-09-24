// « Je veux que ces informations apparaissent dans la fiche demande, le
// récapitulatif, sans avoir à cliquer sur modifier. Ainsi que le SIRET de
// l'entreprise. » — Ismael, 24/09/2026.
//
// Même défaut que la note interne la veille, en pire : l'intitulé de la
// formation, la durée, le tarif, la modalité et le début souhaité ne figuraient
// même pas dans la requête de la page. On ne pouvait les relire qu'en rouvrant
// « Modifier » — alors que c'est sur eux que se décide le devis. Le SIRET, lui,
// était bien lu, et affiché nulle part.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { heures, tarif, jourFr, modalite } from '../features/prospect/format-demande';

const FICHE = fs.readFileSync(
  path.resolve(__dirname, '../app/(dashboard)/prospects/[id]/page.tsx'),
  'utf-8',
);

describe('la mise en forme', () => {
  it('donne au nombre son unité', () => {
    expect(heures(14)).toBe('14 h');
    expect(heures('184')).toBe('184 h');
  });

  it('convertit les centimes, et dit par qui le tarif se compte', () => {
    // Sans conversion, 144000 s'afficherait tel quel : cent fois le prix.
    // Sans l'unité, on croirait lire un total plutôt qu'un prix par stagiaire.
    //
    // Le séparateur de milliers du français est une espace FINE INSÉCABLE
    // (U+202F), pas une espace ordinaire : écrire l'attendu au clavier fait
    // échouer un test pourtant juste.
    const FINE = '\u202f';
    expect(tarif(144000)).toBe(`1${FINE}440 € HT / stagiaire`);
    expect(tarif('120000')).toBe(`1${FINE}200 € HT / stagiaire`);
    expect(tarif(50000)).toBe('500 € HT / stagiaire');
  });

  it('n’affiche jamais « NaN » ni « 0 h »', () => {
    // Le cas courant : une demande dont la durée et le tarif restent à définir.
    for (const vide of [null, undefined, '']) {
      expect(heures(vide)).toBe('—');
      expect(tarif(vide)).toBe('—');
      expect(jourFr(vide)).toBe('—');
    }
    expect(heures(0)).toBe('—');
    expect(heures('à définir')).toBe('—');
    expect(tarif('à définir')).toBe('—');
  });

  it('garde le bon jour quel que soit le fuseau', () => {
    // Une date lue à minuit UTC recule d'un jour à l'ouest : la formation
    // commencerait la veille.
    expect(jourFr('2026-10-06')).toBe('06/10/2026');
    expect(jourFr('2026-01-01')).toBe('01/01/2026');
    expect(jourFr('06/10/2026')).toBe('—');
  });

  it('traduit la modalité', () => {
    expect(modalite('presentiel')).toBe('Présentiel');
    expect(modalite(null)).toBe('—');
    expect(modalite('inconnue')).toBe('—');
  });
});

describe('la fiche demande', () => {
  it('lit enfin ce qui est demandé', () => {
    // C'était la cause : ces colonnes n'étaient pas dans le select.
    for (const col of [
      'custom_formation_title',
      'custom_formation_hours',
      'custom_formation_price_cents',
      'preferred_modality',
      'preferred_start_date',
      'formation_id',
    ]) {
      expect(FICHE, col).toContain(`${col},`);
    }
  });

  it('l’affiche dans le récapitulatif', () => {
    for (const ligne of ['Durée prévue', 'Tarif prévu', 'Modalité', 'Début souhaité', 'SIRET']) {
      expect(FICHE, ligne).toContain(`label="${ligne}"`);
    }
  });

  it('montre la formation du catalogue quand il y en a une', () => {
    // N'afficher que l'intitulé libre laissait « — » sur toutes les demandes
    // parties d'une formation existante.
    expect(FICHE).toContain('formationCatalogue ?? prospect.custom_formation_title');
    expect(FICHE).toContain("from('formations').select('title')");
  });

  it('présente le SIRET groupé, comme on le lit', () => {
    expect(FICHE).toContain('formaterSiret(prospect.company_siret)');
  });
});
