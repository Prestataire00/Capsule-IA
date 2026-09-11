// ARCHETYPE: command
import Link from 'next/link';
import { Plus, Inbox, Eye, MessageSquareWarning, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { SectionLabel } from '@/shared/ui/section-label';
import { IdPill } from '@/shared/ui/id-pill';
import { StatusPill } from '@/shared/ui/status-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { KpiCard } from '@/shared/ui/kpi-card';
import { notFound } from 'next/navigation';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { getCurrentMember } from '@/shared/lib/auth/current-member';

export const dynamic = 'force-dynamic';

type ComplaintRow = {
  id: string;
  reference: string;
  subject: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  reporter_name: string | null;
  reporter_email: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
};

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const sevTone = { low: 'success', medium: 'warning', high: 'danger', critical: 'danger' } as const;
const sevLabel = { low: 'mineure', medium: 'moyenne', high: 'élevée', critical: 'critique' };
const stateLabel = { open: 'ouverte', in_progress: 'en cours', resolved: 'résolue', closed: 'clôturée' };

const statusTone: Record<ComplaintRow['status'], 'success' | 'warning' | 'danger' | 'neutral'> = {
  open: 'danger',
  in_progress: 'warning',
  resolved: 'success',
  closed: 'neutral',
};

const ROW_GRID = 'grid grid-cols-[130px_minmax(0,2fr)_minmax(0,1fr)_110px_100px_110px_56px] gap-4 px-5';

export default async function ReclamationsPage() {
  await requireAccess('qualiopi');
  const me = await getCurrentMember();
  if (!me) notFound();

  const sb = admin();
  const { data } = await sb
    .schema('app')
    .from('complaints')
    .select('id, reference, subject, status, severity, reporter_name, reporter_email, created_at, metadata')
    // Client service_role : sans ce filtre, la page listait les réclamations de
    // TOUS les organismes, noms et e-mails des réclamants compris.
    .eq('organization_id', me.organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);

  const complaints = (data ?? []) as unknown as ComplaintRow[];
  const open = complaints.filter((c) => c.status === 'open' || c.status === 'in_progress');

  return (
    <div className="max-w-6xl w-full mx-auto px-8 py-9">
      <header className="mb-7 flex items-end justify-between flex-wrap gap-4">
        <div>
          <SectionLabel className="mb-2">Qualité</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Réclamations</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3 tabular-nums">
            {open.length} ouverte{open.length > 1 ? 's' : ''} · {complaints.length} au total · indicateur Qualiopi I31
          </p>
        </div>
        <Link
          href="/reclamations/nouvelle"
          className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Saisie manuelle
        </Link>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Réclamations" value={complaints.length} icon={MessageSquareWarning} accent="purple" hint="indicateur Qualiopi I31" />
        <KpiCard label="Ouvertes" value={open.length} icon={Inbox} accent="amber" hint="ouvertes ou en cours" />
        <KpiCard
          label="Gravité élevée"
          value={open.filter((c) => c.severity === 'high' || c.severity === 'critical').length}
          icon={AlertTriangle}
          accent="amber"
          hint="élevées ou critiques, non résolues"
        />
        <KpiCard
          label="Résolues"
          value={complaints.filter((c) => c.status === 'resolved' || c.status === 'closed').length}
          icon={CheckCircle2}
          accent="emerald"
          hint="résolues ou clôturées"
        />
      </section>

      {complaints.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm">
          <EmptyState
            icon={Inbox}
            title="Pas de réclamation enregistrée"
            description="Les réclamations soumises depuis l'espace apprenant apparaîtront ici."
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
          <div className="min-w-[900px]">
            <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
              <div>Référence</div>
              <div>Objet</div>
              <div>Réclamant</div>
              <div>Reçue le</div>
              <div>Gravité</div>
              <div>Statut</div>
              <div className="text-right">Actions</div>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {complaints.map((c) => (
                <li key={c.id} className={`${ROW_GRID} py-3.5 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                  <div>
                    <IdPill>{c.reference}</IdPill>
                  </div>
                  <Link href={`/reclamations/${c.id}`} className="min-w-0 truncate text-[14px] font-bold text-zinc-900 dark:text-zinc-100 hover:underline">
                    {c.subject}
                  </Link>
                  <span className="text-zinc-700 dark:text-zinc-300 truncate">
                    {c.reporter_name ? (
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-full grid place-items-center flex-shrink-0 text-[11px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                          {c.reporter_name.trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="truncate">{c.reporter_name}</span>
                      </span>
                    ) : (
                      <span className="text-zinc-400">anonyme</span>
                    )}
                  </span>
                  <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                    {format(parseISO(c.created_at), 'dd MMM yyyy', { locale: fr })}
                  </span>
                  <div>
                    <StatusPill tone={sevTone[c.severity]}>{sevLabel[c.severity]}</StatusPill>
                  </div>
                  <div>
                    <StatusPill tone={statusTone[c.status]}>{stateLabel[c.status]}</StatusPill>
                  </div>
                  <div className="flex items-center justify-end">
                    <Link
                      href={`/reclamations/${c.id}`}
                      aria-label={`Ouvrir la réclamation ${c.reference}`}
                      title="Ouvrir"
                      className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
