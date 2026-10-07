// ARCHETYPE: workflow (mobile) — le stagiaire a scanné le QR d'un questionnaire de la séance projeté en salle.
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { env } from '@/env.mjs';
import { checkRoomCode, readLearnerCookie, roomPass } from '@/features/attendance/room-code';
import { LEARNER_COOKIE } from '@/features/attendance/room';
import { cleSalleQuestionnaire, lienQuestionnaireEnSalle, modeleProjetable } from '@/features/questionnaire/questionnaire-salle';
import { IdentificationSatisfaction } from '../../../satisfaction/[sessionId]/identification.client';

export const dynamic = 'force-dynamic';

/** Même parcours que la satisfaction projetée : code de la salle, puis le nom, puis la réponse. */
export default async function QuestionnaireSallePage({
  params,
  searchParams,
}: {
  params: { sessionId: string; templateId: string };
  searchParams: { c?: string };
}) {
  const now = Date.now();
  const cle = cleSalleQuestionnaire(params.sessionId, params.templateId);
  const projetable = await modeleProjetable(params.sessionId, params.templateId);
  if (!projetable || !checkRoomCode(env.TOKEN_SIGNING_KEY, cle, searchParams.c, now)) {
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
    const url = await lienQuestionnaireEnSalle(params.sessionId, params.templateId, learnerId);
    if (url) redirect(url);
  }

  return (
    <IdentificationSatisfaction
      sessionId={params.sessionId}
      templateId={params.templateId}
      pass={roomPass(env.TOKEN_SIGNING_KEY, cle, now)}
      titre={projetable.modele.title}
    />
  );
}
