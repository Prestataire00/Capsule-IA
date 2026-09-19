import { describe, it, expect } from 'vitest';
import { ENVOIS_AUTOMATIQUES } from '../envois-automatiques';
import {
  REGLABLES,
  delaisAConsiderer,
  doitPartirAujourdhui,
  estReglable,
  organisationsQuiOntCoupe,
  phraseDuDelai,
  problemesDuReglage,
  reglageEffectif,
  reglageParDefaut,
  type RegleEnregistree,
} from '../programmation-envois';

const regle = (kind: string, enabled: boolean, delayDays: number): RegleEnregistree => ({
  kind,
  enabled,
  delayDays,
});

describe('le catalogue et les réglages ne divergent pas', () => {
  it('décrit un réglage pour chaque envoi du catalogue', () => {
    // Un envoi listé à l'écran sans entrée ici s'afficherait sans commande.
    for (const e of ENVOIS_AUTOMATIQUES) expect(estReglable(e.kind), e.kind).toBe(true);
  });

  it('ne décrit aucun réglage orphelin', () => {
    const connus = new Set(ENVOIS_AUTOMATIQUES.map((e) => e.kind));
    for (const kind of Object.keys(REGLABLES)) expect(connus.has(kind), kind).toBe(true);
  });

  it('borne tout délai réglable, et le défaut tombe dans ses bornes', () => {
    for (const [kind, r] of Object.entries(REGLABLES)) {
      if (!r.delai) continue;
      expect(r.delai.min, kind).toBeLessThanOrEqual(r.delai.defaut);
      expect(r.delai.defaut, kind).toBeLessThanOrEqual(r.delai.max);
    }
  });

  it('garde les délais d’origine du code, pour que ne rien régler ne change rien', () => {
    expect(reglageParDefaut('convocation_j7').delaiJours).toBe(7);
    expect(reglageParDefaut('satisfaction_chaud').delaiJours).toBe(1);
    expect(reglageParDefaut('fin_de_formation').delaiJours).toBe(1);
  });
});

describe('ce qui s’applique réellement', () => {
  it('retombe sur le défaut quand l’organisme n’a rien réglé', () => {
    expect(reglageEffectif('convocation_j7', null)).toEqual({ actif: true, delaiJours: 7 });
    expect(reglageEffectif('convocation_j7', undefined)).toEqual({ actif: true, delaiJours: 7 });
  });

  it('applique le délai réglé', () => {
    expect(reglageEffectif('convocation_j7', regle('convocation_j7', true, 15))).toEqual({
      actif: true,
      delaiJours: 15,
    });
  });

  it('accepte un délai nul quand le type l’autorise', () => {
    // « Le jour même » est un réglage valable pour la satisfaction.
    expect(reglageEffectif('satisfaction_chaud', regle('satisfaction_chaud', true, 0)).delaiJours).toBe(0);
  });

  it('ignore un délai hors bornes plutôt que de l’appliquer', () => {
    // Une valeur aberrante en base ne doit pas faire convoquer à 90 jours.
    expect(reglageEffectif('convocation_j7', regle('convocation_j7', true, 90)).delaiJours).toBe(7);
    expect(reglageEffectif('convocation_j7', regle('convocation_j7', true, 0)).delaiJours).toBe(7);
  });

  it('refuse de couper un envoi qui ne se coupe pas, même si la base dit l’inverse', () => {
    const r = reglageEffectif('certificat_entreprise', regle('certificat_entreprise', false, 3));
    expect(r.actif).toBe(true);
    expect(r.delaiJours).toBe(3);
  });

  it('coupe un envoi que l’organisme a coupé', () => {
    expect(reglageEffectif('satisfaction_chaud', regle('satisfaction_chaud', false, 1)).actif).toBe(false);
  });
});

describe('ce qu’on refuse d’enregistrer', () => {
  it('refuse un type inconnu', () => {
    expect(problemesDuReglage('n_importe_quoi', { actif: true, delaiJours: 1 })).toHaveLength(1);
  });

  it('refuse de couper un envoi dû à l’entreprise', () => {
    expect(problemesDuReglage('certificat_entreprise', { actif: false, delaiJours: 1 })[0]).toMatch(
      /ne peut pas être coupé/i,
    );
  });

  it('refuse un délai hors bornes, en disant lesquelles', () => {
    expect(problemesDuReglage('convocation_j7', { actif: true, delaiJours: 0 })[0]).toMatch(/entre 1 et 60/);
  });

  it('refuse un délai qui n’est pas un entier', () => {
    expect(problemesDuReglage('convocation_j7', { actif: true, delaiJours: 2.5 })[0]).toMatch(/entier/i);
  });

  it('laisse passer un réglage valable', () => {
    expect(problemesDuReglage('convocation_j7', { actif: true, delaiJours: 15 })).toEqual([]);
    expect(problemesDuReglage('fiche_besoin', { actif: true, delaiJours: 0 })).toEqual([]);
  });
});

describe('phrase affichée', () => {
  it('accorde le pluriel', () => {
    expect(phraseDuDelai('convocation_j7', { actif: true, delaiJours: 1 })).toBe(
      '1 jour avant le début de la séance',
    );
    expect(phraseDuDelai('convocation_j7', { actif: true, delaiJours: 15 })).toBe(
      '15 jours avant le début de la séance',
    );
  });

  it('dit « le jour même » plutôt que « 0 jour »', () => {
    expect(phraseDuDelai('satisfaction_chaud', { actif: true, delaiJours: 0 })).toMatch(/jour même/);
  });

  it('ne promet pas de délai là où il n’y en a pas', () => {
    expect(phraseDuDelai('fiche_besoin', { actif: true, delaiJours: 0 })).toBeNull();
  });
});

describe('ce que le cron doit examiner', () => {
  it('examine le défaut même quand personne ne l’a réglé', () => {
    expect(delaisAConsiderer('convocation_j7', new Map())).toEqual([7]);
  });

  it('examine tous les délais réglés, sans doublon et dans l’ordre', () => {
    const regles = new Map([
      ['orgA', regle('convocation_j7', true, 15)],
      ['orgB', regle('convocation_j7', true, 3)],
      ['orgC', regle('convocation_j7', true, 15)],
    ]);
    expect(delaisAConsiderer('convocation_j7', regles)).toEqual([3, 7, 15]);
  });

  it('garde le défaut dans la liste même si tous les organismes connus l’ont changé', () => {
    // Un organisme sans ligne existe toujours : son envoi passerait à la trappe.
    const regles = new Map([['orgA', regle('convocation_j7', true, 15)]]);
    expect(delaisAConsiderer('convocation_j7', regles)).toContain(7);
  });
});

describe('faut-il envoyer aujourd’hui ?', () => {
  const regles = new Map([
    ['orgRegle', regle('convocation_j7', true, 15)],
    ['orgCoupe', regle('convocation_j7', false, 7)],
  ]);

  it('envoie au défaut pour un organisme qui n’a rien réglé', () => {
    const cas = (ecartJours: number) =>
      doitPartirAujourdhui({ kind: 'convocation_j7', organizationId: 'orgSansRegle', regles, ecartJours });
    expect(cas(7)).toBe(true);
    expect(cas(15)).toBe(false);
  });

  it('envoie au délai réglé, et pas au défaut', () => {
    const cas = (ecartJours: number) =>
      doitPartirAujourdhui({ kind: 'convocation_j7', organizationId: 'orgRegle', regles, ecartJours });
    expect(cas(15)).toBe(true);
    expect(cas(7)).toBe(false);
  });

  it('n’envoie jamais pour un organisme qui a coupé', () => {
    for (const ecartJours of [0, 7, 15]) {
      expect(
        doitPartirAujourdhui({ kind: 'convocation_j7', organizationId: 'orgCoupe', regles, ecartJours }),
      ).toBe(false);
    }
  });

  it('liste les organismes qui ont coupé', () => {
    expect([...organisationsQuiOntCoupe('convocation_j7', regles)]).toEqual(['orgCoupe']);
  });

  it('ne compte pas comme coupé un envoi qui ne se coupe pas', () => {
    const r = new Map([['orgA', regle('certificat_entreprise', false, 1)]]);
    expect(organisationsQuiOntCoupe('certificat_entreprise', r).size).toBe(0);
  });
});
