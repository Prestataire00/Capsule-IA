import { NextResponse } from 'next/server';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { readCalendarToken } from '@/features/trainer-space/calendar-token';
import { loadSessionsByIds } from '@/features/trainer-space/my-sessions';
import { buildIcs } from '@/features/trainer-space/ics';

export const dynamic = 'force-dynamic';

const JOUR_MS = 24 * 60 * 60 * 1000;

// Flux d'agenda du formateur (abonnement Google Agenda, Apple Calendrier,
// Outlook). Gardé par son jeton signé ; ne contient aucune donnée d'apprenant.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const userId = readCalendarToken(env.TOKEN_SIGNING_KEY, params.token.replace(/\.ics$/, ''));
  if (!userId) return new NextResponse('Calendrier introuvable', { status: 404 });

  const admin = supabaseAdmin();
  const { data, error } = await admin.schema('app').rpc('trainer_session_ids' as never, { p_user_id: userId } as never);
  if (error) {
    console.error('[calendrier formateur] séances illisibles', error.message);
    return new NextResponse('Calendrier indisponible', { status: 500 });
  }

  const now = Date.now();
  const seances = await loadSessionsByIds(admin, (data ?? []) as string[], {
    from: new Date(now - 60 * JOUR_MS),
    to: new Date(now + 365 * JOUR_MS),
  });
  const base = (env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const ics = buildIcs(
    'Capsule IA — mes séances',
    seances.map((s) => ({
      uid: `${s.id}@capsule-ia`,
      start: new Date(s.startsAt),
      end: new Date(s.endsAt),
      summary: s.title,
      location: s.location ?? (s.remoteUrl ? 'Visio' : null),
      description: s.remoteUrl ? `Visio : ${s.remoteUrl}` : null,
      url: base ? `${base}/emarger/${s.id}` : null,
      cancelled: s.status === 'cancelled',
    })),
  );
  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="capsule-formateur.ics"',
      'Cache-Control': 'private, max-age=900',
    },
  });
}
