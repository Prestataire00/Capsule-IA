'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authActionClient } from '@/shared/lib/safe-action';
import { templateFormSchema, toRuntimeSchema, TEMPLATE_KINDS } from '@/features/questionnaire/template.schema';
import { generateQuestionnaireDraft } from '@/features/questionnaire/generate-with-ai';
import { DEFAULT_QUESTIONNAIRES } from '@/features/questionnaire/default-questionnaires';

const KIND_VALUES = TEMPLATE_KINDS.map((k) => k.value) as [string, ...string[]];

// Importe les questionnaires Qualiopi par défaut (contenu Sosafe). Idempotent :
// n'insère que les codes système absents pour l'organisation.
export const seedDefaultQuestionnaires = authActionClient.action(async ({ ctx }) => {
  const sb = ctx.supabase;
  const orgId = await resolveOrgId(sb);
  if (!orgId) return { ok: false as const, error: 'no_org' };

  const { data: existing } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('code')
    .eq('organization_id', orgId);
  const existingCodes = new Set(((existing as unknown as Array<{ code: string }>) ?? []).map((r) => r.code));

  const toInsert = DEFAULT_QUESTIONNAIRES.filter((q) => !existingCodes.has(q.code)).map((q) => ({
    organization_id: orgId,
    code: q.code,
    kind: q.kind,
    title: q.title,
    schema: q.schema,
    thank_you_message: q.thankYou,
    is_active: true,
  }));

  if (toInsert.length === 0) return { ok: true as const, created: 0 };

  const { error } = await sb.schema('app').from('questionnaire_templates').insert(toInsert as never);
  if (error) return { ok: false as const, error: 'seed_failed', details: error.message };

  revalidatePath('/questionnaires');
  return { ok: true as const, created: toInsert.length };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveOrgId(sb: SupabaseClient<any>): Promise<string | null> {
  const { data } = await sb
    .schema('app')
    .from('members')
    .select('organization_id')
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { organization_id: string } | null)?.organization_id ?? null;
}

function slugify(input: string): string {
  const base = input
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || 'questionnaire';
}

export const saveQuestionnaireTemplate = authActionClient
  .schema(templateFormSchema)
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;
    const orgId = await resolveOrgId(sb);
    if (!orgId) return { ok: false as const, error: 'no_org' };

    const schema = toRuntimeSchema(parsedInput);
    const base = {
      title: parsedInput.title,
      kind: parsedInput.kind,
      schema,
      thank_you_message: parsedInput.thankYou || null,
      is_active: true,
    };

    if (parsedInput.templateId) {
      const { error } = await sb
        .schema('app')
        .from('questionnaire_templates')
        .update(base as never)
        .eq('id', parsedInput.templateId)
        .eq('organization_id', orgId); // jamais les templates système (organization_id NULL)
      if (error) return { ok: false as const, error: 'update_failed', details: error.message };
      revalidatePath('/questionnaires');
      return { ok: true as const, templateId: parsedInput.templateId };
    }

    // Création : code unique par org (slug du titre, suffixe si collision).
    let code = slugify(parsedInput.title);
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error } = await sb
        .schema('app')
        .from('questionnaire_templates')
        .insert({ ...base, organization_id: orgId, code } as never)
        .select('id')
        .single();
      if (!error && data) {
        revalidatePath('/questionnaires');
        return { ok: true as const, templateId: (data as { id: string }).id };
      }
      if (error?.code === '23505') {
        code = `${slugify(parsedInput.title)}_${randomUUID().slice(0, 4)}`;
        continue;
      }
      return { ok: false as const, error: 'create_failed', details: error?.message };
    }
    return { ok: false as const, error: 'create_failed' };
  });

export const deleteQuestionnaireTemplate = authActionClient
  .schema(z.object({ templateId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;
    const orgId = await resolveOrgId(sb);
    if (!orgId) return { ok: false as const, error: 'no_org' };
    const { error } = await sb
      .schema('app')
      .from('questionnaire_templates')
      .update({ deleted_at: new Date().toISOString(), is_active: false } as never)
      .eq('id', parsedInput.templateId)
      .eq('organization_id', orgId);
    if (error) return { ok: false as const, error: 'delete_failed', details: error.message };
    revalidatePath('/questionnaires');
    return { ok: true as const };
  });

export const generateQuestionnaireWithAI = authActionClient
  .schema(z.object({ kind: z.enum(KIND_VALUES), context: z.string().trim().max(2000) }))
  .action(async ({ parsedInput }) => {
    const result = await generateQuestionnaireDraft(
      parsedInput.kind as never,
      parsedInput.context,
    );
    if (!result.ok) return { ok: false as const, error: result.reason };
    return { ok: true as const, title: result.title, questions: result.questions };
  });
