import 'server-only';
import { anthropic } from '@/shared/lib/ai/client';
import { CONVENTION_MODEL } from './extract-convention';
import type { SeanceLue } from './planning-seances';

/**
 * Lecture d'un planning de formation reçu en document.
 *
 * L'import de convention lit une affaire entière — client, tarif, participants,
 * séances. Ici on ne cherche qu'une chose : le calendrier. Un tableau de dates
 * envoyé par le client, l'annexe d'une convention, un planning scanné.
 *
 * Le prompt tient en une consigne, et c'est la règle de l'organisme : **ne
 * rien calculer, ne rien déduire**. Une séance dont l'horaire n'est pas écrit
 * ne doit pas ressortir avec un horaire plausible — mieux vaut une ligne
 * écartée, visible, qu'une séance fausse créée en silence.
 */

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['seances'],
  properties: {
    seances: {
      type: 'array',
      description: 'Une entrée par séance datée trouvée dans le document.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'date', 'startTime', 'endTime', 'modality', 'location'],
        properties: {
          label: {
            type: 'string',
            description: "Intitulé lisible de la séance tel qu'il figure ; chaîne vide si aucun.",
          },
          date: { type: 'string', description: 'AAAA-MM-JJ. Chaîne vide si la date n’est pas écrite.' },
          startTime: { type: 'string', description: 'HH:MM sur 24 h. Chaîne vide si absent.' },
          endTime: { type: 'string', description: 'HH:MM sur 24 h. Chaîne vide si absent.' },
          modality: {
            type: 'string',
            description: "presentiel, distanciel ou hybride si le document le dit ; chaîne vide sinon.",
          },
          location: { type: 'string', description: 'Lieu tel qu’écrit ; chaîne vide si absent.' },
        },
      },
    },
  },
} as const;

const PROMPT = `Tu lis le planning d'une formation professionnelle.

Relève CHAQUE séance datée du document : une ligne par créneau.

Règles absolues :
- Ne calcule rien, ne déduis rien. Recopie ce qui est écrit.
- Une information absente reste une chaîne vide. N'invente jamais un horaire
  « habituel », une durée « probable » ou une date « logique ».
- Une journée coupée en matin et après-midi fait DEUX séances, sauf si le
  document donne un seul créneau continu.
- Les dates s'écrivent AAAA-MM-JJ, les heures HH:MM sur 24 heures. Si l'année
  n'est pas écrite, laisse la date vide plutôt que de la supposer.
- N'invente aucune séance pour « compléter » une série incomplète.

Réponds uniquement avec l'objet JSON demandé.`;

export type ExtractPlanningResult =
  | { ok: true; seances: SeanceLue[] }
  | { ok: false; reason: 'no_api_key' | 'extraction_failed'; detail?: string };

const texte = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export async function extractPlanning(
  documents: ReadonlyArray<{ name: string; base64: string; mediaType: string }>,
): Promise<ExtractPlanningResult> {
  const client = anthropic();
  if (!client) return { ok: false, reason: 'no_api_key' };
  if (documents.length === 0) {
    return { ok: false, reason: 'extraction_failed', detail: 'aucun document reçu' };
  }

  try {
    const contenu = [
      ...documents.flatMap((d) => [
        { type: 'text' as const, text: `Document : ${d.name}` },
        d.mediaType === 'application/pdf'
          ? {
              type: 'document' as const,
              source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: d.base64 },
            }
          : {
              type: 'image' as const,
              // Un planning arrive souvent en photo ou en capture d'écran.
              source: { type: 'base64' as const, media_type: d.mediaType as never, data: d.base64 },
            },
      ]),
      { type: 'text' as const, text: PROMPT },
    ];

    const stream = client.messages.stream({
      model: CONVENTION_MODEL,
      max_tokens: 16000,
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
    if (!raw.trim()) return { ok: false, reason: 'extraction_failed', detail: 'réponse vide du modèle' };

    const objet = JSON.parse(raw) as { seances?: unknown };
    const brutes = Array.isArray(objet.seances) ? objet.seances : [];
    const seances: SeanceLue[] = brutes.map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return {
        label: texte(o.label),
        date: texte(o.date),
        startTime: texte(o.startTime),
        endTime: texte(o.endTime),
        modality: texte(o.modality),
        location: texte(o.location),
      };
    });

    return { ok: true, seances };
  } catch (e) {
    const err = e as { status?: number; message?: string };
    const detail = err?.status ? `HTTP ${err.status} — ${err.message ?? ''}` : (err?.message ?? String(e));
    return { ok: false, reason: 'extraction_failed', detail };
  }
}
