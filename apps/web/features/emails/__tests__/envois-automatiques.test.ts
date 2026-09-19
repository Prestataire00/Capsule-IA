import { describe, it, expect } from 'vitest';
import {
  ENVOIS_AUTOMATIQUES,
  PREFIXE_PROGRAMMATION,
  alerteDe,
  compterParKind,
  lignesEnvois,
  parMoment,
} from '../envois-automatiques';

describe('catalogue des envois automatiques', () => {
  it('ne décrit jamais deux fois le même envoi', () => {
    const kinds = ENVOIS_AUTOMATIQUES.map((e) => e.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('dit toujours ce qui déclenche l’envoi et qui le reçoit', () => {
    for (const e of ENVOIS_AUTOMATIQUES) {
      expect(e.declencheur.length, e.kind).toBeGreaterThan(10);
      expect(e.destinataires.length, e.kind).toBeGreaterThan(3);
    }
  });

  it('justifie tout envoi qu’on ne peut pas couper', () => {
    // Une case grisée sans explication ressemble à un bug. Si l'envoi ne se
    // coupe pas, l'écran doit dire pourquoi.
    for (const e of ENVOIS_AUTOMATIQUES) {
      expect(e.coupureKey !== null || e.obligatoire !== null, e.kind).toBe(true);
    }
  });

  it('couvre le certificat à l’entreprise, qui part même quand le reste est coupé', () => {
    const certificat = ENVOIS_AUTOMATIQUES.find((e) => e.kind === 'certificat_entreprise');
    expect(certificat?.coupureKey).toBeNull();
    expect(certificat?.obligatoire).toMatch(/entreprise/i);
  });
});

describe('rapprochement avec le journal', () => {
  const log = [
    { kind: 'convocation_j7', status: 'sent', sent_at: '2026-09-01T08:00:00Z' },
    { kind: 'convocation_j7', status: 'sent', sent_at: '2026-09-03T08:00:00Z' },
    { kind: 'convocation_j7', status: 'failed', sent_at: '2026-09-02T08:00:00Z' },
    { kind: null, status: 'sent', sent_at: '2026-09-04T08:00:00Z' },
  ];

  it('compte les réussites et les échecs séparément', () => {
    const c = compterParKind(log).get('convocation_j7');
    expect(c).toEqual({ envoyes: 2, echecs: 1, dernier: '2026-09-03T08:00:00Z' });
  });

  it('retient le dernier envoi même s’il arrive dans le désordre', () => {
    const c = compterParKind([
      { kind: 'x', status: 'sent', sent_at: '2026-09-10T08:00:00Z' },
      { kind: 'x', status: 'sent', sent_at: '2026-09-02T08:00:00Z' },
    ]).get('x');
    expect(c?.dernier).toBe('2026-09-10T08:00:00Z');
  });

  it('ignore les traces sans type plutôt que d’inventer une catégorie', () => {
    expect(compterParKind(log).has('')).toBe(false);
    expect([...compterParKind(log).keys()]).toEqual(['convocation_j7']);
  });

  it('rassemble les règles de Programmation sous une seule clé', () => {
    const c = compterParKind([
      { kind: 'schedule:aaa', status: 'sent', sent_at: '2026-09-01T08:00:00Z' },
      { kind: 'schedule:bbb', status: 'sent', sent_at: '2026-09-02T08:00:00Z' },
    ]);
    expect(c.get(PREFIXE_PROGRAMMATION)?.envoyes).toBe(2);
    expect(c.has('schedule:aaa')).toBe(false);
  });
});

describe('ce qu’on signale à l’organisme', () => {
  it('signale l’échec avant tout', () => {
    expect(alerteDe({ envoyes: 10, echecs: 1, dernier: 'x' })).toBe('en_echec');
  });

  it('signale un envoi qu’on n’a jamais vu partir', () => {
    expect(alerteDe({ envoyes: 0, echecs: 0, dernier: null })).toBe('jamais_parti');
  });

  it('ne signale rien quand tout est parti', () => {
    expect(alerteDe({ envoyes: 3, echecs: 0, dernier: 'x' })).toBeNull();
  });
});

describe('lignes de l’écran', () => {
  it('donne une ligne par envoi du catalogue, même sans trace', () => {
    const lignes = lignesEnvois(new Map());
    expect(lignes).toHaveLength(ENVOIS_AUTOMATIQUES.length);
    expect(lignes.every((l) => l.alerte === 'jamais_parti')).toBe(true);
  });

  it('rattache le compteur au bon envoi', () => {
    const lignes = lignesEnvois(
      new Map([['convocation_j7', { envoyes: 5, echecs: 0, dernier: '2026-09-03T08:00:00Z' }]]),
    );
    const convocation = lignes.find((l) => l.kind === 'convocation_j7');
    expect(convocation?.compteur.envoyes).toBe(5);
    expect(convocation?.alerte).toBeNull();
  });

  it('groupe dans l’ordre du parcours, sans groupe vide', () => {
    const groupes = parMoment(lignesEnvois(new Map()));
    expect(groupes.map((g) => g.moment)).toEqual(['avant', 'pendant', 'apres', 'facturation']);
    expect(parMoment([])).toEqual([]);
  });
});
