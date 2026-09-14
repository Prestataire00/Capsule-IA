// ARCHETYPE: workflow
// Justification: la conversation du formateur avec ses participants et l'organisme.

import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireMyTrainerSession } from '@/features/trainer-space/guard';
import { loadSession } from '@/features/sessions/load-session';
import { heure, jourLong } from '@/features/trainer-space/dates';
import { loadSessionMessages, markThreadRead } from '@/features/trainer-space/session-messages';
import { MessageThread } from '@/features/trainer-space/ui/message-thread';
import { MessageComposer } from '@/features/trainer-space/ui/message-composer.client';
import { SeanceNav } from '../_components/seance-nav';
import { sendTrainerMessage } from '../actions';

export const dynamic = 'force-dynamic';

export default async function SeanceMessagesPage({ params }: { params: { id: string } }) {
  const acces = await requireMyTrainerSession(params.id);
  if (!acces.ok) notFound();

  const admin = supabaseAdmin();
  const loaded = await loadSession(admin, params.id);
  if (!loaded) notFound();
  const { session, formation } = loaded;

  const messages = await loadSessionMessages(params.id);
  // Ouvrir le fil vaut lecture : le badge ne doit pas survivre à la visite.
  await markThreadRead(params.id, acces.userId);

  async function envoyer(body: string) {
    'use server';
    return sendTrainerMessage({ sessionId: params.id, body });
  }

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
      <SeanceNav
        sessionId={params.id}
        quand={`${jourLong(session.starts_at)} · ${heure(session.starts_at)} – ${heure(session.ends_at)}`}
        titre={formation?.title ?? session.title ?? 'Séance'}
        sousTitre="Visible par les participants de la séance et par l’organisme."
        actif="messages"
      />
      <MessageThread
        messages={messages}
        moi="formateur"
        vide="Aucun message. Présentez-vous, envoyez le lien de visio, annoncez le programme."
      />
      <MessageComposer envoyer={envoyer} placeholder="Message aux participants…" />
    </div>
  );
}
