import 'server-only';
import { z } from 'zod';
import { anthropic, LEGAL_MODEL } from '@/shared/lib/ai/client';
import { MAX_CHOIX, MAX_QUESTIONS } from './quiz';
import { FORME_LABELS, type Forme } from './kinds';

/**
 * Brouillon d'exercice proposé par l'IA.
 *
 * Elle propose, le formateur dispose : rien n'est enregistré ici. Le brouillon
 * remplit le formulaire, où chaque question, chaque bonne réponse et chaque
 * point restent modifiables avant publication — et la direction valide ensuite.
 * Un contenu pédagogique qu'aucun humain n'a relu n'a rien à faire devant un
 * stagiaire.
 */

export type ContexteFormation = {
  readonly formation: string;
  readonly objectifs: readonly string[];
  readonly programme: string | null;
  readonly dureeHeures: number | null;
  readonly modalite: string | null;
  readonly participants: number | null;
  readonly public: string | null;
  readonly seance: string | null;
  readonly consigne: string | null;
};

const questionIA = z.object({
  enonce: z.string().trim().min(1).max(500),
  choix: z.array(z.string().trim().min(1).max(300)).min(2).max(MAX_CHOIX),
  bonnes: z.array(z.number().int().min(0)).min(1),
  points: z.number().min(1).max(20),
});

const reponseIA = z.object({
  title: z.string().trim().min(1).max(200),
  instructions: z.string().trim().max(2000).optional().default(''),
  questions: z.array(questionIA).max(MAX_QUESTIONS).optional().default([]),
  texte: z.string().trim().max(4000).optional().default(''),
  cartes: z
    .array(z.object({ recto: z.string().trim().min(1).max(300), verso: z.string().trim().min(1).max(500) }))
    .max(40)
    .optional()
    .default([]),
});

export type BrouillonIA = z.infer<typeof reponseIA>;

export type GenerationResult =
  | { ok: true; brouillon: BrouillonIA }
  | { ok: false; reason: 'no_api_key' | 'generation_failed'; details?: string };

const ATTENDU: Record<Forme, string> = {
  quiz:
    '8 à 12 questions à choix. Une seule bonne réponse en général ; deux quand la nuance le justifie. Les mauvaises réponses doivent être plausibles — une erreur qu’un stagiaire commettrait vraiment, jamais une réponse absurde.',
  texte_a_trou:
    'un texte suivi de 120 à 200 mots, dont 6 à 10 mots clés sont entourés de crochets. Ne masque que des termes porteurs de sens (notions, méthodes), jamais des articles ni des mots de liaison.',
  cartes_memoire:
    '10 à 15 cartes. Le recto pose une question courte ou un terme ; le verso donne la réponse en une à trois phrases.',
  video:
    'une consigne de visionnage et 4 à 6 questions à choix portant sur ce qui doit être retenu de la vidéo.',
  devoir:
    'une consigne de travail détaillée : le livrable attendu, les critères d’évaluation, le temps estimé. Aucune question à choix.',
};

const FORMAT: Record<Forme, string> = {
  quiz: '{"title":"...","instructions":"...","questions":[{"enonce":"...","choix":["...","..."],"bonnes":[0],"points":1}]}',
  texte_a_trou: '{"title":"...","instructions":"...","texte":"... avec des [mots] entre crochets ..."}',
  cartes_memoire: '{"title":"...","instructions":"...","cartes":[{"recto":"...","verso":"..."}]}',
  video: '{"title":"...","instructions":"...","questions":[{"enonce":"...","choix":["...","..."],"bonnes":[0],"points":1}]}',
  devoir: '{"title":"...","instructions":"..."}',
};

function decrisLeContexte(c: ContexteFormation): string {
  const lignes = [
    `Formation : ${c.formation}`,
    c.objectifs.length > 0 ? `Objectifs pédagogiques :\n- ${c.objectifs.join('\n- ')}` : null,
    c.dureeHeures ? `Durée totale : ${c.dureeHeures} heures` : null,
    c.modalite ? `Modalité : ${c.modalite}` : null,
    c.participants ? `Nombre de participants : ${c.participants}` : null,
    c.public ? `Public : ${c.public}` : null,
    c.seance ? `Séance concernée : ${c.seance}` : null,
    c.programme ? `Programme :\n${c.programme.slice(0, 4000)}` : null,
    c.consigne ? `Demande du formateur : ${c.consigne}` : null,
  ];
  return lignes.filter(Boolean).join('\n');
}

export async function genererBrouillon(forme: Forme, contexte: ContexteFormation): Promise<GenerationResult> {
  const client = anthropic();
  if (!client) return { ok: false, reason: 'no_api_key' };

  const prompt = `Tu es formateur expérimenté dans un organisme de formation français, et tu prépares du matériel pédagogique.

${decrisLeContexte(contexte)}

Produis : ${FORME_LABELS[forme]} — ${ATTENDU[forme]}

Règles STRICTES :
- Tout en français, vouvoiement, sans jargon inutile.
- Colle au programme et aux objectifs ci-dessus. N'invente aucun contenu qui n'en relève pas.
- Adapte l'ampleur à la durée : une formation de 5 heures ne se teste pas comme un parcours de 35 heures.
- ${contexte.participants && contexte.participants > 8 ? 'Le groupe est nombreux : privilégie des formulations sans ambiguïté, qui ne demandent pas d’arbitrage individuel.' : 'Le groupe est restreint : tu peux viser des questions plus fines.'}
- "bonnes" contient les INDEX (à partir de 0) des bonnes réponses dans "choix".
- Ne mets aucun indice de la bonne réponse dans sa formulation (ni longueur inhabituelle, ni « toutes les réponses ci-dessus »).

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, de la forme :
${FORMAT[forme]}`;

  try {
    const stream = client.messages.stream({
      model: LEGAL_MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output_config: { effort: 'high' } as any,
      messages: [{ role: 'user', content: prompt }],
    });
    const message = await stream.finalMessage();

    const texte = message.content
      .filter((bloc) => bloc.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((bloc) => (bloc as any).text as string)
      .join('')
      .trim();

    // Le modèle encadre parfois son JSON d'un bloc de code : on le retire.
    const nettoye = texte.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    const debut = nettoye.indexOf('{');
    const fin = nettoye.lastIndexOf('}');
    if (debut === -1 || fin <= debut) return { ok: false, reason: 'generation_failed' };

    const parse = reponseIA.safeParse(JSON.parse(nettoye.slice(debut, fin + 1)));
    if (!parse.success) {
      console.error('[pedagogie IA] réponse hors format', parse.error.issues[0]?.message);
      return { ok: false, reason: 'generation_failed', details: parse.error.issues[0]?.message };
    }

    // Une bonne réponse qui désigne une proposition inexistante rendrait le
    // quiz incorrigible : on écarte la question plutôt que de la faire relire.
    const questions = parse.data.questions.filter((q) => q.bonnes.every((b) => b < q.choix.length));
    return { ok: true, brouillon: { ...parse.data, questions } };
  } catch (e) {
    console.error('[pedagogie IA] génération impossible', (e as Error).message);
    return { ok: false, reason: 'generation_failed' };
  }
}
