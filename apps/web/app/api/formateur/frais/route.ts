import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { BILLING_BUCKET, ficheDansOrganisme, libre, prevenirOrganisme } from '@/features/trainer-space/billing';
import { CATEGORIES_FRAIS, eurosEnCentimes, formatEuros } from '@/features/trainer-space/billing-rules';
import { cleanFileName, sniffJustification } from '@/features/attendance/justification-rules';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX = 10 * 1024 * 1024;
const refus = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Note de frais du formateur : rattachée à l'une de SES séances, justificatif
// obligatoire (type vérifié sur ses octets), transmise à l'organisme de la séance.
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
  const sessionId = String(form.get('sessionId') ?? '');
  const date = String(form.get('expenseDate') ?? '');
  const categorie = String(form.get('category') ?? '');
  const libelle = String(form.get('label') ?? '').trim();
  const montant = eurosEnCentimes(String(form.get('amount') ?? ''));
  if (!UUID.test(sessionId) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(categorie in CATEGORIES_FRAIS) || !libelle || libelle.length > 200) {
    return refus('invalid_payload');
  }
  if (montant === null || montant <= 0) return refus('amount_invalid');

  const fichier = form.get('file');
  if (!(fichier instanceof File) || fichier.size === 0 || fichier.size > MAX) return refus('receipt_invalid');
  const octets = new Uint8Array(await fichier.arrayBuffer());
  const type = sniffJustification(octets);
  if (!type) return refus('receipt_invalid');

  const admin = libre(supabaseAdmin());
  const { data: ids, error: idsErr } = await admin.schema('app').rpc('trainer_session_ids', { p_user_id: user.id });
  if (idsErr || !((ids ?? []) as string[]).includes(sessionId)) return refus('forbidden', 404);
  const { data: s } = await admin.schema('app').from('sessions').select('organization_id, starts_at').eq('id', sessionId).maybeSingle();
  const seance = s as { organization_id: string; starts_at: string } | null;
  if (!seance) return refus('forbidden', 404);
  const fiche = await ficheDansOrganisme(user.id, seance.organization_id);
  if (!fiche) return refus('forbidden', 404);

  const id = randomUUID();
  const chemin = `${seance.organization_id}/${fiche.id}/frais/${id}.${type.ext}`;
  const up = await supabaseAdmin().storage.from(BILLING_BUCKET).upload(chemin, octets, { contentType: type.mime, upsert: false });
  if (up.error) {
    console.error('[note de frais] justificatif refusé par le stockage', up.error.message);
    return refus('upload_failed', 500);
  }
  const { error } = await admin.schema('app').from('trainer_expenses').insert({
    id,
    organization_id: seance.organization_id,
    trainer_id: fiche.id,
    user_id: user.id,
    session_id: sessionId,
    expense_date: date,
    category: categorie,
    label: libelle,
    amount_cents: montant,
    receipt_path: chemin,
    receipt_name: cleanFileName(fichier.name, type.ext),
    receipt_mime: type.mime,
    status: 'soumise',
  });
  if (error) {
    console.error('[note de frais] enregistrement refusé', error.message);
    await supabaseAdmin().storage.from(BILLING_BUCKET).remove([chemin]);
    return refus('expense_insert_failed', 500);
  }

  const nom = `${fiche.first_name} ${fiche.last_name}`.trim();
  await prevenirOrganisme(seance.organization_id, `Nouvelle note de frais de ${nom}`, [
    `${CATEGORIES_FRAIS[categorie]} : ${libelle}, ${formatEuros(montant)}.`,
    'Le justificatif est joint ; vous pouvez valider ou refuser la dépense depuis la facturation des formateurs.',
  ]);
  return NextResponse.json({ ok: true, id });
}
