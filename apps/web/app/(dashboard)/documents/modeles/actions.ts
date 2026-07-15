'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { DEFAULT_TEMPLATES } from '@/features/documents/templates/default-templates';
import { resolveDossierVariables } from '@/features/documents/templates/resolve-dossier-variables';
import { renderTemplate } from '@/features/documents/templates/render-template';
import { generateTemplateHtml } from '@/features/documents/templates/generate-with-ai';
import {
  SaveTemplateSchema,
  DeleteTemplateSchema,
  CreateCategorySchema,
  DeleteCategorySchema,
  TEMPLATE_KINDS,
  TEMPLATE_KIND_LABELS,
} from './schema';

// Génère un MODÈLE via l'IA (avec variables), l'enregistre en brouillon et renvoie
// son id — l'éditeur s'ouvre ensuite dessus pour édition/ajout de variables.
export const generateTemplateWithAI = authActionClient
  .schema(z.object({ kind: z.enum(TEMPLATE_KINDS), instruction: z.string().max(2000).optional().default('') }))
  .action(async ({ parsedInput, ctx }) => {
    const orgId = await resolveAdminOrgId(ctx.userId as unknown as string);
    if (!orgId) return { ok: false as const, error: 'forbidden_not_admin' };

    const gen = await generateTemplateHtml(parsedInput.kind, parsedInput.instruction);
    if (!gen.ok) {
      return { ok: false as const, error: gen.reason === 'no_api_key' ? 'ai_unavailable' : 'generation_failed' };
    }

    const title = `${TEMPLATE_KIND_LABELS[parsedInput.kind]} (brouillon IA)`;
    const code = `${slugify(title)}-${Math.abs(hashStr(title + Date.now())) % 100000}`;
    const { data: inserted, error } = await ctx.supabase
      .schema('app')
      .from('document_templates')
      .insert({
        organization_id: orgId,
        kind: parsedInput.kind,
        code,
        title,
        content_html: gen.html,
        is_active: true,
      } as never)
      .select('id')
      .single();
    if (error || !inserted) return { ok: false as const, error: 'save_failed', details: error?.message };

    revalidatePath('/documents/modeles');
    return { ok: true as const, templateId: (inserted as { id: string }).id };
  });

// Rendu d'un modèle avec les VRAIES valeurs d'un dossier — aperçu "valeurs réelles".
export const previewTemplateWithDossier = authActionClient
  .schema(z.object({ contentHtml: z.string().max(100_000), dossierId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const resolved = await resolveDossierVariables(ctx.supabase, parsedInput.dossierId);
    if (!resolved) return { ok: false as const, error: 'dossier_not_found' as const };
    const { html, missing } = renderTemplate(parsedInput.contentHtml, resolved.variables);
    return { ok: true as const, html, missing };
  });

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

async function resolveAdminOrgId(userId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data: member } = await (admin as never as {
    schema: (s: string) => {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            is: (k: string, v: null) => {
              order: (k: string, o: { ascending: boolean }) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{ data: { organization_id: string; role: string } | null }>;
                };
              };
            };
          };
        };
      };
    };
  })
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!member?.organization_id) return null;
  if (!ADMIN_ROLES.includes(member.role as AdminRole)) return null;
  return member.organization_id;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

export const seedDefaultTemplates = authActionClient.action(async ({ ctx }) => {
  const sb = ctx.supabase;
  const orgId = await resolveAdminOrgId(ctx.userId as unknown as string);
  if (!orgId) return { ok: false as const, error: 'forbidden_not_admin' };

  const { data: existing } = await sb
    .schema('app')
    .from('document_templates')
    .select('code')
    .eq('organization_id', orgId);
  const existingCodes = new Set(
    ((existing as unknown as Array<{ code: string }>) ?? []).map((r) => r.code),
  );

  const toInsert = DEFAULT_TEMPLATES.filter((t) => !existingCodes.has(t.code)).map((t) => ({
    organization_id: orgId,
    kind: t.kind,
    code: t.code,
    title: t.title,
    content_html: t.contentHtml,
    is_active: true,
  }));

  if (toInsert.length === 0) return { ok: true as const, created: 0 };

  const { error } = await sb.schema('app').from('document_templates').insert(toInsert as never);
  if (error) return { ok: false as const, error: 'seed_failed', details: error.message };

  revalidatePath('/documents/modeles');
  return { ok: true as const, created: toInsert.length };
});

export const saveTemplate = authActionClient
  .schema(SaveTemplateSchema)
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;
    const orgId = await resolveAdminOrgId(ctx.userId as unknown as string);
    if (!orgId) return { ok: false as const, error: 'forbidden_not_admin' };

    if (parsedInput.id) {
      const { error } = await sb
        .schema('app')
        .from('document_templates')
        .update({
          kind: parsedInput.kind,
          title: parsedInput.title,
          content_html: parsedInput.contentHtml,
          formation_id: parsedInput.formationId,
          category_id: parsedInput.categoryId,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', parsedInput.id)
        .eq('organization_id', orgId);
      if (error) return { ok: false as const, error: 'save_failed', details: error.message };
      revalidatePath('/documents/modeles');
      return { ok: true as const, id: parsedInput.id };
    }

    const code = `${slugify(parsedInput.title)}-${Math.abs(hashStr(parsedInput.title + parsedInput.kind)) % 10000}`;
    const { data: inserted, error } = await sb
      .schema('app')
      .from('document_templates')
      .insert({
        organization_id: orgId,
        kind: parsedInput.kind,
        code,
        title: parsedInput.title,
        content_html: parsedInput.contentHtml,
        formation_id: parsedInput.formationId,
        category_id: parsedInput.categoryId,
        is_active: true,
      } as never)
      .select('id')
      .single();
    if (error || !inserted) return { ok: false as const, error: 'save_failed', details: error?.message };
    revalidatePath('/documents/modeles');
    return { ok: true as const, id: (inserted as { id: string }).id };
  });

export const deleteTemplate = authActionClient
  .schema(DeleteTemplateSchema)
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;
    const orgId = await resolveAdminOrgId(ctx.userId as unknown as string);
    if (!orgId) return { ok: false as const, error: 'forbidden_not_admin' };
    const { error } = await sb
      .schema('app')
      .from('document_templates')
      .update({ deleted_at: new Date().toISOString() } as never)
      .eq('id', parsedInput.id)
      .eq('organization_id', orgId);
    if (error) return { ok: false as const, error: 'delete_failed', details: error.message };
    revalidatePath('/documents/modeles');
    return { ok: true as const };
  });

export const createCategory = authActionClient
  .schema(CreateCategorySchema)
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;
    const orgId = await resolveAdminOrgId(ctx.userId as unknown as string);
    if (!orgId) return { ok: false as const, error: 'forbidden_not_admin' };
    const { data, error } = await sb
      .schema('app')
      .from('document_categories' as never)
      .insert({ organization_id: orgId, name: parsedInput.name } as never)
      .select('id')
      .single();
    if (error || !data) return { ok: false as const, error: 'create_failed', details: error?.message };
    revalidatePath('/documents/modeles');
    return { ok: true as const, id: (data as { id: string }).id };
  });

export const deleteCategory = authActionClient
  .schema(DeleteCategorySchema)
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;
    const orgId = await resolveAdminOrgId(ctx.userId as unknown as string);
    if (!orgId) return { ok: false as const, error: 'forbidden_not_admin' };
    // Les modèles liés repassent en « non classé » (FK ON DELETE SET NULL).
    const { error } = await sb
      .schema('app')
      .from('document_categories' as never)
      .delete()
      .eq('id', parsedInput.id)
      .eq('organization_id', orgId);
    if (error) return { ok: false as const, error: 'delete_failed', details: error.message };
    revalidatePath('/documents/modeles');
    return { ok: true as const };
  });

// Hash déterministe (slug de code) — pas de Math.random pour rester reproductible.
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}
