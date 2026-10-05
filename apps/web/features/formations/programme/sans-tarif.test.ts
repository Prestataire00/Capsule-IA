import { describe, it, expect } from 'vitest';
import { programmeSansTarif } from './sans-tarif';
import { DEFAULT_THEME, type Programme } from './types';

const base = (over: Partial<Programme> = {}): Programme => ({
  schemaVersion: 1,
  theme: DEFAULT_THEME,
  header: {
    logoUrl: '',
    kicker: 'Programme de formation',
    orgName: 'Capsule IA',
    title: 'Excel avancé',
    subtitle: '',
    metaItems: [
      { icon: 'clock', text: '14 heures' },
      { icon: 'euro', text: '1 200 € HT' },
    ],
  },
  sections: [],
  footer: { legalLine: '', lines: [], versionLine: '' },
  ...over,
});

describe('programmeSansTarif', () => {
  it('retire le badge prix et garde la durée', () => {
    const p = programmeSansTarif(base());
    expect(p.header.metaItems).toEqual([{ icon: 'clock', text: '14 heures' }]);
  });

  it('retire les lignes de tarif et garde le reste du tableau', () => {
    const p = programmeSansTarif(
      base({
        sections: [
          {
            id: 'kv',
            type: 'keyvalue',
            title: 'Informations générales',
            rows: [
              { label: 'Public cible', value: 'Comptables' },
              { label: 'Tarif', value: 'Sur devis' },
              { label: 'Conditions', value: '900 € par stagiaire' },
            ],
          },
        ],
      }),
    );
    expect(p.sections).toEqual([
      { id: 'kv', type: 'keyvalue', title: 'Informations générales', rows: [{ label: 'Public cible', value: 'Comptables' }] },
    ]);
  });

  it('retire une section consacrée aux prix', () => {
    const p = programmeSansTarif(
      base({ sections: [{ id: 'r', type: 'richtext', title: 'Tarifs et financement', html: '<p>1 200 €</p>' }] }),
    );
    expect(p.sections).toEqual([]);
  });

  it('garde un objectif qui parle de coûts sans montant', () => {
    const p = programmeSansTarif(
      base({
        sections: [
          {
            id: 'b',
            type: 'bullets',
            title: 'Objectifs',
            items: ['Réduire les coûts de production', 'Prix public : 450 € TTC'],
          },
        ],
      }),
    );
    expect(p.sections).toEqual([
      { id: 'b', type: 'bullets', title: 'Objectifs', items: ['Réduire les coûts de production'] },
    ]);
  });

  it('retire le paragraphe qui donne un prix dans un texte libre', () => {
    const p = programmeSansTarif(
      base({
        sections: [
          {
            id: 'r',
            type: 'richtext',
            title: 'Présentation',
            html: '<p>Deux jours pour maîtriser Excel.</p><p>Tarif inter : <strong>900 €</strong> HT.</p>',
          },
        ],
      }),
    );
    expect(p.sections).toEqual([
      { id: 'r', type: 'richtext', title: 'Présentation', html: '<p>Deux jours pour maîtriser Excel.</p>' },
    ]);
  });
});
