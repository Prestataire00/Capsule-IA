'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { DEFAULT_TEMPLATES } from '@/features/documents/templates/default-templates';
import { SaveTemplateSchema, DeleteTemplateSchema } from './schema';

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

// Hash déterministe (slug de code) — pas de Math.random pour rester reproductible.
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return h;
}
