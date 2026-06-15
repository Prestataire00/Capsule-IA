// ARCHETYPE: command
// Justification: timeline des accès aux ressources du dossier — preuve Qualiopi.

import { Download, Clock, Eye, FileDown, AlertCircle } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';

export const dynamic = 'force-dynamic';

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
    <div className="space-y-6">
      {/* Hero header */}
      <header className="bg-gradient-to-br from-violet-50 to-violet-50/60 dark:from-violet-950/40 dark:to-violet-950/20 border border-violet-200/60 dark:border-violet-900/40 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap shadow-sm">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="w-10 h-10 rounded-lg bg-white dark:bg-zinc-900 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Clock className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </span>
          <div className="min-w-0">
            <SectionLabel className="mb-1">Traçabilité des accès</SectionLabel>
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-0.5">
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
            className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition shadow-sm inline-flex items-center gap-1.5 flex-shrink-0"
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
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <span className="w-14 h-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shadow-sm">
            {/* Illustration SVG — horloge vide */}
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-zinc-400 dark:text-zinc-500"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
          </span>
          <div className="text-center">
            <p className="text-[15px] font-medium text-zinc-700 dark:text-zinc-300">
              Aucun accès enregistré
            </p>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
              Les consultations et téléchargements de ressources apparaîtront ici.
            </p>
          </div>
        </div>
      )}

      {/* Timeline */}
      {!error && rows.length > 0 && (
        <div className="relative">
          {/* Ligne verticale timeline */}
          <div className="absolute left-[19px] top-0 bottom-0 w-px bg-zinc-200/60 dark:bg-zinc-800" />

          <ul className="space-y-0">
            {rows.map((row, i) => {
              const isView = row.action === 'view';
              return (
                <li
                  key={row.id ?? i}
                  className="relative grid grid-cols-[40px_1fr] gap-3 py-3 group"
                >
                  {/* Dot timeline */}
                  <div className="flex items-start justify-center pt-0.5">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm z-10 ${
                        isView
                          ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                          : 'bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400'
                      }`}
                    >
                      {isView ? (
                        <Eye className="w-2.5 h-2.5" />
                      ) : (
                        <FileDown className="w-2.5 h-2.5" />
                      )}
                    </span>
                  </div>

                  {/* Contenu */}
                  <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2.5 shadow-sm group-hover:shadow-md transition min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex items-center gap-2 flex-wrap">
                        <StatusPill tone={isView ? 'info' : 'neutral'}>
                          {isView ? 'consulté' : 'téléchargé'}
                        </StatusPill>
                        <span className="text-[13px] text-zinc-900 dark:text-zinc-100 truncate">
                          {targetLabel(row, resourceTitles)}
                        </span>
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
                          {targetKindLabel(row.target_kind)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {actorLabel(row.actor_kind)}
                        </span>
                        <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                          {formatDateFR(row.occurred_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Footer CSV si beaucoup d'entrées */}
      {!error && rows.length >= 50 && (
        <div className="flex justify-center pt-2">
          <a
            href={`/api/dossiers/${params.id}/tracabilite.csv`}
            className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition"
          >
            <Download className="w-3.5 h-3.5" />
            Télécharger l&apos;export complet CSV
          </a>
        </div>
      )}
    </div>
  );
}
