import 'server-only';
import { anthropic, LEGAL_MODEL } from '@/shared/lib/ai/client';
import { legalPromptBlock } from '@/features/documents/legal/requirements';

export type AiDocResult =
  | { ok: true; html: string; model: string }
  | { ok: false; reason: 'no_api_key' | 'generation_failed'; error?: unknown };

// Génère le corps HTML d'un document à partir d'un TYPE de document, d'une
// instruction et des données du dossier (déjà résolues et formatées en français).
// Le bloc de conformité légale correspondant au type est injecté dans le prompt.
export async function generateDocumentHtml(
  kind: string,
  instruction: string,
  variables: Record<string, string>,
): Promise<AiDocResult> {
  const client = anthropic();
  if (!client) return { ok: false, reason: 'no_api_key' };

  const context = Object.entries(variables)
    .filter(([, v]) => v && v.trim().length > 0 && !v.startsWith('<'))
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const prompt = `Tu es le juriste-rédacteur d'un organisme de formation français (conforme Qualiopi).
Rédige le CORPS HTML d'un document ADMINISTRATIF et JURIDIQUEMENT CONFORME selon le type et la demande ci-dessous.

CONTRAINTES DE SORTIE :
- Réponds UNIQUEMENT avec du HTML (pas de \`\`\`, pas de <html>/<head>/<body>).
- Utilise uniquement <h1>, <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <table>, <thead>, <tbody>, <tr>, <th>, <td>.
- Français juridique et institutionnel, précis et sobre.
- Insère UNIQUEMENT les données réelles fournies ci-dessous. N'invente jamais un montant, une date, un SIRET, un numéro ou une raison sociale. Pour toute donnée manquante mais nécessaire, insère un champ explicite « [à compléter] ».
- Toutes les mentions obligatoires listées ci-dessous DOIVENT figurer dans le document.

${legalPromptBlock(kind)}

DONNÉES DU DOSSIER (source de vérité — ne rien inventer au-delà) :
${context || '(aucune donnée fournie)'}

DEMANDE COMPLÉMENTAIRE DE L'UTILISATEUR :
${instruction || '(aucune — produire le document standard du type indiqué)'}`;

  try {
    const stream = client.messages.stream({
      model: LEGAL_MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output_config: { effort: 'high' } as any,
      messages: [{ role: 'user', content: prompt }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const msg = await stream.finalMessage();
    let html = msg.content
      .filter((b) => b.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b) => (b as any).text as string)
      .join('\n')
      .trim();
    // Nettoyage défensif d'éventuels fences markdown.
    html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    if (!html) return { ok: false, reason: 'generation_failed' };
    return { ok: true, html, model: LEGAL_MODEL };
  } catch (error) {
    return { ok: false, reason: 'generation_failed', error };
  }
}
