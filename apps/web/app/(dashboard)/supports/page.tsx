// ARCHETYPE: command
// Justification: file de validation — l'administration ouvre ou refuse les supports
// déposés par les formateurs avant qu'ils n'atteignent les apprenants.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BookCheck, FileText, Link2, ExternalLink, ShieldCheck } from 'lucide-react';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { SectionLabel } from '@/shared/ui/section-label';
import { loadSupportsAValider } from '@/features/trainer-space/session-resources';
import { peutValiderSupports } from '@/features/trainer-space/support-status';
import { DecisionButtons } from './decision-buttons.client';

export const dynamic = 'force-dynamic';

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const jourFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });

const poids = (octets: number | null): string => {
  if (octets === null) return '';
  const mo = octets / (1024 * 1024);
  return mo >= 1 ? `${mo.toFixed(1)} Mo` : `${Math.max(1, Math.round(octets / 1024))} Ko`;
};

export default async function SupportsAValiderPage() {
  const me = await getCurrentMember();
  // La garde centrale filtre déjà sur la section ; celle-ci nomme la vraie règle.
  if (!peutValiderSupports(me?.role)) redirect('/');

  const supports = await loadSupportsAValider(me!.organizationId);

  return (
    <div className="max-w-5xl w-full mx-auto px-8 py-9">
      <header className="mb-7">
        <SectionLabel className="mb-2">Pédagogie</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Supports à valider</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3 max-w-2xl">
          Rien de ce qu&apos;un formateur dépose n&apos;atteint les apprenants sans votre accord. Ouvrez le document,
          puis validez — ou refusez en disant pourquoi.
        </p>
      </header>

      {supports.length === 0 ? (
        <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-16 text-center">
          <span className="mx-auto mb-3 w-12 h-12 rounded-xl grid place-items-center bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <BookCheck className="h-6 w-6" />
          </span>
          <p className="text-[13px] text-zinc-400">Aucun support en attente. Tout est à jour.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {supports.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border border-amber-200/70 dark:border-amber-900/50 bg-white dark:bg-zinc-900 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex items-start gap-3">
                  <span
                    className={`w-9 h-9 rounded-md grid place-items-center flex-shrink-0 ${
                      s.kind === 'lien'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                    }`}
                  >
                    {s.kind === 'lien' ? <Link2 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">{s.title}</p>
                    {s.description && (
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{s.description}</p>
                    )}
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Déposé par <span className="font-medium text-zinc-700 dark:text-zinc-300">{s.authorName}</span>
                      {' · '}
                      <span className="tabular-nums">{dateFmt.format(new Date(s.submittedAt))}</span>
                      {s.kind === 'fichier' && s.fileSizeBytes !== null && (
                        <>
                          {' · '}
                          <span className="tabular-nums">{poids(s.fileSizeBytes)}</span>
                        </>
                      )}
                    </p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                      <Link href={`/sessions/${s.sessionId}`} className="text-orange-600 dark:text-orange-400 hover:underline">
                        {s.sessionTitle ?? 'Séance'}
                      </Link>
                      {s.sessionStartsAt && (
                        <>
                          {' · '}
                          <span className="tabular-nums">{jourFmt.format(new Date(s.sessionStartsAt))}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="h-8 px-3 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex-shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Examiner
                  </a>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap border-t border-zinc-100 dark:border-zinc-800 pt-3">
                <span className="text-[12px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" /> Vérifiez la source, les droits et la conformité au programme.
                </span>
                <DecisionButtons resourceId={s.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
