// « Rajouter le SIRET de l'entreprise en obligatoire dans la demande ? »
// Demande d'Ismael du 22/09/2026.
//
// Le tunnel d'inscription public l'exigeait déjà du salarié, clé comprise. La
// saisie par l'organisme, non : le même organisme refusait donc sur son site
// ce qu'il acceptait au téléphone, et la demande partait en dossier sans le
// numéro qui identifie le client sur la convention, la facture et au BPF.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { NouvelleDemandeSchema } from '../app/(dashboard)/prospects/nouvelle/schema';

/** SIRET de clé juste, et sa variante d'un chiffre modifié. */
const SIRET_OK = '84033069000024';
const SIRET_CLE_FAUSSE = '84033069000025';

const base = {
  firstName: 'Nathaniel',
  lastName: 'Dahan',
  email: 'n.dahan@exemple.fr',
  situation: 'particulier' as const,
  funderKind: 'autofinancement' as const,
};

const erreursSur = (v: Record<string, unknown>, champ: string): string[] => {
  const r = NouvelleDemandeSchema.safeParse(v);
  if (r.success) return [];
  return r.error.issues.filter((i) => i.path[0] === champ).map((i) => i.message);
};

describe('quand une entreprise est en jeu', () => {
  it.each([
    ['la personne est salariée', { situation: 'salarie' }],
    ['une entreprise est nommée', { companyName: 'FRANCE METIERS' }],
    ['un OPCO finance', { funderKind: 'opco' }],
    ['l’employeur finance', { funderKind: 'entreprise' }],
  ])('le SIRET est exigé : %s', (_cas, ajout) => {
    expect(erreursSur({ ...base, ...ajout }, 'companySiret')).toEqual([
      'SIRET requis dès qu’une entreprise est concernée.',
    ]);
  });

  it('et la demande passe dès qu’il est fourni', () => {
    expect(erreursSur({ ...base, situation: 'salarie', companySiret: SIRET_OK }, 'companySiret')).toEqual([]);
  });
});

describe('quand aucune entreprise n’est en jeu', () => {
  it.each([
    ['un particulier qui s’autofinance', base],
    ['un indépendant', { ...base, situation: 'independant' }],
    ['un demandeur d’emploi', { ...base, situation: 'demandeur' }],
  ])('le SIRET reste facultatif : %s', (_cas, valeurs) => {
    // Sans quoi les formations BtoC deviendraient impossibles à enregistrer.
    expect(NouvelleDemandeSchema.safeParse(valeurs).success).toBe(true);
  });
});

describe('la clé du SIRET', () => {
  it('est contrôlée même lorsque le SIRET n’est pas obligatoire', () => {
    // Un numéro faux est pire qu'absent : il part sur la convention et la
    // facture, et l'administration rejette au rapprochement.
    expect(erreursSur({ ...base, companySiret: SIRET_CLE_FAUSSE }, 'companySiret')).toEqual([
      'SIRET invalide : 14 chiffres, et la clé doit tomber juste.',
    ]);
  });

  it('refuse un numéro trop court, même de clé plausible', () => {
    expect(erreursSur({ ...base, situation: 'salarie', companySiret: '840330690' }, 'companySiret')).toHaveLength(1);
  });

  it('accepte le numéro tel qu’on le colle, avec ses espaces', () => {
    expect(erreursSur({ ...base, situation: 'salarie', companySiret: '840 330 690 00024' }, 'companySiret')).toEqual([]);
  });
});

describe('le formulaire ne crée pas d’impasse', () => {
  const FORM = fs.readFileSync(
    path.resolve(__dirname, '../app/(dashboard)/prospects/nouvelle/demande-form.client.tsx'),
    'utf-8',
  );

  it('affiche le bloc entreprise selon la même règle que le schéma', () => {
    // Sinon le SIRET deviendrait obligatoire dans un champ masqué : rien ne
    // s'enregistre, et rien ne dit pourquoi.
    expect(FORM).toContain("form.companyName.trim() !== ''");
  });

  it('annonce l’obligation avant de la faire subir', () => {
    expect(FORM).toContain('Obligatoire : il identifie le client');
    expect(FORM).toContain('Clé incorrecte');
  });
});

describe('la conversion', () => {
  const CONVERT = fs.readFileSync(
    path.resolve(__dirname, '../features/crm/prospect-conversion/convert-core.ts'),
    'utf-8',
  );

  it('ne jette plus un SIRET mal formé sans le dire', () => {
    // L'entreprise se créait sans SIRET, et la coquille restait invisible.
    expect(CONVERT).toContain("console.warn('[conversion] SIRET écarté, format invalide'");
  });
});
