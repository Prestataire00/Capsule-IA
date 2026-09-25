// « Son paramétrage n'a donc aucun effet. Voulez-vous que je fasse primer le
// modèle de l'organisme ? » — « oui », 25/09/2026.
//
// Laurie a dupliqué la fiche besoin le 22/09 et l'a portée de cinq à neuf
// questions. Relevé en base : son modèle avait ZÉRO assignation. Le code
// choisissait toujours le modèle intégré par son code technique
// (`positionnement_default`), et ignorait celui de l'organisme. Le travail
// avait l'air fait, l'écran montrait un modèle, le logiciel en envoyait un
// autre.
//
// Trois couches le rendaient inopérant, et il fallait les trois : la sélection
// du modèle, le nettoyage des réponses qui jetait les clés inconnues, et
// l'affichage qui ne montrait que cinq champs nommés.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { nettoyerReponses, ficheBesoinRemplie } from '../features/questionnaire/fiche-besoin';

const lire = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf-8');
const SELECTION = lire('../features/questionnaire/needs-analysis.ts');
const MODELE = lire('../features/questionnaire/modele-fiche-besoin.ts');
const FORMULAIRE = lire('../features/questionnaire/ui/formulaire-fiche-besoin.client.tsx');
const FICHE_DEMANDE = lire('../app/(dashboard)/prospects/[id]/page.tsx');

describe('1 — le modèle de l’organisme est choisi', () => {
  it('quand il en a paramétré un', () => {
    expect(SELECTION).toContain('organizationId?: string | null');
    expect(SELECTION).toMatch(/eq\('organization_id', organizationId\)[\s\S]{0,200}kind', 'positionnement'/);
  });

  it('le plus récemment modifié quand il y en a plusieurs', () => {
    // C'est celui qu'on vient de préparer.
    expect(SELECTION).toContain("order('updated_at', { ascending: false })");
  });

  it('et le modèle intégré reste le repli', () => {
    // Un organisme qui n'a rien paramétré ne doit rien voir changer.
    expect(SELECTION).toContain('if (organizationId) {');
    expect(MODELE).toContain('return QUESTIONS_INTEGREES');
  });

  it('les trois points d’envoi passent l’organisation', () => {
    // En oublier un aurait envoyé, selon le chemin, deux questionnaires
    // différents pour la même formation.
    expect(SELECTION.match(/ensureNeedsAnalysisTemplate\(sb, /g)?.length).toBe(2);
    expect(lire('../app/(dashboard)/sessions/[id]/fiches-besoin/actions.ts')).toContain(
      'ensureNeedsAnalysisTemplate(sb, orgId)',
    );
  });
});

describe('2 — les réponses ne sont plus jetées', () => {
  it('les clés du modèle de l’organisme sont acceptées', () => {
    // Sans cette passe, le stagiaire répondait à neuf questions, cinq
    // arrivaient, quatre disparaissaient sans un mot.
    const propres = nettoyerReponses(
      { objectives: 'Monter en compétence', objectifs_professionnels: 'Piloter un projet' } as never,
      ['objectifs_professionnels'],
    );
    expect(propres.objectives).toBe('Monter en compétence');
    expect(propres.objectifs_professionnels).toBe('Piloter un projet');
  });

  it('mais pas n’importe quelle clé', () => {
    // La liste vient du modèle, jamais du formulaire : sinon on écrirait
    // n'importe quoi dans la colonne JSON.
    const propres = nettoyerReponses({ nimporte_quoi: 'x' } as never, ['attendue']);
    expect(propres.nimporte_quoi).toBeUndefined();
  });

  it('et pas plus de quarante', () => {
    const cles = Array.from({ length: 60 }, (_, i) => `q${i}`);
    const brut = Object.fromEntries(cles.map((c) => [c, 'oui']));
    expect(Object.keys(nettoyerReponses(brut as never, cles))).toHaveLength(40);
  });
});

describe('3 — une fiche personnalisée compte comme remplie', () => {
  it('même sans le champ « objectives »', () => {
    // C'était le pivot du modèle intégré. Un modèle d'organisme n'a aucune
    // question de ce nom : sa fiche, pourtant remplie, était comptée vide — et
    // le système la redemandait indéfiniment.
    expect(ficheBesoinRemplie({ objectifs_professionnels: 'Piloter un projet' } as never)).toBe(true);
  });

  it('le niveau seul ne suffit toujours pas', () => {
    // Une note sur cinq ne dit pas un besoin.
    expect(ficheBesoinRemplie({ currentLevel: 4 })).toBe(false);
    expect(ficheBesoinRemplie(null)).toBe(false);
    expect(ficheBesoinRemplie({})).toBe(false);
  });
});

describe('4 — les questions ajoutées se posent, et leurs réponses se lisent', () => {
  it('le formulaire pose les questions du modèle', () => {
    expect(FORMULAIRE).toContain('questions?: readonly Question[]');
    expect(FORMULAIRE).toContain('questions && questions.length > 0 ? depuisQuestions(questions)');
  });

  it('et ce qu’il exige vient du modèle, pas du seul « objectives »', () => {
    // Un modèle d'organisme n'a aucune question de ce nom : la fiche aurait
    // été refusée quoi qu'on réponde.
    expect(FORMULAIRE).toContain('champs.find(');
    expect(FORMULAIRE).toContain('Merci de renseigner :');
  });

  it('la fiche demande affiche aussi les réponses supplémentaires', () => {
    // Sinon le stagiaire répond à neuf questions et l'écran en montre cinq —
    // les quatre autres en base, invisibles.
    expect(FICHE_DEMANDE).toContain('reponsesSupplementaires.map');
    expect(FICHE_DEMANDE).toContain('libelles.get(r.cle) ?? r.cle');
  });
});
