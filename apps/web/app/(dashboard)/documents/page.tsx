// ARCHETYPE: command
// Justification: page Documents org-wide — onglets dérivés du statut réel, table dense, recherche.

import Link from 'next/link';
import { FileText, Search, Eye, PenLine, Sparkles, Archive } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { IdPill } from '@/shared/ui/id-pill';
import { KpiCard, ACCENTS, type Accent } from '@/shared/ui/kpi-card';
import { kindStyle } from './kind-style';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { DocumentUploadButton, AttachToDossier, type DossierOption } from './document-tools';
import { KindFilter } from './kind-filter';
import { StandaloneGenerateButton } from './standalone-generate';

type TabId = 'a-signer' | 'generes' | 'archives';

const TABS: { id: TabId; label: string; accent: Accent }[] = [
  { id: 'a-signer', label: 'À signer', accent: 'amber' },
  { id: 'generes', label: 'Générés', accent: 'orange' },
  { id: 'archives', label: 'Archivés', accent: 'teal' },
];

const AVATARS = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
];
const avatarOf = (name: string) => ({
  initials: name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase(),
  palette: AVATARS[(name.charCodeAt(0) || 0) % AVATARS.length],
});

const KIND_LABELS: Record<string, string> = {
  convention: 'Convention',
  convocation: 'Convocation',
  programme: 'Programme',
  attestation_presence: 'Attestation de présence',
  attestation_fin: 'Attestation de fin',
  certificat_realisation: 'Certificat de réalisation',
  reglement_interieur: 'Règlement intérieur',
  livret_accueil: "Livret d'accueil",
  devis: 'Devis',
  facture: 'Facture',
  feuille_emargement: "Feuille d'émargement",
  questionnaire: 'Questionnaire',
  autre: 'Autre',
};

const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind.replace(/_/g, ' ');

const ROW_GRID = 'grid grid-cols-[minmax(0,2fr)_170px_minmax(0,1.3fr)_minmax(0,1.1fr)_120px_72px] gap-4 px-5';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });

const KIND_OPTIONS = Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }));

const learnerName = (l: { first_name: string | null; last_name: string | null } | null) =>
  l ? [l.first_name, l.last_name].filter(Boolean).join(' ') || '—' : '—';

type DocRow = {
  id: string;
  title: string;
  kind: string;
  status: string;
  created_at: string | null;
  dossier: {
    id: string;
    reference: string;
    learner: { first_name: string | null; last_name: string | null } | null;
  } | null;
  signatures: { status: string }[] | null;
};

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams?: { tab?: string; q?: string; kind?: string };
}) {
  const activeTab: TabId = TABS.some((t) => t.id === searchParams?.tab)
    ? (searchParams?.tab as TabId)
    : 'a-signer';
  const q = (searchParams?.q ?? '').trim();
  const kind = (searchParams?.kind ?? '').trim();

  const sb = supabaseServer();
  // Prod-safe : si app.documents n'est pas migrée → data=null → liste vide.
  // Client non typé : `is_current` et `source_url` (0158) ne sont pas encore
  // dans les types générés (`pnpm db:types` après déploiement).
  let query = (sb as unknown as SupabaseClient)
    .schema('app')
    .from('documents')
    .select(
      'id, title, kind, status, created_at, version, source_url, ' +
        'dossier:dossiers(id, reference, learner:learners(first_name, last_name)), ' +
        'signatures:document_signatures(status)',
    )
    .is('deleted_at', null)
    // Une entrée par document : les versions précédentes restent en historique
    // sur la fiche du document, pas dans la bibliothèque.
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(300);
  if (q) query = query.ilike('title', `%${q}%`);
  if (kind) query = query.eq('kind', kind);
  const [{ data }, { data: dossierData }] = await Promise.all([
    query,
    sb
      .schema('app')
      .from('dossiers')
      .select('id, reference, learner:learners(first_name, last_name)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  const dossiers: DossierOption[] = (
    (dossierData ?? []) as unknown as Array<{
      id: string;
      reference: string;
      learner: { first_name: string | null; last_name: string | null } | null;
    }>
  ).map((d) => ({
    id: d.id,
    reference: d.reference,
    learner: d.learner ? [d.learner.first_name, d.learner.last_name].filter(Boolean).join(' ') || null : null,
  }));

  const all = (((data as unknown) as DocRow[]) ?? []).map((d) => {
    const hasPendingSignature = (d.signatures ?? []).some((s) => s.status === 'pending');
    const tab: TabId = d.status === 'archived' ? 'archives' : hasPendingSignature ? 'a-signer' : 'generes';
    return { ...d, hasPendingSignature, tab };
  });

  const counts: Record<TabId, number> = {
    'a-signer': all.filter((d) => d.tab === 'a-signer').length,
    generes: all.filter((d) => d.tab === 'generes').length,
    archives: all.filter((d) => d.tab === 'archives').length,
  };
  const rows = all.filter((d) => d.tab === activeTab);

  const tabHref = (id: TabId) => {
    const tabParams = new URLSearchParams({ tab: id });
    if (q) tabParams.set('q', q);
    if (kind) tabParams.set('kind', kind);
    return `/documents?${tabParams.toString()}`;
  };

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-9">
      <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <SectionLabel className="mb-2">Documents &amp; communication</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Documents</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
            Conventions, attestations, certificats — générés depuis vos templates.{' '}
            <span className="tabular-nums">
              {all.length} document{all.length > 1 ? 's' : ''} · {counts['a-signer']} à signer
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/dossiers"
            className="border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 text-[13px] font-semibold px-4 h-10 rounded-lg transition hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-2"
          >
            Générer depuis un dossier
          </Link>
          <StandaloneGenerateButton />
          <DocumentUploadButton />
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7" aria-label="Synthèse">
        <KpiCard href={tabHref('a-signer')} label="À signer" value={counts['a-signer']} hint="signatures en attente" icon={PenLine} accent="amber" />
        <KpiCard href={tabHref('generes')} label="Générés" value={counts.generes} hint="depuis vos templates" icon={Sparkles} accent="orange" />
        <KpiCard href={tabHref('archives')} label="Archivés" value={counts.archives} hint="conservés en preuve" icon={Archive} accent="teal" />
      </section>

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <form action="/documents" method="get" className="relative">
          <input type="hidden" name="tab" value={activeTab} />
          {kind && <input type="hidden" name="kind" value={kind} />}
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Rechercher un document…"
            className="h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg pl-9 pr-3 text-[13px] w-72 transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 placeholder:text-zinc-400"
          />
        </form>
        <KindFilter options={KIND_OPTIONS} value={kind} />
        <nav aria-label="Onglets" className="ml-auto inline-flex p-0.5 rounded-lg bg-zinc-200/60 dark:bg-zinc-800/70 text-[12px]">
          {TABS.map((t) => {
            const active = t.id === activeTab;
            return (
              <Link
                key={t.id}
                href={tabHref(t.id)}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'px-3 py-1.5 rounded-md bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-bold shadow-sm tabular-nums whitespace-nowrap inline-flex items-center gap-1.5'
                    : 'px-3 py-1.5 rounded-md text-zinc-500 dark:text-zinc-400 font-medium hover:text-zinc-900 dark:hover:text-zinc-100 tabular-nums whitespace-nowrap inline-flex items-center gap-1.5'
                }
              >
                {t.label}{' '}
                <span className={`text-[11px] font-bold px-1.5 rounded-full ${ACCENTS[t.accent].soft}`}>{counts[t.id]}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
        <div className="min-w-[920px]">
          <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
            <div>Document</div>
            <div>Dossier</div>
            <div>Apprenant</div>
            <div>Type</div>
            <div>Statut</div>
            <div className="text-right">Actions</div>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={q || kind ? 'Aucun document ne correspond à ces filtres.' : 'Aucun document dans cet onglet.'}
              description="Les documents sont générés depuis l'onglet Documents d'un dossier."
            />
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {rows.map((d) => {
                const href = `/documents/${d.id}/apercu`;
                const statusPill: { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' | 'info' } =
                  activeTab === 'archives'
                    ? { label: 'Archivé', tone: 'neutral' }
                    : activeTab === 'a-signer'
                      ? { label: 'À signer', tone: 'warning' }
                      : d.status === 'ready'
                        ? { label: 'Généré', tone: 'success' }
                        : d.status === 'failed'
                          ? { label: 'Échec', tone: 'danger' }
                          : { label: 'En cours', tone: 'info' };
                const action = activeTab === 'a-signer' && d.dossier ? 'Signer' : 'Voir';
                const ActionIcon = action === 'Signer' ? PenLine : Eye;
                const ks = kindStyle(d.kind);
                const KindIcon = ks.icon;
                const learner = d.dossier ? learnerName(d.dossier.learner ?? null) : '—';
                const av = learner !== '—' ? avatarOf(learner) : null;

                return (
                  <li key={d.id} className={`${ROW_GRID} py-3.5 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                    <div className="min-w-0 flex items-center gap-3">
                    <span className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${ACCENTS[ks.accent].soft}`}>
                      <KindIcon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      {d.dossier ? (
                        <Link href={href} className="block truncate text-[14px] font-bold text-zinc-900 dark:text-zinc-100 hover:underline">
                          {d.title}
                        </Link>
                      ) : (
                        <span className="block truncate text-[14px] font-bold text-zinc-900 dark:text-zinc-100">{d.title}</span>
                      )}
                      {d.created_at && (
                        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums mt-0.5">
                          {dateFmt.format(new Date(d.created_at))}
                        </p>
                      )}
                    </div>
                    </div>
                    <div className="min-w-0">
                      {d.dossier ? (
                        <IdPill>{d.dossier.reference}</IdPill>
                      ) : (
                        // Document sans dossier : rattachement direct depuis la ligne.
                        <AttachToDossier documentId={d.id} dossiers={dossiers} />
                      )}
                    </div>
                    <span className={`min-w-0 flex items-center gap-2 ${av ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-400'}`}>
                      {av && (
                        <span className={`w-7 h-7 rounded-full grid place-items-center text-[10px] font-bold shrink-0 ${av.palette}`}>{av.initials}</span>
                      )}
                      <span className="truncate">{learner}</span>
                    </span>
                    <span className={`truncate font-semibold ${ACCENTS[ks.accent].text}`}>{kindLabel(d.kind)}</span>
                    <div>
                      <StatusPill tone={statusPill.tone}>{statusPill.label}</StatusPill>
                    </div>
                    <div className="flex items-center justify-end">
                      <Link
                        href={href}
                        aria-label={`${action} — ${d.title}`}
                        title={action}
                        className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition"
                      >
                        <ActionIcon className="w-4 h-4" />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="px-5 py-3 border-t border-zinc-200/70 dark:border-zinc-800 flex items-center justify-between text-[12px] text-zinc-500 dark:text-zinc-400">
            <span className="tabular-nums">
              {all.length} document{all.length > 1 ? 's' : ''} au total
            </span>
            <Link href="/dossiers" className="font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 transition">
              Voir par dossier →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
