import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { verifierSecretMachine } from '@/shared/lib/http/cron-auth';
import { reponseCron } from '@/shared/lib/http/cron-response';
import { envoyerRappelsSeances } from '@/features/sessions/rappels-seances';
import { envoyerFichesAvantSeance } from '@/features/questionnaire/positionnement-avant-seance';
import { relancerReferentsSatisfaction } from '@/features/questionnaire/relance-satisfaction-referent';

/**
 * Rappels de séance 48 h et 2 h avant le début, à l'entreprise et au
 * formateur ; fiche de positionnement 24 h avant aux stagiaires qui ne l'ont
 * pas remplie ; 24 h après la dernière séance, relance de satisfaction au
 * référent pour ses stagiaires sans réponse. Appelée toutes les 15 minutes par la base (0203) : le rappel
 * « 2 h » ne tient pas dans le passage quotidien des autres envois.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function tick() {
  const sb = supabaseAdmin() as never;
  const [rappels, fiches, satisfaction] = await Promise.all([
    envoyerRappelsSeances(sb),
    envoyerFichesAvantSeance(sb),
    relancerReferentsSatisfaction(sb),
  ]);
  return { rappels, fiches, satisfaction };
}

export async function POST(req: Request) {
  if (!verifierSecretMachine(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  return reponseCron('rappels-seances', await tick());
}

export async function GET(req: Request) {
  if (!verifierSecretMachine(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  return reponseCron('rappels-seances', await tick());
}
