// ARCHETYPE: command
// Justification: page Documents org-wide — onglets dérivés du statut réel, table dense, recherche.

import Link from 'next/link';
import { FileText, Search, Download } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { IdPill } from '@/shared/ui/id-pill';
import { DocumentUploadButton, AttachToDossier, type DossierOption } from './document-tools';
import { KindFilter } from './kind-filter';
import { StandaloneGenerateButton } from './standalone-generate';

type TabId = 'a-signer' | 'generes' | 'archives';

const TABS: { id: TabId; label: string }[] = [
  { id: 'a-signer', label: 'À signer' },
  { id: 'generes', label: 'Générés' },
  { id: 'archives', label: 'Archivés' },
];

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
  let query = sb
    .schema('app')
    .from('documents')
    .select(
      'id, title, kind, status, created_at, ' +
        'dossier:dossiers(id, reference, learner:learners(first_name, last_name)), ' +
        'signatures:document_signatures(status)',
    )
    .is('deleted_at', null)
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

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Documents</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
            Conventions, attestations, certificats — générés depuis vos templates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form action="/documents" method="get" className="relative">
            <input type="hidden" name="tab" value={activeTab} />
            {kind && <input type="hidden" name="kind" value={kind} />}
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Rechercher un document…"
              className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-[13px] w-72 focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 placeholder:text-zinc-400"
            />
          </form>
          <KindFilter options={KIND_OPTIONS} value={kind} />
          <Link
            href="/dossiers"
            className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] font-medium px-4 py-2 rounded-lg transition hover:bg-zinc-50 dark:hover:bg-zinc-900 inline-flex items-center gap-2"
          >
            Générer depuis un dossier
          </Link>
          <StandaloneGenerateButton />
          <DocumentUploadButton />
        </div>
      </header>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 pt-3 border-b border-zinc-200/60 dark:border-zinc-800">
          <ul className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((t) => {
              const active = t.id === activeTab;
              const tabParams = new URLSearchParams({ tab: t.id });
              if (q) tabParams.set('q', q);
              if (kind) tabParams.set('kind', kind);
              return (
                <li key={t.id}>
                  <Link
                    href={`/documents?${tabParams.toString()}`}
                    className={
                      active
                        ? 'text-[13px] font-medium text-violet-700 dark:text-violet-400 border-b-2 border-violet-600 px-3 py-2 -mb-px transition whitespace-nowrap inline-block'
                        : 'text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 px-3 py-2 transition whitespace-nowrap inline-block'
                    }
                  >
                    {t.label}
                    <span
                      className={
                        active
                          ? 'ml-1.5 text-[11px] bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 px-1.5 py-0.5 rounded'
                          : 'ml-1.5 text-[11px] text-zinc-400'
                      }
                    >
                      {counts[t.id]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="grid grid-cols-[28px_1.5fr_140px_1.2fr_140px_120px_100px] gap-3 px-5 py-2.5 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
          <div />
          <div>Document</div>
          <div>Dossier</div>
          <div>Apprenant</div>
          <div>Type</div>
          <div>Statut</div>
          <div>Action</div>
        </div>

        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-[14px] text-zinc-700 dark:text-zinc-300">
              {q || kind ? 'Aucun document ne correspond à ces filtres.' : 'Aucun document dans cet onglet.'}
            </p>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1">
              Les documents sont générés depuis l&apos;onglet Documents d&apos;un dossier.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((d) => {
              const href = d.dossier ? `/dossiers/${d.dossier.id}/documents` : '/dossiers';
              const statusPill =
                activeTab === 'archives'
                  ? { label: 'Archivé', cls: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400' }
                  : activeTab === 'a-signer'
                    ? { label: 'À signer', cls: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' }
                    : d.status === 'ready'
                      ? { label: 'Généré', cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' }
                      : d.status === 'failed'
                        ? { label: 'Échec', cls: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400' }
                        : { label: 'En cours', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' };
              const action = activeTab === 'a-signer' ? 'Signer' : activeTab === 'archives' ? 'Voir' : 'Télécharger';
              const rowGrid =
                'grid grid-cols-[28px_1.5fr_140px_1.2fr_140px_120px_100px] gap-3 px-5 py-3 items-center text-[13px]';

              // Document sans dossier : ligne non-lien avec rattachement + téléchargement.
              if (!d.dossier) {
                return (
                  <li key={d.id} className={`${rowGrid} hover:bg-zinc-50 dark:hover:bg-zinc-950 transition`}>
                    <span className="w-7 h-7 rounded-md bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-zinc-900 dark:text-zinc-100 truncate">{d.title}</span>
                    <AttachToDossier documentId={d.id} dossiers={dossiers} />
                    <span className="text-zinc-400">—</span>
                    <span className="text-zinc-500 dark:text-zinc-400 truncate">{kindLabel(d.kind)}</span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full inline-flex items-center w-fit ${statusPill.cls}`}>
                      {statusPill.label}
                    </span>
                    <a
                      href={`/api/documents/${d.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[12px] font-medium text-orange-600 hover:text-orange-700 transition text-right inline-flex items-center gap-1 justify-end"
                    >
                      Télécharger <Download className="w-3 h-3" />
                    </a>
                  </li>
                );
              }

              return (
                <li key={d.id}>
                  <Link href={href} className={`${rowGrid} hover:bg-zinc-50 dark:hover:bg-zinc-950 transition group`}>
                    <span className="w-7 h-7 rounded-md bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-zinc-900 dark:text-zinc-100 truncate">{d.title}</span>
                    <IdPill className="!text-[10px]">{d.dossier.reference}</IdPill>
                    <span className="text-zinc-700 dark:text-zinc-300 truncate">{learnerName(d.dossier?.learner ?? null)}</span>
                    <span className="text-zinc-500 dark:text-zinc-400 truncate">{kindLabel(d.kind)}</span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full inline-flex items-center w-fit ${statusPill.cls}`}>
                      {statusPill.label}
                    </span>
                    <span className="text-[12px] font-medium text-violet-600 dark:text-violet-400 group-hover:text-violet-700 dark:group-hover:text-violet-300 transition text-right inline-flex items-center gap-1 justify-end group-hover:underline">
                      {action}
                      {action === 'Télécharger' && <Download className="w-3 h-3" />}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <div className="px-5 py-3 border-t border-zinc-200/60 dark:border-zinc-800 flex items-center justify-between text-[12px] text-zinc-500">
          <span>
            {all.length} document{all.length > 1 ? 's' : ''} au total
          </span>
          <Link href="/dossiers" className="text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition">
            Voir par dossier →
          </Link>
        </div>
      </div>
    </div>
  );
}
