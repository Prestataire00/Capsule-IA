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
    <div className="max-w-6xl w-full mx-auto px-6 py-8">
      <header className="mb-6">
        <SectionLabel className="mb-1">Sécurité</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Audit log</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Toutes les modifications sensibles tracées avec acteur, IP et user-agent.
        </p>
      </header>

      <InfoCallout tone="info" className="mb-6">
        Le log d'audit est <strong>append-only</strong>. Conservation 10 ans pour les tables Qualiopi-critiques.
      </InfoCallout>

      <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
        {lignes.length === 0 ? (
          <li className="py-8 text-center text-[13px] text-zinc-500 dark:text-zinc-400">
            Aucune trace enregistrée pour l&apos;instant.
          </li>
        ) : (
          lignes.map((a) => (
            <li key={a.id} className="grid grid-cols-[140px_120px_180px_1fr_180px] gap-3 py-3 px-1 items-center text-[13px]">
              <span className="font-mono text-[11px] text-zinc-500">
                {format(parseISO(a.occurred_at), 'dd MMM HH:mm', { locale: fr })}
              </span>
              <StatusPill tone={actionTone[a.action]}>{actionLabel[a.action]}</StatusPill>
              <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                {a.schema_name}.{a.table_name}
              </span>
              <span className="text-zinc-700 dark:text-zinc-300 truncate">
                {a.row_id && <IdPill className="mr-2">{a.row_id.slice(0, 8)}</IdPill>}
              </span>
              <span className="text-zinc-500 dark:text-zinc-400 truncate font-mono text-[11px]">
                {a.actor_ip ?? '—'}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
