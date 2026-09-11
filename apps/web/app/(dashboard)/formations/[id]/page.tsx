// ARCHETYPE: command
// Justification: fiche détail formation en données réelles — KPIs, dossiers liés, sessions de groupe, lien d'inscription.

import Link from 'next/link';
import { GroupSessionForm } from './group-session-form.client';
import { notFound } from 'next/navigation';
import {
  ArrowLeft, Clock, Video, MapPin, GraduationCap, Eye, EyeOff,
  Users as UsersIcon, Banknote, FileText, ExternalLink, Award, Pencil, FolderOpen,
} from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { CopyInscriptionLink } from '@/shared/ui/copy-inscription-link';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill, dossierStatusTone } from '@/shared/ui/status-pill';
import { formationColorMap, NEUTRAL_COLOR } from '@/shared/lib/formation-color';
import { FormationCover } from './cover-upload.client';
import { FormationTabs } from './formation-tabs.client';
import { env } from '@/env.mjs';

const modalityStyles = {
  presentiel: { icon: MapPin, label: 'Présentiel' },
  distanciel: { icon: Video, label: 'Distanciel' },
  hybride: { icon: GraduationCap, label: 'Hybride' },
};
type ModalityKey = keyof typeof modalityStyles;

const PILL = 'text-[12px] font-semibold h-6 px-2 rounded-md inline-flex items-center gap-1.5';
const NEUTRAL_PILL = `${PILL} bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300`;
const SECONDARY_BTN =
  'text-[13px] font-semibold px-3 h-9 rounded-lg border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition inline-flex items-center gap-1.5';
const LINK = 'text-orange-600 dark:text-orange-400 hover:underline';

const statusLabel: Record<string, string> = {
  active: 'En cours', scheduled: 'Planifié', completed: 'Terminé', closed: 'Clos',
  draft: 'Brouillon', pending_validation: 'À valider', archived: 'Archivé', cancelled: 'Annulé',
};

const formatEuros = (cents: number | null) =>
  cents == null ? '—' : `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;

const ACTIVE = ['active', 'scheduled'];
const REVENUE = ['active', 'completed', 'closed'];

const EXPENSE_KIND_LABEL: Record<string, string> = {
  salaire_formateur: 'Rémunération formateur',
  sous_traitance_confiee: 'Sous-traitance',
  achat_formation: 'Achat de formation',
  autre: 'Autre',
};

export default async function FormationDetailPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const id = params.id;

  const { data } = await sb
    .schema('app')
    .from('formations')
    .select(
      'id, code, title, summary, description, objectives, prerequisites, target_audience, ' +
        'evaluation_method, pedagogical_method, default_modality, default_duration_hours, ' +
        'default_price_cents, is_published, rncp_code, rs_code, certificateur, metadata',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = data as any;
  if (!f) return notFound();

  // Couleur d'identité : attribuée dans l'ordre de création de tout le catalogue.
  const { data: formationRows } = await sb.schema('app').from('formations').select('id, created_at').is('deleted_at', null);
  const color = formationColorMap((formationRows as { id: string; created_at: string | null }[] | null) ?? []).get(f.id) ?? NEUTRAL_COLOR;

  const coverPath: string | null = f.metadata?.catalog?.coverPath ?? null;

  // Équipe pédagogique : le formateur par défaut est la source de vérité, sa
  // fiche fournit photo et description — on ne recopie rien.
  const catalog = (f.metadata?.catalog ?? {}) as Record<string, string | undefined>;
  const defaultTrainerId = catalog.defaultTrainerId ?? '';
  const { data: trainerRow } = defaultTrainerId
    ? await sb
        .schema('app')
        .from('trainers')
        .select('id, first_name, last_name, email, phone, bio, photo_path')
        .eq('id', defaultTrainerId)
        .is('deleted_at', null)
        .maybeSingle()
    : { data: null };
  const trainer = trainerRow as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    bio: string | null;
    photo_path: string | null;
  } | null;
  const trainerPhotoUrl = trainer?.photo_path
    ? `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/trainer-photos/${trainer.photo_path}`
    : null;

  const referents = [
    {
      role: 'Référent pédagogique',
      name: catalog.referentContact ?? '',
      email: catalog.referentContactEmail ?? '',
      phone: catalog.referentContactPhone ?? '',
    },
    {
      role: 'Référent handicap',
      name: catalog.referentHandicap ?? '',
      email: catalog.referentHandicapEmail ?? '',
      phone: catalog.referentHandicapPhone ?? '',
    },
  ].filter((r) => r.name || r.email || r.phone);
  let coverUrl: string | null = null;
  if (coverPath) {
    const { data: signed } = await sb.storage.from('org_assets').createSignedUrl(coverPath, 300);
    coverUrl = signed?.signedUrl ?? null;
  }

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

  // Budget consolidé : charges (formation_expenses) alimentées par les sessions.
  const { data: expenseData } = await sb
    .schema('app')
    .from('formation_expenses' as never)
    .select('kind, amount_cents')
    .eq('formation_id', id)
    .is('deleted_at', null);
  const expenses = ((expenseData as { kind: string; amount_cents: number }[] | null) ?? []);
  const totalExpenses = expenses.reduce((a, e) => a + (e.amount_cents ?? 0), 0);
  const expenseByKind = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.kind] = (acc[e.kind] ?? 0) + (e.amount_cents ?? 0);
    return acc;
  }, {});

  // Qualiopi agrégé : conformité des dossiers de la formation (alimentée par sessions/émargements).
  const { data: qcData } = dossierIds.length
    ? await sb
        .schema('app')
        .from('qualiopi_dossier_checklists' as never)
        .select('satisfied_indicators, total_indicators, is_ready')
        .in('dossier_id', dossierIds)
    : { data: [] as unknown[] };
  const checklists = ((qcData as { satisfied_indicators: number; total_indicators: number; is_ready: boolean }[] | null) ?? []);
  const conformes = checklists.filter((c) => c.is_ready).length;

  // Statistiques : heures dispensées (somme des durées de session).
  const heuresDispensees = sessions.reduce(
    (a, s) => a + Math.max(0, (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 3_600_000),
    0,
  );

  // Taux de présence : signatures apprenants « signées » / total, sur les émargements des sessions.
  let presenceRate: number | null = null;
  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length) {
    const { data: sheetRows } = await sb
      .schema('app')
      .from('attendance_sheets')
      .select('id')
      .in('session_id', sessionIds);
    const sheetIds = ((sheetRows as { id: string }[] | null) ?? []).map((r) => r.id);
    if (sheetIds.length) {
      const { data: sigRows } = await sb
        .schema('app')
        .from('attendance_signatures')
        .select('status')
        .eq('participant_kind', 'learner')
        .in('attendance_sheet_id', sheetIds);
      const sigs = ((sigRows as { status: string }[] | null) ?? []);
      const signed = sigs.filter((s) => s.status === 'present' || s.status === 'late' || s.status === 'remote').length;
      presenceRate = sigs.length ? Math.round((signed / sigs.length) * 100) : null;
    }
  }

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
    <div className="max-w-7xl w-full mx-auto px-8 py-9">
      <Link
        href="/formations"
        className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Retour au catalogue
      </Link>

      {/* En-tête : identité + badges + KPIs + actions */}
      <header className="mb-7">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <SectionLabel className="mb-2">
              Formation · <span className="font-mono normal-case tracking-normal">{f.code}</span>
            </SectionLabel>
            <h1 className="flex items-center gap-3 text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">
              <span className="w-3.5 h-3.5 rounded-[4px] shrink-0" style={{ background: color }} aria-hidden />
              <span className="min-w-0">{f.title}</span>
            </h1>
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              <span className={NEUTRAL_PILL}>
                <Icon className="w-3.5 h-3.5" /> {m.label}
              </span>
              <span className={`${NEUTRAL_PILL} tabular-nums`}>
                <Clock className="w-3.5 h-3.5" /> {Number(f.default_duration_hours)} h
              </span>
              {f.default_price_cents > 0 && (
                <span className={`${NEUTRAL_PILL} tabular-nums`}>
                  <Banknote className="w-3.5 h-3.5" /> {formatEuros(f.default_price_cents)} HT
                </span>
              )}
              {isCertifiante && (
                <span className={`${PILL} bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300`}>
                  <Award className="w-3.5 h-3.5" /> {f.rncp_code ? `RNCP ${f.rncp_code}` : `RS ${f.rs_code}`}
                </span>
              )}
              <StatusPill tone={f.is_published ? 'success' : 'warning'}>
                {f.is_published ? (<><Eye className="w-3 h-3" /> publiée</>) : (<><EyeOff className="w-3 h-3" /> brouillon</>)}
              </StatusPill>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/formations/${f.id}/programme`}
              className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2"
            >
              <FileText className="w-4 h-4" /> Programme
            </Link>
            <Link href={`/formations/${f.id}/supports`} className={SECONDARY_BTN}>
              <FolderOpen className="w-3.5 h-3.5" /> Supports
            </Link>
            <Link href={`/formations/${f.id}/edit`} className={SECONDARY_BTN}>
              <Pencil className="w-3.5 h-3.5" /> Modifier
            </Link>
            <CopyInscriptionLink formationId={f.id} variant="full" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
              <Stat icon={UsersIcon} label="Apprenants actifs" value={activeCount} />
              <Stat icon={Banknote} label="CA généré" value={formatEuros(totalRevenue)} />
              <Stat icon={FileText} label="Dossiers" value={relatedDossiers.length} />
        </div>
      </header>

      <FormationTabs
        counts={{ sessions: sessions.length, dossiers: relatedDossiers.length }}
        overview={
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
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
                      <span className="text-zinc-400 font-bold tabular-nums flex-shrink-0">{i + 1}.</span> {o}
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
                Aucun contenu pédagogique renseigné. <Link href={`/formations/${f.id}/edit`} className={LINK}>Compléter</Link>.
              </p>
            )}
          </div>
        </Card>

        {/* Colonne actions — inscription, dossiers, sessions */}
        <div className="space-y-4">
          {(trainer || referents.length > 0) && (
            <Card title="Équipe pédagogique & contacts">
              {trainer && (
                <div className="flex items-start gap-3 pb-3 mb-3 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-[15px] font-medium text-emerald-700 dark:text-emerald-300">
                    {trainerPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={trainerPhotoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      `${trainer.first_name?.[0] ?? ''}${trainer.last_name?.[0] ?? ''}`.toUpperCase() || '?'
                    )}
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={`/formateurs/${trainer.id}`}
                      className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 hover:text-orange-600 dark:hover:text-orange-300 transition"
                    >
                      {`${trainer.first_name ?? ''} ${trainer.last_name ?? ''}`.trim() || 'Formateur'}
                    </Link>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Formateur par défaut</p>
                    {trainer.bio ? (
                      <p className="mt-1 text-[12px] text-zinc-600 dark:text-zinc-400 whitespace-pre-line">
                        {trainer.bio}
                      </p>
                    ) : (
                      <p className="mt-1 text-[12px] text-zinc-400 dark:text-zinc-500">
                        Aucune description sur sa fiche formateur.
                      </p>
                    )}
                  </div>
                </div>
              )}
              {referents.map((r) => (
                <div key={r.role} className="text-[12px] py-1">
                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-400 dark:text-zinc-500">
                    {r.role}
                  </p>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">{r.name || '—'}</p>
                  <p className="text-zinc-500 dark:text-zinc-400">
                    {[r.email, r.phone].filter(Boolean).join(' · ')}
                  </p>
                </div>
              ))}
            </Card>
          )}

          <Card title="Image de couverture (catalogue)">
            <FormationCover formationId={f.id} coverUrl={coverUrl} />
          </Card>

          <Card title="Lien d'inscription">
            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/70 dark:border-zinc-800 rounded-lg px-2.5 h-9 mb-2">
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400 truncate flex-1">/inscription?formation={f.id}</span>
              <Link href={`/inscription?formation=${f.id}`} target="_blank" title="Ouvrir" className="text-zinc-400 hover:text-orange-600 dark:hover:text-orange-300 flex-shrink-0">
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
            <CopyInscriptionLink formationId={f.id} variant="full" />
          </Card>
            </div>
          </div>
        }
        dossiers={
          <Card title={`Dossiers (${relatedDossiers.length})`}>
            {relatedDossiers.length === 0 ? (
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun dossier rattaché.</p>
            ) : (
              <ul className="-mx-4 -mb-4 border-t border-zinc-100 dark:border-zinc-800/80 divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {relatedDossiers.slice(0, 5).map((d) => {
                  const learner = d.learner ? `${d.learner.first_name} ${d.learner.last_name}` : null;
                  return (
                    <li key={d.id}>
                      <Link href={`/dossiers/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                        <span className={`text-[13px] text-zinc-900 dark:text-zinc-100 truncate ${learner ? 'font-bold' : 'font-mono'}`}>{learner ?? d.reference}</span>
                        <StatusPill tone={dossierStatusTone(d.status)} className="flex-shrink-0">
                          {statusLabel[d.status] ?? d.status}
                        </StatusPill>
                      </Link>
                    </li>
                  );
                })}
                {relatedDossiers.length > 5 && (
                  <li className="px-4 py-3 text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">+{relatedDossiers.length - 5} autre(s)</li>
                )}
              </ul>
            )}
          </Card>
        }
        budget={
          <Card title="Budget & charges">
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-[13px] text-zinc-500 dark:text-zinc-400">Total des charges</span>
              <span className="text-[26px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100 tabular-nums">{formatEuros(totalExpenses)}</span>
            </div>
            {Object.keys(expenseByKind).length > 0 ? (
              <ul className="space-y-1 mb-3">
                {Object.entries(expenseByKind).map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between text-[12px]">
                    <span className="text-zinc-600 dark:text-zinc-400">{EXPENSE_KIND_LABEL[k] ?? k}</span>
                    <span className="text-zinc-800 dark:text-zinc-200 tabular-nums">{formatEuros(v)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-3">
                Aucune charge saisie. Les dépenses se saisissent dans chaque session (onglet Dépenses).
              </p>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800/60 text-[12px]">
              <span className="text-zinc-500 dark:text-zinc-400">Marge estimée (CA − charges)</span>
              <span className={`font-bold tabular-nums ${totalRevenue - totalExpenses >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {formatEuros(totalRevenue - totalExpenses)}
              </span>
            </div>
          </Card>
        }
        stats={
          <Card title="Statistiques">
            <div className="grid grid-cols-2 gap-3">
              <MiniKpi label="Sessions" value={sessions.length} />
              <MiniKpi label="Apprenants" value={relatedDossiers.length} />
              <MiniKpi label="Heures dispensées" value={`${Math.round(heuresDispensees)} h`} />
              <MiniKpi label="CA généré" value={formatEuros(totalRevenue)} />
              <MiniKpi label="Taux de présence" value={presenceRate == null ? '—' : `${presenceRate} %`} />
              <MiniKpi label="Budget charges" value={formatEuros(totalExpenses)} />
            </div>
          </Card>
        }
        qualiopi={
          <Card title="Qualiopi">
            {checklists.length === 0 ? (
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                Conformité non encore calculée. Elle s'alimente depuis les émargements et questionnaires des dossiers.
              </p>
            ) : (
              <div className="flex items-baseline justify-between">
                <span className="text-[13px] text-zinc-500 dark:text-zinc-400">Dossiers conformes</span>
                <span
                  className={`text-[26px] leading-none font-extrabold tabular-nums ${
                    conformes === checklists.length ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {conformes}/{checklists.length}
                </span>
              </div>
            )}
          </Card>
        }
        sessions={
          <Card title={`Sessions (${sessions.length})`}>
            <div className="mb-3 pb-3 border-b border-zinc-100 dark:border-zinc-800/80">
              <GroupSessionForm formationId={id} defaultPriceCents={f.default_price_cents} />
            </div>
            {sessions.length === 0 ? (
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucune session. Créez-en une ci-dessus.</p>
            ) : (
              <ul className="-mx-4 -mb-4 divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {sessions.slice(0, 5).map((s) => {
                  const isGroup = !s.dossier_id;
                  const row = (
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 flex items-center gap-2">
                        <span className="truncate text-[13px] font-semibold text-[color:var(--sess)]">{s.title || 'Session'}</span>
                        {isGroup && (
                          <span className="shrink-0 inline-flex items-center h-5 px-1.5 rounded-md text-[11px] font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">groupe</span>
                        )}
                      </span>
                      <span className="tabular-nums text-[12px] text-zinc-500 dark:text-zinc-400 shrink-0">
                        {new Date(s.starts_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </span>
                    </div>
                  );
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/sessions/${s.id}`}
                        className="block px-4 py-3.5 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors"
                      >
                        {row}
                      </Link>
                    </li>
                  );
                })}
                <li className="px-4 py-3">
                  <Link href={`/sessions?formation=${id}`} className={`text-[12px] font-semibold ${LINK}`}>
                    Voir toutes les sessions →
                  </Link>
                </li>
              </ul>
            )}
          </Card>
        }
      />
    </div>
  );
}

// Chiffre clé de l'en-tête.
function Stat({
  icon: Icon, label, value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5">
      <p className="flex items-center gap-2 text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">
        <Icon className="w-4 h-4 text-zinc-400" /> {label}
      </p>
      <p className="text-[26px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100 tabular-nums mt-3">{value}</p>
    </div>
  );
}

// Petit KPI dans une carte (statistiques formation).
function MiniKpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-zinc-50 dark:bg-zinc-950/40 rounded-lg px-4 py-3">
      <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="text-[26px] font-extrabold text-zinc-900 dark:text-zinc-100 tabular-nums leading-none mt-2">{value}</p>
    </div>
  );
}

// Sous-section libellée dans la carte Programme.
function Section({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-400 dark:text-zinc-500 mb-1.5">{label}</p>
      {children}
    </div>
  );
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-4 shadow-sm overflow-hidden ${className}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 mb-3">{title}</p>
      {children}
    </div>
  );
}
