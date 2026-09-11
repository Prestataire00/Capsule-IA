// Référentiel V10 (décret n° 2026-728) : 33 indicateurs au 1er novembre 2026,
// la V9 cessant la veille. Ces tests verrouillent la date d'effet, le nouvel
// indicateur 33 et la reprise des preuves au même numéro.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION = fs.readFileSync(
  path.resolve(__dirname, '../../../supabase/migrations/0142_qualiopi_referentiel_v10.sql'),
  'utf-8',
);

describe('référentiel Qualiopi V10 (0142)', () => {
  it('borne la V9 au 31 octobre et ouvre la V10 au 1er novembre 2026', () => {
    expect(MIGRATION).toContain("SET effective_until = DATE '2026-10-31'");
    expect(MIGRATION.match(/DATE '2026-11-01'/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('reprend les 13 indicateurs dont le texte change', () => {
    for (const n of [1, 2, 3, 7, 12, 14, 15, 19, 20, 27, 30, 31, 32]) {
      expect(MIGRATION).toMatch(new RegExp(`^  \\(${n}, 'Le prestataire|^  \\(${n}, 'Lorsque`, 'm'));
    }
  });

  it('crée l’indicateur 33, réservé à l’apprentissage', () => {
    expect(MIGRATION).toContain("'V10-I33', 33, 'organization', 7");
    expect(MIGRATION).toContain("ARRAY['apprentissage']::text[]");
    expect(MIGRATION).toContain('distinct du recueil général de satisfaction');
  });

  it('compte une preuve de dossier au même numéro, quelle que soit la version', () => {
    expect(MIGRATION).toContain('x.number = r.number AND x.referential_version <> \'legacy\'');
  });

  it('recalcule chaque nuit les dossiers ouverts, jamais les dossiers clos', () => {
    expect(MIGRATION).toContain("status NOT IN ('closed', 'archived', 'cancelled')");
    expect(MIGRATION).toContain("'qualiopi_recompute_nightly'");
    expect(MIGRATION).toContain('REVOKE ALL ON FUNCTION app.recompute_open_qualiopi_checklists() FROM PUBLIC');
  });
});
