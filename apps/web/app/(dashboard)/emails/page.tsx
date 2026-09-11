// ARCHETYPE: command
// Justification: journal d'audit append-only des envois email — densité, filtres,
// traces horodatées, drill-down par dossier/statut.

import Link from 'next/link';
import type { ComponentType } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Mail, MailX, MailOpen, Inbox, MousePointerClick, CheckCheck } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { StatusPill } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { SectionLabel } from '@/shared/ui/section-label';

export const dynamic = 'force-dynamic';

const ROW_GRID = 'grid grid-cols-[110px_minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_96px_150px_96px] gap-4 px-5';

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
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  open_count: number | null;
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
      'id, organization_id, dossier_id, kind, recipient, subject, status, provider_id, error, sent_at, delivered_at, opened_at, clicked_at, bounced_at, open_count',
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
  const openedCount = rows.filter((r) => r.opened_at).length;

  const activeDossier = searchParams.dossier;
  const activeStatus =
    searchParams.status === 'sent' || searchParams.status === 'failed'
      ? searchParams.status
      : undefined;

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-9">
      <header className="mb-7">
        <SectionLabel className="mb-2">Notifications</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Historique des envois</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
          Journal d'audit de tous les emails envoyés par votre organisation.{' '}
          <span className="tabular-nums">
            {rows.length} trace{rows.length > 1 ? 's' : ''}
          </span>
        </p>
      </header>

      <div className="grid grid-cols-3 gap-4 mb-6 max-w-3xl">
        <Kpi label="Envoyés" value={sentCount} icon={Mail} href="/emails?status=sent" />
        <Kpi label="Ouverts" value={openedCount} icon={MailOpen} />
        <Kpi label="Échecs" value={failedCount} icon={MailX} href="/emails?status=failed" />
      </div>

      {(activeDossier || activeStatus) && (
        <div className="mb-4 flex items-center gap-2 text-[12px]">
          <span className="text-zinc-500 dark:text-zinc-400">Filtres :</span>
          {activeStatus && (
            <span className="inline-flex items-center h-6 px-2 rounded-md font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              statut = {activeStatus}
            </span>
          )}
          {activeDossier && (
            <span className="inline-flex items-center h-6 px-2 rounded-md font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
              dossier = <span className="font-mono ml-1">{activeDossier.slice(0, 8)}</span>
            </span>
          )}
          <a href="/emails" className="font-semibold text-orange-600 dark:text-orange-400 hover:underline">
            Réinitialiser
          </a>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
        <div className="min-w-[1000px]">
          <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
            <div>Date</div>
            <div>Destinataire</div>
            <div>Sujet</div>
            <div>Type</div>
            <div>Statut</div>
            <div>Suivi</div>
            <div>Dossier</div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Aucun envoi pour le moment"
              description="Les emails envoyés (convocations, satisfaction, confirmations…) apparaîtront ici avec leur statut."
            />
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {rows.map((r) => (
                <li key={r.id} className={`${ROW_GRID} py-3.5 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                  <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                    {format(parseISO(r.sent_at), 'dd MMM HH:mm', { locale: fr })}
                  </span>
                  <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate" title={r.recipient}>
                    {r.recipient}
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400 truncate" title={r.subject ?? undefined}>
                    {r.subject ?? '—'}
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400 text-[12px] truncate">
                    {r.kind ? (KIND_LABELS[r.kind] ?? r.kind) : '—'}
                  </span>
                  <span>
                    <StatusPill tone={r.status === 'sent' ? 'success' : 'danger'}>
                      {r.status === 'sent' ? 'envoyé' : 'échec'}
                    </StatusPill>
                  </span>
                  <span className="flex items-center gap-2 flex-wrap">
                    {r.bounced_at ? (
                      <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-rose-700 dark:text-rose-400">
                        <MailX className="w-3.5 h-3.5" /> rejeté
                      </span>
                    ) : (
                      <>
                        {r.delivered_at && (
                          <span title="Livré" className="text-emerald-600 dark:text-emerald-400">
                            <CheckCheck className="w-4 h-4" />
                          </span>
                        )}
                        {r.opened_at && (
                          <span
                            title={`Ouvert${r.open_count && r.open_count > 1 ? ` ×${r.open_count}` : ''}`}
                            className="inline-flex items-center gap-0.5 text-[12px] font-semibold tabular-nums text-orange-600 dark:text-orange-400"
                          >
                            <MailOpen className="w-4 h-4" />
                            {r.open_count && r.open_count > 1 ? `×${r.open_count}` : ''}
                          </span>
                        )}
                        {r.clicked_at && (
                          <span title="Cliqué" className="text-blue-600 dark:text-blue-400">
                            <MousePointerClick className="w-4 h-4" />
                          </span>
                        )}
                        {!r.delivered_at && !r.opened_at && !r.clicked_at && (
                          r.provider_id && r.provider_id.includes('@') ? (
                            <span
                              title="Envoyé via SMTP (votre boîte mail) : le suivi ouvertures/clics n'est pas disponible sur ce canal."
                              className="text-zinc-400 dark:text-zinc-500 text-[11px]"
                            >
                              SMTP — suivi indisponible
                            </span>
                          ) : (
                            <span className="text-zinc-300 dark:text-zinc-600 text-[12px]">—</span>
                          )
                        )}
                      </>
                    )}
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
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  hintTone = 'neutral',
  icon: Icon,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  hintTone?: 'neutral' | 'success' | 'warning' | 'danger';
  icon?: ComponentType<{ className?: string }>;
  href?: string;
}) {
  const hintCls = {
    neutral: 'text-zinc-500 dark:text-zinc-400',
    success: 'text-emerald-700 dark:text-emerald-400',
    warning: 'text-amber-700 dark:text-amber-400',
    danger: 'text-red-700 dark:text-red-400',
  }[hintTone];
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">{label}</p>
        {Icon && <Icon className="w-4 h-4 text-zinc-400" />}
      </div>
      <p className="text-[26px] leading-none font-extrabold tabular-nums text-zinc-900 dark:text-zinc-100 mt-3">{value}</p>
      {hint && <p className={`text-[12px] mt-2 tabular-nums ${hintCls}`}>{hint}</p>}
    </>
  );
  const cls = 'block bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5';
  return href ? (
    <Link href={href} className={`${cls} hover:border-orange-200 dark:hover:border-orange-900/60 transition`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
