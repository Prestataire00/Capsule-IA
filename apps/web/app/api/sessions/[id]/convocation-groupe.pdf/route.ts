import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { chargerSeance, construireConvocationGroupe, participantsConvoques } from '@/features/sessions/convocation-groupe';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Convocation du groupe d'une séance, avec la liste des participants.
// ?entreprise=<id> : seulement les salariés de cette entreprise.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID.test(params.id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const me = await getCurrentMember();
  if (!me || me.role === 'formateur' || can(me.role, 'dossiers') === 'none') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // La séance doit être visible sous RLS : elle appartient à l'organisme du membre.
  const { data: visible } = await supabaseServer().schema('app').from('sessions').select('id').eq('id', params.id).maybeSingle();
  if (!visible) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const sb = supabaseAdmin() as unknown as SupabaseClient;
  const seance = await chargerSeance(sb, params.id);
  if (!seance || seance.organizationId !== me.organizationId) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const entreprise = req.nextUrl.searchParams.get('entreprise');
  const tous = await participantsConvoques(sb, seance);
  const participants = entreprise && UUID.test(entreprise) ? tous.filter((p) => p.companyId === entreprise) : tous;
  const { data: c } =
    entreprise && UUID.test(entreprise)
      ? await sb.schema('app').from('companies').select('name').eq('id', entreprise).eq('organization_id', me.organizationId).maybeSingle()
      : { data: null };

  const pdf = await construireConvocationGroupe(sb, seance, participants, (c as { name: string } | null)?.name ?? null);
  return new NextResponse(Buffer.from(pdf.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pdf.filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
