// ARCHETYPE: command
// Justification: log d'audit append-only — densité, recherche, traces horodatées.

import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { SectionLabel } from '@/shared/ui/section-label';
import { IdPill } from '@/shared/ui/id-pill';
import { StatusPill } from '@/shared/ui/status-pill';
import { InfoCallout } from '@/shared/ui/info-callout';
import { requireAccess } from '@/shared/lib/auth/require-access';

const actionLabel = { insert: 'création', update: 'modification', delete: 'suppression' };
const actionTone = { insert: 'success', update: 'info', delete: 'danger' } as const;

const ROW_GRID = 'grid grid-cols-[120px_130px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-5';

type LigneAudit = {
  id: string;
  occurred_at: string;
  action: 'insert' | 'update' | 'delete';
  schema_name: string;
  table_name: string;
  row_id: string | null;
  actor_user_id: string | null;
  actor_ip: string | null;
};

export default async function AuditPage() {
  await requireAccess('settings');

  // Cette page affichait un journal de démonstration — huit lignes figées,
  // identiques pour tous les organismes — alors que `audit.audit_log` existe et
  // se remplit réellement (audit CAP-28).
  const me = await getCurrentMember();
  const { data, error } = me
    ? await supabaseAdmin()
        .schema('audit')
        .from('audit_log' as never)
        .select('id, occurred_at, action, schema_name, table_name, row_id, actor_user_id, actor_ip')
        .eq('organization_id' as never, me.organizationId as never)
        .order('occurred_at', { ascending: false })
        .limit(100)
    : { data: [], error: null };
  if (error) console.error('[audit] lecture du journal échouée', error.message);
  const lignes = (data ?? []) as unknown as LigneAudit[];

  return (
    <div className="max-w-6xl w-full mx-auto px-8 py-9">
      <header className="mb-7">
        <SectionLabel className="mb-2">Sécurité</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Audit log</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
          Toutes les modifications sensibles tracées avec acteur, IP et user-agent.{' '}
          <span className="tabular-nums">
            {lignes.length} trace{lignes.length > 1 ? 's' : ''} récente{lignes.length > 1 ? 's' : ''}
          </span>
        </p>
      </header>

      <InfoCallout tone="info" className="mb-6">
        Le log d'audit est <strong>append-only</strong>. Conservation 10 ans pour les tables Qualiopi-critiques.
      </InfoCallout>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
        <div className="min-w-[760px]">
          <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
            <div>Date</div>
            <div>Action</div>
            <div>Table</div>
            <div>Enregistrement</div>
            <div>Adresse IP</div>
          </div>
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {lignes.length === 0 ? (
              <li className="py-8 text-center text-[13px] text-zinc-500 dark:text-zinc-400">
                Aucune trace enregistrée pour l&apos;instant.
              </li>
            ) : (
              lignes.map((a) => (
                <li key={a.id} className={`${ROW_GRID} py-3.5 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                  <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                    {format(parseISO(a.occurred_at), 'dd MMM HH:mm', { locale: fr })}
                  </span>
                  <div>
                    <StatusPill tone={actionTone[a.action]}>{actionLabel[a.action]}</StatusPill>
                  </div>
                  <span className="font-mono text-[12px] font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {a.schema_name}.{a.table_name}
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300 truncate">
                    {a.row_id ? <IdPill>{a.row_id.slice(0, 8)}</IdPill> : <span className="text-zinc-400">—</span>}
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400 truncate font-mono text-[12px]">
                    {a.actor_ip ?? '—'}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
