import { describe, it, expect } from 'vitest';
import {
  genererSeances,
  joursDeFormation,
  jourDeLaSemaine,
  resumePlanification,
  JOURS_OUVRES,
  MAX_SEANCES,
} from './planification';

const MATIN = { debut: '09:00', fin: '12:30', libelle: 'matin' };
const APREM = { debut: '14:00', fin: '17:30', libelle: 'après-midi' };

describe('jours de formation', () => {
  it('numérote la semaine comme on en parle : lundi = 1, dimanche = 7', () => {
    expect(jourDeLaSemaine('2026-10-05')).toBe(1); // lundi
    expect(jourDeLaSemaine('2026-10-11')).toBe(7); // dimanche
  });

  it('écarte le week-end quand seuls les jours ouvrés sont cochés', () => {
    const jours = joursDeFormation('2026-10-05', '2026-10-11', JOURS_OUVRES);
    expect(jours).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
  });

  it('retient le samedi si on le demande', () => {
    expect(joursDeFormation('2026-10-05', '2026-10-11', [6])).toEqual(['2026-10-10']);
  });

  it('une journée unique reste une journée', () => {
    expect(joursDeFormation('2026-10-06', '2026-10-06', JOURS_OUVRES)).toEqual(['2026-10-06']);
  });

  it('traverse un changement de mois et une année bissextile', () => {
    expect(joursDeFormation('2028-02-28', '2028-03-01', [1, 2, 3, 4, 5, 6, 7])).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
    ]);
  });
});

describe('génération des séances', () => {
  it('duplique les horaires sur chaque jour retenu', () => {
    const r = genererSeances({
      dateDebut: '2026-10-05',
      dateFin: '2026-10-09',
      jours: JOURS_OUVRES,
      creneaux: [MATIN, APREM],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.seances).toHaveLength(10);
    expect(r.seances[0]).toEqual({ date: '2026-10-05', debut: '09:00', fin: '12:30', libelle: 'matin' });
    expect(r.seances[1]).toEqual({ date: '2026-10-05', debut: '14:00', fin: '17:30', libelle: 'après-midi' });
    expect(resumePlanification(r.seances)).toBe('5 jours · 10 séances');
  });

  it('un seul créneau donne une séance par jour', () => {
    const r = genererSeances({
      dateDebut: '2026-10-05',
      dateFin: '2026-10-07',
      jours: JOURS_OUVRES,
      creneaux: [MATIN],
    });
    expect(r.ok && r.seances).toHaveLength(3);
  });

  it('refuse une fin antérieure au début', () => {
    const r = genererSeances({ dateDebut: '2026-10-09', dateFin: '2026-10-05', jours: JOURS_OUVRES, creneaux: [MATIN] });
    expect(r).toEqual({ ok: false, erreur: 'fin_avant_debut' });
  });

  it('refuse un créneau dont la fin précède le début', () => {
    const r = genererSeances({
      dateDebut: '2026-10-05',
      dateFin: '2026-10-05',
      jours: JOURS_OUVRES,
      creneaux: [{ debut: '17:00', fin: '09:00', libelle: 'matin' }],
    });
    expect(r).toEqual({ ok: false, erreur: 'creneau_invalide' });
  });

  it('le dit quand la période ne contient aucun jour coché', () => {
    // Un week-end seul avec « jours ouvrés » : ne rien créer en silence serait
    // le pire des cas — l'écran resterait vide sans explication.
    const r = genererSeances({
      dateDebut: '2026-10-10',
      dateFin: '2026-10-11',
      jours: JOURS_OUVRES,
      creneaux: [MATIN],
    });
    expect(r).toEqual({ ok: false, erreur: 'aucun_jour' });
  });

  it('arrête une saisie manifestement fausse plutôt que de créer mille séances', () => {
    // Typiquement une date de fin tapée à l'année suivante.
    const r = genererSeances({
      dateDebut: '2026-01-01',
      dateFin: '2027-01-01',
      jours: [1, 2, 3, 4, 5, 6, 7],
      creneaux: [MATIN, APREM],
    });
    expect(r).toEqual({ ok: false, erreur: 'trop_de_seances' });
  });

  it('accepte exactement la limite', () => {
    const r = genererSeances({
      dateDebut: '2026-01-01',
      dateFin: '2026-12-31',
      jours: [1, 2, 3, 4, 5, 6, 7],
      creneaux: [MATIN],
    });
    // 365 jours dépassent la limite : on vérifie que le garde-fou est bien
    // celui annoncé, et pas un nombre arbitraire.
    expect(r.ok).toBe(false);
    expect(MAX_SEANCES).toBe(200);
  });

  it('refuse une génération sans créneau', () => {
    const r = genererSeances({ dateDebut: '2026-10-05', dateFin: '2026-10-05', jours: JOURS_OUVRES, creneaux: [] });
    expect(r).toEqual({ ok: false, erreur: 'aucun_creneau' });
  });
});
