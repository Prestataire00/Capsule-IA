'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';

// Téléverse l'image de couverture d'une formation (affichée dans le catalogue).
// Stockée dans org_assets ; chemin dans formations.metadata.catalog.coverPath
// (aucune migration).
export const uploadFormationCover = authActionClient
  .schema(z.object({ formationId: z.string().uuid(), pngBase64: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;

    const { data: f } = await sb
      .schema('app')
      .from('formations')
      .select('organization_id, metadata')
      .eq('id', parsedInput.formationId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!f) return { ok: false as const, error: 'not_found' };
    const row = f as { organization_id: string; metadata: Record<string, unknown> | null };

    const path = `${row.organization_id}/formations/${parsedInput.formationId}.png`;
    const bytes = Uint8Array.from(Buffer.from(parsedInput.pngBase64, 'base64'));
    const { error: upErr } = await sb.storage
      .from('org_assets')
      .upload(path, bytes, { contentType: 'image/png', upsert: true });
    if (upErr) return { ok: false as const, error: 'upload_failed', details: upErr.message };

    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const catalog = (meta.catalog ?? {}) as Record<string, unknown>;
    const metadata = { ...meta, catalog: { ...catalog, coverPath: path } };
    const { error } = await sb
      .schema('app')
      .from('formations')
      .update({ metadata } as never)
      .eq('id', parsedInput.formationId)
      .eq('organization_id', row.organization_id);
    if (error) return { ok: false as const, error: 'update_failed', details: error.message };

    revalidatePath(`/formations/${parsedInput.formationId}`);
    return { ok: true as const };
  });
