// ARCHETYPE: command
// Justification: dossiers confiés au formateur — ce qu'il doit gérer, sans la partie financière.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Building2, CalendarClock, Clock, FolderOpen, MapPin, User } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { hasTrainerSpace } from '@/shared/lib/auth/landing';
import { StatusPill } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { loadMyDossiers } from '@/features/trainer-space/my-dossiers';
import { Chip, CarreIcone } from '@/features/trainer-space/ui/chip';

export const dynamic = 'force-dynamic';

/** Date de dossier (colonne DATE) : pas de fuseau à appliquer, on formate la chaîne. */
const jourCourt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const MODALITE: Record<string, string> = { presentiel: 'Présentiel', distanciel: 'Distanciel', hybride: 'Hybride' };

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
    <div className="max-w-2xl w-full mx-auto px-4 py-6 space-y-4">
      <header className="rounded-2xl border border-orange-100 dark:border-orange-900/40 bg-gradient-to-br from-orange-50 via-white to-sky-50 dark:from-orange-950/40 dark:via-zinc-900 dark:to-sky-950/30 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl grid place-items-center text-white bg-orange-500 shadow-md shadow-orange-500/30 shrink-0">
            <FolderOpen className="w-5 h-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Mes dossiers</h1>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
              {dossiers.length} dossier{dossiers.length > 1 ? 's' : ''} confié{dossiers.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-3">
          Les affaires qui vous sont confiées : client, apprenants, séances et émargement. Les éléments financiers
          (tarifs, devis, factures) restent chez l’organisme.
        </p>
      </header>

      {dossiers.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Aucun dossier confié"
          description="Dès que l’organisme vous confie une affaire, elle apparaît ici avec son client, ses apprenants et ses séances."
        />
      ) : (
        <ul className="space-y-3">
          {dossiers.map((d) => {
            const st = STATUT[d.status] ?? { label: d.status, tone: 'neutral' as const };
            return (
              <li key={d.id}>
                <Link
                  href={`/mes-dossiers/${d.id}`}
                  className="block rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm hover:shadow-md hover:border-orange-300 dark:hover:border-orange-800 transition"
                >
                  <div className="flex items-start gap-3">
                    <CarreIcone accent="teal" icon={Building2} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {d.formationTitle ?? 'Formation'}
                      </p>
                      <p className="text-[13px] text-zinc-600 dark:text-zinc-400 truncate">
                        {d.companyName ?? d.learnerName ?? 'Client non renseigné'}
                      </p>
                    </div>
                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <Chip accent="blue" icon={CalendarClock}>
                      {jourCourt(d.startDate)} → {jourCourt(d.endDate)}
                    </Chip>
                    {d.totalHours != null && (
                      <Chip accent="teal" icon={Clock}>
                        {Number(d.totalHours)} h
                      </Chip>
                    )}
                    <Chip accent="sky" icon={MapPin}>
                      {MODALITE[d.modality] ?? d.modality}
                    </Chip>
                    {d.learnerName && d.companyName && (
                      <Chip accent="rose" icon={User}>
                        {d.learnerName}
                      </Chip>
                    )}
                    <IdPill className="ml-auto">{d.reference}</IdPill>
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
