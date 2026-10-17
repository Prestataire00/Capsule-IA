// Le test de positionnement d'une formation, généré à partir de ses objectifs
// (réunion avec Laurie, 16/10/2026 : « deux questions par objectif du
// programme de formation », comme les construit Calliope). Pur.

import { z } from 'zod';
import { questionDraftSchema, type QuestionDraft } from './template.schema';

export const PREFIXE_TEST_POSITIONNEMENT = 'test_positionnement_';

/** Un test par formation : son code dérive de l'identifiant de la formation. */
export const codeTestPositionnement = (formationId: string) => `${PREFIXE_TEST_POSITIONNEMENT}${formationId.replace(/-/g, '')}`;

export const titreTestPositionnement = (formation: string) => `Test de positionnement — ${formation}`.slice(0, 200);

export function promptTestPositionnement(formation: string, objectifs: readonly string[]): string {
  return `Tu es formateur et expert Qualiopi dans un organisme de formation français.
Construis le TEST DE POSITIONNEMENT de la formation « ${formation} », passé par chaque stagiaire au démarrage de la session, sur son téléphone, en 5 minutes.

Objectifs pédagogiques du programme :
${objectifs.map((o, i) => `${i + 1}. ${o}`).join('\n')}

Exactement DEUX questions par objectif, dans l'ordre des objectifs :
1. une auto-évaluation : type "rating", max 5, libellé « Aujourd'hui, je sais … » reformulant l'objectif à la première personne (1 = pas du tout, 5 = parfaitement) ;
2. une mise en situation courte : type "choice", 3 ou 4 options concrètes dont une seule juste, plus la dernière option « Je ne sais pas ».

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour :
{"questions": [{"id": "o1_auto", "type": "rating", "label": "...", "required": true, "options": [], "max": 5}, {"id": "o1_situation", "type": "choice", "label": "...", "required": true, "options": ["...", "...", "Je ne sais pas"], "max": 5}]}

Règles : ids "o<n>_auto" et "o<n>_situation" (n = numéro de l'objectif) ; français simple, sans jargon ; libellés de 200 caractères au plus.`;
}

const reponseSchema = z.object({ questions: z.array(questionDraftSchema).min(2).max(40) });

/** La réponse de l'IA, si elle respecte « deux questions par objectif ». */
export function lireTestGenere(texte: string, nbObjectifs: number): QuestionDraft[] | null {
  const json = /\{[\s\S]*\}/.exec(texte);
  if (!json) return null;
  let brut: unknown;
  try {
    brut = JSON.parse(json[0]);
  } catch {
    return null;
  }
  const p = reponseSchema.safeParse(brut);
  if (!p.success) return null;
  const questions = p.data.questions;
  if (questions.length !== nbObjectifs * 2) return null;
  if (new Set(questions.map((q) => q.id)).size !== questions.length) return null;
  if (questions.some((q) => q.type === 'choice' && q.options.length < 2)) return null;
  return questions;
}
