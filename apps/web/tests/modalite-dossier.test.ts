import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ModalitiesSchema, derivePrimaryModality } from '../features/dossier/modality-set';

const lire = (p: string) => readFileSync(resolve(__dirname, p), 'utf8');

describe('modalité modifiable dans le dossier', () => {
  it('au moins une modalité, la première est la principale', () => {
    expect(ModalitiesSchema.safeParse([]).success).toBe(false);
    expect(ModalitiesSchema.safeParse(['distanciel', 'presentiel']).success).toBe(true);
    expect(derivePrimaryModality(['distanciel', 'presentiel'])).toBe('distanciel');
  });
  it('l’action écrit la modalité principale et la liste, pour un dossier de l’organisme', () => {
    const a = lire('../app/(dashboard)/dossiers/[id]/modalite-actions.ts');
    expect(a).toContain("guardAction('dossiers')");
    expect(a).toContain(".eq('organization_id', garde.member.organizationId)");
    expect(a).toContain('modality: derivePrimaryModality(modalites), modalities: modalites');
  });
  it('la fiche dossier propose la modification', () => {
    expect(lire('../app/(dashboard)/dossiers/[id]/layout.tsx')).toContain('<ModaliteModifiable');
  });
});
