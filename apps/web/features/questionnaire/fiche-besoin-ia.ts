import 'server-only';
import { z } from 'zod';
import { anthropic, LEGAL_MODEL } from '@/shared/lib/ai/client';
import { questionDraftSchema, toRuntimeQuestion } from './template.schema';
import type { Question } from './schema';
import { htmlToPlain } from '@/features/formations/programme/from-formation';

/**
 * La fiche besoin adaptée à UNE formation, rédigée par l'IA (demande d'Ismael,
 * 2026-10-05) : en plus du socle Qualiopi — niveau, objectifs, aménagements —
 * les questions qui situent le stagiaire dans le sujet même de la formation
 * (« Avez-vous déjà utilisé un outil d'IA ? » pour une formation à l'IA).
 * L'organisme la relit et la modifie ensuite dans l'éditeur de questionnaires.
 */

export type FormationPourFiche = {
  readonly title: string;
  /** Tout ce que la formation dit d'elle-même (Informations), en texte. */
  readonly contexte: string;
};

/** Le texte d'une valeur de catalogue : chaînes et listes, HTML retiré. */
function texteDe(v: unknown): string[] {
  if (typeof v === 'string') return v.trim() ? [htmlToPlain(v)] : [];
  if (Array.isArray(v)) return v.flatMap(texteDe);
  if (v && typeof v === 'object') return Object.values(v as Record<string, unknown>).flatMap(texteDe);
  return [];
}

const LIBELLES: Record<string, string> = {
  summary: 'Résumé',
  description: 'Description',
  objectives: 'Objectifs pédagogiques',
  prerequisites: 'Prérequis',
  target_audience: 'Public visé',
  pedagogical_method: 'Méthodes pédagogiques',
  evaluation_method: 'Modalités d’évaluation',
};

/**
 * Le détail de la formation tel qu'on le lit dans ses Informations : résumé,
 * description, objectifs, prérequis, public, méthodes, évaluation, et le
 * contenu du catalogue (programme, déroulé). Borné : l'IA n'a besoin que du sujet.
 */
export function contexteDeFormation(f: Record<string, unknown>): string {
  const parties: string[] = [];
  for (const [cle, libelle] of Object.entries(LIBELLES)) {
    const t = texteDe(f[cle]).join(' ; ').trim();
    if (t) parties.push(`${libelle} : ${t}`);
  }
  const catalogue = (f.metadata as { catalog?: Record<string, unknown> } | null)?.catalog ?? null;
  if (catalogue) {
    const utiles = ['subtitle', 'deroulement', 'programme', 'contenu', 'sequences', 'competences', 'titreVise'];
    const t = utiles.flatMap((k) => texteDe(catalogue[k])).join(' ; ').trim();
    if (t) parties.push(`Programme : ${t}`);
  }
  return parties.join('\n').slice(0, 6000);
}

export type FicheAdapteeResult =
  | { ok: true; questions: Question[] }
  | { ok: false; reason: 'no_api_key' | 'generation_failed' };

/** Le socle que chaque fiche garde, quelles que soient les questions de l'IA. */
const SOCLE: Question[] = [
  { id: 'currentLevel', type: 'rating', label: 'Votre niveau actuel sur le sujet de la formation', required: true, max: 5 },
  { id: 'objectives', type: 'text', label: 'Qu’attendez-vous de cette formation ? Vos objectifs', required: true },
  { id: 'accommodations', type: 'text', label: 'Avez-vous besoin d’un aménagement (situation de handicap, accessibilité) ?', required: false },
];

const reponseIa = z.object({ questions: z.array(questionDraftSchema).min(3).max(10) });

/** Socle d'abord, puis les questions propres à la formation, sans doublon d'identifiant. */
export function assemblerFiche(propres: readonly Question[]): Question[] {
  const socle = new Set(SOCLE.map((q) => q.id));
  const vus = new Set<string>();
  const specifiques = propres.filter((q) => !socle.has(q.id) && !vus.has(q.id) && vus.add(q.id));
  return [SOCLE[0]!, ...specifiques, SOCLE[1]!, SOCLE[2]!];
}

export async function genererFicheBesoinAdaptee(formation: FormationPourFiche): Promise<FicheAdapteeResult> {
  const client = anthropic();
  if (!client) return { ok: false, reason: 'no_api_key' };

  const contexte = `Formation : ${formation.title}\n${formation.contexte}`.trim();

  const prompt = `Tu es responsable pédagogique d'un organisme de formation français certifié Qualiopi.
Rédige les questions de la fiche de positionnement (analyse des besoins) qu'un stagiaire remplit AVANT cette formation :
${contexte}

Les questions sur le niveau général, les objectifs et le handicap existent déjà : ne les pose pas.
Pose 4 à 7 questions PROPRES AU SUJET de cette formation, qui permettent au formateur de situer chaque stagiaire :
son expérience concrète du sujet (ex. pour une formation à l'IA : « Avez-vous déjà utilisé un outil d'IA comme ChatGPT ? »),
les outils qu'il utilise, ses usages professionnels visés, une situation de travail où il veut l'appliquer.
Questions courtes, claires, en français, au vouvoiement. Préfère les questions fermées (type "choice", 2 à 5 options) quand c'est possible.

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour :
{"questions": [{"id": "snake_case", "type": "text|choice|rating", "label": "...", "required": false, "options": ["..."], "max": 5}]}
Règles : "id" en snake_case unique ; type "choice" → "options" (2 à 5) ; sinon "options": [] ; "max": 5 ; tous les champs présents.`;

  try {
    const stream = client.messages.stream({
      model: LEGAL_MODEL,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output_config: { effort: 'medium' } as any,
      messages: [{ role: 'user', content: prompt }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const msg = await stream.finalMessage();
    const texte = msg.content
      .filter((b) => b.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b) => (b as any).text as string)
      .join('\n');
    const json = /\{[\s\S]*\}/.exec(texte);
    if (!json) return { ok: false, reason: 'generation_failed' };
    const p = reponseIa.safeParse(JSON.parse(json[0]));
    if (!p.success) return { ok: false, reason: 'generation_failed' };
    return { ok: true, questions: assemblerFiche(p.data.questions.map(toRuntimeQuestion)) };
  } catch (e) {
    console.error('[fiche besoin IA] génération impossible', e instanceof Error ? e.message : e);
    return { ok: false, reason: 'generation_failed' };
  }
}
