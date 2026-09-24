import { describe, it, expect } from 'vitest';
import {
  heuresDuPlanning,
  horsPeriode,
  modaliteOuDefaut,
  trierPlanning,
  type SeanceLue,
} from '../planning-seances';

const lue = (over: Partial<SeanceLue> = {}): SeanceLue => ({
  label: 'Séance',
  date: '2026-11-02',
  startTime: '09:00',
  endTime: '12:30',
  modality: 'presentiel',
  location: 'Marseille',
  ...over,
});

const options = { modalitePardefaut: 'presentiel' as const };

describe('ce qu’on accepte d’un planning lu', () => {
  it('retient une séance complète', () => {
    const r = trierPlanning([lue()], options);
    expect(r.retenues).toHaveLength(1);
    expect(r.rejetees).toHaveLength(0);
  });

  it('écarte une date illisible plutôt que de la deviner', () => {
    const r = trierPlanning([lue({ date: '02/11/2026' })], options);
    expect(r.retenues).toHaveLength(0);
    expect(r.rejetees[0]!.motif).toMatch(/date/);
  });

  it('écarte une date qui n’existe pas', () => {
    // `new Date` normaliserait le 31 février en 3 mars, sans rien dire.
    const r = trierPlanning([lue({ date: '2026-02-31' })], options);
    expect(r.retenues).toHaveLength(0);
    expect(r.rejetees).toHaveLength(1);
  });

  it('écarte un horaire illisible', () => {
    expect(trierPlanning([lue({ startTime: '9h' })], options).rejetees).toHaveLength(1);
    expect(trierPlanning([lue({ endTime: '25:00' })], options).rejetees).toHaveLength(1);
  });

  it('écarte une séance dont la fin précède le début', () => {
    const r = trierPlanning([lue({ startTime: '14:00', endTime: '09:00' })], options);
    expect(r.rejetees[0]!.motif).toMatch(/fin précède/);
  });

  it('écarte une séance de durée nulle', () => {
    const r = trierPlanning([lue({ startTime: '09:00', endTime: '09:00' })], options);
    expect(r.retenues).toHaveLength(0);
  });

  it('ne crée pas deux fois la même séance', () => {
    const r = trierPlanning([lue(), lue({ label: 'Autre intitulé' })], options);
    expect(r.retenues).toHaveLength(1);
    expect(r.rejetees[0]!.motif).toMatch(/double/);
  });

  it('distingue deux séances du même jour à des heures différentes', () => {
    const r = trierPlanning([lue(), lue({ startTime: '14:00', endTime: '17:30' })], options);
    expect(r.retenues).toHaveLength(2);
  });

  it('range les séances dans l’ordre du calendrier', () => {
    const r = trierPlanning(
      [lue({ date: '2026-11-06' }), lue({ date: '2026-11-02', startTime: '14:00', endTime: '17:00' }), lue({ date: '2026-11-02' })],
      options,
    );
    expect(r.retenues.map((s) => `${s.date} ${s.startTime}`)).toEqual([
      '2026-11-02 09:00',
      '2026-11-02 14:00',
      '2026-11-06 09:00',
    ]);
  });

  it('dit pourquoi chaque séance a été écartée', () => {
    const r = trierPlanning([lue({ date: 'bientôt' })], options);
    expect(r.rejetees[0]!.seance.date).toBe('bientôt');
    expect(r.rejetees[0]!.motif.length).toBeGreaterThan(5);
  });
});

describe('modalité', () => {
  it('reprend celle du document quand elle est reconnue', () => {
    expect(modaliteOuDefaut('distanciel', 'presentiel')).toBe('distanciel');
    expect(modaliteOuDefaut('  HYBRIDE ', 'presentiel')).toBe('hybride');
  });

  it('retombe sur celle du dossier plutôt que d’inventer', () => {
    expect(modaliteOuDefaut('en visio depuis Rabat', 'distanciel')).toBe('distanciel');
    expect(modaliteOuDefaut('', 'presentiel')).toBe('presentiel');
  });
});

describe('heures du planning', () => {
  it('additionne les durées', () => {
    const { retenues } = trierPlanning(
      [lue({ startTime: '09:00', endTime: '12:30' }), lue({ startTime: '14:00', endTime: '17:00' })],
      options,
    );
    expect(heuresDuPlanning(retenues)).toBe(6.5);
  });

  it('vaut zéro sans séance', () => {
    expect(heuresDuPlanning([])).toBe(0);
  });
});

describe('séances hors de la période du dossier', () => {
  const { retenues } = trierPlanning(
    [lue({ date: '2026-10-15' }), lue({ date: '2026-11-02' }), lue({ date: '2026-12-20' })],
    options,
  );

  it('signale ce qui déborde, sans rien écarter', () => {
    const dehors = horsPeriode(retenues, { debut: '2026-11-01', fin: '2026-11-30' });
    expect(dehors.map((s) => s.date)).toEqual(['2026-10-15', '2026-12-20']);
    expect(retenues).toHaveLength(3);
  });

  it('ne signale rien quand la période est inconnue', () => {
    expect(horsPeriode(retenues, { debut: null, fin: null })).toEqual([]);
  });

  it('accepte les bornes incluses', () => {
    expect(horsPeriode(retenues, { debut: '2026-10-15', fin: '2026-12-20' })).toEqual([]);
  });
});
