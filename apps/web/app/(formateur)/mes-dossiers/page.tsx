// ARCHETYPE: command
// Justification: dossiers confiés au formateur — ce qu'il doit gérer, sans la partie financière.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Building2, CalendarClock, FolderOpen, User } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { hasTrainerSpace } from '@/shared/lib/auth/landing';
import { StatusPill } from '@/shared/ui/status-pill';
import { loadMyDossiers } from '@/features/trainer-space/my-dossiers';

export const dynamic = 'force-dynamic';

/** Date de dossier (colonne DATE) : pas de fuseau à appliquer, on formate la chaîne. */
const jourCourt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const STATUT: Record<string, { label: string; tone: 'info' | 'success' | 'neutral' | 'warning' | 'danger' }> = {
  draft: { label: 'Brouillon', tone: 'neutral' },
  pending_validation: { label: 'À valider', tone: 'warning' },
  scheduled: { label: 'Planifié', tone: 'info' },
  active: { label: 'En cours', tone: 'success' },
  completed: { label: 'Terminé', tone: 'neutral' },
  closed: { label: 'Clos', tone: 'neutral' },
  archived: { label: 'Archivé', tone: 'neutral' },
  cancelled: { label: 'Annulé', tone: 'danger' },
};

export default async function MesDossiersPage() {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || !(await hasTrainerSpace(user.id))) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dossiers = await loadMyDossiers(sb as any);

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Mes dossiers</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Les affaires qui vous sont confiées : client, apprenants, séances et émargement. Les éléments financiers
          (tarifs, devis, factures) restent chez l’organisme.
        </p>
      </header>

      {dossiers.length === 0 ? (
        <p className="text-[13px] text-zinc-400 text-center py-10">
          Aucun dossier ne vous est confié pour l’instant.
        </p>
      ) : (
        <ul className="space-y-3">
          {dossiers.map((d) => {
            const st = STATUT[d.status] ?? { label: d.status, tone: 'neutral' as const };
            return (
              <li key={d.id}>
                <Link
                  href={`/mes-dossiers/${d.id}`}
                  className="block rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3.5 hover:border-orange-300 dark:hover:border-orange-800 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {d.formationTitle ?? 'Formation'}
                      </p>
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span className="inline-flex items-center gap-1">
                          <FolderOpen className="w-3 h-3" aria-hidden />
                          <span className="tabular-nums">{d.reference}</span>
                        </span>
                        {d.companyName && (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="w-3 h-3" aria-hidden /> {d.companyName}
                          </span>
                        )}
                        {d.learnerName && (
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3 h-3" aria-hidden /> {d.learnerName}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <CalendarClock className="w-3 h-3" aria-hidden />
                          {jourCourt(d.startDate)} → {jourCourt(d.endDate)}
                        </span>
                      </p>
                    </div>
                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
