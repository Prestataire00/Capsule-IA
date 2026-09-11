// ARCHETYPE: command
// Justification: tableau de bord qualité — référentiel RNQ par critère (façon mini-audit
// Digiforma) avec, pour chaque indicateur, ce que Capsule produit, les preuves déposées
// et l'auto-évaluation ; plus le suivi de conformité des dossiers.

import Link from 'next/link';
import { ShieldCheck, ShieldAlert, Check, Circle, FileText, ArrowUpRight, Info, Download } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { SectionLabel } from '@/shared/ui/section-label';
import { IdPill } from '@/shared/ui/id-pill';
import { StatCard } from '@/shared/ui/stat-card';
import { dossierStatusLabel } from '@/shared/ui/status-pill';
import { loadOrgEvidence, type Evidence } from '@/features/qualiopi/evidence';
import { ORG_STATUS_LABELS, type OrgStatus } from '@/features/qualiopi/status';
import { jourParis, versions, VERSION_LABELS } from '@/features/qualiopi/referentiel';
import { preuvesParNumero, statutEffectif, statutsParNumero, type OrgStatutRow, type Profil } from '@/features/qualiopi/statut';
import { IndicatorStatus, ProofUpload, RemoveProofButton } from './indicator-actions.client';

export const dynamic = 'force-dynamic';

// ── Dossiers suivis (onglet « Dossiers ») ──────────────────────────────────
type QualiopiDossierRow = {
  id: string;
  reference: string;
  status: string;
  qualiopi_ready: boolean | null;
  learner: { first_name: string; last_name: string } | null;
  formation: { title: string } | null;
  checklist: { total_indicators: number; satisfied_indicators: number; blocking_missing: number } | null;
};

const SCOPED_STATUSES = ['scheduled', 'active', 'completed'] as const;

async function loadInScopeDossiers(sb: ReturnType<typeof supabaseServer>) {
  const { data, error } = await sb
    .schema('app')
    .from('dossiers')
    .select(
      `id, reference, status, qualiopi_ready,
       learner:learners(first_name, last_name),
       formation:formations(title),
       checklist:qualiopi_dossier_checklists(total_indicators, satisfied_indicators, blocking_missing)`,
    )
    .in('status', SCOPED_STATUSES)
    .order('reference', { ascending: true });
  if (error) {
    console.error('[qualiopi] dossiers illisibles', error.message);
    return [];
  }
  return ((data ?? []) as unknown as QualiopiDossierRow[]).map((d) => ({
    id: d.id,
    reference: d.reference,
    status: d.status,
    learnerName: d.learner ? `${d.learner.first_name} ${d.learner.last_name}`.trim() : '—',
    formationTitle: d.formation?.title ?? '—',
    ready: d.qualiopi_ready ?? false,
    total: d.checklist?.total_indicators ?? 0,
    satisfied: d.checklist?.satisfied_indicators ?? 0,
    blocking: d.checklist?.blocking_missing ?? 0,
  }));
}

// ── Référentiel ────────────────────────────────────────────────────────────
type Indicateur = {
  id: string;
  number: number;
  criterion: number;
  criterion_label: string | null;
  title: string;
  requirement: string | null;
  expected_proofs: string[] | null;
  scope: 'organization' | 'dossier';
  applies_to: string[] | null;
  certifying_only: boolean;
  condition: string | null;
  new_entrant: boolean;
  minor_nc_possible: boolean;
  referential_version: string;
  effective_from: string | null;
  effective_until: string | null;
};

type Preuve = { id: string; indicator_id: string; title: string; valid_until: string | null; created_at: string };

const TON_STATUT: Record<OrgStatus, string> = {
  conforme: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  en_cours: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  a_traiter: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  non_applicable: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
};

const CATEGORIES: ReadonlyArray<readonly [string, string]> = [
  ['Formation', 'action_formation'],
  ['Bilan', 'bilan_competences'],
  ['VAE', 'vae'],
  ['Apprentissage', 'apprentissage'],
];

/** Catégories d'action visées par un indicateur réservé ; null s'il est commun. */
function categoriesVisees(appliesTo: string[] | null): string | null {
  if (!appliesTo) return null;
  return CATEGORIES.filter(([, code]) => appliesTo.includes(code)).map(([label]) => label).join(' · ') || null;
}

/** « 1er novembre 2026 » à partir de « 2026-11-01 ». */
function dateLongue(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const jour = d.getUTCDate();
  return `${jour === 1 ? '1er' : jour} ${d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
      {children}
    </span>
  );
}

export default async function QualiopiPage({
  searchParams,
}: {
  searchParams: { onglet?: string; critere?: string; filter?: string; version?: string };
}) {
  await requireAccess('qualiopi');
  const me = await getCurrentMember();
  const sb = supabaseServer();
  const admin = supabaseAdmin();

  const onglet = searchParams.onglet === 'dossiers' || searchParams.filter ? 'dossiers' : 'referentiel';
  const critere = Math.min(7, Math.max(1, Number(searchParams.critere) || 1));

  const [dossiers, refRes, statutsRes, preuvesRes, evidence, profilRes] = await Promise.all([
    loadInScopeDossiers(sb),
    sb
      .schema('app')
      .from('qualiopi_indicators')
      .select(
        'id, number, criterion, criterion_label, title, requirement, expected_proofs, scope, applies_to, certifying_only, condition, new_entrant, minor_nc_possible, referential_version, effective_from, effective_until' as never,
      )
      .eq('is_active', true)
      .neq('referential_version' as never, 'legacy' as never)
      .order('number'),
    me
      ? admin
          .schema('app')
          .from('qualiopi_org_indicator_status' as never)
          .select('indicator_id, status, note, updated_at')
          .eq('organization_id' as never, me.organizationId as never)
      : Promise.resolve({ data: [], error: null }),
    me
      ? admin
          .schema('app')
          .from('qualiopi_proofs')
          .select('id, indicator_id, title, valid_until, created_at')
          .eq('organization_id', me.organizationId)
          .eq('scope', 'organization')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    me ? loadOrgEvidence(me.organizationId) : Promise.resolve({}),
    me
      ? Promise.all([
          admin.schema('app').from('dossiers').select('id', { count: 'exact', head: true }).eq('organization_id', me.organizationId).eq('action_type' as never, 'apprentissage' as never),
          admin.schema('app').from('formations').select('rncp_code, rs_code').eq('organization_id', me.organizationId).is('deleted_at', null),
          admin.schema('app').from('trainers').select('id', { count: 'exact', head: true }).eq('organization_id', me.organizationId).eq('is_internal', false).is('deleted_at', null),
        ])
      : Promise.resolve(null),
  ]);

  // Référentiel en vigueur. Tant que la migration 0139 n'est pas appliquée, la
  // requête échoue : on le dit plutôt que d'afficher un référentiel vide.
  const referentielIndisponible = Boolean(refRes.error);
  const tous = ((refRes.data ?? []) as unknown as Indicateur[]).filter(Boolean);
  const { courante, suivante } = versions(tous, jourParis());
  const version =
    searchParams.version && searchParams.version !== 'legacy' && tous.some((i) => i.referential_version === searchParams.version)
      ? searchParams.version
      : courante;
  const indicateurs = tous.filter((i) => i.referential_version === version);
  const apercu = version !== courante;
  const suffixeVersion = apercu && version ? `&version=${version}` : '';

  // Statuts et preuves suivent le numéro : le travail fait sous la V9 vaut sous la V10.
  const numeroParId = new Map(tous.map((i) => [i.id, i.number]));
  const statuts = statutsParNumero(((statutsRes as { data: unknown }).data ?? []) as OrgStatutRow[], numeroParId);
  const preuvesParIndicateur = preuvesParNumero(((preuvesRes as { data: unknown }).data ?? []) as Preuve[], numeroParId);

  // Ce qui change au passage à la version suivante, au même numéro.
  const evolutions = new Map<number, 'nouveau' | 'modifie'>();
  if (suivante && courante) {
    const avant = new Map(tous.filter((i) => i.referential_version === courante).map((i) => [i.number, i.requirement]));
    for (const i of tous.filter((x) => x.referential_version === suivante.version)) {
      if (!avant.has(i.number)) evolutions.set(i.number, 'nouveau');
      else if (avant.get(i.number) !== i.requirement) evolutions.set(i.number, 'modifie');
    }
  }
  const nbNouveaux = [...evolutions.values()].filter((e) => e === 'nouveau').length;

  const profil: Profil = {
    apprentissage: (profilRes?.[0].count ?? 0) > 0,
    certifiant: ((profilRes?.[1].data ?? []) as { rncp_code: string | null; rs_code: string | null }[]).some(
      (f) => (f.rncp_code ?? '').trim() || (f.rs_code ?? '').trim(),
    ),
    sousTraitance: (profilRes?.[2].count ?? 0) > 0,
  };

  const evalues = indicateurs.map((ind) => {
    const preuvesAuto = (evidence as Record<number, Evidence[]>)[ind.number] ?? [];
    const saisi = statuts.get(ind.number);
    return {
      ind,
      preuvesAuto,
      preuvesDeposees: preuvesParIndicateur.get(ind.number) ?? [],
      note: saisi?.note ?? null,
      saisi: saisi?.status ?? null,
      ...statutEffectif(ind, saisi?.status, preuvesAuto, profil),
    };
  });

  const applicables = evalues.filter((e) => e.status !== 'non_applicable');
  const conformes = applicables.filter((e) => e.status === 'conforme').length;
  const enCours = applicables.filter((e) => e.status === 'en_cours').length;
  const aTraiter = applicables.filter((e) => e.status === 'a_traiter').length;
  const pct = applicables.length > 0 ? Math.round((conformes / applicables.length) * 100) : 0;

  const criteres = Array.from({ length: 7 }, (_, i) => {
    const n = i + 1;
    const items = evalues.filter((e) => e.ind.criterion === n);
    const app = items.filter((e) => e.status !== 'non_applicable');
    return {
      n,
      label: items[0]?.ind.criterion_label ?? `Critère ${n}`,
      total: app.length,
      ok: app.filter((e) => e.status === 'conforme').length,
    };
  });
  const duCritere = evalues.filter((e) => e.ind.criterion === critere);

  const pretsDossiers = dossiers.filter((d) => d.ready).length;
  const bloquantsDossiers = dossiers.filter((d) => d.blocking > 0).length;
  const filtre = searchParams.filter === 'blocking' || searchParams.filter === 'ready' ? searchParams.filter : null;
  const dossiersAffiches =
    filtre === 'blocking' ? dossiers.filter((d) => d.blocking > 0) : filtre === 'ready' ? dossiers.filter((d) => d.ready) : dossiers;

  const onglets = [
    { id: 'referentiel', label: 'Référentiel', href: '/qualiopi' },
    { id: 'dossiers', label: `Dossiers (${dossiers.length})`, href: '/qualiopi?onglet=dossiers' },
  ];

  return (
    <div className="max-w-6xl w-full mx-auto px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
        <SectionLabel className="mb-1">Conformité</SectionLabel>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Qualiopi</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Référentiel national qualité — 7 critères, {indicateurs.length} indicateurs
          {version ? ` (${VERSION_LABELS[version] ?? version})` : ''}.
        </p>
        </div>
        {!referentielIndisponible && (
          <a
            href="/api/qualiopi/export"
            className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900 transition inline-flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            Exporter le dossier d&apos;audit
          </a>
        )}
      </header>

      {!referentielIndisponible && suivante && (
        <div className="mb-6 flex items-start gap-2.5 p-3.5 bg-purple-50 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-900/40 rounded-lg">
          <Info className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-purple-900 dark:text-purple-200">
            {apercu ? (
              <>
                Vous consultez le référentiel applicable au {dateLongue(suivante.from)}. Vos statuts et preuves y sont repris.{' '}
                <Link href="/qualiopi" className="underline underline-offset-2">
                  Revenir au référentiel en vigueur
                </Link>
              </>
            ) : (
              <>
                Nouveau référentiel au {dateLongue(suivante.from)} : {evolutions.size} indicateurs évoluent, dont {nbNouveaux}{' '}
                nouveau{nbNouveaux > 1 ? 'x' : ''}. Vos statuts et preuves sont conservés.{' '}
                <Link href={`/qualiopi?version=${suivante.version}`} className="underline underline-offset-2">
                  Consulter le nouveau référentiel
                </Link>
              </>
            )}
          </p>
        </div>
      )}

      {referentielIndisponible ? (
        <div className="mb-6 flex items-start gap-2.5 p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 rounded-lg">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-[13px] text-amber-900 dark:text-amber-200">
            Le référentiel officiel n&apos;est pas encore installé dans la base (migration 0139). Le suivi des
            dossiers reste disponible ci-dessous.
          </p>
        </div>
      ) : (
        <section className="mb-6 bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-end justify-between gap-4 flex-wrap mb-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Préparation de l&apos;audit</p>
              <p className="text-[24px] text-zinc-900 dark:text-zinc-100 tabular-nums">
                {conformes}/{applicables.length}
                <span className="text-[13px] text-zinc-500 ml-2">indicateurs conformes</span>
              </p>
            </div>
            <div className="flex items-center gap-4 text-[12px] text-zinc-600 dark:text-zinc-400">
              <span>{enCours} en cours</span>
              <span>{aTraiter} à traiter</span>
              <span>{evalues.length - applicables.length} non applicables</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </section>
      )}

      <nav className="flex items-center gap-1 mb-6 border-b border-zinc-200/60 dark:border-zinc-800">
        {onglets.map((o) => (
          <Link
            key={o.id}
            href={o.href}
            className={`text-[13px] px-3 py-2 -mb-px border-b-2 transition ${
              onglet === o.id
                ? 'border-orange-500 text-zinc-900 dark:text-zinc-100 font-medium'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            {o.label}
          </Link>
        ))}
      </nav>

      {onglet === 'referentiel' && !referentielIndisponible && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            {criteres.map((c) => (
              <Link
                key={c.n}
                href={`/qualiopi?critere=${c.n}${suffixeVersion}`}
                className={`flex-shrink-0 rounded-lg border px-3 py-2 transition ${
                  c.n === critere
                    ? 'border-purple-300 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/40'
                    : 'border-zinc-200/60 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                }`}
              >
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Critère {c.n}</p>
                <p className="text-[12px] text-zinc-900 dark:text-zinc-100 max-w-[180px] truncate">{c.label}</p>
                <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
                  {c.ok}/{c.total}
                </p>
              </Link>
            ))}
          </div>

          <ul className="space-y-3">
            {duCritere.map(({ ind, preuvesAuto, preuvesDeposees, note, saisi, status, auto }) => (
              <li key={ind.id}>
                <details className="group bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg shadow-sm">
                  <summary className="flex items-start gap-3 px-5 py-4 cursor-pointer list-none">
                    <span className="font-mono text-[11px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-1.5 py-0.5 rounded mt-0.5">
                      I{ind.number}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] text-zinc-900 dark:text-zinc-100">{ind.title}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        <Badge>{ind.scope === 'dossier' ? 'Par dossier' : 'Organisme'}</Badge>
                        {ind.new_entrant && <Badge>Nouvel entrant</Badge>}
                        {suivante && evolutions.has(ind.number) && (
                          <Badge>
                            {apercu
                              ? evolutions.get(ind.number) === 'nouveau'
                                ? 'Nouveau'
                                : 'Modifié'
                              : `Évolue le ${dateLongue(suivante.from)}`}
                          </Badge>
                        )}
                        {ind.certifying_only && <Badge>Certifiant</Badge>}
                        {categoriesVisees(ind.applies_to) && <Badge>{categoriesVisees(ind.applies_to)}</Badge>}
                        {ind.condition === 'subcontracting' && <Badge>Sous-traitance</Badge>}
                        {ind.condition === 'work_periods' && <Badge>Périodes en entreprise</Badge>}
                        <Badge>{ind.minor_nc_possible ? 'Écart mineur possible' : 'Écart majeur'}</Badge>
                      </div>
                    </div>
                    <span className={`flex-shrink-0 text-[11px] px-2 py-0.5 rounded-full ${TON_STATUT[status]}`}>
                      {ORG_STATUS_LABELS[status]}
                      {auto && status !== 'a_traiter' ? ' · constaté' : ''}
                    </span>
                  </summary>

                  <div className="px-5 pb-5 pt-1 grid grid-cols-1 lg:grid-cols-2 gap-5 border-t border-zinc-200/60 dark:border-zinc-800">
                    <div className="space-y-4 pt-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">Exigence</p>
                        <p className="text-[13px] text-zinc-700 dark:text-zinc-300">
                          {ind.requirement ?? 'Le texte officiel de l’indicateur sera affiché ici.'}
                        </p>
                      </div>
                      {(ind.expected_proofs?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                            Éléments de preuve attendus
                          </p>
                          <ul className="text-[13px] text-zinc-700 dark:text-zinc-300 list-disc pl-4 space-y-0.5">
                            {ind.expected_proofs!.map((p) => (
                              <li key={p}>{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">Ce que Capsule produit</p>
                        {preuvesAuto.length === 0 ? (
                          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                            Rien d&apos;automatique pour cet indicateur : déposez vos preuves ci-contre.
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {preuvesAuto.map((p) => (
                              <li key={p.label} className="flex items-start gap-2 text-[13px]">
                                {p.ok ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                                ) : (
                                  <Circle className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 flex-shrink-0 mt-0.5" />
                                )}
                                <span className="text-zinc-700 dark:text-zinc-300">
                                  {p.label}
                                  {p.href && (
                                    <Link href={p.href} className="ml-1.5 inline-flex items-center text-purple-600 dark:text-purple-400 hover:underline">
                                      voir <ArrowUpRight className="w-3 h-3" />
                                    </Link>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4 pt-4">
                      <IndicatorStatus indicatorId={ind.id} status={saisi} note={note} />
                      <div>
                        <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                          Preuves déposées ({preuvesDeposees.length})
                        </p>
                        {preuvesDeposees.length > 0 && (
                          <ul className="mb-3 divide-y divide-zinc-200/60 dark:divide-zinc-800 border-y border-zinc-200/60 dark:border-zinc-800">
                            {preuvesDeposees.map((p) => {
                              const expiree = p.valid_until !== null && p.valid_until < new Date().toISOString().slice(0, 10);
                              return (
                                <li key={p.id} className="flex items-center gap-2 py-2 text-[13px]">
                                  <FileText className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                                  <a href={`/api/qualiopi/proofs?id=${p.id}`} className="flex-1 min-w-0 truncate text-zinc-800 dark:text-zinc-200 hover:underline">
                                    {p.title}
                                  </a>
                                  {p.valid_until && (
                                    <span className={`text-[11px] ${expiree ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'}`}>
                                      {expiree ? 'expirée le' : "jusqu'au"} {new Date(`${p.valid_until}T12:00:00`).toLocaleDateString('fr-FR')}
                                    </span>
                                  )}
                                  <RemoveProofButton proofId={p.id} />
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        <ProofUpload indicatorId={ind.id} />
                      </div>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}

      {onglet === 'dossiers' && (
        <>
          <section className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <StatCard label="Dossiers prêts" value={`${pretsDossiers}/${dossiers.length}`} hint={dossiers.length > 0 && pretsDossiers === dossiers.length ? 'tous prêts' : '—'} href="/qualiopi?filter=ready" />
            <StatCard label="Dossiers bloquants" value={bloquantsDossiers} hint={bloquantsDossiers > 0 ? 'à traiter' : 'aucun'} href="/qualiopi?filter=blocking" />
            <StatCard label="Indicateurs de dossier satisfaits" value={`${dossiers.reduce((n, d) => n + d.satisfied, 0)}`} hint={`/ ${dossiers.reduce((n, d) => n + d.total, 0)}`} />
          </section>

          {filtre && (
            <p className="mb-3 text-[13px] text-zinc-500 dark:text-zinc-400">
              Filtré sur{' '}
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {filtre === 'blocking' ? 'dossiers bloquants' : 'dossiers conformes'}
              </span>{' '}
              —{' '}
              <Link href="/qualiopi?onglet=dossiers" className="text-orange-600 hover:underline">
                tout afficher
              </Link>
            </p>
          )}

          {dossiersAffiches.length === 0 ? (
            <p className="text-[13px] text-zinc-400 text-center py-12">Aucun dossier en cours à suivre.</p>
          ) : (
            <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
              {dossiersAffiches.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/dossiers/${d.id}/qualiopi`}
                    className="grid grid-cols-[110px_1fr_1fr_120px_120px_140px] gap-3 py-3 px-1 items-center text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
                  >
                    <IdPill>{d.reference}</IdPill>
                    <span className="text-zinc-900 dark:text-zinc-100">{d.learnerName}</span>
                    <span className="text-zinc-500 dark:text-zinc-400 truncate">{d.formationTitle}</span>
                    <span className="text-zinc-500 dark:text-zinc-400">{dossierStatusLabel(d.status)}</span>
                    <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                      {d.satisfied}/{d.total}
                    </span>
                    {d.ready ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-500">
                        <ShieldCheck className="w-3.5 h-3.5" /> prêt
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-500">
                        <ShieldAlert className="w-3.5 h-3.5" /> {d.blocking} bloquant{d.blocking > 1 ? 's' : ''}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
