'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { articlesFor, type LegalKind } from '@/shared/lib/legifrance/mapping';
import { fetchArticle } from '@/shared/lib/legifrance/client';
import { generateLegalDoc } from '@/shared/lib/ai/generate-legal-doc';
import { generateLegalDocPDF } from '@/features/documents/generate-legal-doc-pdf';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type ActionResult = { ok: true } | { ok: false; error: string };

const KIND_TITLE: Record<LegalKind, string> = {
  reglement_interieur: 'Règlement intérieur',
  cgv: 'Conditions générales de vente',
  livret_accueil: "Livret d'accueil",
};

async function orgInfo(sb: ReturnType<typeof admin>, orgId: string) {
  const { data } = await sb
    .schema('app')
    .from('organizations')
    .select('name, declaration_activite')
    .eq('id', orgId)
    .maybeSingle();
  const o = (data ?? {}) as { name?: string; declaration_activite?: string };
  return { name: o.name ?? '', nda: o.declaration_activite ?? null };
}

export async function generateLegalDocDraft(orgId: string, kind: LegalKind): Promise<ActionResult> {
  const sb = admin();
  const refs = articlesFor(kind);
  const fetched = await Promise.all(refs.map((r) => fetchArticle(r)));
  const sources = fetched.filter((x): x is NonNullable<typeof x> => x !== null);
  if (sources.length === 0) return { ok: false, error: 'Légifrance indisponible (clés PISTE ?)' };

  const org = await orgInfo(sb, orgId);
  const gen = await generateLegalDoc(kind, org, sources);
  if (!gen.ok) {
    return { ok: false, error: gen.reason === 'no_api_key' ? 'Clé Anthropic manquante' : 'Génération échouée' };
  }

  const { error } = await sb.schema('app').from('org_legal_documents').upsert(
    {
      organization_id: orgId,
      kind,
      status: 'draft',
      content_md: gen.contentMd,
      sources_used: sources,
      generated_model: gen.model,
      generated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,kind' },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath('/parametres/documents-legaux');
  return { ok: true };
}

export async function saveLegalDocEdit(orgId: string, kind: LegalKind, contentMd: string): Promise<ActionResult> {
  const sb = admin();
  const { error } = await sb
    .schema('app')
    .from('org_legal_documents')
    .update({ content_md: contentMd, status: 'draft', updated_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .eq('kind', kind);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/parametres/documents-legaux');
  return { ok: true };
}

export async function validateLegalDoc(orgId: string, kind: LegalKind): Promise<ActionResult> {
  const sb = admin();
  const { data: doc } = await sb
    .schema('app')
    .from('org_legal_documents')
    .select('content_md, version')
    .eq('organization_id', orgId)
    .eq('kind', kind)
    .maybeSingle();
  const d = doc as { content_md?: string; version?: number } | null;
  if (!d?.content_md) return { ok: false, error: 'Brouillon vide' };

  const org = await orgInfo(sb, orgId);
  const pdf = await generateLegalDocPDF({
    title: KIND_TITLE[kind],
    organization: { name: org.name, nda: org.nda, address: null },
    contentMd: d.content_md,
  });
  const path = `${orgId}/legal/${kind}-v${d.version ?? 1}.pdf`;
  const up = await sb.storage.from('documents').upload(path, Buffer.from(pdf), {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (up.error) return { ok: false, error: up.error.message };

  const { error } = await sb
    .schema('app')
    .from('org_legal_documents')
    .update({
      status: 'validated',
      validated_at: new Date().toISOString(),
      pdf_storage_path: path,
      version: (d.version ?? 1) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', orgId)
    .eq('kind', kind);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/parametres/documents-legaux');
  return { ok: true };
}
