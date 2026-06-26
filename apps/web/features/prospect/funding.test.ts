import { describe, expect, it } from 'vitest';

import {
  FUNDER_VALUES,
  derivePrimaryFunder,
  requiredDocsForFunders,
} from './funding';

describe('FUNDER_VALUES', () => {
  it('equals the 6 supported funders', () => {
    expect(FUNDER_VALUES).toEqual([
      'opco',
      'cpf',
      'faf_ca',
      'agefiph',
      'entreprise',
      'autofinancement',
    ]);
  });
});

describe('requiredDocsForFunders', () => {
  it('opco requires payslip and collective_agreement', () => {
    const keys = requiredDocsForFunders(['opco']).map((d) => d.key);
    expect(keys).toContain('payslip');
    expect(keys).toContain('collective_agreement');
  });

  it('agefiph requires rqth_proof', () => {
    const keys = requiredDocsForFunders(['agefiph']).map((d) => d.key);
    expect(keys).toContain('rqth_proof');
  });

  it('unions and dedupes across multiple funders', () => {
    const docs = requiredDocsForFunders(['opco', 'agefiph']);
    const keys = docs.map((d) => d.key);
    expect(keys).toContain('payslip');
    expect(keys).toContain('collective_agreement');
    expect(keys).toContain('rqth_proof');
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('autofinancement has no required docs', () => {
    const docs = requiredDocsForFunders(['autofinancement']);
    expect(docs.filter((d) => d.required)).toHaveLength(0);
  });
});

describe('derivePrimaryFunder', () => {
  it('returns the first funder', () => {
    expect(derivePrimaryFunder(['agefiph', 'opco'])).toBe('agefiph');
  });

  it('throws on empty input', () => {
    expect(() => derivePrimaryFunder([])).toThrow();
  });
});
