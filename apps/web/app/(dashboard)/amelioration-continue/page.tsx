// ARCHETYPE: command
// Justification: amélioration continue façon Digiforma — axes d'amélioration suivis en trois
// temps, incidents (aléas, difficultés, abandons), actions correctives, registre de veille.
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  Telescope,
  ClipboardCheck,
  MessageSquareWarning,
  Plus,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Target,
  TriangleAlert,
  Info,
} from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { ACCENTS, KpiCard, type Accent } from '@/shared/ui/kpi-card';
import { FormField, inputClass } from '@/shared/ui/form-field';
import {
  ACTION_ORIGIN_LABELS,
  AXIS_STATUSES,
  AXIS_STATUS_LABELS,
  INCIDENT_KINDS,
  INCIDENT_KIND_LABELS,
  SEVERITY_LABELS,
  type ActionOrigin,
  type AxisStatus,
  type IncidentKind,
  type Severity,
} from '@/features/amelioration/schemas';
import {
  createAxis,
  createImprovementAction,
  createIncident,
  createVeilleEntry,
  moveAxis,
  resolveIncident,
  updateImprovementStatus,
} from './actions';

export const dynamic = 'force-dynamic';

const VEILLE_CAT_LABELS: Record<string, string> = {
  legale: 'Légale & réglementaire',
  metier: 'Métier & secteur',
  pedagogique: 'Pédagogique',
  technologique: 'Technologique',
  handicap: 'Handicap',
  autre: 'Autre',
};
const ACTION_STATUS: Record<string, { label: string; tone: 'neutral' | 'warning' | 'success' }> = {
  open: { label: 'à faire', tone: 'neutral' },
  in_progress: { label: 'en cours', tone: 'warning' },
  done: { label: 'terminée', tone: 'success' },
};
const ERREURS: Record<string, string> = {
  forbidden: 'Réservé aux personnes qui gèrent la qualité.',
  unauthenticated: 'Session expirée — reconnectez-vous.',
  titre_requis: 'Donnez un titre.',
  resolution_requise: 'Indiquez comment l’incident a été traité.',
  url_invalide: 'L’adresse de la source n’est pas valide.',
  date_invalide: 'Date invalide.',
};

// Une couleur par colonne du suivi des axes (à lancer → en cours → optimisé).
const AXE_ACCENTS: Accent[] = ['blue', 'amber', 'emerald'];

type Onglet = 'axes' | 'incidents' | 'actions' | 'veille';

type VeilleRow = { id: string; category: string; title: string; summary: string | null; source_url: string | null; status: string; created_at: string };
type ActionRow = {
  id: string;
  origin: ActionOrigin;
  complaint_id: string | null;
  incident_id: string | null;
  axis_id: string | null;
  title: string;
  owner: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  created_at: string;
};
type ComplaintRow = { id: string; reference: string; subject: string; severity: string };
type IncidentRow = {
  id: string;
  kind: IncidentKind;
  title: string;
  description: string | null;
  occurred_on: string;
  severity: Severity;
  status: 'ouvert' | 'traite';
  resolution: string | null;
};
type AxisRow = { id: string; title: string; description: string | null; indicator_number: number | null; status: AxisStatus };

async function load() {
  const sb = supabaseServer();
  const t = (nom: string) => sb.schema('app').from(nom as never);
  const [veille, actions, complaints, incidents, axes] = await Promise.all([
    t('veille_entries').select('id, category, title, summary, source_url, status, created_at').order('created_at', { ascending: false }).limit(200),
    t('improvement_actions')
      .select('id, origin, complaint_id, incident_id, axis_id, title, owner, priority, status, due_date, created_at')
      .order('created_at', { ascending: false })
      .limit(300),
    t('complaints').select('id, reference, subject, severity').is('resolved_at' as never, null).is('deleted_at' as never, null).order('created_at', { ascending: false }).limit(50),
    t('quality_incidents')
      .select('id, kind, title, description, occurred_on, severity, status, resolution')
      .order('occurred_on', { ascending: false })
      .limit(200),
    t('improvement_axes').select('id, title, description, indicator_number, status').order('created_at', { ascending: true }).limit(200),
  ]);
  // Tant que la migration 0144 n'est pas appliquée, incidents et axes sont illisibles.
  const nouveautesIndisponibles = Boolean(incidents.error || axes.error);
  return {
    veille: (veille.data ?? []) as unknown as VeilleRow[],
    actions: (actions.error ? [] : actions.data ?? []) as unknown as ActionRow[],
    complaints: (complaints.data ?? []) as unknown as ComplaintRow[],
    incidents: (incidents.data ?? []) as unknown as IncidentRow[],
    axes: (axes.data ?? []) as unknown as AxisRow[],
    nouveautesIndisponibles,
  };
}

export default async function AmeliorationContinuePage({ searchParams }: { searchParams: { onglet?: string; error?: string } }) {
  const { veille, actions, complaints, incidents, axes, nouveautesIndisponibles } = await load();
  const onglet: Onglet = (['axes', 'incidents', 'actions', 'veille'] as const).find((o) => o === searchParams.onglet) ?? 'axes';

  const avecActionReclamation = new Set(actions.map((a) => a.complaint_id).filter(Boolean));
  const avecActionIncident = new Set(actions.map((a) => a.incident_id).filter(Boolean));
  const reclamationsSansAction = complaints.filter((c) => !avecActionReclamation.has(c.id));
  const incidentsOuverts = incidents.filter((i) => i.status === 'ouvert');
  const incidentsSansAction = incidentsOuverts.filter((i) => !avecActionIncident.has(i.id));
  const axeDe = new Map(axes.map((a) => [a.id, a]));

  const onglets: { id: Onglet; label: string }[] = [
    { id: 'axes', label: `Axes d’amélioration (${axes.length})` },
    { id: 'incidents', label: `Incidents (${incidentsOuverts.length} ouvert${incidentsOuverts.length > 1 ? 's' : ''})` },
    { id: 'actions', label: `Actions (${actions.filter((a) => a.status !== 'done').length} ouvertes)` },
    { id: 'veille', label: `Veille (${veille.length})` },
  ];

  return (
    <div className="max-w-6xl w-full mx-auto px-8 py-9 space-y-7">
      <header>
        <SectionLabel className="mb-2">Qualité · Critères 6 et 7</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Amélioration continue</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3 max-w-3xl">
          Incidents et réclamations donnent lieu à des actions correctives, rattachées à des axes d&apos;amélioration
          suivis jusqu&apos;à ce qu&apos;ils soient optimisés. Indicateurs 23 à 25, 31 et 32.
        </p>
      </header>

      {searchParams.error && (
        <div className="flex items-start gap-2.5 p-3.5 bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 rounded-lg text-[13px] text-red-800 dark:text-red-200">
          <TriangleAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {ERREURS[searchParams.error] ?? searchParams.error}
        </div>
      )}
      {nouveautesIndisponibles && (
        <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 rounded-lg text-[13px] text-amber-900 dark:text-amber-200">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          Incidents et axes d&apos;amélioration seront disponibles une fois la migration 0144 appliquée.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard label="Axes en cours" value={axes.filter((a) => a.status === 'en_cours').length} icon={Target} accent="purple" />
        <KpiCard label="Incidents ouverts" value={incidentsOuverts.length} icon={TriangleAlert} accent="amber" />
        <KpiCard label="Réclamations ouvertes" value={complaints.length} icon={MessageSquareWarning} accent="amber" href="/reclamations" />
        <KpiCard label="Actions ouvertes" value={actions.filter((a) => a.status !== 'done').length} icon={ClipboardCheck} accent="emerald" />
      </div>

      <nav className="flex items-center gap-1 border-b border-zinc-200/70 dark:border-zinc-800 overflow-x-auto">
        {onglets.map((o) => (
          <Link
            key={o.id}
            href={`/amelioration-continue?onglet=${o.id}`}
            aria-current={onglet === o.id ? 'page' : undefined}
            className={`text-[13px] px-3 py-2 -mb-px border-b-2 whitespace-nowrap transition tabular-nums ${
              onglet === o.id
                ? 'border-orange-500 text-zinc-900 dark:text-zinc-100 font-bold'
                : 'border-transparent text-zinc-500 dark:text-zinc-400 font-medium hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            {o.label}
          </Link>
        ))}
      </nav>

      {onglet === 'axes' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
              Ce que l&apos;organisme a décidé d&apos;améliorer, et où il en est.
            </p>
            <NewAxisForm />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {AXIS_STATUSES.map((statut, i) => {
              const duStatut = axes.filter((a) => a.status === statut);
              const accent = AXE_ACCENTS[i] ?? 'purple';
              return (
                <div key={statut} className={`bg-gradient-to-br border rounded-xl p-3 ${ACCENTS[accent].card}`}>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${ACCENTS[accent].bar}`} aria-hidden />
                      {AXIS_STATUS_LABELS[statut]}
                    </h2>
                    <span className={`text-[12px] font-bold tabular-nums px-2 py-0.5 rounded-full ${ACCENTS[accent].soft}`}>{duStatut.length}</span>
                  </div>
                  {duStatut.length === 0 ? (
                    <p className="text-[12px] text-zinc-400 px-1 py-2">Aucun axe.</p>
                  ) : (
                    <ul className="space-y-2">
                      {duStatut.map((axe) => {
                        const siennes = actions.filter((a) => a.axis_id === axe.id);
                        const faites = siennes.filter((a) => a.status === 'done').length;
                        return (
                          <li key={axe.id} className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-lg shadow-sm p-3 space-y-2">
                            <div className="flex items-start gap-2">
                              <p className="flex-1 text-[15px] font-bold text-zinc-900 dark:text-zinc-100">{axe.title}</p>
                              {axe.indicator_number && (
                                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                                  I{axe.indicator_number}
                                </span>
                              )}
                            </div>
                            {axe.description && <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{axe.description}</p>}
                            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                              {siennes.length === 0 ? 'Aucune action' : `${faites}/${siennes.length} action${siennes.length > 1 ? 's' : ''} terminée${faites > 1 ? 's' : ''}`}
                            </p>
                            <form action={createImprovementAction} className="flex gap-1.5">
                              <input type="hidden" name="retour" value="axes" />
                              <input type="hidden" name="axisId" value={axe.id} />
                              <input type="hidden" name="origin" value="audit" />
                              <input name="title" required placeholder="Nouvelle action" aria-label="Nouvelle action" className={`${inputClass} !text-[12px] !py-1`} />
                              <button type="submit" aria-label="Ajouter l'action" className="w-8 h-8 flex-shrink-0 rounded-md grid place-items-center text-zinc-500 dark:text-zinc-400 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-950/40 dark:hover:text-orange-300 transition">
                                <Plus className="w-4 h-4" />
                              </button>
                            </form>
                            <div className="flex justify-between">
                              {i > 0 ? <MoveAxis id={axe.id} vers={AXIS_STATUSES[i - 1]!} sens="gauche" /> : <span />}
                              {i < AXIS_STATUSES.length - 1 && <MoveAxis id={axe.id} vers={AXIS_STATUSES[i + 1]!} sens="droite" />}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {onglet === 'incidents' && (
        <section className="space-y-6">
          <div className="space-y-3">
            <SectionLabel>À traiter</SectionLabel>
            {reclamationsSansAction.length === 0 && incidentsSansAction.length === 0 ? (
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucune réclamation ni aucun incident ouvert sans action corrective.</p>
            ) : (
              <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden">
                {reclamationsSansAction.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-5 py-3.5 text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                    <span className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${ACCENTS.amber.soft}`}>
                      <MessageSquareWarning className="w-4 h-4" />
                    </span>
                    <Link href={`/reclamations/${c.id}`} className="font-mono text-[11px] text-zinc-500 hover:underline">{c.reference}</Link>
                    <span className="flex-1 font-bold text-zinc-900 dark:text-zinc-100 truncate">{c.subject}</span>
                    <ActionCorrective
                      origin="reclamation"
                      lien={{ complaintId: c.id }}
                      titre={`Traiter la réclamation ${c.reference} — ${c.subject}`}
                      priorite={c.severity === 'critical' || c.severity === 'high' ? 'high' : 'medium'}
                    />
                  </li>
                ))}
                {incidentsSansAction.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-5 py-3.5 text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                    <span className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${ACCENTS.amber.soft}`}>
                      <TriangleAlert className="w-4 h-4" />
                    </span>
                    <span className="text-[12px] text-zinc-500 dark:text-zinc-400">{INCIDENT_KIND_LABELS[i.kind]}</span>
                    <span className="flex-1 font-bold text-zinc-900 dark:text-zinc-100 truncate">{i.title}</span>
                    <ActionCorrective origin="incident" lien={{ incidentId: i.id }} titre={`Suite à l’incident — ${i.title}`} priorite={i.severity === 'elevee' ? 'high' : 'medium'} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <SectionLabel>Incidents</SectionLabel>
              <NewIncidentForm />
            </div>
            {incidents.length === 0 ? (
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                Aucun incident déclaré. Consignez ici les aléas, difficultés, abandons et insatisfactions survenus en cours de formation.
              </p>
            ) : (
              <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden">
                {incidents.map((i) => (
                  <li key={i.id} className="px-5 py-3.5 text-[13px] space-y-2 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-[12px] font-semibold ${ACCENTS.amber.soft}`}>
                        <TriangleAlert className="w-3 h-3" />
                        {INCIDENT_KIND_LABELS[i.kind]}
                      </span>
                      <span className="flex-1 text-[15px] font-bold text-zinc-900 dark:text-zinc-100 min-w-0">{i.title}</span>
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">{format(parseISO(i.occurred_on), 'dd MMM yyyy', { locale: fr })}</span>
                      <span className="text-[12px] text-zinc-500 dark:text-zinc-400">Gravité {SEVERITY_LABELS[i.severity].toLowerCase()}</span>
                      <StatusPill tone={i.status === 'traite' ? 'success' : 'warning'}>{i.status === 'traite' ? 'traité' : 'ouvert'}</StatusPill>
                    </div>
                    {i.description && <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{i.description}</p>}
                    {i.status === 'traite' ? (
                      <p className="text-[12px] text-emerald-700 dark:text-emerald-400">Traitement : {i.resolution}</p>
                    ) : (
                      <form action={resolveIncident} className="flex gap-2 items-start">
                        <input type="hidden" name="id" value={i.id} />
                        <input name="resolution" required placeholder="Comment l’incident a-t-il été traité ?" aria-label="Traitement de l'incident" className={`${inputClass} !text-[12px]`} />
                        <button type="submit" className="inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 h-9 rounded-lg text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 whitespace-nowrap">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Marquer traité
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {onglet === 'actions' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Plan d&apos;actions</SectionLabel>
            <NewActionForm axes={axes} />
          </div>
          {actions.length === 0 ? (
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucune action pour le moment.</p>
          ) : (
            <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden">
              {actions.map((a) => {
                const st = ACTION_STATUS[a.status] ?? ACTION_STATUS.open!;
                const axe = a.axis_id ? axeDe.get(a.axis_id) : undefined;
                return (
                  <li key={a.id} className="grid grid-cols-1 sm:grid-cols-[1fr_110px_110px_170px] gap-2 sm:gap-4 px-5 py-3.5 items-center text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                    <span className="min-w-0 flex items-start gap-3">
                      <span className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${ACCENTS[a.status === 'done' ? 'emerald' : a.status === 'in_progress' ? 'amber' : 'orange'].soft}`}>
                        {a.status === 'done' ? <CheckCircle2 className="w-4 h-4" /> : <ClipboardCheck className="w-4 h-4" />}
                      </span>
                      <span className="min-w-0">
                      <span className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">{a.title}</span>
                      <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                        {ACTION_ORIGIN_LABELS[a.origin] ?? a.origin}
                        {a.complaint_id && (
                          <>
                            {' · '}
                            <Link href={`/reclamations/${a.complaint_id}`} className="hover:underline">réclamation</Link>
                          </>
                        )}
                        {axe ? ` · axe « ${axe.title} »` : ''}
                        {a.owner ? ` · ${a.owner}` : ''}
                        {a.due_date ? ` · échéance ${format(parseISO(a.due_date), 'dd/MM/yy')}` : ''}
                      </span>
                      </span>
                    </span>
                    <StatusPill tone={st.tone}>{st.label}</StatusPill>
                    <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">{format(parseISO(a.created_at), 'dd MMM yyyy', { locale: fr })}</span>
                    <span className="flex items-center gap-1.5 sm:justify-end">
                      {a.status === 'open' && <StatusButton id={a.id} status="in_progress" label="Démarrer" />}
                      {a.status !== 'done' && <StatusButton id={a.id} status="done" label="Terminer" done />}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {onglet === 'veille' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Registre de veille</SectionLabel>
            <NewVeilleForm />
          </div>
          {veille.length === 0 ? (
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucune entrée de veille.</p>
          ) : (
            <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden">
              {veille.map((v) => (
                <li key={v.id} className="px-5 py-3.5 text-[13px] hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0 ${ACCENTS.purple.soft}`}>
                      <Telescope className="w-4 h-4" />
                    </span>
                    <span className={`inline-flex items-center h-6 px-2 rounded-md text-[12px] font-semibold whitespace-nowrap ${ACCENTS.purple.soft}`}>
                      {VEILLE_CAT_LABELS[v.category] ?? v.category}
                    </span>
                    <span className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 flex-1 truncate">{v.title}</span>
                    <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">{format(parseISO(v.created_at), 'dd MMM yyyy', { locale: fr })}</span>
                  </div>
                  {v.summary && <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1">{v.summary}</p>}
                  {v.source_url && (
                    <a href={v.source_url} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-orange-600 dark:text-orange-400 hover:underline">
                      Source
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function MoveAxis({ id, vers, sens }: { id: string; vers: AxisStatus; sens: 'gauche' | 'droite' }) {
  return (
    <form action={moveAxis}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={vers} />
      <button
        type="submit"
        className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-1.5 py-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
      >
        {sens === 'gauche' && <ArrowLeft className="w-3 h-3" />}
        {AXIS_STATUS_LABELS[vers]}
        {sens === 'droite' && <ArrowRight className="w-3 h-3" />}
      </button>
    </form>
  );
}

function ActionCorrective({
  origin,
  lien,
  titre,
  priorite,
}: {
  origin: 'reclamation' | 'incident';
  lien: { complaintId?: string; incidentId?: string };
  titre: string;
  priorite: 'high' | 'medium';
}) {
  return (
    <form action={createImprovementAction}>
      <input type="hidden" name="retour" value="incidents" />
      <input type="hidden" name="origin" value={origin} />
      {lien.complaintId && <input type="hidden" name="complaintId" value={lien.complaintId} />}
      {lien.incidentId && <input type="hidden" name="incidentId" value={lien.incidentId} />}
      <input type="hidden" name="title" value={titre.slice(0, 200)} />
      <input type="hidden" name="priority" value={priorite} />
      <button type="submit" className="inline-flex items-center gap-1 text-[12px] text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 font-semibold whitespace-nowrap">
        Créer une action corrective <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </form>
  );
}

function StatusButton({ id, status, label, done }: { id: string; status: string; label: string; done?: boolean }) {
  return (
    <form action={updateImprovementStatus}>
      <input type="hidden" name="retour" value="actions" />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        className={`inline-flex items-center gap-1 text-[12px] font-semibold px-2.5 h-8 rounded-lg transition ${
          done
            ? 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        }`}
      >
        {done && <CheckCircle2 className="w-3 h-3" />}
        {label}
      </button>
    </form>
  );
}

const panneau =
  'absolute right-0 z-10 mt-2 w-80 bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-lg p-4 space-y-3';
const declencheur =
  'list-none cursor-pointer text-[13px] font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 h-9 inline-flex items-center gap-1.5 transition';
const valider =
  'w-full bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-3 h-9 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10';

function NewAxisForm() {
  return (
    <details className="relative">
      <summary className={declencheur}>
        <Plus className="w-3.5 h-3.5" /> Nouvel axe
      </summary>
      <form action={createAxis} className={panneau}>
        <FormField label="Axe d’amélioration" required>
          <input type="text" name="title" required maxLength={200} className={inputClass} placeholder="Ex. : réduire les abandons en cours de parcours" />
        </FormField>
        <FormField label="Indicateur Qualiopi servi">
          <input type="number" name="indicatorNumber" min={1} max={33} className={inputClass} placeholder="Ex. : 12" />
        </FormField>
        <FormField label="Constat, objectif">
          <textarea name="description" rows={3} maxLength={4000} className={inputClass} />
        </FormField>
        <button type="submit" className={valider}>
          Ajouter l&apos;axe
        </button>
      </form>
    </details>
  );
}

function NewIncidentForm() {
  return (
    <details className="relative">
      <summary className={declencheur}>
        <Plus className="w-3.5 h-3.5" /> Déclarer un incident
      </summary>
      <form action={createIncident} className={panneau}>
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Nature" required>
            <select name="kind" defaultValue="alea" className={inputClass}>
              {INCIDENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {INCIDENT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Gravité">
            <select name="severity" defaultValue="moyenne" className={inputClass}>
              {(Object.keys(SEVERITY_LABELS) as Severity[]).map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABELS[s]}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="Intitulé" required>
          <input type="text" name="title" required maxLength={200} className={inputClass} placeholder="Ex. : formateur absent le 12 mars" />
        </FormField>
        <FormField label="Date">
          <input type="date" name="occurredOn" className={inputClass} />
        </FormField>
        <FormField label="Description">
          <textarea name="description" rows={2} maxLength={4000} className={inputClass} />
        </FormField>
        <button type="submit" className={valider}>
          Déclarer l&apos;incident
        </button>
      </form>
    </details>
  );
}

function NewActionForm({ axes }: { axes: AxisRow[] }) {
  return (
    <details className="relative">
      <summary className={declencheur}>
        <Plus className="w-3.5 h-3.5" /> Nouvelle action
      </summary>
      <form action={createImprovementAction} className={panneau}>
        <input type="hidden" name="retour" value="actions" />
        <FormField label="Titre" required>
          <input type="text" name="title" required maxLength={200} className={inputClass} placeholder="Action à mener" />
        </FormField>
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Origine">
            <select name="origin" defaultValue="autre" className={inputClass}>
              <option value="satisfaction">Satisfaction</option>
              <option value="audit">Audit</option>
              <option value="veille">Veille</option>
              <option value="autre">Autre</option>
            </select>
          </FormField>
          <FormField label="Priorité">
            <select name="priority" defaultValue="medium" className={inputClass}>
              <option value="low">Basse</option>
              <option value="medium">Moyenne</option>
              <option value="high">Haute</option>
            </select>
          </FormField>
        </div>
        {axes.length > 0 && (
          <FormField label="Axe d’amélioration">
            <select name="axisId" defaultValue="" className={inputClass}>
              <option value="">—</option>
              {axes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <div className="grid grid-cols-2 gap-2">
          <FormField label="Responsable">
            <input type="text" name="owner" maxLength={200} className={inputClass} placeholder="Nom" />
          </FormField>
          <FormField label="Échéance">
            <input type="date" name="dueDate" className={inputClass} />
          </FormField>
        </div>
        <FormField label="Description">
          <textarea name="description" rows={2} maxLength={4000} className={inputClass} />
        </FormField>
        <button type="submit" className={valider}>
          Ajouter l&apos;action
        </button>
      </form>
    </details>
  );
}

function NewVeilleForm() {
  return (
    <details className="relative">
      <summary className={declencheur}>
        <Plus className="w-3.5 h-3.5" /> Nouvelle entrée
      </summary>
      <form action={createVeilleEntry} className={panneau}>
        <FormField label="Catégorie" required>
          <select name="category" defaultValue="legale" className={inputClass}>
            {Object.entries(VEILLE_CAT_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Titre" required>
          <input type="text" name="title" required maxLength={200} className={inputClass} placeholder="Sujet de veille" />
        </FormField>
        <FormField label="Résumé">
          <textarea name="summary" rows={2} className={inputClass} />
        </FormField>
        <FormField label="Source (URL)">
          <input type="url" name="source_url" className={inputClass} placeholder="https://…" />
        </FormField>
        <FormField label="Impact">
          <input type="text" name="impact" className={inputClass} placeholder="Conséquence / action" />
        </FormField>
        <button type="submit" className={valider}>
          Ajouter l&apos;entrée
        </button>
      </form>
    </details>
  );
}

