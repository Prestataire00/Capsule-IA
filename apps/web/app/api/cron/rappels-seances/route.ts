import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { verifierSecretMachine } from '@/shared/lib/http/cron-auth';
import { reponseCron } from '@/shared/lib/http/cron-response';
import { envoyerRappelsSeances } from '@/features/sessions/rappels-seances';

/**
 * Rappels de séance 48 h et 2 h avant le début, à l'entreprise et au
 * formateur. Appelée toutes les 15 minutes par la base (0203) : le rappel
 * « 2 h » ne tient pas dans le passage quotidien des autres envois.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function tick() {
  return envoyerRappelsSeances(supabaseAdmin() as never);
}

export async function POST(req: Request) {
  if (!verifierSecretMachine(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  return reponseCron('rappels-seances', await tick());
}

export async function GET(req: Request) {
  if (!verifierSecretMachine(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  return reponseCron('rappels-seances', await tick());
}
