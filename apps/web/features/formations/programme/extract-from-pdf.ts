import 'server-only';
import { anthropic } from '@/shared/lib/ai/client';

/**
 * Lecture d'un programme de formation existant (PDF) pour pré-remplir la fiche.
 * Claude lit le PDF nativement (bloc `document`) — pas d'extracteur de texte
 * côté serveur, ce qui préserve les tableaux et les mises en page en colonnes.
 */
export const PROGRAMME_MODEL = 'claude-opus-5';

/** 5 Mo : aligné sur `serverActions.bodySizeLimit` de next.config.mjs. */
export const MAX_PDF_BYTES = 5 * 1024 * 1024;

export type ExtractedProgramme = {
  title: string;
  subtitle: string;
  objectives: string[];
  programContent: string;
  targetAudience: string;
  prerequisites: string[];
  pedagogicalMethod: string;
  teachingTeam: string;
  deroulement: string;
  evaluationMethod: string;
  resultIndicators: string;
  accessibilityInfo: string;
  durationHours: string;
};

const TEXT_FIELD = { type: 'string' } as const;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: TEXT_FIELD,
    subtitle: TEXT_FIELD,
    objectives: { type: 'array', items: { type: 'string' } },
    programContent: TEXT_FIELD,
    targetAudience: TEXT_FIELD,
    prerequisites: { type: 'array', items: { type: 'string' } },
    pedagogicalMethod: TEXT_FIELD,
    teachingTeam: TEXT_FIELD,
    deroulement: TEXT_FIELD,
    evaluationMethod: TEXT_FIELD,
    resultIndicators: TEXT_FIELD,
    accessibilityInfo: TEXT_FIELD,
    durationHours: TEXT_FIELD,
  },
  required: [
    'title',
    'subtitle',
    'objectives',
    'programContent',
    'targetAudience',
    'prerequisites',
    'pedagogicalMethod',
    'teachingTeam',
    'deroulement',
    'evaluationMethod',
    'resultIndicators',
    'accessibilityInfo',
    'durationHours',
  ],
} as const;

const PROMPT = `Tu lis le programme d'une formation professionnelle (organisme de formation français) et tu remplis la fiche formation correspondante.

Règles :
- Reprends le contenu du document tel qu'il est écrit. Ne réécris pas, ne reformule pas, n'invente rien : un champ absent du document reste une chaîne vide (ou une liste vide).
- programContent, pedagogicalMethod, teachingTeam, evaluationMethod, resultIndicators et accessibilityInfo sont du HTML simple : <p>, <ul>/<li>, <ol>/<li>, <strong>, <em>, <h3>, <br> uniquement. Pas d'attribut, pas de style, pas de <html>/<body>.
- programContent conserve le découpage du document (journées, demi-journées, modules, séquences) avec des titres <h3> et des listes.
- objectives et prerequisites sont des listes de chaînes brutes (sans puce ni numérotation), une entrée par élément.
- targetAudience et deroulement sont du texte simple, sans balise.
- durationHours est la durée totale en heures, en chiffres uniquement ("14", "7.5"). Si le document ne donne que des jours, convertis sur une base de 7 heures par jour. Chaîne vide si la durée n'est pas indiquée.
- title est l'intitulé exact de la formation ; subtitle une accroche courte si le document en comporte une.`;

export type ExtractResult =
  | { ok: true; data: ExtractedProgramme }
  | { ok: false; reason: 'no_api_key' | 'extraction_failed'; error?: unknown };

export async function extractProgrammeFromPdf(pdfBase64: string): Promise<ExtractResult> {
  const client = anthropic();
  if (!client) return { ok: false, reason: 'no_api_key' };

  try {
    const stream = client.messages.stream({
      model: PROGRAMME_MODEL,
      max_tokens: 32000,
      thinking: { type: 'adaptive' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } } as any,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const message = await stream.finalMessage();
    const raw = message.content
      .filter((b) => b.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b) => (b as any).text as string)
      .join('');

    if (!raw.trim()) return { ok: false, reason: 'extraction_failed' };
    return { ok: true, data: normalize(JSON.parse(raw) as Partial<ExtractedProgramme>) };
  } catch (error) {
    console.error('[extractProgrammeFromPdf] échec', error);
    return { ok: false, reason: 'extraction_failed', error };
  }
}

/** Le schéma garantit les clés, pas leur propreté : on borne avant d'alimenter le formulaire. */
function normalize(raw: Partial<ExtractedProgramme>): ExtractedProgramme {
  const text = (v: unknown, max: number): string =>
    typeof v === 'string' ? v.trim().slice(0, max) : '';
  const list = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean).slice(0, 60)
      : [];

  const hours = text(raw.durationHours, 10).replace(',', '.');

  return {
    title: text(raw.title, 200),
    subtitle: text(raw.subtitle, 300),
    objectives: list(raw.objectives),
    programContent: text(raw.programContent, 50000),
    targetAudience: text(raw.targetAudience, 5000),
    prerequisites: list(raw.prerequisites),
    pedagogicalMethod: text(raw.pedagogicalMethod, 10000),
    teachingTeam: text(raw.teachingTeam, 10000),
    deroulement: text(raw.deroulement, 10000),
    evaluationMethod: text(raw.evaluationMethod, 10000),
    resultIndicators: text(raw.resultIndicators, 10000),
    accessibilityInfo: text(raw.accessibilityInfo, 10000),
    durationHours: Number.isFinite(Number(hours)) && Number(hours) > 0 ? hours : '',
  };
}
