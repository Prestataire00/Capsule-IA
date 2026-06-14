export type Question =
  | { id: string; type: 'nps'; label: string; required: boolean }
  | { id: string; type: 'rating'; label: string; required: boolean; max: number }
  | { id: string; type: 'text'; label: string; required: boolean }
  | { id: string; type: 'choice'; label: string; required: boolean; options: string[] };

export type QuestionnaireSchema = { questions: Question[] };
export type Answers = Record<string, string | number>;
export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

const isBlank = (v: unknown): boolean => v === undefined || v === null || v === '';

export function validateAnswers(schema: QuestionnaireSchema, answers: Answers): ValidationResult {
  const errors: string[] = [];
  for (const q of schema.questions) {
    const v = answers[q.id];
    if (isBlank(v)) {
      if (q.required) errors.push(`${q.id}: réponse requise`);
      continue;
    }
    if (q.type === 'nps') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 10) errors.push(`${q.id}: NPS doit être 0..10`);
    } else if (q.type === 'rating') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > q.max) errors.push(`${q.id}: note doit être 1..${q.max}`);
    } else if (q.type === 'choice') {
      if (!q.options.includes(String(v))) errors.push(`${q.id}: choix invalide`);
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
