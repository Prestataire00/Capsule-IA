// Une inscription d'entreprise forme UN dossier : la validation s'appliquait
// au lot, la conversion n'en prenait qu'un salarié (audit du 07/10/2026).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CORE = readFileSync(resolve(__dirname, '../features/crm/prospect-conversion/convert-core.ts'), 'utf8');

describe('conversion d’un lot d’entreprise', () => {
  it('rattache les autres salariés du lot au même dossier', () => {
    expect(CORE).toContain('company_batch_id');
    expect(CORE).toContain('await rattacherLeLot(');
    expect(CORE).toMatch(/\.eq\('company_batch_id', input\.batchId\)[\s\S]{0,120}\.is\('converted_dossier_id', null\)/);
  });
  it('le titulaire est rattaché aussi : dès qu’il y a des rattachements, seuls eux sont attendus', () => {
    expect(CORE).toContain('titulaireId: candidatSuitLaFormation ? learnerId : null');
    expect(CORE).toContain("from('dossier_learners')");
  });
  it('les demandes du lot pointent vers le dossier', () => {
    expect(CORE).toMatch(/update\(\{ converted_dossier_id: input\.dossierId, status: 'converted'/);
  });
});
