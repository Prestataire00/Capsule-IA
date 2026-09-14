// ARCHETYPE: workflow
// Justification: la conversation d'une séance, côté apprenant.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { loadSessionMessages } from '@/features/trainer-space/session-messages';
import { MessageThread } from '@/features/trainer-space/ui/message-thread';
import { MessageComposer } from '@/features/trainer-space/ui/message-composer.client';
import { resolveAccesApprenant } from '../../_sessions';
import { formatSessionDate, formatSessionTime } from '../../_lib';
import { sendLearnerMessage } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EspaceFilPage({ params }: { params: { token: string; sessionId: string } }) {
  const acces = await resolveAccesApprenant(params.token);
  if (!acces) notFound();
  const seance = acces.seances.find((s) => s.id === params.sessionId);
  if (!seance) notFound();

  const messages = await loadSessionMessages(params.sessionId);

  async function envoyer(body: string) {
    'use server';
    return sendLearnerMessage({ token: params.token, sessionId: params.sessionId, body });
  }

  return (
    <div className="space-y-5">
      <Link
        href={`/espace/${params.token}/messages`}
        className="text-[12px] text-zinc-500 inline-flex items-center gap-1.5 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        <ArrowLeft className="w-3 h-3" /> Toutes mes conversations
      </Link>

      <header>
        <p className="text-[11px] uppercase tracking-wider text-zinc-500 tabular-nums">
          {formatSessionDate(seance.startsAt)} · {formatSessionTime(seance.startsAt)} – {formatSessionTime(seance.endsAt)}
        </p>
        <h1 className="text-[22px] font-semibold text-zinc-900 dark:text-zinc-100">
          {seance.title ?? 'Séance'}
        </h1>
      </header>

      <MessageThread
        messages={messages}
        moi="apprenant"
        vide="Aucun message. Posez votre question, votre formateur la verra."
      />
      <MessageComposer envoyer={envoyer} placeholder="Votre message au formateur…" />
    </div>
  );
}
