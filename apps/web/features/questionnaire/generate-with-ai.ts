import 'server-only';
import { anthropic, LEGAL_MODEL } from '@/shared/lib/ai/client';
import { questionDraftSchema, type QuestionDraft, type TemplateKind } from './template.schema';
import { z } from 'zod';

export type GenerateQuestionnaireResult =
  | { ok: true; title: string; questions: QuestionDraft[] }
  | { ok: false; reason: 'no_api_key' | 'generation_failed' };

const KIND_GUIDANCE: Record<TemplateKind, string> = {
  positionnement:
    "analyse des besoins / positionnement AVANT la formation : niveau initial, attentes, objectifs, contraintes pratiques.",
  satisfaction_chaud:
    "satisfaction à chaud en fin de formation : qualité pédagogique, organisation, atteinte des objectifs, recommandation (NPS).",
  satisfaction_froid:
    "satisfaction à froid quelques mois après : mise en pratique des acquis, impact professionnel, recommandation (NPS).",
  evaluation_acquis:
    "évaluation des acquis : auto-évaluation des compétences acquises sur les objectifs pédagogiques.",
  opco: "questionnaire destiné au financeur : conformité, suivi, satisfaction du financement.",
  satisfaction_formateur:
    "recueil de l'appréciation du formateur sur le déroulé, le groupe et les moyens mis à disposition.",
  custom: 'questionnaire personnalisé adapté au contexte fourni.',
};

const aiResponseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  questions: z.array(questionDraftSchema).min(3).max(15),
});

/** Génère un brouillon de questionnaire via Claude pour un type + contexte donné. */
export async function generateQuestionnaireDraft(
  kind: TemplateKind,
  context: string,
): Promise<GenerateQuestionnaireResult> {
  const client = anthropic();
  if (!client) return { ok: false, reason: 'no_api_key' };

  const prompt = `Tu es expert qualité Qualiopi pour un organisme de formation français.
Génère un questionnaire de type : ${KIND_GUIDANCE[kind]}
${context.trim() ? `Contexte de la formation : ${context.trim()}` : ''}

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, de la forme :
{"title": "...", "questions": [{"id": "snake_case", "type": "text|choice|rating|nps", "label": "...", "required": true, "options": ["..."], "max": 5}]}

Règles STRICTES :
- 5 à 10 questions, pertinentes et non redondantes, en français.
- "id" en snake_case unique (minuscules, chiffres, underscore).
- type "choice" → fournir "options" (2 à 5) ; sinon "options": [].
- type "rating" → "max" entre 4 et 5 ; sinon "max": 5.
- type "nps" → échelle 0-10 (recommandation), au plus une par questionnaire.
- Toujours inclure tous les champs id/type/label/required/options/max pour chaque question.`;

  try {
    const stream = client.messages.stream({
      model: LEGAL_MODEL,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output_config: { effort: 'high' } as any,
      messages: [{ role: 'user', content: prompt }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const msg = await stream.finalMessage();
    const text = msg.content
      .filter((b) => b.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b) => (b as any).text as string)
      .join('\n');

    const jsonMatch = /\{[\s\S]*\}/.exec(text);
    if (!jsonMatch) return { ok: false, reason: 'generation_failed' };
    const parsed = aiResponseSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) return { ok: false, reason: 'generation_failed' };

    return { ok: true, title: parsed.data.title, questions: parsed.data.questions };
  } catch {
    return { ok: false, reason: 'generation_failed' };
  }
}
