// ARCHETYPE: command
// Justification: timeline des accès aux ressources du dossier — preuve Qualiopi.

import { Download, Clock, Eye, FileDown, AlertCircle, ShieldCheck } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { StatusPill } from '@/shared/ui/status-pill';
import { EmptyState } from '@/shared/ui/empty-state';

export const dynamic = 'force-dynamic';

const ROW_GRID = 'grid grid-cols-[120px_minmax(0,2.2fr)_100px_120px_150px] gap-4 px-5';

type AccessRow = {
  id: string;
  occurred_at: string;
  action: 'view' | 'download';
  target_kind: 'document' | 'module_resource' | 'replay';
  target_id: string;
  actor_kind: 'learner_token' | 'system' | 'user';
  learner_id: string | null;
};

type ModuleResourceRow = {
  id: string;
  title: string;
};

function formatDateFR(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function actorLabel(kind: string): string {
  switch (kind) {
    case 'learner_token':
      return 'Apprenant';
    case 'system':
      return 'Système';
    case 'user':
      return 'Gestionnaire';
    default:
      return kind;
  }
}

function targetLabel(
  row: AccessRow,
  resourceTitles: Map<string, string>,
): string {
  if (row.target_kind === 'document') return 'Document';
  if (row.target_kind === 'replay') return 'Replay';
  if (row.target_kind === 'module_resource') {
    const title = resourceTitles.get(row.target_id);
    return title ?? `Support ${row.target_id.slice(0, 8)}…`;
  }
  return row.target_id.slice(0, 8) + '…';
}

function targetKindLabel(kind: string): string {
  switch (kind) {
    case 'document':
      return 'Document';
    case 'module_resource':
      return 'Support';
    case 'replay':
      return 'Replay';
    default:
      return kind;
  }
}

export default async function TracabilitePage({
  params,
}: {
  params: { id: string };
}) {
  const sb = supabaseServer();

  const { data: rawRows, error } = await sb
    .schema('app')
    .from('resource_access_log' as never)
    .select('id, occurred_at, action, target_kind, target_id, actor_kind, learner_id')
    .eq('dossier_id', params.id)
    .order('occurred_at', { ascending: false })
    .limit(500);

  const rows = (rawRows as unknown as AccessRow[]) ?? [];

  // Jointure applicative : récupérer les titres des module_resources référencés.
  const moduleResourceIds = [
    ...new Set(
      rows
        .filter((r) => r.target_kind === 'module_resource')
        .map((r) => r.target_id),
    ),
  ];

  const resourceTitles = new Map<string, string>();
  if (moduleResourceIds.length > 0) {
    const { data: resources } = await sb
      .schema('app')
      .from('module_resources' as never)
      .select('id, title')
      .in('id', moduleResourceIds);

    for (const res of (resources as unknown as ModuleResourceRow[]) ?? []) {
      resourceTitles.set(res.id, res.title);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex items-start gap-3">
          <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS.purple.soft}`}>
            <ShieldCheck className="w-4 h-4" />
          </span>
          <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <SectionLabel>Traçabilité des accès</SectionLabel>
            {rows.length > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.purple.soft}`}>{rows.length}</span>
            )}
          </div>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            {error
              ? 'Erreur lors du chargement des données.'
              : rows.length === 0
                ? 'Aucun accès enregistré pour le moment.'
                : `${rows.length} entrée${rows.length > 1 ? 's' : ''} · preuve Qualiopi`}
          </p>
          </div>
        </div>
        {rows.length > 0 && (
          <a
            href={`/api/dossiers/${params.id}/tracabilite.csv`}
            className="h-9 border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-[13px] font-semibold px-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition inline-flex items-center gap-1.5 flex-shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Exporter CSV
          </a>
        )}
      </header>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 rounded-lg px-4 py-3 text-[13px] text-red-700 dark:text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Impossible de charger la traçabilité : {error.message}</span>
        </div>
      )}

      {/* Empty state */}
      {!error && rows.length === 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
          <EmptyState
            icon={Clock}
            title="Aucun accès enregistré"
            description="Les consultations et téléchargements de ressources apparaîtront ici."
          />
        </div>
      )}

      {/* Journal des accès */}
      {!error && rows.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
          <div className="min-w-[760px]">
            <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
              <div>Action</div>
              <div>Ressource</div>
              <div>Type</div>
              <div>Acteur</div>
              <div className="text-right">Date</div>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {rows.map((row, i) => {
                const isView = row.action === 'view';
                return (
                  <li key={row.id ?? i} className={`${ROW_GRID} py-3.5 items-center hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                    <div>
                      <StatusPill tone={isView ? 'info' : 'neutral'}>{isView ? 'consulté' : 'téléchargé'}</StatusPill>
                    </div>
                    <div className="min-w-0 flex items-center gap-2">
                      {isView ? (
                        <Eye className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                      ) : (
                        <FileDown className="w-3.5 h-3.5 shrink-0 text-zinc-400" />
                      )}
                      <span className="truncate text-[15px] font-bold text-zinc-900 dark:text-zinc-100">{targetLabel(row, resourceTitles)}</span>
                    </div>
                    <div className="text-[13px] text-zinc-600 dark:text-zinc-400">{targetKindLabel(row.target_kind)}</div>
                    <div className="text-[13px] text-zinc-600 dark:text-zinc-400">{actorLabel(row.actor_kind)}</div>
                    <div className="text-right text-[13px] tabular-nums text-zinc-700 dark:text-zinc-300">{formatDateFR(row.occurred_at)}</div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Footer CSV si beaucoup d'entrées */}
      {!error && rows.length >= 50 && (
        <div className="flex justify-center pt-2">
          <a
            href={`/api/dossiers/${params.id}/tracabilite.csv`}
            className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            Télécharger l&apos;export complet CSV
          </a>
        </div>
      )}
    </div>
  );
}
