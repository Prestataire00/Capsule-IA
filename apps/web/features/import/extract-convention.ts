import 'server-only';
import { anthropic } from '@/shared/lib/ai/client';
import { normalizeImport, type ConventionImport } from './convention-types';

/**
 * Lecture d'une convention de formation et de ses programmes annexés.
 *
 * Claude lit les PDF nativement (blocs `document`), comme l'import d'un
 * programme seul : les tableaux de dates et de tarifs d'une convention ne
 * survivent pas à un extracteur de texte. Tous les documents partent dans le
 * même appel, pour que le programme annexé et la convention se recoupent.
 */

export const CONVENTION_MODEL = 'claude-opus-5';

/** 5 Mo par fichier, 20 Mo au total : au-delà, l'appel devient lent et coûteux. */
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const MAX_FILES = 6;

const LISTE = { type: 'array', items: { type: 'string' } } as const;
const TEXTE = { type: 'string' } as const;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    client: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: TEXTE,
        legalName: TEXTE,
        siret: TEXTE,
        address: TEXTE,
        representativeFirstName: TEXTE,
        representativeLastName: TEXTE,
        representativeRole: TEXTE,
        contactEmail: TEXTE,
        contactPhone: TEXTE,
      },
      required: [
        'name',
        'legalName',
        'siret',
        'address',
        'representativeFirstName',
        'representativeLastName',
        'representativeRole',
        'contactEmail',
        'contactPhone',
      ],
    },
    formations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: TEXTE,
          subtitle: TEXTE,
          durationHours: TEXTE,
          modality: { type: 'string', enum: ['presentiel', 'distanciel', 'hybride'] },
          objectives: LISTE,
          prerequisites: LISTE,
          targetAudience: TEXTE,
          programContent: TEXTE,
          pedagogicalMethod: TEXTE,
          evaluationMethod: TEXTE,
          accessibilityInfo: TEXTE,
          accessDelay: TEXTE,
          teachingTeam: TEXTE,
          modules: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                code: TEXTE,
                title: TEXTE,
                durationLabel: TEXTE,
                contenu: LISTE,
                objectifs: LISTE,
              },
              required: ['code', 'title', 'durationLabel', 'contenu', 'objectifs'],
            },
          },
        },
        required: [
          'title',
          'subtitle',
          'durationHours',
          'modality',
          'objectives',
          'prerequisites',
          'targetAudience',
          'programContent',
          'pedagogicalMethod',
          'evaluationMethod',
          'accessibilityInfo',
          'accessDelay',
          'teachingTeam',
          'modules',
        ],
      },
    },
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: TEXTE,
          date: TEXTE,
          startTime: TEXTE,
          endTime: TEXTE,
          modality: { type: 'string', enum: ['presentiel', 'distanciel', 'hybride'] },
          location: TEXTE,
        },
        required: ['label', 'date', 'startTime', 'endTime', 'modality', 'location'],
      },
    },
    pricing: {
      type: 'object',
      additionalProperties: false,
      properties: {
        totalHtCents: { type: ['integer', 'null'] },
        vatRate: { type: ['integer', 'null'] },
        paymentTerms: TEXTE,
      },
      required: ['totalHtCents', 'vatRate', 'paymentTerms'],
    },
    participants: {
      type: 'object',
      additionalProperties: false,
      properties: {
        count: { type: ['integer', 'null'] },
        groups: TEXTE,
        named: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { firstName: TEXTE, lastName: TEXTE, email: TEXTE },
            required: ['firstName', 'lastName', 'email'],
          },
        },
      },
      required: ['count', 'groups', 'named'],
    },
    notes: TEXTE,
  },
  required: ['client', 'formations', 'sessions', 'pricing', 'participants', 'notes'],
} as const;

const PROMPT = `Tu lis une convention de formation professionnelle française et, s'ils sont joints, les programmes de formation annexés. Tu remplis une fiche destinée à créer le client, la formation et les séances dans un logiciel de gestion d'organisme de formation.

Règles impératives :
- Le "client" est le BÉNÉFICIAIRE de la convention (l'entreprise qui achète la formation), jamais l'organisme de formation prestataire. En cas de doute : l'organisme est celui qui porte un numéro de déclaration d'activité (NDA) et signe "pour l'organisme de formation".
- Ne réécris pas, n'invente rien. Un élément absent des documents reste une chaîne vide, une liste vide ou null.
- siret : chiffres uniquement, 14 caractères.
- sessions : une entrée PAR séance effectivement datée (un tableau de dates donne donc plusieurs entrées, y compris quand plusieurs groupes se succèdent le même jour). date au format AAAA-MM-JJ, startTime et endTime au format HH:MM sur 24 heures ("10h30" → "10:30"). label reprend l'intitulé de la ligne (groupe, demi-journée). location = lieu précis s'il est écrit.
- Si les dates sont annoncées comme indicatives, remplis-les quand même : elles seront relues.
- formations : une entrée par programme distinct. durationHours en heures, chiffres seulement. modules reprend le découpage du programme annexé (code type "M1.1", intitulé, durée telle qu'écrite, contenu et objectifs pédagogiques en listes de phrases brutes).
- programContent, pedagogicalMethod, evaluationMethod, accessibilityInfo, teachingTeam : HTML simple (<p>, <ul>/<li>, <strong>, <em>, <h3>, <br>), sans attribut ni style.
- objectives, prerequisites, contenu, objectifs : listes de phrases sans puce ni numérotation.
- pricing.totalHtCents : le montant HT total en CENTIMES (1 440 € → 144000). vatRate en pourcentage entier (20). paymentTerms reprend l'échéancier tel qu'écrit.
- participants.count : nombre de stagiaires prévu par la convention. groups : la répartition telle qu'écrite. named : uniquement les participants réellement nommés dans les documents (souvent aucun, la liste étant annexée plus tard).
- notes : ce que tu as lu d'important sans savoir où le ranger (financement, mentions particulières, incohérences entre les documents).`;

export type ExtractConventionResult =
  | { ok: true; data: ConventionImport }
  | { ok: false; reason: 'no_api_key' | 'extraction_failed'; error?: unknown };

export async function extractConvention(
  pdfs: ReadonlyArray<{ name: string; base64: string }>,
): Promise<ExtractConventionResult> {
  const client = anthropic();
  if (!client) return { ok: false, reason: 'no_api_key' };
  if (pdfs.length === 0) return { ok: false, reason: 'extraction_failed' };

  try {
    const contenu = [
      ...pdfs.flatMap((p) => [
        { type: 'text' as const, text: `Document : ${p.name}` },
        {
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: p.base64 },
        },
      ]),
      { type: 'text' as const, text: PROMPT },
    ];

    const stream = client.messages.stream({
      model: CONVENTION_MODEL,
      max_tokens: 32000,
      thinking: { type: 'adaptive' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } } as any,
      messages: [{ role: 'user', content: contenu }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const message = await stream.finalMessage();
    const raw = message.content
      .filter((b) => b.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b) => (b as any).text as string)
      .join('');
    if (!raw.trim()) return { ok: false, reason: 'extraction_failed' };

    return { ok: true, data: normalizeImport(JSON.parse(raw)) };
  } catch (error) {
    console.error('[extractConvention] échec', error);
    return { ok: false, reason: 'extraction_failed', error };
  }
}
