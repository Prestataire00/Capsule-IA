// ARCHETYPE: workflow
// Justification: l'organisme suit et relance la conversation entre le formateur et les participants.

import { notFound } from 'next/navigation';
import { BookOpen, FileText, Link2 } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { loadSession } from '@/features/sessions/load-session';
import { loadSessionMessages, markThreadRead } from '@/features/trainer-space/session-messages';
import { loadSessionResources } from '@/features/trainer-space/session-resources';
import { MessageThread } from '@/features/trainer-space/ui/message-thread';
import { MessageComposer } from '@/features/trainer-space/ui/message-composer.client';
import { peutValiderSupports, SUPPORT_STATUS_LABELS } from '@/features/trainer-space/support-status';
import { DecisionButtons } from '../../../supports/decision-buttons.client';
import { sendStaffMessage } from './actions';

export const dynamic = 'force-dynamic';

const STATUT_TON: Record<string, string> = {
  en_attente: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  valide: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  refuse: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
};

export default async function SessionMessagesPage({ params }: { params: { id: string } }) {
  // `loadSession` lit sous RLS : une séance d'une autre organisation n'existe pas ici.
  const loaded = await loadSession(supabaseServer(), params.id);
  if (!loaded) notFound();

  const me = await getCurrentMember();
  const peutValider = peutValiderSupports(me?.role);
  const [messages, supports] = await Promise.all([
    loadSessionMessages(params.id),
    loadSessionResources(params.id),
  ]);
  if (me) await markThreadRead(params.id, me.userId);

  async function envoyer(body: string) {
    'use server';
    return sendStaffMessage({ sessionId: params.id, body });
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">Conversation de la séance</h2>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
            Le formateur et les participants écrivent ici. Vos messages apparaissent au nom de l&apos;organisme.
          </p>
        </div>
        <MessageThread
          messages={messages}
          moi="organisme"
          vide="Aucun message pour l’instant."
        />
        <MessageComposer envoyer={envoyer} placeholder="Message au formateur et aux participants…" />
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-md grid place-items-center bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <BookOpen className="w-4 h-4" />
          </span>
          <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
            Supports déposés par le formateur{' '}
            {supports.length > 0 && <span className="text-zinc-400 tabular-nums font-normal">({supports.length})</span>}
          </h2>
        </div>
        {supports.length === 0 ? (
          <p className="text-[13px] text-zinc-400">Aucun support déposé pour cette séance.</p>
        ) : (
          <ul className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden">
            {supports.map((s) => (
              <li key={s.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                <span className="min-w-0 flex items-center gap-2.5">
                  {s.kind === 'lien' ? (
                    <Link2 className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-[13px] text-zinc-900 dark:text-zinc-100 truncate">{s.title}</span>
                    <span className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-flex items-center h-5 px-1.5 rounded text-[11px] font-semibold ${STATUT_TON[s.validationStatus]}`}>
                        {SUPPORT_STATUS_LABELS[s.validationStatus]}
                      </span>
                      {!s.isPublished && <span className="text-[12px] text-zinc-500">retiré par le formateur</span>}
                    </span>
                    {s.validationStatus === 'refuse' && s.rejectionReason && (
                      <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        Motif : {s.rejectionReason}
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex items-center gap-3 flex-shrink-0">
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] font-medium text-orange-600 dark:text-orange-400 hover:underline"
                    >
                      Ouvrir
                    </a>
                  )}
                  {peutValider && s.validationStatus === 'en_attente' && <DecisionButtons resourceId={s.id} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
