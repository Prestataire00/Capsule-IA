// « Dans questionnaire, je dois voir tous les questionnaires pour chaque
// interlocuteur, étape etc., je dois les visualiser en entier et pouvoir les
// modifier ainsi que définir la règle d'envoi automatique » — 25/09/2026.
//
// Les modèles n'étaient classés que par `kind` — « positionnement »,
// « satisfaction_chaud », « opco » —, un vocabulaire de base de données. Rien
// ne disait à qui le questionnaire s'adresse ni quand il part, alors que ce
// sont les deux questions qu'on se pose en ouvrant cet écran.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  interlocuteurDuModele,
  etapeDuModele,
  declencheurDuModele,
  INTERLOCUTEURS,
  ETAPES,
} from '../features/questionnaire/cartographie';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const CATALOGUE = lire('../app/(dashboard)/questionnaires/catalogue/page.tsx');
const APERCU = lire('../app/(dashboard)/questionnaires/[templateId]/apercu/page.tsx');
const ONGLETS = lire('../app/(dashboard)/questionnaires/questionnaires-tabs.client.tsx');

describe('à qui s’adresse un questionnaire', () => {
  it('le code prime sur le type', () => {
    // La satisfaction entreprise est enregistrée en `satisfaction_chaud`, faute
    // de valeur dédiée dans l'énumération. La lire par son seul `kind` la
    // rangerait chez le stagiaire, et on chercherait longtemps pourquoi le
    // client ne reçoit rien.
    expect(
      interlocuteurDuModele({ kind: 'satisfaction_chaud', code: 'satisfaction_entreprise_default' }),
    ).toBe('entreprise');
    expect(interlocuteurDuModele({ kind: 'satisfaction_chaud', code: 'sys_satisfaction' })).toBe('apprenant');
  });

  it('range chacun où il doit être', () => {
    expect(interlocuteurDuModele({ kind: 'satisfaction_formateur' })).toBe('formateur');
    expect(interlocuteurDuModele({ kind: 'opco', code: 'funder_besoins' })).toBe('financeur');
    expect(interlocuteurDuModele({ kind: 'positionnement', code: 'positionnement_default' })).toBe('apprenant');
  });

  it('et retombe sur le stagiaire plutôt que sur rien', () => {
    // Un modèle personnalisé sans code reconnu doit apparaître quelque part :
    // invisible, il n'existe pas.
    expect(interlocuteurDuModele({ kind: 'custom' })).toBe('apprenant');
    const cles = INTERLOCUTEURS.map((i) => i.cle);
    expect(cles).toContain(interlocuteurDuModele({ kind: 'n’importe quoi' }));
  });
});

describe('à quel moment il part', () => {
  it('avant, pendant, après', () => {
    expect(etapeDuModele({ kind: 'positionnement' })).toBe('avant');
    expect(etapeDuModele({ kind: 'evaluation_acquis' })).toBe('pendant');
    expect(etapeDuModele({ kind: 'satisfaction_chaud' })).toBe('apres');
    expect(etapeDuModele({ kind: 'satisfaction_froid' })).toBe('apres');
    expect(etapeDuModele({ kind: 'satisfaction_formateur' })).toBe('apres');
  });

  it('le financeur se range au début, là où il conditionne la prise en charge', () => {
    expect(etapeDuModele({ kind: 'opco' })).toBe('avant');
  });

  it('toute étape rendue est une étape connue', () => {
    const cles = ETAPES.map((e) => e.cle);
    for (const kind of ['positionnement', 'custom', 'inconnu', 'opco']) {
      expect(cles).toContain(etapeDuModele({ kind }));
    }
  });
});

describe('ce qui déclenche l’envoi', () => {
  it('se lit à côté du modèle', () => {
    // Sans cette phrase, on découvre le comportement réel en le subissant.
    expect(declencheurDuModele({ kind: 'positionnement', code: 'positionnement_default' })).toMatch(
      /inscription/i,
    );
    expect(
      declencheurDuModele({ kind: 'satisfaction_formateur', code: 'satisfaction_formateur_default' }),
    ).toMatch(/terminé/i);
  });

  it('et dit franchement quand rien ne part tout seul', () => {
    // `null` plutôt qu'une phrase vague : « s'envoie à la main » est une
    // information, « envoi automatique » sur un modèle qui ne part jamais est
    // un mensonge.
    expect(declencheurDuModele({ kind: 'satisfaction_chaud', code: 'satisfaction_entreprise_default' })).toBeNull();
    expect(declencheurDuModele({ kind: 'custom', code: 'sys_manager' })).toBeNull();
  });
});

describe('les écrans', () => {
  it('rangent par interlocuteur puis par étape', () => {
    expect(CATALOGUE).toContain('INTERLOCUTEURS.map');
    expect(CATALOGUE).toContain('ETAPES.map');
  });

  it('mènent à la lecture, à la modification et au réglage', () => {
    expect(CATALOGUE).toContain('/apercu');
    expect(CATALOGUE).toContain('Modifier');
    expect(CATALOGUE).toContain('/emails/automatiques');
  });

  it('et l’onglet existe', () => {
    expect(ONGLETS).toContain("'/questionnaires/catalogue'");
    expect(ONGLETS).toContain('Par interlocuteur');
  });

  it('l’aperçu montre les deux formes de schéma', () => {
    // `{questions}` et `{fields}` coexistent en base : normaliser, c'est
    // montrer ce que le destinataire verra vraiment.
    expect(APERCU).toContain('questionsDuSchema(m.schema)');
  });

  it('et prévient quand un modèle n’a aucune question lisible', () => {
    // Envoyé tel quel, le destinataire verrait un formulaire vide — c'est
    // exactement ce qui a failli arriver au questionnaire entreprise.
    expect(APERCU).toContain('Ce modèle ne contient aucune question lisible');
  });
});
