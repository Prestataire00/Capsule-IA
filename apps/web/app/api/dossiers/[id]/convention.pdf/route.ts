import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { generateConventionPDF } from '@/features/documents/generate-convention-pdf';
import { buildConventionInput } from '@/features/documents/build-convention-input';
import { loadDossierPayers, type DossierPayer } from '@/features/documents/dossier-payers';
import { persistGeneratedDocument } from '@/features/documents/persist-document';
import { canAccessDossier } from '@/features/documents/guard-dossier-access';

export const dynamic = 'force-dynamic';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await canAccessDossier(params.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const sb = admin();

  // Résout le payeur ciblé : ?payer=<funderId|'reste'>. Sans paramètre → payeur primaire
  // (1er financeur, sinon reste à charge, sinon convention générique sans financeur).
  const payerParam = req.nextUrl.searchParams.get('payer');
  const payers = await loadDossierPayers(sb, params.id);
  let selected: DossierPayer | null;
  if (payerParam) {
    selected = payers.find((p) => p.payer === payerParam) ?? null;
    if (!selected) {
      return NextResponse.json({ error: 'payer_not_found' }, { status: 404 });
    }
  } else {
    selected = payers[0] ?? null;
  }

  const built = await buildConventionInput(sb, params.id, selected);
  if (!built) {
    return NextResponse.json({ error: 'dossier_not_found' }, { status: 404 });
  }
  const { input, organizationId } = built;

  const pdfBytes = await generateConventionPDF(input);

  const titleSuffix = selected ? ` — ${selected.modeLabel}` : '';
  try {
    await persistGeneratedDocument(sb as never, {
      organizationId,
      dossierId: params.id,
      kind: 'convention',
      title: `Convention de formation${titleSuffix}`,
      bytes: pdfBytes,
      generationInput: input,
      metadata: selected
        ? { payer: selected.payer, funder_name: selected.funderName, mode_label: selected.modeLabel }
        : { payer: null },
    });
  } catch (e) {
    console.error('[convention] persist failed', e);
  }

  const filename = selected
    ? `convention-${input.dossier.reference}-${selected.payer}.pdf`
    : `convention-${input.dossier.reference}.pdf`;

  try {
    const { error: auditErr } = await sb.schema('app').from('resource_access_log' as never).insert({
      organization_id: organizationId,
      target_kind: 'document', target_id: params.id, dossier_id: params.id,
      learner_id: null, actor_kind: 'system', action: 'download',
    } as never);
    if (auditErr) console.error('resource_access_log insert failed (non-bloquant)', auditErr);
  } catch (err) {
    console.error('resource_access_log insert failed (non-bloquant)', err);
  }

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
