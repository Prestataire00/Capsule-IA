'use server';

import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { renderTemplate } from '@/features/documents/templates/render-template';
import { resolveDossierVariables } from '@/features/documents/templates/resolve-dossier-variables';
import { wrapGeneratedHtml } from '@/features/documents/templates/wrap-generated-html';
import { GenerateFromTemplateSchema } from '../../../documents/modeles/schema';

export const generateFromTemplate = authActionClient
  .schema(GenerateFromTemplateSchema)
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;

    // 1. Charger le modèle (RLS : org courante ou modèle système actif).
    const { data: tplRow } = await sb
      .schema('app')
      .from('document_templates')
      .select('id, kind, title, content_html')
      .eq('id', parsedInput.templateId)
      .is('deleted_at', null)
      .maybeSingle();
    const tpl = tplRow as unknown as {
      id: string;
      kind: string;
      title: string;
      content_html: string | null;
    } | null;
    if (!tpl || !tpl.content_html) {
      return { ok: false as const, error: 'template_not_found' };
    }

    // 2. Résoudre les variables du dossier.
    const resolved = await resolveDossierVariables(sb, parsedInput.dossierId);
    if (!resolved) return { ok: false as const, error: 'dossier_not_found' };

    // 3. Rendre le HTML.
    const { html } = renderTemplate(tpl.content_html, resolved.variables);
    // En-tête de marque (logo + identité OF) + pied de page légal, sauf si le
    // modèle place déjà lui-même le logo via la variable {organisme_logo}.
    const finalHtml = tpl.content_html.includes('organisme_logo')
      ? html
      : wrapGeneratedHtml(html, resolved.variables);

    // 4. Persister le document (HTML inline, consultable/imprimable).
    const { data: inserted, error } = await sb
      .schema('app')
      .from('documents')
      .insert({
        organization_id: resolved.organizationId,
        dossier_id: parsedInput.dossierId,
        template_id: tpl.id,
        kind: tpl.kind,
        title: tpl.title,
        status: 'ready',
        content_html: finalHtml,
        generated_at: new Date().toISOString(),
        generation_input: { template_id: tpl.id },
      } as never)
      .select('id')
      .single();
    if (error || !inserted) {
      return { ok: false as const, error: 'document_create_failed', details: error?.message };
    }

    revalidatePath(`/dossiers/${parsedInput.dossierId}/documents`);
    return { ok: true as const, documentId: (inserted as { id: string }).id };
  });
