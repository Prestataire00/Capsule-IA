// ARCHETYPE: command
// Justification: journal d'audit append-only des envois email — densité, filtres,
// traces horodatées, drill-down par dossier/statut.

import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Mail, MailX, MailOpen, Inbox, MousePointerClick, CheckCheck } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { KpiCard, AccentBar, ACCENTS } from '@/shared/ui/kpi-card';
import { StatusPill } from '@/shared/ui/status-pill';
import { IdPill } from '@/shared/ui/id-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { SectionLabel } from '@/shared/ui/section-label';
import { EmailsTabs } from './emails-tabs.client';

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

const AVATARS = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
];

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

      <EmailsTabs />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 max-w-4xl">
        <KpiCard label="Envoyés" value={sentCount} icon={Mail} accent="sky" href="/emails?status=sent" />
        <KpiCard
          label="Ouverts"
          value={openedCount}
          icon={MailOpen}
          accent="emerald"
          hint={`${sentCount > 0 ? Math.round((openedCount / sentCount) * 100) : 0}% des envoyés`}
        >
          <AccentBar value={openedCount} max={sentCount} accent="emerald" />
        </KpiCard>
        <KpiCard label="Échecs" value={failedCount} icon={MailX} accent={failedCount > 0 ? 'rose' : 'sky'} href="/emails?status=failed" />
      </div>

      {(activeDossier || activeStatus) && (
        <div className="mb-4 flex items-center gap-2 text-[12px]">
          <span className="text-zinc-500 dark:text-zinc-400">Filtres :</span>
          {activeStatus && (
            <span className={`inline-flex items-center h-6 px-2 rounded-md font-semibold ${activeStatus === 'failed' ? ACCENTS.rose.soft : ACCENTS.sky.soft}`}>
              statut = {activeStatus}
            </span>
          )}
          {activeDossier && (
            <span className={`inline-flex items-center h-6 px-2 rounded-md font-semibold ${ACCENTS.orange.soft}`}>
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
                  <span className="min-w-0 flex items-center gap-2.5" title={r.recipient}>
                    <span
                      className={`w-7 h-7 rounded-full grid place-items-center text-[10px] font-bold shrink-0 ${AVATARS[(r.recipient.charCodeAt(0) || 0) % AVATARS.length]}`}
                    >
                      {r.recipient.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100 truncate">{r.recipient}</span>
                  </span>
                  <span className="min-w-0 flex items-center gap-2" title={r.subject ?? undefined}>
                    <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${ACCENTS.sky.soft}`}>
                      <Mail className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-zinc-600 dark:text-zinc-400 truncate">{r.subject ?? '—'}</span>
                  </span>
                  <span className="min-w-0">
                    {r.kind ? (
                      <span className={`inline-block max-w-full truncate align-middle text-[12px] font-semibold px-2 py-0.5 rounded-full ${ACCENTS.sky.soft}`}>
                        {KIND_LABELS[r.kind] ?? r.kind}
                      </span>
                    ) : (
                      <span className="text-zinc-400 text-[12px]">—</span>
                    )}
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
