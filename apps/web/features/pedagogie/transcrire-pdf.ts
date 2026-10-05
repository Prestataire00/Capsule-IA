import 'server-only';
import { anthropic } from '@/shared/lib/ai/client';
import { PROGRAMME_MODEL } from '@/features/formations/programme/extract-from-pdf';
import { TYPES_BLOC, type Bloc } from './docx-blocs';

/**
 * Transcription fidèle d'un support PDF en blocs (titres, paragraphes,
 * listes, tableaux, pages), pour en faire un Word que l'équipe annote.
 * Claude lit le PDF nativement, mise en page en colonnes et tableaux
 * compris ; il retranscrit, il ne réécrit pas.
 */

/** Limite de l'API pour un PDF en pièce jointe. */
export const MAX_PDF_TRANSCRIPTION = 30 * 1024 * 1024;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    blocs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: [...TYPES_BLOC] },
          texte: { type: 'string' },
          lignes: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
        },
        required: ['type', 'texte', 'lignes'],
      },
    },
  },
  required: ['blocs'],
} as const;

const PROMPT = `Tu retranscris un support de cours (PDF) en blocs, pour en faire un document Word que l'équipe pédagogique va annoter.

Règles :
- Retranscris TOUT le texte, dans l'ordre de lecture, mot pour mot. Ne résume pas, ne reformule pas, ne corrige rien, n'ajoute rien.
- Ouvre chaque page du PDF par un bloc { "type": "page", "texte": "Page N" } (N = numéro de la page dans le PDF).
- Titres : "titre1", "titre2", "titre3" selon leur niveau visuel. Paragraphes : "paragraphe". Listes à puces : un bloc "puce" par élément ; listes numérotées : un bloc "numero" par élément (sans le numéro).
- Tableaux : un bloc "tableau" dont "lignes" contient chaque ligne en tableau de cellules (première ligne = en-tête) ; "texte" vide.
- Une image ou un schéma sans texte : un bloc "paragraphe" décrivant brièvement l'image entre crochets, par exemple « [Schéma : cycle PDCA] ».
- Hors tableau, "lignes" est un tableau vide.`;

export type TranscriptionResult =
  | { ok: true; blocs: Bloc[] }
  | { ok: false; reason: 'no_api_key' | 'transcription_failed' };

export async function transcrirePdf(pdfBase64: string): Promise<TranscriptionResult> {
  const client = anthropic();
  if (!client) return { ok: false, reason: 'no_api_key' };

  try {
    const stream = client.messages.stream({
      model: PROGRAMME_MODEL,
      max_tokens: 64000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    } as never);
    const message = await stream.finalMessage();
    const brut = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('');
    if (!brut.trim()) return { ok: false, reason: 'transcription_failed' };
    const lu = JSON.parse(brut) as { blocs?: Bloc[] };
    const blocs = (lu.blocs ?? []).filter(
      (b) => (TYPES_BLOC as readonly string[]).includes(b.type) && typeof b.texte === 'string' && Array.isArray(b.lignes),
    );
    return blocs.length > 0 ? { ok: true, blocs } : { ok: false, reason: 'transcription_failed' };
  } catch (error) {
    console.error('[transcrirePdf] échec', error);
    return { ok: false, reason: 'transcription_failed' };
  }
}
