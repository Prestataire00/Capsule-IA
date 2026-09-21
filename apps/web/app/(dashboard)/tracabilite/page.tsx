// ARCHETYPE: command
// Justification: traçabilité des accès aux documents (ouvertures / téléchargements) —
// qui a consulté quoi, quand. Lecture de app.resource_access_log (RLS org).
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Eye, Download, FileSearch, Users } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { KpiCard, AccentBar, ACCENTS } from '@/shared/ui/kpi-card';
import { EmptyState } from '@/shared/ui/empty-state';
import { SectionLabel } from '@/shared/ui/section-label';
import { IdPill } from '@/shared/ui/id-pill';

export const dynamic = 'force-dynamic';

const ROW_GRID = 'grid grid-cols-[120px_minmax(0,1.6fr)_130px_minmax(0,1fr)_96px] gap-4 px-5';

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

const ACTOR_PILLS: Record<string, string> = {
  learner_token: ACCENTS.rose.soft,
  user: ACCENTS.orange.soft,
  system: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
};

const AVATARS = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
];

async function loadAccess(dossier?: string): Promise<AccessRow[]> {
  const sb = supabaseServer();
  let query = sb
    .schema('app')
    .from('resource_access_log' as never)
    .select(
      'id, target_kind, action, actor_kind, dossier_id, occurred_at, dossier:dossiers(reference, learner:learners!dossiers_learner_id_fkey(first_name, last_name))',
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
    <div className="max-w-7xl w-full mx-auto px-8 py-9">
      <header className="mb-7">
        <SectionLabel className="mb-2">Suivi</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Traçabilité des documents</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3">
          Qui a ouvert ou téléchargé les documents, et quand — preuve d&apos;accès (Qualiopi).{' '}
          <span className="tabular-nums">
            {rows.length} accès · {dossiers} dossier{dossiers > 1 ? 's' : ''}
          </span>
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Accès total" value={rows.length} icon={FileSearch} accent="purple" hint="preuve d'accès Qualiopi" />
        <KpiCard label="Ouvertures" value={views} icon={Eye} accent="sky">
          <AccentBar value={views} max={rows.length} accent="sky" />
        </KpiCard>
        <KpiCard label="Téléchargements" value={downloads} icon={Download} accent="emerald">
          <AccentBar value={downloads} max={rows.length} accent="emerald" />
        </KpiCard>
        <KpiCard label="Par les apprenants" value={byLearner} icon={Users} accent="rose">
          <AccentBar value={byLearner} max={rows.length} accent="rose" />
        </KpiCard>
      </div>

      {searchParams.dossier && (
        <div className="mb-4 flex items-center gap-2 text-[12px]">
          <span className="text-zinc-500 dark:text-zinc-400">
            Filtré sur le dossier <span className="font-mono">{searchParams.dossier.slice(0, 8)}</span>
          </span>
          <a href="/tracabilite" className="font-semibold text-orange-600 dark:text-orange-400 hover:underline">Tout afficher</a>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
        <div className="min-w-[760px]">
          <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
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
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {rows.map((r) => {
                const learner = r.dossier?.learner;
                const who = learner ? `${learner.first_name} ${learner.last_name}`.trim() : null;
                return (
                  <li key={r.id} className={`${ROW_GRID} py-3.5 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                    <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                      {format(parseISO(r.occurred_at), 'dd MMM HH:mm', { locale: fr })}
                    </span>
                    <div className="min-w-0 flex items-center gap-3">
                      {who ? (
                        <span className={`w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${AVATARS[(who.charCodeAt(0) || 0) % AVATARS.length]}`}>
                          {who.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                      ) : (
                        <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS.orange.soft}`}>
                          <FileSearch className="w-4 h-4" />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-bold text-zinc-900 dark:text-zinc-100">{who ?? r.dossier?.reference ?? '—'}</p>
                        {who && r.dossier?.reference && (
                          <p className="truncate text-[12px] text-zinc-500 dark:text-zinc-400">{r.dossier.reference}</p>
                        )}
                      </div>
                    </div>
                    <span>
                      {r.action === 'download' ? (
                        <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2 py-0.5 rounded-full ${ACCENTS.emerald.soft}`}>
                          <Download className="w-3.5 h-3.5" /> Téléchargé
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold px-2 py-0.5 rounded-full ${ACCENTS.sky.soft}`}>
                          <Eye className="w-3.5 h-3.5" /> Ouvert
                        </span>
                      )}
                    </span>
                    <span>
                      <span className={`inline-flex items-center text-[12px] font-semibold px-2 py-0.5 rounded-full ${ACTOR_PILLS[r.actor_kind] ?? ACTOR_PILLS.system}`}>
                        {ACTOR_LABELS[r.actor_kind] ?? r.actor_kind}
                      </span>
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
    </div>
  );
}
