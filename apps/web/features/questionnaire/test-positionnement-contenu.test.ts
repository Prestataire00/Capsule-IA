import { describe, expect, it } from 'vitest';
import { codeTestPositionnement, lireProgramme, lireTestGenere, nombreAttendu, promptTestPositionnement, type ContenuFormation } from './test-positionnement-contenu';
import type { Programme } from '@/features/formations/programme/types';

const q = (n: number) => [
  { id: `m${n}_auto`, type: 'rating', label: `Je sais ${n}`, required: true, options: [], max: 5 },
  { id: `m${n}_situation`, type: 'choice', label: `Cas ${n}`, required: true, options: ['A', 'B', 'Je ne sais pas'], max: 5 },
];

const contenu: ContenuFormation = {
  titre: 'Acculturation à l’IA',
  resume: 'Découvrir l’IA générative',
  modalite: 'Présentiel',
  dureeHeures: 14,
  methodePedagogique: 'Ateliers pratiques sur Gemini',
  methodeEvaluation: 'Mises en situation',
  objectifs: ['Comprendre l’IA'],
  modules: [
    { titre: 'MODULE 1 — Les bases', contenu: ['Qu’est-ce qu’un LLM', 'Atelier : premier prompt'] },
    { titre: 'MODULE 2 — NotebookLM', contenu: ['Importer ses sources'] },
  ],
  programmeTexte: 'Déroulé : matin théorie, après-midi pratique',
};

describe('test du dernier cours', () => {
  it('le prompt reprend le programme, le contenu et les modalités', () => {
    const p = promptTestPositionnement(contenu);
    expect(p).toContain('MODULE 2 — NotebookLM');
    expect(p).toContain('Importer ses sources');
    expect(p).toContain('Ateliers pratiques sur Gemini');
    expect(p).toContain('Présentiel');
    expect(p).toContain('Exactement DEUX questions par module');
  });
  it('deux questions par module ; sans modules, 10 à 16', () => {
    expect(nombreAttendu(contenu)).toEqual({ min: 4, max: 4 });
    expect(nombreAttendu({ modules: [] })).toEqual({ min: 10, max: 16 });
    expect(lireTestGenere(JSON.stringify({ questions: [...q(1), ...q(2)] }), nombreAttendu(contenu))).toHaveLength(4);
    expect(lireTestGenere(JSON.stringify({ questions: q(1) }), nombreAttendu(contenu))).toBeNull();
    expect(lireTestGenere('pas de JSON', { min: 1, max: 2 })).toBeNull();
  });
  it('lit les modules et le reste du programme', () => {
    const programme = {
      sections: [
        { id: 'r', type: 'richtext', title: 'Public', html: '<p>Salariés&nbsp;sans prérequis</p>' },
        {
          id: 'm',
          type: 'modules',
          title: '',
          overviewTitle: '',
          overview: [],
          totalLabel: '',
          totalValue: '',
          modules: [{ code: 'MODULE 1', title: 'Bases', durationLabel: '', submodules: [{ code: 'M1.1', title: 'LLM', durationLabel: '', contenu: ['Tokens'], objectifs: ['Expliquer un LLM'] }] }],
        },
      ],
    } as unknown as Programme;
    const r = lireProgramme(programme);
    expect(r.modules).toEqual([{ titre: 'MODULE 1 — Bases', contenu: ['LLM', 'Tokens', 'Objectif : Expliquer un LLM'] }]);
    expect(r.texte).toContain('Salariés sans prérequis');
  });
  it('un code par formation', () => {
    expect(codeTestPositionnement('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).toBe('test_positionnement_0190a1b2c3d47e5f8a9b0c1d2e3f4a5b');
  });
});
