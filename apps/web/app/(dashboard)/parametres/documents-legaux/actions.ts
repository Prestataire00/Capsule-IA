'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { articlesFor, type LegalKind } from '@/shared/lib/legifrance/mapping';
import { fetchArticle } from '@/shared/lib/legifrance/client';
import { generateLegalDoc } from '@/shared/lib/ai/generate-legal-doc';
import type { OrgInfo } from '@/shared/lib/ai/build-legal-prompt';
import { generateLegalDocPDF } from '@/features/documents/generate-legal-doc-pdf';
import { loadOrgBranding } from '@/features/documents/load-org-branding';
import { guardAction } from '@/shared/lib/auth/guard-action';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * `orgId` arrive du composant client : sans cette garde, il suffisait de le
 * remplacer pour générer ou écraser les documents légaux d'un autre organisme.
 * Renvoie l'erreur à propager, ou `null` si l'appel est légitime.
 */
async function guardOrg(orgId: string): Promise<{ ok: false; error: string } | null> {
  const guard = await guardAction('settings');
  if (!guard.ok) return { ok: false, error: guard.error };
  if (guard.member.organizationId !== orgId) return { ok: false, error: 'forbidden' };
  return null;
}

const KIND_TITLE: Record<LegalKind, string> = {
  reglement_interieur: 'Règlement intérieur',
  cgv: 'Conditions générales de vente',
  livret_accueil: "Livret d'accueil",
};

type AddressJson = {
  line1?: string;
  line2?: string;
  city?: string;
  postal_code?: string;
  country?: string;
};

function composeAddress(addr: AddressJson | null | undefined): string | null {
  if (!addr || typeof addr !== 'object') return null;
  const s = [
    [addr.line1, addr.line2].filter(Boolean).join(' '),
    [addr.postal_code, addr.city].filter(Boolean).join(' '),
    addr.country,
  ]
    .filter((p) => p && p.trim().length > 0)
    .join(', ');
  return s || null;
}

// Toute l'identité légale de l'organisme, injectée dans le prompt IA (et le PDF).
async function orgInfo(
  sb: ReturnType<typeof admin>,
  orgId: string,
): Promise<OrgInfo & { address: string | null }> {
  const { data } = await sb
    .schema('app')
    .from('organizations')
    .select(
      'name, legal_name, siret, declaration_activite, address, representative_name, representative_title, contact_email, contact_phone',
    )
    .eq('id', orgId)
    .maybeSingle();
  const o = (data ?? {}) as {
    name?: string;
    legal_name?: string | null;
    siret?: string | null;
    declaration_activite?: string | null;
    address?: AddressJson | null;
    representative_name?: string | null;
    representative_title?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
  };
  return {
    name: o.name ?? '',
    legalName: o.legal_name ?? null,
    siret: o.siret ?? null,
    nda: o.declaration_activite ?? null,
    address: composeAddress(o.address),
    representative: o.representative_name ?? null,
    representativeTitle: o.representative_title ?? null,
    email: o.contact_email ?? null,
    phone: o.contact_phone ?? null,
  };
}

export async function generateLegalDocDraft(orgId: string, kind: LegalKind): Promise<ActionResult> {
  const guard = await guardOrg(orgId);
  if (guard) return guard;
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
  const guard = await guardOrg(orgId);
  if (guard) return guard;
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
  const guard = await guardOrg(orgId);
  if (guard) return guard;
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
  const branding = await loadOrgBranding(sb as never, orgId);
  const pdf = await generateLegalDocPDF({
    title: KIND_TITLE[kind],
    organization: { name: org.legalName || org.name, nda: org.nda ?? null, address: org.address ?? null },
    logoPng: branding.logoPng,
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
