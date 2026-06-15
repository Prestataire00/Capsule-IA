// ARCHETYPE: command
// Justification: journal d'audit append-only des envois email — densité, filtres,
// traces horodatées, drill-down par dossier/statut.

import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Mail, MailX, Inbox } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { StatCard } from '@/shared/ui/stat-card';
import { StatusPill } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { SectionLabel } from '@/shared/ui/section-label';

export const dynamic = 'force-dynamic';

type EmailLogRow = {
  id: string;
  organization_id: string | null;
  dossier_id: string | null;
  kind: string | null;
  recipient: string;
  subject: string | null;
  status: 'sent' | 'failed';
  provider_id: string | null;
  error: string | null;
  sent_at: string;
};

type SearchParams = { dossier?: string; status?: string };

// Lecture via supabaseServer() (RLS) : un membre ne voit que les traces de son org
// (policy email_log_member_read). Filtres facultatifs depuis un futur drill-down.
async function loadEmailLog(params: SearchParams): Promise<EmailLogRow[]> {
  const sb = supabaseServer();
  let query = sb
    .schema('app')
    .from('email_log' as never)
    .select(
      'id, organization_id, dossier_id, kind, recipient, subject, status, provider_id, error, sent_at',
    )
    .order('sent_at', { ascending: false })
    .limit(500);

  if (params.dossier) query = query.eq('dossier_id', params.dossier);
  if (params.status === 'sent' || params.status === 'failed') {
    query = query.eq('status', params.status);
  }

  const { data } = await query;
  return (data ?? []) as unknown as EmailLogRow[];
}

const KIND_LABELS: Record<string, string> = {
  convocation_j7: 'Convocation J-7',
  satisfaction: 'Satisfaction',
  dossier_entree: 'Entrée en formation',
  confirmation_preinscription: 'Confirmation pré-inscription',
  autre: 'Autre',
};

export default async function EmailsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const rows = await loadEmailLog(searchParams);
  const sentCount = rows.filter((r) => r.status === 'sent').length;
  const failedCount = rows.filter((r) => r.status === 'failed').length;

  const activeDossier = searchParams.dossier;
  const activeStatus =
    searchParams.status === 'sent' || searchParams.status === 'failed'
      ? searchParams.status
      : undefined;

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="mb-6">
        <SectionLabel className="mb-1">Notifications</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Historique des envois
        </h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
          Journal d'audit de tous les emails envoyés par votre organisation.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 mb-6 max-w-md">
        <StatCard
          label="Envoyés"
          value={sentCount}
          icon={Mail}
          accent="emerald"
          href="/emails?status=sent"
        />
        <StatCard
          label="Échecs"
          value={failedCount}
          icon={MailX}
          accent="rose"
          href="/emails?status=failed"
        />
      </div>

      {(activeDossier || activeStatus) && (
        <div className="mb-4 flex items-center gap-2 text-[12px]">
          <span className="text-zinc-400">Filtres :</span>
          {activeStatus && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
              statut = {activeStatus}
            </span>
          )}
          {activeDossier && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
              dossier = {activeDossier.slice(0, 8)}
            </span>
          )}
          <a href="/emails" className="text-violet-600 hover:underline">
            Réinitialiser
          </a>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[140px_1fr_1fr_160px_100px_100px] gap-3 px-5 py-2.5 text-[10px] tracking-wider uppercase text-zinc-400 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
          <div>Date</div>
          <div>Destinataire</div>
          <div>Sujet</div>
          <div>Type</div>
          <div>Statut</div>
          <div>Dossier</div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Aucun envoi pour le moment"
            description="Les emails envoyés (convocations, satisfaction, confirmations…) apparaîtront ici avec leur statut."
          />
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r) => (
              <li
                key={r.id}
                className="grid grid-cols-[140px_1fr_1fr_160px_100px_100px] gap-3 px-5 py-3 items-center text-[13px]"
              >
                <span className="font-mono text-[11px] text-zinc-500">
                  {format(parseISO(r.sent_at), 'dd MMM HH:mm', { locale: fr })}
                </span>
                <span className="text-zinc-700 dark:text-zinc-300 truncate" title={r.recipient}>
                  {r.recipient}
                </span>
                <span
                  className="text-zinc-600 dark:text-zinc-400 truncate"
                  title={r.subject ?? undefined}
                >
                  {r.subject ?? '—'}
                </span>
                <span className="text-zinc-500 text-[12px] truncate">
                  {r.kind ? (KIND_LABELS[r.kind] ?? r.kind) : '—'}
                </span>
                <span>
                  <StatusPill tone={r.status === 'sent' ? 'success' : 'danger'}>
                    {r.status === 'sent' ? 'envoyé' : 'échec'}
                  </StatusPill>
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
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
