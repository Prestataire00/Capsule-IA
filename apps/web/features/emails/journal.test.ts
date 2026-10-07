import { describe, expect, it } from 'vitest';
import { chiffres, etatDe, filtrer, libelleEnvoi, repartitionParType, serieParJour, type LigneJournal } from './journal';

const l = (p: Partial<LigneJournal>): LigneJournal => ({
  id: Math.random().toString(36),
  kind: 'convocation_j7',
  recipient: 'lea@client.fr',
  subject: 'Votre convocation',
  status: 'sent',
  sentAt: '2026-10-06T08:00:00Z',
  deliveredAt: null,
  openedAt: null,
  clickedAt: null,
  bouncedAt: null,
  openCount: null,
  dossierId: null,
  providerId: null,
  ...p,
});

describe('libellés', () => {
  it('nomme les envois du catalogue et les autres', () => {
    expect(libelleEnvoi('message_direct')).toBe('Message direct');
    expect(libelleEnvoi('schedule:abc')).toBe('Envoi programmé');
    expect(libelleEnvoi('un_code_inconnu')).toBe('Un code inconnu');
    expect(libelleEnvoi(null)).toBe('Autre');
  });
});

describe('état', () => {
  it('l’échec et le rejet d’abord, puis du clic à l’envoi', () => {
    expect(etatDe(l({ status: 'failed', openedAt: 'x' }))).toBe('echec');
    expect(etatDe(l({ bouncedAt: 'x', openedAt: 'x' }))).toBe('rejete');
    expect(etatDe(l({ clickedAt: 'x', openedAt: 'x' }))).toBe('clique');
    expect(etatDe(l({ openedAt: 'x' }))).toBe('lu');
    expect(etatDe(l({ deliveredAt: 'x' }))).toBe('delivre');
    expect(etatDe(l({}))).toBe('envoye');
    expect(etatDe(l({ status: 'pending' }))).toBe('en_cours');
  });
});

describe('série par jour', () => {
  it('compte à l’heure de Paris et garde les jours vides', () => {
    const s = serieParJour(
      [l({ sentAt: '2026-10-06T22:30:00Z' }), l({ sentAt: '2026-10-06T08:00:00Z', status: 'failed' })],
      3,
      new Date('2026-10-07T12:00:00Z'),
    );
    expect(s).toEqual([
      { jour: '2026-10-05', partis: 0, echecs: 0 },
      { jour: '2026-10-06', partis: 0, echecs: 1 },
      { jour: '2026-10-07', partis: 1, echecs: 0 },
    ]);
  });
});

describe('répartition par type', () => {
  it('trie par volume et regroupe le reste', () => {
    const lignes = [
      ...Array.from({ length: 3 }, () => l({ kind: 'convocation_j7' })),
      l({ kind: 'devis' }),
      l({ kind: 'facture_x' }),
      l({ kind: 'schedule:1' }),
      l({ kind: 'schedule:2', status: 'failed' }),
    ];
    const r = repartitionParType(lignes, 3);
    expect(r[0]).toMatchObject({ kind: 'convocation_j7', total: 3 });
    expect(r[1]).toMatchObject({ libelle: 'Envoi programmé', total: 2, echecs: 1 });
    expect(r[2]).toMatchObject({ libelle: 'Autres (2 types)', total: 2 });
  });
});

describe('filtres et chiffres', () => {
  const lignes = [
    l({ recipient: 'rita@client.fr', openedAt: 'x' }),
    l({ kind: 'devis', status: 'failed' }),
    l({ kind: 'devis', bouncedAt: 'x' }),
  ];
  it('filtre par problème, type et recherche sans accents', () => {
    expect(filtrer(lignes, { etat: 'probleme' })).toHaveLength(2);
    expect(filtrer(lignes, { type: 'devis' })).toHaveLength(2);
    expect(filtrer(lignes, { q: 'RITA' })).toHaveLength(1);
    expect(filtrer(lignes, { q: 'dévis' })).toHaveLength(2);
  });
  it('compte partis, lus et problèmes', () => {
    expect(chiffres(lignes)).toEqual({ partis: 1, delivres: 1, lus: 1, problemes: 2, tauxLecture: 100 });
  });
});
