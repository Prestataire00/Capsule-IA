// ARCHETYPE: workflow (mobile) — le stagiaire a scanné le QR du questionnaire de satisfaction projeté en salle.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { checkRoomCode, readLearnerCookie, roomPass } from '@/features/attendance/room-code';
import { LEARNER_COOKIE } from '@/features/attendance/room';
import { loadSession } from '@/features/sessions/load-session';
import { cleSalleSatisfaction, lienSatisfactionEnSalle } from '@/features/questionnaire/satisfaction-salle';
import { IdentificationSatisfaction } from './identification.client';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Scan du QR projeté : un code de moins de vingt secondes prouve la présence
 * en salle. Un stagiaire déjà reconnu sur ce téléphone (à l'émargement par
 * QR) va droit à son questionnaire ; sinon il donne son nom.
 */
export default async function SatisfactionSallePage({
  params,
  searchParams,
}: {
  params: { sessionId: string };
  searchParams: { c?: string };
}) {
  const now = Date.now();
  const cle = cleSalleSatisfaction(params.sessionId);
  if (!UUID.test(params.sessionId) || !checkRoomCode(env.TOKEN_SIGNING_KEY, cle, searchParams.c, now)) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-[380px] text-center space-y-2">
          <RefreshCw className="w-8 h-8 mx-auto text-amber-500" />
          <h1 className="text-[22px] font-semibold text-zinc-900 dark:text-zinc-100">QR code expiré</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Le code affiché par votre formateur change toutes les dix secondes. Scannez à nouveau celui qui est à l’écran.
          </p>
        </div>
      </div>
    );
  }

  const learnerId = readLearnerCookie(env.TOKEN_SIGNING_KEY, cookies().get(LEARNER_COOKIE)?.value, now);
  if (learnerId) {
    const url = await lienSatisfactionEnSalle(params.sessionId, learnerId);
    if (url) redirect(url);
  }

  const loaded = await loadSession(supabaseAdmin(), params.sessionId);
  return (
    <IdentificationSatisfaction
      sessionId={params.sessionId}
      pass={roomPass(env.TOKEN_SIGNING_KEY, cle, now)}
      titre={loaded?.formation?.title ?? loaded?.session.title ?? 'Votre formation'}
    />
  );
}
