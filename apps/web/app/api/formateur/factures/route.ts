import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { BILLING_BUCKET, libre, loadBillingProfile, prevenirOrganisme, seancesFacturables } from '@/features/trainer-space/billing';
import { eurosEnCentimes, formatEuros } from '@/features/trainer-space/billing-rules';
import { sniffJustification } from '@/features/attendance/justification-rules';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 10 * 1024 * 1024;
const refus = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Facture déposée par le formateur (faite avec son propre logiciel) : PDF
// vérifié sur ses octets, séances terminées non encore facturées de SES
// séances dans cet organisme ; le montant attendu d'après son tarif est gardé
// pour que l'organisme repère un écart avant de valider.
export async function POST(req: NextRequest) {
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();
  if (!user) return refus('unauthenticated', 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return refus('invalid_payload');
  }
  const orgId = String(form.get('organizationId') ?? '');
  const numero = String(form.get('number') ?? '').trim();
  const emission = String(form.get('issueDate') ?? '');
  const ht = eurosEnCentimes(String(form.get('subtotal') ?? ''));
  const tva = eurosEnCentimes(String(form.get('vat') ?? '0'));
  let sessionIds: string[] = [];
  try {
    const v: unknown = JSON.parse(String(form.get('sessionIds') ?? '[]'));
    if (Array.isArray(v)) sessionIds = [...new Set(v.filter((x): x is string => typeof x === 'string' && UUID.test(x)))].slice(0, 60);
  } catch {
    return refus('invalid_payload');
  }
  if (!UUID.test(orgId) || !numero || numero.length > 40 || !/^\d{4}-\d{2}-\d{2}$/.test(emission)) return refus('invalid_payload');
  if (ht === null || tva === null) return refus('amount_invalid');

  const fichier = form.get('file');
  if (!(fichier instanceof File) || fichier.size === 0 || fichier.size > MAX) return refus('file_invalid');
  const octets = new Uint8Array(await fichier.arrayBuffer());
  if (sniffJustification(octets)?.mime !== 'application/pdf') return refus('file_invalid');

  const facturable = await seancesFacturables(user.id, orgId);
  if (!facturable) return refus('forbidden', 404);
  const eligibles = new Map<string, number | null>([
    ...facturable.lignes.map((l) => [l.sessionId, l.totalCents] as [string, number]),
    ...facturable.sansTarif.map((s) => [s.id, null] as [string, null]),
  ]);
  if (sessionIds.length === 0 || sessionIds.some((id) => !eligibles.has(id))) return refus('sessions_invalid');
  const attendus = sessionIds.map((id) => eligibles.get(id) ?? null);
  const attendu = attendus.every((v) => v !== null) ? attendus.reduce<number>((t, v) => t + (v ?? 0), 0) : null;

  const { fiche } = facturable;
  const nom = `${fiche.first_name} ${fiche.last_name}`.trim();
  const profil = await loadBillingProfile(user.id);
  const admin = libre(supabaseAdmin());
  const id = randomUUID();
  const { error } = await admin.schema('app').from('trainer_invoices').insert({
    id,
    organization_id: orgId,
    trainer_id: fiche.id,
    user_id: user.id,
    source: 'deposee',
    number: numero,
    issue_date: emission,
    subtotal_cents: ht,
    vat_cents: tva,
    total_cents: ht + tva,
    expected_subtotal_cents: attendu,
    status: 'soumise',
    issuer_snapshot: {
      trainer_name: nom,
      email: fiche.email,
      legal_name: profil?.legal_name ?? null,
      siret: profil?.siret ?? null,
      iban: profil?.iban ?? null,
      bic: profil?.bic ?? null,
    },
  });
  if (error) {
    if (error.code === '23505') return refus('number_used', 409);
    console.error('[facture déposée] enregistrement refusé', error.message);
    return refus('invoice_insert_failed', 500);
  }
  const annuler = async () => {
    await admin.schema('app').from('trainer_invoices').delete().eq('id', id);
  };
  const { error: lienErr } = await admin
    .schema('app')
    .from('trainer_invoice_sessions')
    .insert(sessionIds.map((s) => ({ invoice_id: id, session_id: s })));
  if (lienErr) {
    console.error('[facture déposée] séances non rattachées', lienErr.message);
    await annuler();
    return refus('invoice_insert_failed', 500);
  }

  const chemin = `${orgId}/${fiche.id}/factures/${id}.pdf`;
  const up = await supabaseAdmin().storage.from(BILLING_BUCKET).upload(chemin, octets, { contentType: 'application/pdf', upsert: false });
  if (up.error) {
    console.error('[facture déposée] PDF refusé par le stockage', up.error.message);
    await annuler();
    return refus('upload_failed', 500);
  }
  await admin.schema('app').from('trainer_invoices').update({ pdf_path: chemin }).eq('id', id);

  await prevenirOrganisme(orgId, `Nouvelle facture de ${nom}`, [
    `${nom} a déposé la facture ${numero} de ${formatEuros(ht + tva)} pour ${sessionIds.length} séance${sessionIds.length > 1 ? 's' : ''}.`,
    attendu !== null && attendu !== ht
      ? `Attention : d’après son tarif, le montant HT attendu est de ${formatEuros(attendu)}.`
      : 'Vous pouvez la consulter, la valider ou la refuser depuis la facturation des formateurs.',
  ]);
  return NextResponse.json({ ok: true, id });
}
