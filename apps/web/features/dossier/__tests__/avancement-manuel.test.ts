import { describe, it, expect } from 'vitest';
import {
  fusionnerAvancement,
  nombreFranchies,
  peutEtreValideeALaMain,
  prochaineEtape,
  type ValidationManuelle,
} from '../avancement-manuel';

const etape = (key: string, done: boolean, at: string | null = null) => ({ key, done, at });

const validation = (stepKey: string, over: Partial<ValidationManuelle> = {}): ValidationManuelle => ({
  stepKey,
  validatedAt: '2026-09-24T10:00:00.000Z',
  par: 'Laurie PAYET',
  note: null,
  ...over,
});

describe('croisement du constat et de la validation manuelle', () => {
  it('franchit une étape validée à la main, et le dit', () => {
    const [e] = fusionnerAvancement([etape('convention_signed', false)], [validation('convention_signed')]);
    expect(e!.done).toBe(true);
    expect(e!.origine).toBe('manuel');
    expect(e!.at).toBe('2026-09-24T10:00:00.000Z');
    expect(e!.validePar).toBe('Laurie PAYET');
  });

  it('laisse le constat faire foi sur la date quand la preuve existe', () => {
    // La preuve est arrivée après coup : c'est sa date qui compte.
    const [e] = fusionnerAvancement(
      [etape('paid', true, '2026-09-30T08:00:00.000Z')],
      [validation('paid', { validatedAt: '2026-09-24T10:00:00.000Z' })],
    );
    expect(e!.origine).toBe('constate');
    expect(e!.at).toBe('2026-09-30T08:00:00.000Z');
  });

  it('signale qu’une validation manuelle a fini par être confirmée', () => {
    // On n'efface pas la validation : un auditeur voudra la voir.
    const [e] = fusionnerAvancement([etape('paid', true, '2026-09-30')], [validation('paid')]);
    expect(e!.confirmeeDepuis).toBe(true);
    expect(e!.validePar).toBe('Laurie PAYET');
  });

  it('ne marque rien de confirmé quand aucune validation n’a précédé', () => {
    const [e] = fusionnerAvancement([etape('paid', true, '2026-09-30')], []);
    expect(e!.confirmeeDepuis).toBe(false);
    expect(e!.origine).toBe('constate');
  });

  it('laisse une étape sans preuve ni validation intacte', () => {
    const [e] = fusionnerAvancement([etape('devis', false)], []);
    expect(e!.done).toBe(false);
    expect(e!.origine).toBeNull();
  });

  it('garde le motif de la validation', () => {
    const [e] = fusionnerAvancement(
      [etape('convention_signed', false)],
      [validation('convention_signed', { note: 'Signée sur papier, scan au dossier client.' })],
    );
    expect(e!.note).toMatch(/papier/);
  });

  it('ignore une validation qui ne correspond à aucune étape', () => {
    const r = fusionnerAvancement([etape('devis', false)], [validation('etape_inconnue')]);
    expect(r).toHaveLength(1);
    expect(r[0]!.done).toBe(false);
  });

  it('conserve les champs propres à l’étape', () => {
    const etapes = [{ key: 'devis', done: false, at: null, label: 'Devis préparé', href: '/x' }];
    const [e] = fusionnerAvancement(etapes, [validation('devis')]);
    expect(e!.label).toBe('Devis préparé');
    expect(e!.href).toBe('/x');
  });
});

describe('comptage et étape suivante', () => {
  const etapes = fusionnerAvancement(
    [etape('created', true, '2026-09-21'), etape('needs', false), etape('session', false)],
    [validation('needs')],
  );

  it('compte les étapes franchies, quelle qu’en soit l’origine', () => {
    expect(nombreFranchies(etapes)).toBe(2);
  });

  it('désigne la première étape qui reste', () => {
    expect(prochaineEtape(etapes)?.key).toBe('session');
  });

  it('ne désigne rien quand tout est franchi', () => {
    const toutes = fusionnerAvancement([etape('created', true), etape('needs', true)], []);
    expect(prochaineEtape(toutes)).toBeNull();
  });
});

describe('ce qui se valide à la main', () => {
  it('refuse la création du dossier : elle est vraie par construction', () => {
    expect(peutEtreValideeALaMain(etape('created', true))).toBe(false);
    expect(peutEtreValideeALaMain(etape('created', false))).toBe(false);
  });

  it('refuse une étape déjà constatée : il n’y a rien à suppléer', () => {
    expect(peutEtreValideeALaMain(etape('paid', true))).toBe(false);
  });

  it('accepte une étape non franchie', () => {
    expect(peutEtreValideeALaMain(etape('convention_signed', false))).toBe(true);
  });
});
