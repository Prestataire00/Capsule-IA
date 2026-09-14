import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { loadDisponibilitesDuJour } from '@/features/trainer-space/availability-store';

/**
 * Disponibilités des formateurs sur un créneau, pour l'écran de planification.
 *
 * Route d'API : le middleware ne la protège pas, la garde est donc explicite —
 * membre connecté, et lecture de la section qui planifie les séances.
 */

export const dynamic = 'force-dynamic';

const schema = z.object({
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
});

export async function GET(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  if (can(me.role, 'dossiers') === 'none') {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const p = schema.safeParse({
    startsAt: url.searchParams.get('startsAt'),
    endsAt: url.searchParams.get('endsAt'),
  });
  if (!p.success) return NextResponse.json({ ok: false, error: 'invalid_range' }, { status: 400 });
  if (Date.parse(p.data.endsAt) <= Date.parse(p.data.startsAt)) {
    return NextResponse.json({ ok: false, error: 'invalid_range' }, { status: 400 });
  }

  const formateurs = await loadDisponibilitesDuJour({
    organizationId: me.organizationId,
    startsAt: p.data.startsAt,
    endsAt: p.data.endsAt,
  });
  return NextResponse.json({ ok: true, formateurs });
}
