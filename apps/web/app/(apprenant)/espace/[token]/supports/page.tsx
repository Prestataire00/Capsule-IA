// ARCHETYPE: command
// Justification: l'apprenant retrouve les supports déposés par son formateur, séance par séance.

import { notFound } from 'next/navigation';
import { FileText, Link2, ExternalLink, BookOpen } from 'lucide-react';
import { SectionLabel } from '@/shared/ui/section-label';
import { loadSessionResources, type SessionResource } from '@/features/trainer-space/session-resources';
import { resolveAccesApprenant } from '../_sessions';
import { formatSessionDate } from '../_lib';

export const dynamic = 'force-dynamic';

const poids = (octets: number | null): string => {
  if (octets === null) return '';
  const mo = octets / (1024 * 1024);
  return mo >= 1 ? `${mo.toFixed(1)} Mo` : `${Math.max(1, Math.round(octets / 1024))} Ko`;
};

function SupportRow({ s }: { s: SessionResource }) {
  return (
    <li className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0 flex items-center gap-3">
        <span
          className={`w-8 h-8 rounded-md grid place-items-center flex-shrink-0 ${
            s.kind === 'lien'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
          }`}
        >
          {s.kind === 'lien' ? <Link2 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{s.title}</p>
          {s.description && <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{s.description}</p>}
          {!s.description && s.kind === 'fichier' && (
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">{poids(s.fileSizeBytes)}</p>
          )}
        </div>
      </div>
      {s.url && (
        <a
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="h-8 px-3 rounded-md text-[12px] font-medium inline-flex items-center gap-1.5 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 flex-shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Ouvrir
        </a>
      )}
    </li>
  );
}

export default async function EspaceSupportsPage({ params }: { params: { token: string } }) {
  const acces = await resolveAccesApprenant(params.token);
  if (!acces) notFound();

  const parSeance = await Promise.all(
    acces.seances.map(async (s) => ({ seance: s, supports: await loadSessionResources(s.id, { diffusablesSeulement: true }) })),
  );
  const avecSupports = parSeance.filter((p) => p.supports.length > 0);
  const total = avecSupports.reduce((n, p) => n + p.supports.length, 0);

  return (
    <div className="space-y-6">
      <header>
        <SectionLabel className="mb-2">Ma formation</SectionLabel>
        <h1 className="text-[24px] leading-none font-semibold text-zinc-900 dark:text-zinc-100">Supports de cours</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3">
          {total === 0
            ? 'Votre formateur n’a pas encore publié de support.'
            : `${total} support${total > 1 ? 's' : ''} mis à disposition par votre formateur.`}
        </p>
      </header>

      {avecSupports.length === 0 ? (
        <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-12 text-center">
          <span className="mx-auto mb-3 w-12 h-12 rounded-xl grid place-items-center bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            <BookOpen className="h-6 w-6" />
          </span>
          <p className="text-[13px] text-zinc-400">Les documents apparaîtront ici dès leur publication.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {avecSupports.map(({ seance, supports }) => (
            <section
              key={seance.id}
              className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                  {seance.title ?? `Séance du ${formatSessionDate(seance.startsAt)}`}
                </p>
                <p className="text-[11px] uppercase tracking-wider text-zinc-500 tabular-nums">
                  {formatSessionDate(seance.startsAt)}
                </p>
              </div>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {supports.map((s) => (
                  <SupportRow key={s.id} s={s} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
