// ARCHETYPE: command
// Justification: l'apprenant voit ses conversations de séance et en ouvre une.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MessagesSquare, ChevronRight } from 'lucide-react';
import { SectionLabel } from '@/shared/ui/section-label';
import { loadSessionMessages } from '@/features/trainer-space/session-messages';
import { resolveAccesApprenant } from '../_sessions';
import { formatSessionDate } from '../_lib';

export const dynamic = 'force-dynamic';

const horodatage = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export default async function EspaceMessagesPage({ params }: { params: { token: string } }) {
  const acces = await resolveAccesApprenant(params.token);
  if (!acces) notFound();

  const fils = await Promise.all(
    acces.seances.map(async (s) => {
      const messages = await loadSessionMessages(s.id, 50);
      return { seance: s, nombre: messages.length, dernier: messages[messages.length - 1] ?? null };
    }),
  );
  // La séance la plus récente d'abord : c'est là que la conversation est vivante.
  const ordonnees = [...fils].reverse();

  return (
    <div className="space-y-6">
      <header>
        <SectionLabel className="mb-2">Ma formation</SectionLabel>
        <h1 className="text-[26px] leading-none font-semibold text-zinc-900 dark:text-zinc-100">Messages</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3">
          Posez vos questions à votre formateur. Votre organisme voit aussi la conversation.
        </p>
      </header>

      {ordonnees.length === 0 ? (
        <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-12 text-center">
          <span className="mx-auto mb-3 w-12 h-12 rounded-xl grid place-items-center bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <MessagesSquare className="h-6 w-6" />
          </span>
          <p className="text-[13px] text-zinc-400">Aucune séance planifiée pour l’instant.</p>
        </div>
      ) : (
        <ul className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden">
          {ordonnees.map(({ seance, nombre, dernier }) => (
            <li key={seance.id}>
              <Link
                href={`/espace/${params.token}/messages/${seance.id}`}
                className="px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {seance.title ?? `Séance du ${formatSessionDate(seance.startsAt)}`}
                  </p>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                    {dernier ? (
                      <>
                        <span className="tabular-nums">{horodatage.format(new Date(dernier.createdAt))}</span>
                        {' · '}
                        {dernier.authorName} : {dernier.body.slice(0, 80)}
                      </>
                    ) : (
                      'Aucun message — écrivez le premier.'
                    )}
                  </p>
                </div>
                <span className="flex items-center gap-2 flex-shrink-0">
                  {nombre > 0 && (
                    <span className="text-[11px] font-semibold tabular-nums px-2 h-6 rounded-md grid place-items-center bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {nombre}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
