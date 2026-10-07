import { describe, expect, it } from 'vitest';
import { jourDeRappel, rappelsAEnvoyer } from './rappel-du-jour';

const s = (id: string, starts_at: string, formation_id: string | null = 'f1') => ({ id, starts_at, formation_id, dossier_id: 'd1' });

describe('un rappel 48 h par jour et par formation', () => {
  const matin = s('matin', '2026-10-09T07:00:00Z');
  const apresMidi = s('am', '2026-10-09T11:30:00Z');
  it('matin et après-midi : un seul envoi, celui du matin', () => {
    const r = rappelsAEnvoyer([{ seance: apresMidi, emails: ['isma@x.fr'] }, { seance: matin, emails: ['Isma@x.fr'] }], new Set());
    expect(r.map((x) => x.seance.id)).toEqual(['matin']);
  });
  it('déjà prévenu par un passage précédent : rien', () => {
    const deja = new Set([`${jourDeRappel(matin)}|isma@x.fr`]);
    expect(rappelsAEnvoyer([{ seance: apresMidi, emails: ['isma@x.fr'] }], deja)).toEqual([]);
  });
  it('un autre jour, une autre formation ou un autre destinataire : un envoi chacun', () => {
    const r = rappelsAEnvoyer(
      [
        { seance: matin, emails: ['isma@x.fr', 'rh@client.fr'] },
        { seance: s('lendemain', '2026-10-10T07:00:00Z'), emails: ['isma@x.fr'] },
        { seance: s('autre', '2026-10-09T12:00:00Z', 'f2'), emails: ['isma@x.fr'] },
      ],
      new Set(),
    );
    expect(r).toHaveLength(4);
  });
  it('le jour est celui de Paris', () => {
    expect(jourDeRappel(s('x', '2026-10-08T22:30:00Z'))).toBe('2026-10-09|f1');
  });
});
