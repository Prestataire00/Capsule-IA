import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(__dirname, '../features/crm/prospect-conversion/convert-core.ts'),
  'utf8',
);

/**
 * Un dossier né d'une demande naissait à `total_hours: 1` dès que la formation
 * venait du catalogue — la durée de la formation n'était jamais lue. Ce 1 h
 * remonte ensuite au BPF, au suivi des heures et aux attestations, sans que
 * rien ne le signale.
 */
describe('la conversion d’une demande reprend la durée de la formation', () => {
  it('lit la durée du catalogue', () => {
    expect(SRC).toContain('default_duration_hours');
    expect(SRC).toContain('dureeCatalogue');
  });

  it('ne pose plus 1 heure en dur', () => {
    expect(SRC).not.toContain('total_hours: p.formation_id ? 1 : hours');
    expect(SRC).toContain('total_hours: dureeCatalogue ?? hours');
  });

  it('garde les heures de la demande pour une formation sur mesure', () => {
    // `hours` vient de custom_formation_hours : il reste le repli quand aucune
    // formation du catalogue ne porte de durée.
    expect(SRC).toContain('const hours = Math.max(1, Number(p.custom_formation_hours ?? 0) || 7);');
  });
});
