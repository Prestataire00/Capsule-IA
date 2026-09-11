import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { autoSendDue } from '@/features/attendance/link-recipients';
import { sendSheetLinks } from '@/features/attendance/send-links';

/**
 * Envoi automatique des liens d'émargement, de 30 minutes avant le début de
 * chaque demi-journée à 10 minutes après — pour les seuls organismes qui l'ont
 * activé (réglage désactivé par défaut). Idempotent : un apprenant ne reçoit
 * qu'un lien par feuille. Appelée toutes les 10 minutes par la base (0147).
 *
 * Secret CRON_SECRET dans l'en-tête Authorization uniquement : dans l'URL, il
 * finirait dans les journaux d'accès.
 */
export const dynamic = 'force-dynamic';

function autorise(req: Request): boolean {
  const recu = Buffer.from(req.headers.get('Authorization') ?? '');
  const attendu = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  return recu.length === attendu.length && timingSafeEqual(recu, attendu);
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
  if (orgErr) return { ok: false as const, error: 'lecture_impossible' };
  const orgIds = ((orgs ?? []) as { id: string }[]).map((o) => o.id);
  if (orgIds.length === 0) return { ok: true as const, sheets: 0, sent: 0 };

  // Séances commencées depuis moins de 12 h (l'après-midi démarre après) ou qui démarrent dans l'heure.
  const { data: sessions } = await sb
    .schema('app')
    .from('sessions')
    .select('id')
    .in('organization_id', orgIds)
    .neq('status', 'cancelled')
    .gte('starts_at', new Date(now.getTime() - 12 * 3600_000).toISOString())
    .lte('starts_at', new Date(now.getTime() + 3600_000).toISOString());

  let traitees = 0;
  let envoyes = 0;
  const erreurs: string[] = [];
  for (const s of (sessions ?? []) as { id: string }[]) {
    // Fenêtres de la base : pause déjeuner de l'organisme comprise.
    const { data: fenetres } = await sb.schema('app').rpc('attendance_session_windows' as never, { p_session_id: s.id } as never);
    for (const f of (fenetres ?? []) as { sheet_id: string; window_start: string }[]) {
      if (!autoSendDue(new Date(f.window_start), now)) continue;
      traitees++;
      try {
        const r = await sendSheetLinks(f.sheet_id, 'auto', env.PUBLIC_APP_URL);
        envoyes += r.sent;
        if (r.failed.length) erreurs.push(`${f.sheet_id}: ${r.failed.length} échec(s)`);
      } catch (e) {
        console.error('[cron émargement] envoi impossible', f.sheet_id, e);
        erreurs.push(`${f.sheet_id}: échec`);
      }
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
