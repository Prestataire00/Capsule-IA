// ARCHETYPE: command
// Justification: fiche détail formation en données réelles — KPIs, dossiers liés, sessions de groupe, lien d'inscription.

import Link from 'next/link';
import { GroupSessionForm } from './group-session-form.client';
import { notFound } from 'next/navigation';
import {
  ArrowLeft, Clock, Video, MapPin, GraduationCap, Eye, EyeOff,
  Users as UsersIcon, Banknote, FileText, Sparkles, ExternalLink, Award, Pencil,
} from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { CopyInscriptionLink } from '@/shared/ui/copy-inscription-link';

const modalityStyles = {
  presentiel: { bg: 'bg-violet-100 dark:bg-violet-950/40', text: 'text-violet-700 dark:text-violet-400', icon: MapPin, label: 'Présentiel' },
  distanciel: { bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-400', icon: Video, label: 'Distanciel' },
  hybride: { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400', icon: GraduationCap, label: 'Hybride' },
};
type ModalityKey = keyof typeof modalityStyles;

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  scheduled: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  completed: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  closed: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  draft: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  pending_validation: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  archived: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-500',
  cancelled: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
};

const statusLabel: Record<string, string> = {
  active: 'En cours', scheduled: 'Planifié', completed: 'Terminé', closed: 'Clos',
  draft: 'Brouillon', pending_validation: 'À valider', archived: 'Archivé', cancelled: 'Annulé',
};

const formatEuros = (cents: number | null) =>
  cents == null ? '—' : `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;

const ACTIVE = ['active', 'scheduled'];
const REVENUE = ['active', 'completed', 'closed'];

export default async function FormationDetailPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const id = params.id;

  const { data } = await sb
    .schema('app')
    .from('formations')
    .select(
      'id, code, title, summary, description, objectives, prerequisites, target_audience, ' +
        'evaluation_method, pedagogical_method, default_modality, default_duration_hours, ' +
        'default_price_cents, is_published, rncp_code, rs_code, certificateur',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = data as any;
  if (!f) return notFound();

  const { data: dossierData } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, reference, status, total_amount_cents, learner:learners(first_name, last_name)')
    .eq('formation_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const relatedDossiers = ((dossierData as any[]) ?? []);

  // Sessions de cette formation = sessions de groupe (formation_id) + sessions des dossiers rattachés.
  // Repli sur les seules sessions par dossier si `formation_id` n'est pas encore connu du
  // cache de schéma PostgREST (migration 0106) — évite « erreur base de données » sur la fiche.
  const dossierIds = relatedDossiers.map((d) => d.id);
  const orFilter = dossierIds.length
    ? `formation_id.eq.${id},dossier_id.in.(${dossierIds.join(',')})`
    : `formation_id.eq.${id}`;
  const primary = await sb
    .schema('app')
    .from('sessions')
    .select('id, title, status, starts_at, ends_at, modality, remote_url, dossier_id, formation_id')
    .or(orFilter)
    .order('starts_at', { ascending: false })
    .limit(50);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sessionData = primary.data as any[] | null;
  if (primary.error) {
    console.error('[formation] sessions avec formation_id échouées, repli par dossier:', primary.error);
    if (dossierIds.length) {
      const fb = await sb
        .schema('app')
        .from('sessions')
        .select('id, title, status, starts_at, ends_at, modality, remote_url, dossier_id')
        .in('dossier_id', dossierIds)
        .order('starts_at', { ascending: false })
        .limit(50);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sessionData = fb.data as any[] | null;
    }
  }
  const sessions = sessionData ?? [];

  const activeCount = relatedDossiers.filter((d) => ACTIVE.includes(d.status)).length;
  const totalRevenue = relatedDossiers
    .filter((d) => REVENUE.includes(d.status))
    .reduce((acc, d) => acc + (d.total_amount_cents ?? 0), 0);

  const objectives: string[] = f.objectives ?? [];
  const prerequisites: string[] = f.prerequisites ?? [];
  const description: string | null = f.description ?? f.summary ?? null;

  const m = modalityStyles[f.default_modality as ModalityKey] ?? modalityStyles.presentiel;
  const Icon = m.icon;
  const isCertifiante = !!(f.rncp_code || f.rs_code);

  return (
    <div className="max-w-7xl w-full mx-auto px-6 py-5">
      <Link
        href="/formations"
        className="text-[12px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Retour au catalogue
      </Link>

      {/* En-tête compact : identité + badges + KPIs + actions, sur une seule bande */}
      <header className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm px-5 py-4 mb-4">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-start gap-3.5 min-w-0">
            <span className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${m.bg}`}>
              <Icon className={`w-5 h-5 ${m.text}`} />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">{f.code}</p>
              <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight leading-tight">{f.title}</h1>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${m.bg} ${m.text}`}>
                  <Icon className="w-2.5 h-2.5" /> {m.label}
                </span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  <Clock className="w-2.5 h-2.5" /> {Number(f.default_duration_hours)} h
                </span>
                {f.default_price_cents > 0 && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    <Banknote className="w-2.5 h-2.5" /> {formatEuros(f.default_price_cents)} HT
                  </span>
                )}
                {isCertifiante && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                    <Award className="w-2.5 h-2.5" /> {f.rncp_code ? `RNCP ${f.rncp_code}` : `RS ${f.rs_code}`}
                  </span>
                )}
                <span className={
                  f.is_published
                    ? 'text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 inline-flex items-center gap-1'
                    : 'text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 inline-flex items-center gap-1'
                }>
                  {f.is_published ? (<><Eye className="w-2.5 h-2.5" /> publiée</>) : (<><EyeOff className="w-2.5 h-2.5" /> brouillon</>)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2.5">
            <div className="flex items-center gap-2">
              <Link
                href={`/formations/${f.id}/programme`}
                className="text-[12px] font-medium px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition inline-flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" /> Programme
              </Link>
              <Link
                href={`/formations/${f.id}/edit`}
                className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-950 transition inline-flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" /> Modifier
              </Link>
              <CopyInscriptionLink formationId={f.id} variant="full" />
            </div>
            <div className="flex items-center gap-5">
              <Stat icon={UsersIcon} label="Apprenants actifs" value={activeCount} />
              <Stat icon={Banknote} label="CA généré" value={formatEuros(totalRevenue)} />
              <Stat icon={FileText} label="Dossiers" value={relatedDossiers.length} />
            </div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Colonne pédagogie — une seule carte, sections compactes */}
        <Card title="Programme pédagogique" className="lg:col-span-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            {description && (
              <Section label="Description" className="sm:col-span-2">
                <p className="text-[13px] text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-line line-clamp-4">{description}</p>
              </Section>
            )}
            {objectives.length > 0 && (
              <Section label="Objectifs pédagogiques">
                <ul className="space-y-1">
                  {objectives.map((o, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[13px] text-zinc-600 dark:text-zinc-400">
                      <span className="text-violet-500 mt-0.5 flex-shrink-0">{i + 1}.</span> {o}
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {(f.target_audience || prerequisites.length > 0) && (
              <Section label="Public visé & prérequis">
                {f.target_audience && (
                  <p className="text-[13px] text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-line">{f.target_audience}</p>
                )}
                {prerequisites.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {prerequisites.map((p, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[13px] text-zinc-600 dark:text-zinc-400">
                        <span className="text-zinc-400 mt-0.5">•</span> {p}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            )}
            {!description && objectives.length === 0 && !f.target_audience && prerequisites.length === 0 && (
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400 sm:col-span-2">
                Aucun contenu pédagogique renseigné. <Link href={`/formations/${f.id}/edit`} className="text-violet-600 hover:underline">Compléter</Link>.
              </p>
            )}
          </div>
        </Card>

        {/* Colonne actions — inscription, dossiers, sessions */}
        <div className="space-y-4">
          <Card title="Lien d'inscription">
            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 mb-2">
              <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400 truncate flex-1">/inscription?formation={f.id}</span>
              <Link href={`/inscription?formation=${f.id}`} target="_blank" title="Ouvrir" className="text-zinc-400 hover:text-violet-600 flex-shrink-0">
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
            <CopyInscriptionLink formationId={f.id} variant="full" />
          </Card>

          <Card title={`Dossiers (${relatedDossiers.length})`}>
            {relatedDossiers.length === 0 ? (
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun dossier rattaché.</p>
            ) : (
              <ul className="-my-1">
                {relatedDossiers.slice(0, 5).map((d) => {
                  const learner = d.learner ? `${d.learner.first_name} ${d.learner.last_name}` : null;
                  return (
                    <li key={d.id}>
                      <Link href={`/dossiers/${d.id}`} className="flex items-center justify-between gap-2 px-2.5 py-1.5 -mx-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950 transition">
                        <span className="text-[13px] text-zinc-900 dark:text-zinc-100 truncate">{learner ?? d.reference}</span>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statusStyles[d.status] ?? statusStyles.draft}`}>
                          {statusLabel[d.status] ?? d.status}
                        </span>
                      </Link>
                    </li>
                  );
                })}
                {relatedDossiers.length > 5 && (
                  <li className="px-2.5 pt-1 text-[11px] text-zinc-400">+{relatedDossiers.length - 5} autre(s)</li>
                )}
              </ul>
            )}
          </Card>

          <Card title={`Sessions (${sessions.length})`}>
            <div className="mb-2 pb-2 border-b border-zinc-100 dark:border-zinc-800/60">
              <GroupSessionForm formationId={id} />
            </div>
            {sessions.length === 0 ? (
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucune session. Créez-en une ci-dessus.</p>
            ) : (
              <ul className="-my-1">
                {sessions.slice(0, 5).map((s) => {
                  const isGroup = !s.dossier_id;
                  const row = (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] text-zinc-900 dark:text-zinc-100 truncate">
                        {s.title || 'Session'}
                        {isGroup && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">groupe</span>}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-400 shrink-0">
                        {new Date(s.starts_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </span>
                    </div>
                  );
                  return (
                    <li key={s.id}>
                      {isGroup ? (
                        <div className="px-2.5 py-1.5 -mx-2.5">{row}</div>
                      ) : (
                        <Link href={`/dossiers/${s.dossier_id}/sessions`} className="block px-2.5 py-1.5 -mx-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950 transition">{row}</Link>
                      )}
                    </li>
                  );
                })}
                <li className="px-2.5 pt-1">
                  <Link href={`/sessions?formation=${id}`} className="text-[12px] text-violet-600 dark:text-violet-400 hover:underline">
                    Voir toutes les sessions →
                  </Link>
                </li>
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// KPI inline compact (dans l'en-tête).
function Stat({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="text-right">
      <p className="text-[18px] font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums leading-none inline-flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-zinc-400" /> {value}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mt-1">{label}</p>
    </div>
  );
}

// Sous-section libellée dans la carte Programme.
function Section({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-medium mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-4 shadow-sm ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-3 h-3 text-violet-500" />
        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">{title}</p>
      </div>
      {children}
    </div>
  );
}
