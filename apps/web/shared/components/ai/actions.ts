'use server';

import { z } from 'zod';
import { authActionClient } from '@/shared/lib/safe-action';
import { anthropic, LEGAL_MODEL } from '@/shared/lib/ai/client';

const ChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      }),
    )
    .min(1)
    .max(40),
});

// Rassemble un contexte compact et réel (RLS-scopé) pour l'assistant.
async function buildContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
): Promise<string> {
  const parts: string[] = [];
  try {
    const { data: org } = await sb
      .schema('app')
      .from('organizations')
      .select('name, legal_name, declaration_activite, qualiopi_certified_at')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (org) {
      parts.push(
        `ORGANISME : ${org.legal_name || org.name}` +
          (org.declaration_activite ? ` (NDA ${org.declaration_activite})` : '') +
          (org.qualiopi_certified_at ? ` — certifié Qualiopi depuis ${org.qualiopi_certified_at}` : ' — Qualiopi non renseigné'),
      );
    }
  } catch {
    /* ignore */
  }

  try {
    const { data: dossiers } = await sb
      .schema('app')
      .from('dossiers')
      .select('reference, status, start_date, end_date, total_hours, learner:learners!dossiers_learner_id_fkey(first_name, last_name)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(60);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (dossiers as any[]) ?? [];
    const byStatus: Record<string, number> = {};
    for (const d of rows) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
    parts.push(`DOSSIERS (${rows.length}) — répartition par statut : ${JSON.stringify(byStatus)}`);
    const lines = rows.slice(0, 40).map((d) => {
      const l = Array.isArray(d.learner) ? d.learner[0] : d.learner;
      const name = l ? `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() : '—';
      return `- ${d.reference} · ${d.status} · ${name} · ${d.start_date ?? '?'}→${d.end_date ?? '?'} · ${d.total_hours ?? '?'} h`;
    });
    if (lines.length) parts.push('Liste des dossiers :\n' + lines.join('\n'));
  } catch {
    /* ignore */
  }

  try {
    const { data: pending } = await sb
      .schema('app')
      .from('document_signatures')
      .select('id', { count: 'exact', head: false })
      .eq('status', 'pending')
      .limit(200);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const count = ((pending as any[]) ?? []).length;
    parts.push(`SIGNATURES EN ATTENTE : ${count} document(s) à signer.`);
  } catch {
    /* ignore */
  }

  return parts.join('\n\n') || '(Aucune donnée disponible pour le moment.)';
}

export const askAssistant = authActionClient.schema(ChatSchema).action(async ({ parsedInput, ctx }) => {
  const client = anthropic();
  if (!client) return { ok: false as const, error: 'ai_unavailable' };

  const context = await buildContext(ctx.supabase);

  const system = `Tu es l'assistant d'un organisme de formation français, intégré au logiciel "Capsule IA".
Tu aides le gérant à piloter son activité : dossiers de formation, conformité Qualiopi, sessions, documents.

RÈGLES :
- Réponds en français, de façon concise, claire et actionnable (listes courtes quand utile).
- Base-toi UNIQUEMENT sur le CONTEXTE ci-dessous. N'invente jamais un chiffre, une date ou un nom.
- Si l'information demandée n'est pas dans le contexte, dis-le clairement et indique où la trouver dans l'application (ex. « onglet Dossiers », « Qualité »).
- Reste factuel et professionnel.

CONTEXTE (données réelles de l'organisme, à l'instant) :
${context}`;

  try {
    const res = await client.messages.create({
      model: LEGAL_MODEL,
      max_tokens: 1024,
      system,
      messages: parsedInput.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const reply = res.content
      .filter((b) => b.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b) => (b as any).text as string)
      .join('\n')
      .trim();
    if (!reply) return { ok: false as const, error: 'empty_reply' };
    return { ok: true as const, reply };
  } catch {
    return { ok: false as const, error: 'generation_failed' };
  }
});
