// ARCHETYPE: command
// Justification: traçabilité des accès aux documents (ouvertures / téléchargements) —
// qui a consulté quoi, quand. Lecture de app.resource_access_log (RLS org).
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Eye, Download, FileSearch, FolderOpen } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { StatCard } from '@/shared/ui/stat-card';
import { EmptyState } from '@/shared/ui/empty-state';
import { SectionLabel } from '@/shared/ui/section-label';
import { IdPill } from '@/shared/ui/id-pill';

export const dynamic = 'force-dynamic';

type AccessRow = {
  id: string;
  target_kind: string;
  action: 'view' | 'download';
  actor_kind: 'learner_token' | 'user' | 'system';
  dossier_id: string | null;
  occurred_at: string;
  dossier: {
    reference: string | null;
    learner: { first_name: string; last_name: string } | null;
  } | null;
};

const ACTOR_LABELS: Record<string, string> = {
  learner_token: 'Apprenant (lien)',
  user: 'Staff',
  system: 'Système',
};

async function loadAccess(dossier?: string): Promise<AccessRow[]> {
  const sb = supabaseServer();
  let query = sb
    .schema('app')
    .from('resource_access_log' as never)
    .select(
      'id, target_kind, action, actor_kind, dossier_id, occurred_at, dossier:dossiers(reference, learner:learners(first_name, last_name))',
    )
    .eq('target_kind', 'document')
    .order('occurred_at', { ascending: false })
    .limit(500);
  if (dossier) query = query.eq('dossier_id', dossier);
  const { data } = await query;
  return (data ?? []) as unknown as AccessRow[];
}

export default async function TracabilitePage({
  searchParams,
}: {
  searchParams: { dossier?: string };
}) {
  const rows = await loadAccess(searchParams.dossier);

  const views = rows.filter((r) => r.action === 'view').length;
  const downloads = rows.filter((r) => r.action === 'download').length;
  const byLearner = rows.filter((r) => r.actor_kind === 'learner_token').length;
  const dossiers = new Set(rows.map((r) => r.dossier_id).filter(Boolean)).size;

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="mb-6">
        <SectionLabel className="mb-1">Suivi</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Traçabilité des documents
        </h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
          Qui a ouvert ou téléchargé les documents, et quand — preuve d&apos;accès (Qualiopi).
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Accès total" value={rows.length} icon={FileSearch} accent="violet" />
        <StatCard label="Ouvertures" value={views} icon={Eye} accent="blue" />
        <StatCard label="Téléchargements" value={downloads} icon={Download} accent="emerald" />
        <StatCard label="Par les apprenants" value={byLearner} icon={FolderOpen} accent="amber" />
      </div>

      {searchParams.dossier && (
        <div className="mb-4 flex items-center gap-2 text-[12px]">
          <span className="text-zinc-400">Filtré sur le dossier {searchParams.dossier.slice(0, 8)}</span>
          <a href="/tracabilite" className="text-violet-600 hover:underline">Tout afficher</a>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[150px_1fr_140px_130px_100px] gap-3 px-5 py-2.5 text-[10px] tracking-wider uppercase text-zinc-400 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
          <div>Date</div>
          <div>Dossier / apprenant</div>
          <div>Action</div>
          <div>Par</div>
          <div>Dossier</div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={FileSearch}
            title="Aucun accès enregistré"
            description="Les ouvertures et téléchargements de documents (espace apprenant, signatures, PDF) apparaîtront ici."
          />
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r) => {
              const learner = r.dossier?.learner;
              const who = learner ? `${learner.first_name} ${learner.last_name}`.trim() : null;
              return (
                <li
                  key={r.id}
                  className="grid grid-cols-[150px_1fr_140px_130px_100px] gap-3 px-5 py-3 items-center text-[13px]"
                >
                  <span className="tabular-nums text-[11px] text-zinc-500">
                    {format(parseISO(r.occurred_at), 'dd MMM HH:mm', { locale: fr })}
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300 truncate">
                    {r.dossier?.reference ?? '—'}
                    {who && <span className="text-zinc-400 dark:text-zinc-500"> · {who}</span>}
                  </span>
                  <span>
                    {r.action === 'download' ? (
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-emerald-600 dark:text-emerald-400">
                        <Download className="w-3.5 h-3.5" /> Téléchargé
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-blue-600 dark:text-blue-400">
                        <Eye className="w-3.5 h-3.5" /> Ouvert
                      </span>
                    )}
                  </span>
                  <span className="text-zinc-500 text-[12px]">
                    {ACTOR_LABELS[r.actor_kind] ?? r.actor_kind}
                  </span>
                  <span className="min-w-0">
                    {r.dossier_id ? (
                      <a href={`/dossiers/${r.dossier_id}`} className="hover:underline">
                        <IdPill>{r.dossier_id.slice(0, 8)}</IdPill>
                      </a>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
