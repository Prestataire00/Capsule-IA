import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/shared/lib/ai/client', () => ({ anthropic: () => null, LEGAL_MODEL: 'x' }));

import { assemblerFiche, contexteDeFormation, genererFicheBesoinAdaptee } from './fiche-besoin-ia';

describe('fiche besoin adaptée à la formation', () => {
  it('garde toujours le socle Qualiopi autour des questions propres', () => {
    const fiche = assemblerFiche([
      { id: 'deja_ia', type: 'choice', label: 'Déjà utilisé une IA ?', required: false, options: ['Oui', 'Non'] },
      { id: 'objectives', type: 'text', label: 'doublon', required: false },
    ]);
    expect(fiche.map((q) => q.id)).toEqual(['currentLevel', 'deja_ia', 'objectives', 'accommodations']);
    expect(fiche.find((q) => q.id === 'objectives')?.required).toBe(true);
  });

  it('reprend le détail de la formation, HTML retiré', () => {
    const c = contexteDeFormation({
      description: '<p>Prise en main de <strong>ChatGPT</strong></p>',
      objectives: ['Poser un cadre d’usage', 'Sécuriser les données'],
      pedagogical_method: '<p>Études de cas</p>',
      metadata: { catalog: { deroulement: 'Matin : théorie', programme: { sections: [{ title: 'Prompts' }] } } },
    });
    expect(c).toContain('Description : Prise en main de ChatGPT');
    expect(c).toContain('Objectifs pédagogiques : Poser un cadre d’usage ; Sécuriser les données');
    expect(c).toContain('Méthodes pédagogiques : Études de cas');
    expect(c).toContain('Programme : Matin : théorie ; Prompts');
  });

  it('sans clé, dit que l’IA n’est pas configurée', async () => {
    const r = await genererFicheBesoinAdaptee({ title: 'IA', contexte: '' });
    expect(r).toEqual({ ok: false, reason: 'no_api_key' });
  });
});
