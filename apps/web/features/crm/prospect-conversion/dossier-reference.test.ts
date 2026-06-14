import { describe, it, expect } from 'vitest';
import { generateDossierReference } from './dossier-reference';

describe('generateDossierReference', () => {
  it('forme DOS-AAAA-XXXXXXXX déterministe à partir de l\'id prospect', () => {
    const ref = generateDossierReference('abcdef12-3456-7890-abcd-ef1234567890', 2026);
    expect(ref).toBe('DOS-2026-ABCDEF12');
  });
  it('est stable pour le même prospect (idempotence)', () => {
    const id = 'abcdef12-3456-7890-abcd-ef1234567890';
    expect(generateDossierReference(id, 2026)).toBe(generateDossierReference(id, 2026));
  });
});
