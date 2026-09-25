// « Dans Vue, j'ai cliqué que c'était fait à la main, alors ça doit aussi
// valider dans le côté Qualiopi du dossier, ça doit être lié » — 25/09/2026.
//
// L'avancement du dossier et la conformité Qualiopi décrivaient la même
// réalité sans se parler. Valider « Analyse du besoin reçue » parce qu'elle
// s'est faite au téléphone laissait l'onglet Qualiopi réclamer le
// questionnaire de positionnement : deux écrans, deux vérités, et c'est
// l'auditeur qui aurait tranché.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  indicateursDeLEtape,
  INDICATEURS_PAR_ETAPE,
  ETAPES_SANS_INDICATEUR,
  titreDeLaPreuve,
  descriptionDeLaPreuve,
} from '../features/dossier/avancement-qualiopi';

const ACTION = fs.readFileSync(
  path.resolve(__dirname, '../app/(dashboard)/dossiers/[id]/avancement-actions.ts'),
  'utf-8',
);

describe('ce qu’une étape prouve', () => {
  it('l’analyse du besoin vaut pour les indicateurs 4 et 8', () => {
    // Tous deux satisfaits par le questionnaire de positionnement. La
    // recueillir au téléphone les remplit aussi : c'est le même acte, par un
    // autre canal.
    expect(indicateursDeLEtape('needs')).toEqual([4, 8]);
  });

  it('la formation réalisée vaut pour le 12', () => {
    expect(indicateursDeLEtape('done')).toEqual([12]);
  });

  it('et une étape commerciale ne prouve rien', () => {
    // Prétendre le contraire ferait passer un dossier pour conforme sans
    // l'être : le contraire exact du service à rendre.
    for (const etape of ETAPES_SANS_INDICATEUR) {
      expect(indicateursDeLEtape(etape), etape).toEqual([]);
    }
    expect(indicateursDeLEtape('etape_inconnue')).toEqual([]);
  });

  it('les deux listes ne se chevauchent pas', () => {
    // Une étape à la fois cartographiée et déclarée sans indicateur serait une
    // contradiction que personne ne verrait.
    for (const etape of ETAPES_SANS_INDICATEUR) {
      expect(Object.keys(INDICATEURS_PAR_ETAPE)).not.toContain(etape);
    }
  });
});

describe('la preuve déposée', () => {
  it('dit qu’elle est déclarative', () => {
    // Un auditeur doit pouvoir la distinguer d'une pièce justificative.
    expect(titreDeLaPreuve('Analyse du besoin')).toBe('Analyse du besoin — validée à la main');
  });

  it('reprend le motif, avec la date', () => {
    const texte = descriptionDeLaPreuve('Recueilli au téléphone le 12/09', new Date('2026-09-25T10:00:00Z'));
    expect(texte).toContain('Recueilli au téléphone le 12/09');
    expect(texte).toContain('25/09/2026');
  });

  it('n’est jamais vide, même sans motif', () => {
    // Une preuve sans description laisse l'auditeur deviner d'où elle sort,
    // ce qui est pire que pas de preuve du tout.
    const texte = descriptionDeLaPreuve(null, new Date('2026-09-25T10:00:00Z'));
    expect(texte).not.toBe('');
    expect(texte).toContain('Aucun motif');
  });
});

describe('le branchement', () => {
  it('pose les preuves à la validation', () => {
    expect(ACTION).toContain('await poserLesPreuves(');
    expect(ACTION).toContain("source: 'avancement_manuel'");
  });

  it('et les retire quand la validation est annulée', () => {
    // La laisser survivre rendrait l'indicateur satisfait par un geste annulé,
    // et rien à l'écran ne dirait pourquoi il reste vert.
    expect(ACTION).toContain('await retirerLesPreuves(');
    expect(ACTION).toMatch(/contains\('metadata', \{ source: 'avancement_manuel', step_key: stepKey \}/);
  });

  it('vise toutes les versions actives du référentiel', () => {
    // v9 court jusqu'au 31/10/2026, v10 prend la suite. Ne viser que la plus
    // récente laisserait l'indicateur insatisfait tant que le calcul s'appuie
    // sur v9.
    expect(ACTION).toContain("eq('is_active', true)");
    expect(ACTION).toMatch(/neq\('referential_version'[\s\S]{0,60}'legacy'/);
  });

  it('n’écrit pas en upsert : la contrainte n’existe pas', () => {
    // `qualiopi_proofs` n'a aucune unicité sur (dossier, indicateur) : un
    // `ON CONFLICT` sans index correspondant échoue à l'exécution — une erreur
    // qui ne se serait vue qu'en production.
    expect(ACTION).not.toContain("onConflict: 'dossier_id,indicator_id'");
    expect(ACTION).toMatch(/retirerLesPreuves\(dossierId, stepKey\);[\s\S]{0,200}\.insert\(/);
  });

  it('un échec de preuve ne fait pas échouer la validation', () => {
    // L'étape est franchie ; le lien Qualiopi est un bonus. Bloquer l'un sur
    // l'autre priverait d'un geste utile pour une raison qui ne le concerne pas.
    expect(ACTION).toContain("console.error('[avancement] preuve Qualiopi non déposée'");
  });
});
