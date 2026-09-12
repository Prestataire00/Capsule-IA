import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sha256Hex } from './file-hash';

/**
 * Archivage d'un document généré dans la GED.
 *
 * Un document est identifié par sa SOURCE (`sourceKey`) : régénérer la même
 * facture ou la même convention ne crée pas une ligne de plus, mais une
 * nouvelle **version**. La bibliothèque n'affiche que la version courante
 * (`is_current`) ; les précédentes restent consultables en historique
 * (`parent_document_id`), jamais supprimées — ce sont des preuves.
 *
 * Sans `sourceKey`, on garde l'ancien comportement : dédoublonnage sur
 * l'empreinte du fichier.
 */
export type PersistArgs = {
  organizationId: string;
  dossierId: string | null;
  kind: string;
  title: string;
  bytes: Uint8Array;
  generationInput: unknown;
  /** Métadonnées additionnelles écrites dans app.documents.metadata (ex. { payer, funder_kind }). */
  metadata?: Record<string, unknown>;
  /** Identifiant stable de la source, ex. `invoice:<id>` : une entrée, des versions. */
  sourceKey?: string;
  /** Route de régénération (document « vivant » toujours à jour à l'ouverture). */
  sourceUrl?: string | null;
};

export type PersistResult = { documentId: string; created: boolean; version: number };

export async function persistGeneratedDocument(sb: SupabaseClient, args: PersistArgs): Promise<PersistResult> {
  const fileHash = sha256Hex(args.bytes);

  type Existing = { id: string; version: number; parent_document_id: string | null; file_hash: string | null };
  let current: Existing | null = null;

  if (args.sourceKey) {
    const { data } = await sb
      .schema('app')
      .from('documents')
      .select('id, version, parent_document_id, file_hash')
      .eq('organization_id', args.organizationId)
      .eq('source_key', args.sourceKey)
      .eq('is_current', true)
      .is('deleted_at', null)
      .maybeSingle();
    current = (data as Existing | null) ?? null;

    // Contenu identique : rien de neuf, on rafraîchit seulement le titre.
    if (current && current.file_hash === fileHash) {
      await sb
        .schema('app')
        .from('documents')
        .update({ title: args.title, source_url: args.sourceUrl ?? null, updated_at: new Date().toISOString() } as never)
        .eq('id', current.id);
      return { documentId: current.id, created: false, version: Number(current.version) };
    }
  } else {
    const { data: sameFile } = await sb
      .schema('app')
      .from('documents')
      .select('id, version')
      .eq('organization_id', args.organizationId)
      .eq('file_hash', fileHash)
      .is('deleted_at', null)
      .maybeSingle();
    if (sameFile) {
      const row = sameFile as { id: string; version: number };
      return { documentId: row.id, created: false, version: Number(row.version ?? 1) };
    }
  }

  const version = current ? Number(current.version) + 1 : 1;
  const storagePath = `${args.organizationId}/${args.dossierId ?? 'org'}/${args.kind}/${fileHash}.pdf`;
  const { error: upErr } = await sb.storage
    .from('documents')
    .upload(storagePath, args.bytes, { contentType: 'application/pdf', upsert: true });
  if (upErr) throw new Error(`document_upload_failed: ${upErr.message}`);

  // La version précédente sort de la bibliothèque AVANT l'insertion : l'index
  // unique n'autorise qu'une version courante par source.
  if (current) {
    await sb
      .schema('app')
      .from('documents')
      .update({ is_current: false, status: 'archived', updated_at: new Date().toISOString() } as never)
      .eq('id', current.id);
  }

  const { data: inserted, error: insErr } = await sb
    .schema('app')
    .from('documents')
    .insert({
      organization_id: args.organizationId,
      dossier_id: args.dossierId,
      kind: args.kind,
      title: args.title,
      status: 'ready',
      storage_path: storagePath,
      mime_type: 'application/pdf',
      file_size_bytes: args.bytes.byteLength,
      file_hash: fileHash,
      generated_at: new Date().toISOString(),
      generation_input: args.generationInput,
      source_key: args.sourceKey ?? null,
      source_url: args.sourceUrl ?? null,
      is_current: true,
      version,
      parent_document_id: current ? (current.parent_document_id ?? current.id) : null,
      ...(args.metadata ? { metadata: args.metadata } : {}),
    })
    .select('id')
    .single();
  if (insErr) {
    // L'insertion a échoué : la version précédente doit rester la courante.
    if (current) {
      await sb
        .schema('app')
        .from('documents')
        .update({ is_current: true, status: 'ready' } as never)
        .eq('id', current.id);
    }
    throw new Error(`document_insert_failed: ${insErr.message}`);
  }

  return { documentId: (inserted as { id: string }).id, created: true, version };
}
