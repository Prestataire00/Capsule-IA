import 'server-only';
import { anthropic, LEGAL_MODEL } from './client';
import { buildLegalPrompt, type OrgInfo, type LegalSource } from './build-legal-prompt';
import type { LegalKind } from '@/shared/lib/legifrance/mapping';

export type GenerateResult =
  | { ok: true; contentMd: string; model: string }
  | { ok: false; reason: 'no_api_key' | 'generation_failed'; error?: unknown };

export async function generateLegalDoc(
  kind: LegalKind,
  org: OrgInfo,
  sources: LegalSource[],
): Promise<GenerateResult> {
  const client = anthropic();
  if (!client) return { ok: false, reason: 'no_api_key' };
  const prompt = buildLegalPrompt(kind, org, sources);
  try {
    // Opus 4.8 : adaptive thinking + effort high ; PAS de temperature (retirée).
    // Streaming (sortie longue) + finalMessage().
    const stream = client.messages.stream({
      model: LEGAL_MODEL,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output_config: { effort: 'high' } as any,
      messages: [{ role: 'user', content: prompt }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const msg = await stream.finalMessage();
    const contentMd = msg.content
      .filter((b) => b.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b) => (b as any).text as string)
      .join('\n');
    if (!contentMd.trim()) return { ok: false, reason: 'generation_failed' };
    return { ok: true, contentMd, model: LEGAL_MODEL };
  } catch (error) {
    return { ok: false, reason: 'generation_failed', error };
  }
}
