import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/lib/ai/client', () => ({ anthropic: () => null, LEGAL_MODEL: 'x' }));

import { assemblerFiche, genererFicheBesoinAdaptee } from './fiche-besoin-ia';

describe('fiche besoin adaptée à la formation', () => {
  it('garde toujours le socle Qualiopi autour des questions propres', () => {
    const fiche = assemblerFiche([
      { id: 'deja_ia', type: 'choice', label: 'Déjà utilisé une IA ?', required: false, options: ['Oui', 'Non'] },
      { id: 'objectives', type: 'text', label: 'doublon', required: false },
    ]);
    expect(fiche.map((q) => q.id)).toEqual(['currentLevel', 'deja_ia', 'objectives', 'accommodations']);
    expect(fiche.find((q) => q.id === 'objectives')?.required).toBe(true);
  });

  it('sans clé, dit que l’IA n’est pas configurée', async () => {
    const r = await genererFicheBesoinAdaptee({ title: 'IA', summary: null, objectives: [], prerequisites: [], targetAudience: null });
    expect(r).toEqual({ ok: false, reason: 'no_api_key' });
  });
});
