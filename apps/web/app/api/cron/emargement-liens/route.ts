import { NextResponse } from 'next/server';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { halfDayWindow, type HalfDay } from '@/features/attendance/half-day-window';
import { autoSendDue } from '@/features/attendance/link-recipients';
import { sendSheetLinks } from '@/features/attendance/send-links';

/**
 * Envoi automatique des liens d'émargement, de 30 minutes avant le début de
 * chaque demi-journée à 10 minutes après — pour les seuls organismes qui l'ont
 * activé (réglage désactivé par défaut). Idempotent : un apprenant ne reçoit
 * qu'un lien par feuille. À appeler toutes les 10 minutes.
 *
 * Protégé par CRON_SECRET.
 */
export const dynamic = 'force-dynamic';

function autorise(req: Request): boolean {
  if (req.headers.get('Authorization') === `Bearer ${env.CRON_SECRET}`) return true;
  return new URL(req.url).searchParams.get('secret') === env.CRON_SECRET;
}

async function tick() {
  if (!env.PUBLIC_APP_URL) return { ok: false as const, error: 'public_app_url_missing' };
  const sb = supabaseAdmin();
  const now = new Date();

  const { data: orgs, error: orgErr } = await sb
    .schema('app')
    .from('organizations')
    .select('id')
    .eq('attendance_auto_send' as never, true as never)
    .is('deleted_at', null);
  if (orgErr) return { ok: false as const, error: orgErr.message };
  const orgIds = ((orgs ?? []) as { id: string }[]).map((o) => o.id);
  if (orgIds.length === 0) return { ok: true as const, sheets: 0, sent: 0 };

  // Séances commencées depuis moins de 12 h (l'après-midi démarre après) ou qui démarrent dans l'heure.
  const { data: sessions } = await sb
    .schema('app')
    .from('sessions')
    .select('id, starts_at, ends_at')
    .in('organization_id', orgIds)
    .neq('status', 'cancelled')
    .gte('starts_at', new Date(now.getTime() - 12 * 3600_000).toISOString())
    .lte('starts_at', new Date(now.getTime() + 3600_000).toISOString());
  const parId = new Map(((sessions ?? []) as { id: string; starts_at: string; ends_at: string }[]).map((s) => [s.id, s]));
  if (parId.size === 0) return { ok: true as const, sheets: 0, sent: 0 };

  const { data: sheets } = await sb
    .schema('app')
    .from('attendance_sheets')
    .select('id, session_id, half_day')
    .in('session_id', [...parId.keys()])
    .neq('status', 'finalized');

  let traitees = 0;
  let envoyes = 0;
  const erreurs: string[] = [];
  for (const sh of (sheets ?? []) as { id: string; session_id: string; half_day: HalfDay | null }[]) {
    const s = parId.get(sh.session_id);
    if (!s) continue;
    const fenetre = halfDayWindow(new Date(s.starts_at), new Date(s.ends_at), sh.half_day ?? 'full');
    if (!autoSendDue(fenetre.start, now)) continue;
    traitees++;
    try {
      const r = await sendSheetLinks(sh.id, 'auto', env.PUBLIC_APP_URL);
      envoyes += r.sent;
      if (r.failed.length) erreurs.push(`${sh.id}: ${r.failed.length} échec(s)`);
    } catch (e) {
      erreurs.push(`${sh.id}: ${(e as Error).message}`);
    }
  }
  return { ok: true as const, sheets: traitees, sent: envoyes, errors: erreurs };
}

export async function POST(req: Request) {
  if (!autorise(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await tick());
}

export async function GET(req: Request) {
  if (!autorise(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await tick());
}
