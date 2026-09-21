// ARCHETYPE: command
// Justification: fiche détail formation en données réelles — KPIs, dossiers liés, sessions de groupe, lien d'inscription.

import Link from 'next/link';
import { GroupSessionForm } from './group-session-form.client';
import { notFound } from 'next/navigation';
import {
  ArrowLeft, Clock, Video, MapPin, GraduationCap, Eye, EyeOff,
  Users as UsersIcon, Banknote, FileText, ExternalLink, Award, Pencil, FolderOpen,
  BookOpen, CalendarDays, BarChart3, ShieldCheck, ImageIcon, Link2, Percent, Tag, RefreshCw,
} from 'lucide-react';
import { CERTIF_TYPES, FUNDING_TYPES, VALIDITY_UNITS } from '@/features/formations/constants';
import type { CatalogMeta } from '@/features/formations/mapping';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { CopyInscriptionLink } from '@/shared/ui/copy-inscription-link';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill, dossierStatusTone } from '@/shared/ui/status-pill';
import { estTitulaireProvisoire } from '@/features/dossier/referent';
import { formationColorMap, deepColor, tintColor, NEUTRAL_COLOR } from '@/shared/lib/formation-color';
import { KpiCard, AccentBar, ACCENTS, type Accent } from '@/shared/ui/kpi-card';
import { ManageOnly } from '@/shared/components/auth/manage-only';
import { FormationDeleteButton } from '../formation-delete.client';
import { FormationCover } from './cover-upload.client';
import { FormationTabs } from './formation-tabs.client';
import { env } from '@/env.mjs';

const modalityStyles = {
  presentiel: { icon: MapPin, label: 'Présentiel', accent: 'blue' as Accent },
  distanciel: { icon: Video, label: 'Distanciel', accent: 'sky' as Accent },
  hybride: { icon: GraduationCap, label: 'Hybride', accent: 'teal' as Accent },
};
type ModalityKey = keyof typeof modalityStyles;

const PILL = 'text-[12px] font-semibold h-6 px-2 rounded-md inline-flex items-center gap-1.5';
const SECONDARY_BTN =
  'text-[13px] font-semibold px-3 h-9 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800/60 transition inline-flex items-center gap-1.5';
const LINK = 'text-orange-600 dark:text-orange-400 hover:underline';

const statusLabel: Record<string, string> = {
  active: 'En cours', scheduled: 'Planifié', completed: 'Terminé', closed: 'Clos',
  draft: 'Brouillon', pending_validation: 'À valider', archived: 'Archivé', cancelled: 'Annulé',
};

const formatEuros = (cents: number | null) =>
  cents == null ? '—' : `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;

const ACTIVE = ['active', 'scheduled'];
const REVENUE = ['active', 'completed', 'closed'];
// Signé mais pas encore réalisé : le carnet de commandes, montré à part du CA.
const PLANIFIE = ['draft', 'pending_validation', 'scheduled'];

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
        'default_price_cents, is_published, rncp_code, rs_code, certificateur, metadata, created_at',
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
    .select('id, reference, status, total_amount_cents, learner_id, learner:learners!dossiers_learner_id_fkey(first_name, last_name, email)')
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

  const dossiersActifs = relatedDossiers.filter((d) => ACTIVE.includes(d.status));
  const totalRevenue = relatedDossiers
    .filter((d) => REVENUE.includes(d.status))
    .reduce((acc, d) => acc + (d.total_amount_cents ?? 0), 0);
  // Signé, pas encore réalisé. L'afficher évite la question « pourquoi le CA
  // ne bouge pas » sur une formation dont les dossiers sont tous planifiés.
  const revenuPlanifie = relatedDossiers
    .filter((d) => PLANIFIE.includes(d.status))
    .reduce((acc, d) => acc + (d.total_amount_cents ?? 0), 0);

  /**
   * Apprenants réellement inscrits.
   *
   * La carte comptait des DOSSIERS sous l'intitulé « Apprenants actifs » : une
   * session de groupe de seize salariés, portée par un seul dossier, affichait
   * donc 1. On compte ici les personnes — titulaires des dossiers actifs et
   * participants nommés des séances — sans le titulaire provisoire que pose
   * l'import d'une convention tant que la liste nominative n'est pas arrivée.
   */
  const { data: participantRows } = sessionIds.length
    ? await sb
        .schema('app')
        .from('session_participants')
        .select('learner_id')
        .in('session_id', sessionIds)
        .eq('participant_kind', 'learner')
    : { data: [] };

  const idsApprenants = new Set<string>();
  for (const d of dossiersActifs) if (d.learner_id) idsApprenants.add(d.learner_id as string);
  for (const p of ((participantRows ?? []) as Array<{ learner_id: string | null }>)) {
    if (p.learner_id) idsApprenants.add(p.learner_id);
  }

  const { data: apprenantRows } = idsApprenants.size
    ? await sb.schema('app').from('learners').select('id, email').in('id', [...idsApprenants]).is('deleted_at', null)
    : { data: [] };
  const activeCount = ((apprenantRows ?? []) as Array<{ email: string | null }>).filter(
    (l) => !estTitulaireProvisoire(l.email),
  ).length;

  const objectives: string[] = f.objectives ?? [];
  const prerequisites: string[] = f.prerequisites ?? [];
  const description: string | null = texte(f.description) ?? f.summary ?? null;

  // Fiche d'identité de la formation : colonnes + metadata.catalog (saisie du
  // formulaire catalogue). Tout ce qui est renseigné s'affiche, rien d'autre.
  const cat = (f.metadata?.catalog ?? {}) as Partial<CatalogMeta>;
  const categories: string[] = cat.categories ?? [];
  const financements = (cat.fundingTypes ?? []).map(
    (v) => FUNDING_TYPES.find((t) => t.value === v)?.label ?? v,
  );
  const dureeJours = cat.durationDays ? `${cat.durationDays} jour${Number(cat.durationDays) > 1 ? 's' : ''}` : null;
  const effectif =
    cat.effectifMin || cat.effectifMax
      ? `${cat.effectifMin ?? '?'} – ${cat.effectifMax ?? '?'} participants`
      : null;
  const validite = cat.validityValue
    ? `${cat.validityValue} ${VALIDITY_UNITS.find((u) => u.value === cat.validityUnit)?.label ?? cat.validityUnit ?? ''}`.trim()
    : null;
  const recyclage = cat.recyclingEnabled
    ? [validite ? `validité ${validite}` : null, cat.recyclingReminderValue ? `relance ${cat.recyclingReminderValue} ${cat.recyclingReminderUnit ?? ''}`.trim() : null]
        .filter(Boolean)
        .join(' · ') || 'oui'
    : null;
  const certification = [
    CERTIF_TYPES.find((c) => c.value === cat.certifType && c.value !== 'sans')?.label ?? null,
    f.rncp_code ? `RNCP ${f.rncp_code}` : f.rs_code ? `RS ${f.rs_code}` : null,
    f.certificateur ?? cat.certifNomCertificateur ?? null,
  ]
    .filter(Boolean)
    .join(' · ');
  const lieu = [cat.defaultLocation, cat.defaultCity, cat.defaultDepartment].filter(Boolean).join(', ');
  const tarifs = [
    cat.priceEntrepriseCents ? { label: 'Entreprise', value: formatEuros(cat.priceEntrepriseCents) } : null,
    cat.priceParticulierCents ? { label: 'Particulier', value: formatEuros(cat.priceParticulierCents) } : null,
    cat.priceIndependantCents ? { label: 'Indépendant', value: formatEuros(cat.priceIndependantCents) } : null,
  ].filter((x): x is { label: string; value: string } => x !== null);

  /**
   * Une convention ne donne pas de tarif par stagiaire, seulement un forfait
   * de groupe : la fiche le dit au lieu de laisser un zéro muet. Et si un
   * chiffre s'y trouve malgré tout (import d'avant le 15/09/2026, qui divisait
   * le forfait par l'effectif annoncé), elle signale qu'il a été déduit — un
   * forfait facturé à la tête sous-facture dès qu'un stagiaire manque.
   */
  // `importedFrom` est écrit par l'import mais absent de `CatalogMeta` (type
  // partagé, hors de cette zone) : lu ici sans l'élargir.
  const origineCatalogue = (f.metadata?.catalog as { importedFrom?: string } | undefined)?.importedFrom;
  const tarifDeduitDe =
    origineCatalogue !== 'convention'
      ? null
      : Number(f.default_price_cents ?? 0) === 0
        ? `Non renseigné : la convention donne un forfait global${cat.priceEntrepriseCents ? ` de ${formatEuros(cat.priceEntrepriseCents)} HT` : ''}, pas un prix par stagiaire.`
        : // Donnée antérieure au 15/09/2026 : l'import divisait alors le forfait
          // par l'effectif annoncé. Le chiffre est resté, il ne vient pas de la convention.
          `Chiffre déduit à l'import, absent de la convention${cat.priceEntrepriseCents ? ` (forfait : ${formatEuros(cat.priceEntrepriseCents)} HT)` : ''}. À corriger ou à remettre à zéro.`;

  const contenus = [
    { label: 'Programme détaillé', value: texte(cat.programContent) },
    { label: 'Méthodes pédagogiques', value: texte(f.pedagogical_method) },
    { label: 'Modalités d’évaluation', value: texte(f.evaluation_method) },
    { label: 'Déroulement', value: texte(cat.deroulement) },
    { label: 'Indicateurs de résultats', value: texte(cat.resultIndicators) },
    { label: 'Accessibilité (handicap)', value: texte(cat.accessibilityInfo) },
    { label: 'Délais et modalités d’accès', value: texte(cat.accessDelay) },
    { label: 'Équipe pédagogique', value: texte(cat.teachingTeam) },
  ].filter((s): s is { label: string; value: string } => Boolean(s.value));

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
        {/* Bandeau teinté à la couleur de la formation, relevé d'une touche d'orange Capsule. */}
        <div
          className="rounded-2xl border px-7 py-6 flex items-start justify-between gap-6 flex-wrap"
          style={{
            background: `linear-gradient(135deg, ${tintColor(color, 16)} 0%, ${tintColor('#f97316', 9)} 100%)`,
            borderColor: tintColor(color, 30),
          }}
        >
          <div className="min-w-0">
            <SectionLabel className="mb-2">
              Formation · <span className="font-mono normal-case tracking-normal">{f.code}</span>
            </SectionLabel>
            <h1 className="flex items-center gap-3 text-[30px] leading-none font-extrabold" style={{ color: deepColor(color) }}>
              <span className="w-3.5 h-3.5 rounded-[4px] shrink-0" style={{ background: color }} aria-hidden />
              <span className="min-w-0">{f.title}</span>
            </h1>
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              <span className={`${PILL} ${ACCENTS[m.accent].soft}`}>
                <Icon className="w-3.5 h-3.5" /> {m.label}
              </span>
              <span className={`${PILL} ${ACCENTS.sky.soft} tabular-nums`}>
                <Clock className="w-3.5 h-3.5" /> {Number(f.default_duration_hours)} h
              </span>
              {f.default_price_cents > 0 && (
                <span className={`${PILL} ${ACCENTS.emerald.soft} tabular-nums`}>
                  <Banknote className="w-3.5 h-3.5" /> {formatEuros(f.default_price_cents)} HT
                </span>
              )}
              {isCertifiante && (
                <span className={`${PILL} ${ACCENTS.purple.soft}`}>
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
            <ManageOnly section="catalogue">
              <FormationDeleteButton
                formationId={f.id}
                title={f.title}
                dossiers={relatedDossiers.length}
                sessions={sessions.length}
                variant="button"
              />
            </ManageOnly>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <KpiCard
            icon={UsersIcon}
            label="Apprenants inscrits"
            value={activeCount}
            accent="rose"
            hint={activeCount === 0 ? 'liste nominative non reçue' : 'dossiers en cours ou planifiés'}
          />
          <KpiCard
            icon={Banknote}
            label="CA réalisé"
            value={formatEuros(totalRevenue)}
            accent="emerald"
            hint={
              revenuPlanifie > 0
                ? `dossiers en cours et terminés · ${formatEuros(revenuPlanifie)} signés à venir`
                : 'dossiers en cours et terminés'
            }
          />
          <KpiCard icon={FileText} label="Dossiers" value={relatedDossiers.length} accent="orange" hint="rattachés à la formation" />
        </div>
      </header>

      <FormationTabs
        counts={{ sessions: sessions.length, dossiers: relatedDossiers.length }}
        overview={
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <Card title="Information générale" icon={FileText} accent="blue">
              <dl className="divide-y divide-zinc-100 dark:divide-zinc-800/80 -mt-1">
                <Info label="Catégorie" icon={Tag} value={categories.join(' · ')} />
                <Info label="Modalité" icon={Icon} value={m.label} />
                <Info
                  label="Durée"
                  icon={Clock}
                  value={`${Number(f.default_duration_hours)} h${dureeJours ? ` (${dureeJours})` : ''}`}
                  chiffre
                />
                <Info label="Effectif" icon={UsersIcon} value={effectif} chiffre />
                <Info
                  label="Tarif de base"
                  icon={Banknote}
                  value={`${formatEuros(f.default_price_cents)} HT`}
                  chiffre
                  precision={tarifDeduitDe}
                />
                {tarifs.map((t) => (
                  <Info key={t.label} label={`Tarif ${t.label.toLowerCase()}`} icon={Banknote} value={`${t.value} HT`} chiffre />
                ))}
                <Info label="Lieu par défaut" icon={MapPin} value={lieu} />
                <Info label="Certification" icon={Award} value={certification} />
                <Info label="Recyclage" icon={RefreshCw} value={recyclage} />
                <Info label="Éligible CPF" icon={GraduationCap} value={cat.eligibleCpf ? 'Oui' : null} />
                <Info label="Version" icon={FileText} value={cat.version} />
                <Info
                  label="Créée le"
                  icon={CalendarDays}
                  value={f.created_at ? new Date(f.created_at).toLocaleDateString('fr-FR') : null}
                  chiffre
                />
              </dl>
              {financements.length > 0 && (
                <div className="pt-3 mt-1 border-t border-zinc-100 dark:border-zinc-800/80">
                  <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-400 dark:text-zinc-500 mb-1.5">Financements</p>
                  <div className="flex flex-wrap gap-1.5">
                    {financements.map((t) => (
                      <span key={t} className={`${PILL} ${ACCENTS.emerald.soft}`}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <Card title="Contenu pédagogique" icon={BookOpen} accent="orange">
              <div className="space-y-4">
                {description && (
                  <Section label="Description">
                    <p className="text-[13px] text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-line">{description}</p>
                  </Section>
                )}
                {objectives.length > 0 && (
                  <Section label="Objectifs pédagogiques">
                    <ul className="space-y-1">
                      {objectives.map((o, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-[13px] text-zinc-600 dark:text-zinc-400">
                          <span className={`w-5 h-5 rounded-md grid place-items-center text-[11px] font-bold tabular-nums flex-shrink-0 ${ACCENTS.orange.soft}`}>{i + 1}</span> {o}
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
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-[7px] flex-shrink-0" /> {p}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                )}
                {!description && objectives.length === 0 && !f.target_audience && prerequisites.length === 0 && (
                  <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                    Aucun contenu pédagogique renseigné. <Link href={`/formations/${f.id}/edit`} className={LINK}>Compléter</Link>.
                  </p>
                )}
              </div>
            </Card>
          </div>

          {contenus.length > 0 && (
            <Card title="Programme & modalités" icon={FileText} accent="purple">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                {contenus.map((s) => (
                  <Section key={s.label} label={s.label} className={s.label === 'Programme détaillé' ? 'sm:col-span-2' : ''}>
                    <p className="text-[13px] text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-line">{s.value}</p>
                  </Section>
                ))}
              </div>
              <p className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 text-[12px] text-zinc-500 dark:text-zinc-400">
                Le programme complet (modules, déroulé horaire, mise en page) s’édite et s’imprime depuis{' '}
                <Link href={`/formations/${f.id}/programme`} className={LINK}>Programme</Link>.
              </p>
            </Card>
          )}
        </div>

        {/* Colonne actions — inscription, dossiers, sessions */}
        <div className="space-y-4">
          {(trainer || referents.length > 0) && (
            <Card title="Équipe pédagogique & contacts" icon={UsersIcon} accent="teal">
              {trainer && (
                <div className="flex items-start gap-3 pb-3 mb-3 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-100 dark:bg-teal-950/60 text-[15px] font-bold text-teal-700 dark:text-teal-300 ring-2 ring-teal-200/70 dark:ring-teal-900/60">
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
                    <p className={`text-[11px] font-semibold ${ACCENTS.teal.text}`}>Formateur par défaut</p>
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
                  <p className={`text-[11px] font-bold uppercase tracking-[0.06em] ${r.role === 'Référent handicap' ? ACCENTS.purple.text : ACCENTS.blue.text}`}>
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

          <Card title="Image de couverture (catalogue)" icon={ImageIcon} accent="sky">
            <FormationCover formationId={f.id} coverUrl={coverUrl} />
          </Card>

          <Card title="Lien d'inscription" icon={Link2} accent="orange">
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
          <Card title="Dossiers" count={relatedDossiers.length} icon={FolderOpen} accent="rose">
            {relatedDossiers.length === 0 ? (
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun dossier rattaché.</p>
            ) : (
              <ul className="-mx-4 -mb-4 border-t border-zinc-100 dark:border-zinc-800/80 divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {relatedDossiers.slice(0, 5).map((d) => {
                  const learner = d.learner ? `${d.learner.first_name} ${d.learner.last_name}` : null;
                  return (
                    <li key={d.id}>
                      <Link href={`/dossiers/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                        <span className="min-w-0 flex items-center gap-2.5">
                          <Avatar name={learner ?? d.reference ?? '?'} />
                          <span className={`text-[13px] text-zinc-900 dark:text-zinc-100 truncate ${learner ? 'font-bold' : 'font-mono'}`}>{learner ?? d.reference}</span>
                        </span>
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
          <Card title="Budget & charges" icon={Banknote} accent="emerald">
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-[13px] text-zinc-500 dark:text-zinc-400">Total des charges</span>
              <span className={`text-[24px] leading-none font-extrabold tabular-nums ${ACCENTS.emerald.value}`}>{formatEuros(totalExpenses)}</span>
            </div>
            {Object.keys(expenseByKind).length > 0 ? (
              <ul className="space-y-2.5 mb-3">
                {Object.entries(expenseByKind).map(([k, v]) => (
                  <li key={k} className="text-[12px]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-zinc-600 dark:text-zinc-400">{EXPENSE_KIND_LABEL[k] ?? k}</span>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">{formatEuros(v)}</span>
                    </div>
                    <AccentBar value={v} max={totalExpenses} accent="emerald" className="h-1.5" />
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
          <Card title="Statistiques" icon={BarChart3} accent="blue">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <KpiCard icon={CalendarDays} label="Sessions" value={sessions.length} accent="blue" />
              <KpiCard icon={UsersIcon} label="Apprenants" value={relatedDossiers.length} accent="rose" />
              <KpiCard icon={Clock} label="Heures dispensées" value={`${Math.round(heuresDispensees)} h`} accent="sky" />
              <KpiCard icon={Banknote} label="CA généré" value={formatEuros(totalRevenue)} accent="emerald" />
              <KpiCard
                icon={Percent}
                label="Taux de présence"
                value={presenceRate == null ? '—' : `${presenceRate} %`}
                accent={presenceRate == null || presenceRate >= 80 ? 'emerald' : 'amber'}
              >
                {presenceRate != null && (
                  <AccentBar value={presenceRate} max={100} accent={presenceRate >= 80 ? 'emerald' : 'amber'} />
                )}
              </KpiCard>
              <KpiCard icon={FileText} label="Budget charges" value={formatEuros(totalExpenses)} accent="orange" />
            </div>
          </Card>
        }
        qualiopi={
          <Card title="Qualiopi" icon={ShieldCheck} accent="purple">
            {checklists.length === 0 ? (
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                Conformité non encore calculée. Elle s'alimente depuis les émargements et questionnaires des dossiers.
              </p>
            ) : (
              <div>
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-[13px] text-zinc-500 dark:text-zinc-400">Dossiers conformes</span>
                  <span
                    className={`text-[24px] leading-none font-extrabold tabular-nums ${
                      conformes === checklists.length ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {conformes}/{checklists.length}
                  </span>
                </div>
                <AccentBar value={conformes} max={checklists.length} accent={conformes === checklists.length ? 'emerald' : 'amber'} />
              </div>
            )}
          </Card>
        }
        sessions={
          <Card title="Sessions" count={sessions.length} icon={CalendarDays} accent="blue">
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
                      <span className="min-w-0 flex items-center gap-2.5">
                        <span className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${ACCENTS.blue.soft}`}>
                          <CalendarDays className="w-3.5 h-3.5" />
                        </span>
                        <span className="truncate text-[13px] font-semibold text-[color:var(--sess)]">{s.title || 'Session'}</span>
                        {isGroup && (
                          <span className={`shrink-0 inline-flex items-center h-5 px-1.5 rounded-md text-[11px] font-semibold ${ACCENTS.rose.soft}`}>groupe</span>
                        )}
                      </span>
                      <span className={`tabular-nums text-[12px] font-semibold shrink-0 ${ACCENTS.blue.text}`}>
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

// Initiales sur une couleur tirée du nom.
const AVATAR_PALETTE = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
];
function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
  const hash = Array.from(name).reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return (
    <span className={`w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold shrink-0 ${AVATAR_PALETTE[hash % AVATAR_PALETTE.length]}`}>
      {initials}
    </span>
  );
}

/**
 * Texte lisible d'un champ riche : le formulaire catalogue enregistre du HTML
 * (éditeur riche). La fiche n'en affiche que le texte — pas de HTML tiers injecté
 * dans la page, et une carte qui reste homogène avec les champs simples.
 */
function texte(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&(?:quot|#34);/g, '"')
    .replace(/&(?:#39|apos|rsquo);/g, '’')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return t === '' ? null : t;
}

/** Ligne « libellé → valeur » de la carte Information générale. Masquée si vide. */
function Info({
  label,
  value,
  icon: RowIcon,
  chiffre = false,
  precision,
}: {
  label: string;
  value: string | null | undefined;
  icon?: React.ComponentType<{ className?: string }>;
  chiffre?: boolean;
  /** D'où sort le chiffre, quand il est déduit et non saisi. */
  precision?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
      <dt className="text-[13px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5 shrink-0">
        {RowIcon && <RowIcon className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />}
        {label}
      </dt>
      <dd className={`text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 text-right ${chiffre ? 'tabular-nums' : ''}`}>
        {value}
      </dd>
      {precision && (
        <dd className="text-[11px] text-zinc-400 dark:text-zinc-500 text-right basis-full">{precision}</dd>
      )}
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

function Card({
  title,
  children,
  className = '',
  icon: Icon,
  accent = 'orange',
  count,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: Accent;
  count?: number;
}) {
  return (
    <div className={`bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-4 shadow-sm overflow-hidden ${className}`}>
      <div className="flex items-center gap-2.5 mb-3">
        {Icon && (
          <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS[accent].soft}`}>
            <Icon className="w-4 h-4" />
          </span>
        )}
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-600 dark:text-zinc-300">{title}</p>
        {count != null && (
          <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS[accent].soft}`}>{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}
