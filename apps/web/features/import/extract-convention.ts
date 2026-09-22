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

const CLIENT = {
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
} as const;

const FORMATIONS = {
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
} as const;

const SESSIONS = {
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
} as const;

const PRICING = {
  type: 'object',
  additionalProperties: false,
  properties: {
    totalHtCents: { type: ['integer', 'null'] },
    vatRate: { type: ['integer', 'null'] },
    paymentTerms: TEXTE,
  },
  required: ['totalHtCents', 'vatRate', 'paymentTerms'],
} as const;

const PARTICIPANTS = {
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
} as const;

const DOSSIER = {
  type: 'object',
  additionalProperties: false,
  properties: {
    objective: TEXTE,
    actionType: {
      type: 'string',
      enum: ['action_formation', 'bilan_competences', 'vae', 'apprentissage', 'formation_continue', 'formation_initiale', ''],
    },
    traineeCategory: {
      type: 'string',
      enum: ['salarie', 'demandeur_emploi', 'particulier', 'apprenti', 'autre', ''],
    },
    place: TEXTE,
    paymentMethod: TEXTE,
    retractationDays: { type: ['integer', 'null'] },
    signedOn: TEXTE,
    signedPlace: TEXTE,
    annexFeesCents: { type: ['integer', 'null'] },
    totalTtcCents: { type: ['integer', 'null'] },
    sanction: TEXTE,
    funders: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: TEXTE,
          kind: {
            type: 'string',
            enum: ['opco', 'cpf', 'pole_emploi', 'region', 'autofinancement', 'entreprise', 'autre'],
          },
          amountCents: { type: ['integer', 'null'] },
          fileNumber: TEXTE,
        },
        required: ['name', 'kind', 'amountCents', 'fileNumber'],
      },
    },
    trainerNames: LISTE,
  },
  required: [
    'objective',
    'actionType',
    'traineeCategory',
    'place',
    'paymentMethod',
    'retractationDays',
    'signedOn',
    'signedPlace',
    'annexFeesCents',
    'totalTtcCents',
    'sanction',
    'funders',
    'trainerNames',
  ],
} as const;

/**
 * Deux schémas, et non un seul.
 *
 * Le décodage contraint compile le schéma en grammaire, et l'API refusait la
 * nôtre : « the compiled grammar is too large ». Aucune convention ne pouvait
 * donc être importée, quel que soit le PDF — l'écran accusait un document
 * illisible alors que la requête était rejetée avant même d'être lue. Le
 * contenu pédagogique (modules imbriqués, listes de phrases) pèse à lui seul
 * autant que tout le reste : séparé, chacun compile.
 */
export const SCHEMA_CONVENTION = {
  type: 'object',
  additionalProperties: false,
  properties: {
    client: CLIENT,
    sessions: SESSIONS,
    pricing: PRICING,
    participants: PARTICIPANTS,
    dossier: DOSSIER,
    notes: TEXTE,
  },
  required: ['client', 'sessions', 'pricing', 'participants', 'dossier', 'notes'],
} as const;

export const SCHEMA_FORMATIONS = {
  type: 'object',
  additionalProperties: false,
  properties: { formations: FORMATIONS },
  required: ['formations'],
} as const;

const SOCLE = `Tu lis une convention de formation professionnelle française et, s'ils sont joints, les programmes de formation annexés. Tu remplis une fiche destinée à créer le client, la formation et les séances dans un logiciel de gestion d'organisme de formation.

Règles communes :
- Le "client" est le BÉNÉFICIAIRE de la convention (l'entreprise qui achète la formation), jamais l'organisme de formation prestataire. En cas de doute : l'organisme est celui qui porte un numéro de déclaration d'activité (NDA) et signe "pour l'organisme de formation".
- Ne réécris pas, n'invente rien. Un élément absent des documents reste une chaîne vide, une liste vide ou null.`;

/** Tout sauf le contenu pédagogique : le client, l'affaire, les dates, l'argent. */
const PROMPT_CONVENTION = `${SOCLE}

Renseigne le client, les séances, le prix, les participants, le dossier et les notes. Laisse de côté le contenu pédagogique des programmes : il est relevé par ailleurs.
- siret : chiffres uniquement, 14 caractères.
- sessions : une entrée PAR séance effectivement datée (un tableau de dates donne donc plusieurs entrées, y compris quand plusieurs groupes se succèdent le même jour). date au format AAAA-MM-JJ, startTime et endTime au format HH:MM sur 24 heures ("10h30" → "10:30"). label reprend l'intitulé de la ligne (groupe, demi-journée). location = lieu précis s'il est écrit.
- Si les dates sont annoncées comme indicatives, remplis-les quand même : elles seront relues.
- pricing.totalHtCents : le montant HT total en CENTIMES (1 440 € → 144000). vatRate en pourcentage entier (20). paymentTerms reprend l'échéancier tel qu'écrit.
- participants.count : nombre de stagiaires prévu par la convention. groups : la répartition telle qu'écrite. named : uniquement les participants réellement nommés dans les documents (souvent aucun, la liste étant annexée plus tard).
- notes : ce que tu as lu d'important sans savoir où le ranger (mentions particulières, incohérences entre les documents).

Le bloc "dossier" décrit l'affaire elle-même. Relève tout ce que les documents permettent :
- objective : l'objet de la formation tel qu'écrit ("Objectif de la formation : …").
- actionType : la nomenclature du code du travail quand la convention la cite (art. L6313-1). "Action de formation" → action_formation. Chaîne vide si absent.
- traineeCategory : qui suit la formation. Des salariés d'une entreprise cliente → salarie. Un particulier à ses frais → particulier. Demandeur d'emploi, apprenti → les valeurs correspondantes. Chaîne vide si on ne peut pas trancher.
- place : le lieu tel qu'écrit ("dans les locaux de l'entreprise", adresse, "classe virtuelle").
- paymentMethod : le mode de règlement ("par virement", "chèque", "prélèvement").
- retractationDays : le délai de rétractation en jours, s'il est chiffré.
- signedOn / signedPlace : la date (AAAA-MM-JJ) et la ville de signature ("Document réalisé en 2 exemplaires à Orléans, le 18/08/2026").
- annexFeesCents et totalTtcCents : frais annexes et total TTC en CENTIMES.
- sanction : ce qui est remis au stagiaire à l'issue (attestation, certificat), tel qu'écrit.
- funders : les financeurs NOMMÉS comme prenant en charge tout ou partie du coût, avec leur nature (opco, cpf, pole_emploi, region, entreprise, autofinancement, autre), le montant en centimes s'il est indiqué, et le numéro de dossier externe s'il figure. Attention : une clause qui EXCLUT une prise en charge ("le coût ne pourra faire l'objet d'une demande de prise en charge par l'OPCO") n'est pas un financeur — n'en crée aucun dans ce cas. Une entreprise qui paie elle-même la formation de ses salariés n'est pas non plus à lister ici : c'est le client.
- trainerNames : les formateurs nommés dans la convention ou ses annexes ("Formateur : Prénom NOM"), sans leur biographie.`;

/** Le contenu pédagogique seul : c'est lui qui faisait déborder la grammaire. */
const PROMPT_FORMATIONS = `${SOCLE}

Ne renseigne QUE les formations : leur contenu pédagogique, tel qu'il figure dans la convention et dans les programmes annexés.
- Une entrée par programme distinct. durationHours en heures, chiffres seulement.
- modules reprend le découpage du programme annexé (code type "M1.1", intitulé, durée telle qu'écrite, contenu et objectifs pédagogiques en listes de phrases brutes).
- programContent, pedagogicalMethod, evaluationMethod, accessibilityInfo, teachingTeam : HTML simple (<p>, <ul>/<li>, <strong>, <em>, <h3>, <br>), sans attribut ni style.
- objectives, prerequisites, contenu, objectifs : listes de phrases sans puce ni numérotation.`;

export type ExtractConventionResult =
  | { ok: true; data: ConventionImport }
  | { ok: false; reason: 'no_api_key' | 'extraction_failed'; error?: unknown; detail?: string };

/**
 * Ce que l'API a répondu, en une phrase montrable.
 *
 * Sans elle, tout échec s'affichait « le PDF est peut-être illisible » — y
 * compris un refus qui n'avait rien à voir avec le PDF. Le message technique
 * est court et sans secret : c'est celui qu'on demandera à l'utilisateur de
 * recopier.
 */
function detailLisible(error: unknown): string {
  const e = error as { status?: number; error?: { error?: { message?: string } }; message?: string };
  const message = e?.error?.error?.message ?? e?.message ?? String(error);
  return e?.status ? `HTTP ${e.status} — ${message}` : message;
}

/** Un appel au modèle, contraint par un schéma, qui rend l'objet JSON attendu. */
async function lireAvecSchema(
  client: NonNullable<ReturnType<typeof anthropic>>,
  documents: ReadonlyArray<{ name: string; base64: string }>,
  schema: unknown,
  prompt: string,
): Promise<Record<string, unknown>> {
  const contenu = [
    ...documents.flatMap((p) => [
      { type: 'text' as const, text: `Document : ${p.name}` },
      {
        type: 'document' as const,
        source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: p.base64 },
      },
    ]),
    { type: 'text' as const, text: prompt },
  ];

  const stream = client.messages.stream({
    model: CONVENTION_MODEL,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } } as any,
    messages: [{ role: 'user', content: contenu }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const message = await stream.finalMessage();
  const raw = message.content
    .filter((b) => b.type === 'text')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b) => (b as any).text as string)
    .join('');
  if (!raw.trim()) throw new Error('réponse vide du modèle');
  return JSON.parse(raw) as Record<string, unknown>;
}

export async function extractConvention(
  pdfs: ReadonlyArray<{ name: string; base64: string }>,
): Promise<ExtractConventionResult> {
  const client = anthropic();
  if (!client) return { ok: false, reason: 'no_api_key' };
  if (pdfs.length === 0) return { ok: false, reason: 'extraction_failed', detail: 'aucun document reçu' };

  try {
    // Les deux lectures partent ensemble : elles portent les mêmes PDF, et
    // l'enchaînement doublerait une attente déjà longue.
    const [convention, formations] = await Promise.all([
      lireAvecSchema(client, pdfs, SCHEMA_CONVENTION, PROMPT_CONVENTION),
      lireAvecSchema(client, pdfs, SCHEMA_FORMATIONS, PROMPT_FORMATIONS),
    ]);

    return { ok: true, data: normalizeImport({ ...convention, ...formations }) };
  } catch (error) {
    console.error('[extractConvention] échec', error);
    return { ok: false, reason: 'extraction_failed', error, detail: detailLisible(error) };
  }
}
