// ARCHETYPE: workflow
// Justification: vérification des pièces + validation d'une demande (action staff tracée).

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { ArrowLeft, ClipboardList, History, FileCheck2, Pencil } from 'lucide-react';
import { env } from '@/env.mjs';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { ProspectNoteForm } from './note-form.client';
import { SectionLabel } from '@/shared/ui/section-label';
import { formaterSiret } from '@/shared/lib/siret';
import { heures, jourFr, modalite, tarif } from '@/features/prospect/format-demande';
import { StatusPill } from '@/shared/ui/status-pill';
import { AccentBar, ACCENTS, type Accent } from '@/shared/ui/kpi-card';
import { requiredDocs } from '@/features/prospect/funding';
import { ProspectDetailActions, type DocChecklistItem } from './prospect-detail-actions';
import { ConvertButton } from '../convert-button';
import { QUOTE_STATUS_LABELS, type QuoteStatus } from '@/features/billing/domain/quote';
import { ManageOnly } from '@/shared/components/auth/manage-only';
import { DeleteEntityButton } from '@/features/corbeille/ui/delete-entity-button.client';
import { FicheBesoinControls } from './fiche-besoin-controls.client';

export const dynamic = 'force-dynamic';

type ProspectDoc = { key: string; label: string; storage_path: string };

type NeedsAnalysis = {
  currentLevel?: number | null;
  objectives?: string | null;
  expectations?: string | null;
  constraints?: string | null;
  accommodations?: string | null;
  typologyContext?: string | null;
};

const LEVEL_LABELS: Record<number, string> = {
  1: 'Débutant',
  2: 'Bases',
  3: 'Intermédiaire',
  4: 'Avancé',
  5: 'Expert',
};

const SITUATION_LABELS: Record<string, string> = {
  salarie: 'Salarié(e)',
  demandeur: "Demandeur d'emploi",
  independant: 'Indépendant(e)',
  particulier: 'Particulier',
};

type Prospect = {
  id: string;
  organization_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  situation: string | null;
  company_name: string | null;
  company_siret: string | null;
  convention_collective: string | null;
  funder_kinds: string[] | null;
  funder_kind: string;
  company_batch_id: string | null;
  validation_status: 'pending_validation' | 'validated' | 'rejected';
  validation_rejected_reason: string | null;
  documents: ProspectDoc[] | null;
  needs_analysis: NeedsAnalysis | null;
  /** « Note interne » du formulaire : contexte, contraintes, interlocuteur. */
  message: string | null;
  /** Formation du catalogue ; null = besoin spécifique ou formation à définir. */
  formation_id: string | null;
  custom_formation_title: string | null;
  custom_formation_hours: number | string | null;
  custom_formation_price_cents: number | string | null;
  preferred_modality: string | null;
  preferred_start_date: string | null;
  created_at: string;
};

function Answer({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 mb-0.5">
        {label}
      </p>
      <p className="text-[13px] text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{value}</p>
    </div>
  );
}

type Review = { doc_key: string; status: string; rejected_reason: string | null };
type Event = {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  occurred_at: string;
  actor_user_id: string | null;
};

const CHANNEL_LABELS: Record<string, string> = {
  note: 'Note interne',
  call: 'Appel téléphonique',
  email: 'E-mail envoyé',
  meeting: 'Rendez-vous',
  sms: 'SMS / WhatsApp',
};

const EVENT_LABELS: Record<string, string> = {
  document_verified: 'Pièce vérifiée',
  document_rejected: 'Pièce refusée',
  document_unverified: 'Validation annulée',
  demande_validated: 'Demande validée',
  demande_rejected: 'Demande refusée',
  comment: 'Commentaire',
};

function admin() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const AVATARS = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
] as const;

function avatarTone(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % AVATARS.length;
  return AVATARS[h] ?? AVATARS[0];
}

function SectionTitle({ icon: Icon, accent, children }: { icon: typeof ClipboardList; accent: Accent; children: React.ReactNode }) {
  return (
    <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
      <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS[accent].soft}`}>
        <Icon className="h-4 w-4" />
      </span>
      {children}
    </h2>
  );
}


function KeyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5 break-words tabular-nums">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-zinc-900 dark:text-zinc-100 font-semibold text-right break-words tabular-nums">{value}</dd>
    </div>
  );
}

export default async function ProspectDetailPage({ params }: { params: { id: string } }) {
  await requireAccess('crm');
  const sb = admin();

  const { data: pRow, error: erreurLecture } = await sb
    .schema('app')
    .from('prospects' as never)
    .select(
      'id, organization_id, first_name, last_name, email, phone, situation, company_name, company_siret, convention_collective, funder_kinds, funder_kind, company_batch_id, validation_status, validation_rejected_reason, documents, needs_analysis, message, formation_id, custom_formation_title, custom_formation_hours, custom_formation_price_cents, preferred_modality, preferred_start_date, created_at',
    )
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle();
  const prospect = pRow as unknown as Prospect | null;
  // Une requête en échec n'est pas une ligne absente : sans cette distinction,
  // toute panne s'affiche en 404 (incident du 21/09/2026).
  if (erreurLecture) {
    console.error('[demande] lecture impossible', erreurLecture.code, erreurLecture.message);
    throw new Error(`Lecture impossible (demande) : ${erreurLecture.message}`);
  }
  if (!prospect) notFound();

  // Une demande porte soit une formation du catalogue, soit un intitulé libre.
  // N'afficher que l'intitulé libre laissait « — » sur toutes les demandes
  // parties d'une formation existante.
  const { data: formationRow } = prospect.formation_id
    ? await sb.schema('app').from('formations').select('title').eq('id', prospect.formation_id).maybeSingle()
    : { data: null };
  const formationCatalogue = (formationRow as { title?: string } | null)?.title ?? null;

  const [{ data: reviewRows }, { data: eventRows }] = await Promise.all([
    sb.schema('app').from('prospect_document_reviews' as never).select('doc_key, status, rejected_reason').eq('prospect_id', params.id),
    sb.schema('app').from('prospect_events' as never).select('id, kind, payload, occurred_at, actor_user_id').eq('prospect_id', params.id).order('occurred_at', { ascending: false }),
  ]);
  const reviews = (reviewRows ?? []) as unknown as Review[];
  const events = (eventRows ?? []) as unknown as Event[];

  // Qui a fait quoi : une note de suivi sans auteur ne sert à rien.
  const actorIds = [...new Set(events.map((e) => e.actor_user_id).filter((v): v is string => Boolean(v)))];
  const { data: actorRows } = actorIds.length
    ? await sb.schema('app').from('profiles').select('user_id, full_name').in('user_id', actorIds)
    : { data: [] };
  const actorNames = new Map(
    ((actorRows ?? []) as unknown as Array<{ user_id: string; full_name: string | null }>).map((p) => [
      p.user_id,
      p.full_name ?? '',
    ]),
  );

  // Devis du dossier issu de la demande (établi à l'étape 4 : session + analyse du besoin).
  const { data: convRow } = await sb
    .schema('app')
    .from('prospects')
    .select('converted_dossier_id')
    .eq('id', params.id)
    .maybeSingle();
  const convertedDossierId = (convRow as { converted_dossier_id: string | null } | null)?.converted_dossier_id ?? null;
  const { data: quoteLinks } = convertedDossierId
    ? await sb.schema('app').from('quote_dossiers').select('quote_id').eq('dossier_id', convertedDossierId)
    : { data: [] };
  const quoteIds = ((quoteLinks ?? []) as Array<{ quote_id: string }>).map((l) => l.quote_id);
  const { data: devisRow } = quoteIds.length
    ? await sb
        .schema('app')
        .from('quotes')
        .select('id, reference, status, created_at')
        .in('id', quoteIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const devis = devisRow as { id: string; reference: string; status: QuoteStatus; created_at: string } | null;

  const reviewByKey = new Map(reviews.map((r) => [r.doc_key, r]));
  const uploaded = prospect.documents ?? [];
  const uploadedByKey = new Map(uploaded.map((d) => [d.key, d]));

  const situationForDocs = prospect.company_batch_id ? 'entreprise' : prospect.situation ?? '';
  const required = requiredDocs(prospect.funder_kinds ?? [], situationForDocs);

  const keys = new Set<string>(required.map((d) => d.key));
  uploaded.forEach((d) => keys.add(d.key));
  const labelByKey = new Map<string, { label: string; required: boolean }>();
  required.forEach((d) => labelByKey.set(d.key, { label: d.label, required: d.required }));
  uploaded.forEach((d) => {
    if (!labelByKey.has(d.key)) labelByKey.set(d.key, { label: d.label, required: false });
  });

  const docs: DocChecklistItem[] = [...keys].map((key) => {
    const meta = labelByKey.get(key)!;
    const up = uploadedByKey.get(key);
    const rev = reviewByKey.get(key);
    return {
      key,
      label: meta.label,
      required: meta.required,
      uploaded: !!up,
      downloadHref: up ? `/api/prospects/${prospect.id}/document/${encodeURIComponent(key)}` : null,
      reviewStatus: (rev?.status as DocChecklistItem['reviewStatus']) ?? null,
      rejectedReason: rev?.rejected_reason ?? null,
    };
  });

  const canValidate = required
    .filter((d) => d.required)
    .every((d) => reviewByKey.get(d.key)?.status === 'verified');

  const initials = `${prospect.first_name?.[0] ?? ''}${prospect.last_name?.[0] ?? ''}`.toUpperCase();
  const avatar = avatarTone(`${prospect.first_name ?? ''} ${prospect.last_name ?? ''}`);
  const situationLabel = prospect.situation
    ? (SITUATION_LABELS[prospect.situation] ?? prospect.situation)
    : '—';
  const funders = (prospect.funder_kinds ?? [prospect.funder_kind]).filter(Boolean);

  const reference = `#${new Date(prospect.created_at).getFullYear()}-${String(
    new Date(prospect.created_at).getMonth() + 1,
  ).padStart(2, '0')}${String(new Date(prospect.created_at).getDate()).padStart(2, '0')}`;

  const missingRequired = required.filter(
    (d) => d.required && reviewByKey.get(d.key)?.status !== 'verified',
  ).length;
  const providedCount = docs.filter((d) => d.uploaded).length;
  const lastEventAt = events[0]?.occurred_at ?? null;
  const daysSince = (iso: string | null): number | null =>
    iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;
  const followedBy = events.find((e) => e.actor_user_id && actorNames.get(e.actor_user_id));
  const n = prospect.needs_analysis;

  // « Prochaine action » : ce qu'il faut faire maintenant, déduit de l'état réel
  // de la demande — pas une liste d'actions possibles.
  const nextAction: { title: string; why: string } = (() => {
    if (prospect.validation_status === 'rejected') {
      return {
        title: 'Demande refusée',
        why: prospect.validation_rejected_reason?.trim() || 'Aucun motif enregistré.',
      };
    }
    if (missingRequired > 0) {
      return {
        title: `Réclamer ${missingRequired} pièce${missingRequired > 1 ? 's' : ''}`,
        why: 'La demande ne peut pas être validée tant que les pièces obligatoires ne sont pas vérifiées.',
      };
    }
    if (prospect.validation_status === 'pending_validation') {
      return {
        title: 'Valider la demande',
        why: 'Toutes les pièces obligatoires sont vérifiées.',
      };
    }
    const d = daysSince(lastEventAt);
    return {
      title: 'Proposer une session de formation',
      why:
        d === null
          ? 'Demande validée, aucun échange enregistré.'
          : `Dernier échange il y a ${d} jour${d > 1 ? 's' : ''}.`,
    };
  })();

  return (
    <div className="max-w-6xl w-full mx-auto px-6 pb-10">
      {/* En-tête collant : identité + les trois gestes principaux, toujours atteignables */}
      <div className="sticky top-0 z-20 -mx-6 px-6 pt-6 pb-5 bg-rose-50/90 dark:bg-zinc-950/90 backdrop-blur border-b border-rose-100 dark:border-rose-900/40">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Link
                href="/prospects"
                className="text-[12px] text-zinc-500 hover:text-orange-600 dark:hover:text-orange-400 inline-flex items-center gap-1 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Demandes
              </Link>
              <span className="text-zinc-300 dark:text-zinc-700" aria-hidden>
                ·
              </span>
              <SectionLabel className="tabular-nums">Demande {reference}</SectionLabel>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${avatar}`}>
                {initials || '?'}
              </span>
              <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100 truncate">
                {prospect.first_name} {prospect.last_name}
              </h1>
              <StatusPill
                tone={
                  prospect.validation_status === 'validated'
                    ? 'success'
                    : prospect.validation_status === 'rejected'
                      ? 'danger'
                      : 'warning'
                }
              >
                {prospect.validation_status === 'validated'
                  ? 'Validée'
                  : prospect.validation_status === 'rejected'
                    ? 'Refusée'
                    : 'En attente'}
              </StatusPill>
              {/* Supprimer depuis la fiche, et pas seulement depuis la liste :
                  c'est ici qu'on constate qu'une demande est un doublon ou une
                  erreur de saisie. Suppression réversible — elle rejoint la
                  corbeille, comme toutes les autres entités. */}
              <span className="ml-auto shrink-0 flex items-center gap-2">
                <ManageOnly section="crm">
                  <Link
                    href={`/prospects/${params.id}/modifier`}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Modifier
                  </Link>
                </ManageOnly>
                <ManageOnly section="crm">
                  <DeleteEntityButton
                    entite="demande"
                    id={params.id}
                    nom={`${prospect.first_name ?? ''} ${prospect.last_name ?? ''}`.trim() || 'cette demande'}
                    article="cette demande"
                    variant="button"
                    redirigerVers="/prospects"
                  />
                </ManageOnly>
              </span>
            </div>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3 tabular-nums">
              Reçue le {new Date(prospect.created_at).toLocaleDateString('fr-FR')}
              {prospect.company_name ? ` · ${prospect.company_name}` : ''}
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <a
              href={`mailto:${prospect.email}`}
              className="text-[13px] font-semibold px-3 h-9 inline-flex items-center rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition"
            >
              Envoyer un e-mail
            </a>
            <Link
              href="/agenda"
              className="text-[13px] font-semibold px-3 h-9 inline-flex items-center rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition"
            >
              Programmer un RDV
            </Link>
            {prospect.validation_status === 'validated' && (
              <ConvertButton prospectId={prospect.id} label="Inscrire à une formation" />
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] mt-6">
        {/* ── Colonne principale ─────────────────────────────────────────── */}
        <main className="space-y-5 min-w-0">
          <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <SectionTitle icon={ClipboardList} accent="blue">Fiche besoin</SectionTitle>
              <div className="ml-auto flex flex-wrap gap-1.5">
                {n?.currentLevel != null && (
                  <span className={`inline-flex items-center h-6 px-2 rounded-md text-[12px] font-semibold ${ACCENTS.purple.soft}`}>
                    Niveau : {LEVEL_LABELS[n.currentLevel] ?? n.currentLevel}
                  </span>
                )}
                {funders.length > 0 && (
                  <span className={`inline-flex items-center h-6 px-2 rounded-md text-[12px] font-semibold ${ACCENTS.emerald.soft}`}>
                    {funders.join(', ').toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            {n && (n.objectives || n.expectations || n.constraints || n.accommodations || n.typologyContext) ? (
              <div className="space-y-3">
                <Answer label="Objectifs" value={n.objectives} />
                <Answer label="Attentes" value={n.expectations} />
                <Answer label="Contraintes" value={n.constraints} />
                <Answer label="Besoin d'aménagement" value={n.accommodations} />
                <Answer label="Contexte / typologie" value={n.typologyContext} />
              </div>
            ) : (
              <p className="text-[13px] text-zinc-400">
                Aucune fiche besoin renseignée — envoyez-la au client, ou remplissez-la pendant l’appel.
              </p>
            )}

            {/* L'analyse du besoin précède la décision : c'est elle qui dit
                quelle formation vendre. Elle ne partait jusqu'ici qu'à la
                création du dossier, donc trop tard. */}
            <ManageOnly section="crm">
              <FicheBesoinControls
                prospectId={prospect.id}
                reponses={
                  n
                    ? Object.fromEntries(
                        Object.entries(n).filter(([, v]) => v !== null && v !== undefined && v !== ''),
                      )
                    : null
                }
                aUneAdresse={Boolean(prospect.email)}
              />
            </ManageOnly>

            {/* La « note interne » du formulaire ne se lisait nulle part : il
                fallait rouvrir « Modifier » pour la retrouver. Ce qu'on écrit
                pendant l'appel — le contexte, l'interlocuteur, une contrainte —
                doit se voir là où l'on reprend le dossier. */}
            {prospect.message && (
              <div className={`rounded-lg border p-3 ${ACCENTS.amber.card}`}>
                <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-amber-700 dark:text-amber-400 mb-1">
                  Note interne
                </p>
                <p className="text-[13px] text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{prospect.message}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 rounded-lg border border-zinc-200/70 dark:border-zinc-800 divide-y sm:divide-y-0 sm:divide-x divide-zinc-100 dark:divide-zinc-800/80 overflow-hidden bg-zinc-50/60 dark:bg-zinc-950/40">
              <KeyFact label="Situation" value={`${situationLabel}${prospect.company_batch_id ? ' · entreprise' : ''}`} />
              <KeyFact label="Entreprise" value={prospect.company_name ?? '—'} />
              <KeyFact label="Reçue le" value={new Date(prospect.created_at).toLocaleDateString('fr-FR')} />
            </div>
          </section>

          <section id="pieces" className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <SectionTitle icon={FileCheck2} accent={missingRequired === 0 ? 'emerald' : 'amber'}>Pièces justificatives</SectionTitle>
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${
                  missingRequired === 0 ? ACCENTS.emerald.soft : ACCENTS.amber.soft
                }`}
              >
                {providedCount} / {docs.length} fournie{docs.length > 1 ? 's' : ''}
              </span>
            </div>
            <AccentBar value={providedCount} max={docs.length} accent={missingRequired === 0 ? 'emerald' : 'amber'} />
            <ProspectDetailActions
              prospectId={prospect.id}
              validationStatus={prospect.validation_status}
              docs={docs}
              canValidate={canValidate}
            />
            <p
              className={
                missingRequired === 0
                  ? 'flex items-center gap-2 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums'
                  : 'flex items-center gap-2 text-[12px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums'
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${missingRequired === 0 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                aria-hidden
              />
              {missingRequired === 0
                ? 'Aucune pièce bloquante — la demande peut avancer.'
                : `${missingRequired} pièce${missingRequired > 1 ? 's' : ''} obligatoire${missingRequired > 1 ? 's' : ''} à vérifier avant validation.`}
            </p>
          </section>

          <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-5 space-y-3">
            <SectionTitle icon={History} accent="orange">Suivi &amp; historique</SectionTitle>
            <ProspectNoteForm prospectId={prospect.id} />
            {events.length === 0 ? (
              <p className="text-[13px] text-zinc-400">Aucune action enregistrée.</p>
            ) : (
              <ul className="space-y-0 pt-1">
                {events.map((e, i) => (
                  <li key={e.id} className="flex items-start gap-3 text-[12px]">
                    <span className="flex flex-col items-center self-stretch">
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-orange-400 ring-2 ring-orange-100 dark:ring-orange-900/40" />
                      {i < events.length - 1 && <span className="w-px flex-1 bg-zinc-200 dark:bg-zinc-800" />}
                    </span>
                    <span className="pb-3">
                      <span className="text-zinc-900 dark:text-zinc-100 font-bold">
                        {e.kind === 'comment'
                          ? (CHANNEL_LABELS[String(e.payload?.channel ?? '')] ?? 'Note interne')
                          : (EVENT_LABELS[e.kind] ?? e.kind)}
                      </span>
                      {typeof e.payload?.text === 'string' && (
                        <span className="block text-zinc-700 dark:text-zinc-300 whitespace-pre-line mt-0.5">
                          {e.payload.text as string}
                        </span>
                      )}
                      {typeof e.payload?.doc_key === 'string' && (
                        <span className="text-zinc-400"> · {e.payload.doc_key as string}</span>
                      )}
                      {typeof e.payload?.reason === 'string' && (
                        <span className="text-zinc-400 truncate"> — {e.payload.reason as string}</span>
                      )}
                      <span className="block text-zinc-500 dark:text-zinc-400 tabular-nums">
                        {new Date(e.occurred_at).toLocaleString('fr-FR')}
                        {e.actor_user_id && actorNames.get(e.actor_user_id) && (
                          <> · {actorNames.get(e.actor_user_id)}</>
                        )}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        {/* ── Colonne de droite : à qui on parle, quoi faire, tout le reste ── */}
        <aside className="space-y-4 lg:sticky lg:top-24 self-start">
          <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${avatar}`}>
                {initials || '?'}
              </span>
              <div className="min-w-0">
                <p className="text-[17px] font-extrabold text-zinc-900 dark:text-zinc-100 truncate">
                  {prospect.first_name} {prospect.last_name}
                </p>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">Demande {reference}</p>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-[13px]">
              <a href={`mailto:${prospect.email}`} className="block text-zinc-700 dark:text-zinc-300 hover:text-orange-600 truncate">
                {prospect.email}
              </a>
              {prospect.phone ? (
                <a href={`tel:${prospect.phone}`} className="block text-zinc-700 dark:text-zinc-300 hover:text-orange-600 tabular-nums">
                  {prospect.phone}
                </a>
              ) : (
                <p className="text-zinc-400 dark:text-zinc-500">Téléphone non renseigné</p>
              )}
            </div>
          </section>

          <section className={`rounded-xl border bg-gradient-to-br p-4 shadow-sm space-y-3 ${ACCENTS.orange.card}`}>
            <p className={`text-[11px] font-bold uppercase tracking-[0.06em] ${ACCENTS.orange.text}`}>
              Prochaine action
            </p>
            <div>
              <p className="text-[17px] font-extrabold text-zinc-900 dark:text-zinc-100 tabular-nums">
                {nextAction.title}
              </p>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1">{nextAction.why}</p>
            </div>
            {prospect.validation_status === 'validated' ? (
              <ConvertButton prospectId={prospect.id} label="Inscrire à une formation" variant="primary" />
            ) : (
              <a
                href="#pieces"
                className="w-full inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 transition"
              >
                Voir les pièces
              </a>
            )}
            <a
              href={`mailto:${prospect.email}`}
              className="w-full inline-flex items-center justify-center gap-2 border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] font-semibold px-4 h-10 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition"
            >
              Relancer par e-mail
            </a>
          </section>

          {/* La demande constitue le dossier : le fil entre les deux doit se
              suivre dans les deux sens, sinon la continuité se perd. */}
          {convertedDossierId && (
            <Link
              href={`/dossiers/${convertedDossierId}`}
              className="group block rounded-xl border border-orange-200/70 dark:border-orange-900/40 bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/25 dark:to-zinc-900 p-4 shadow-sm hover:shadow-md transition"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-orange-700 dark:text-orange-400">
                Dossier
              </p>
              <p className="text-[13px] text-zinc-800 dark:text-zinc-200 mt-1 font-medium">
                Cette demande a été convertie — ouvrir son dossier
              </p>
            </Link>
          )}

          {convertedDossierId && (
            <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
                Devis
              </p>
              {devis ? (
                <>
                  <p className="text-[13px] text-zinc-900 dark:text-zinc-100">
                    <span className="font-mono text-[12px]">{devis.reference}</span> · <span className="font-semibold">{QUOTE_STATUS_LABELS[devis.status]}</span>
                  </p>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    Établi le {new Date(devis.created_at).toLocaleDateString('fr-FR')}
                    {devis.status === 'draft' ? ' — à relire avant envoi.' : '.'}
                  </p>
                  <Link
                    href={`/devis/${devis.id}`}
                    className="w-full inline-flex items-center justify-center gap-2 border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] font-semibold px-4 h-10 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition"
                  >
                    {devis.status === 'draft' ? 'Relire et envoyer' : 'Ouvrir le devis'}
                  </Link>
                </>
              ) : (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Il s’établira automatiquement dès que la session sera planifiée et l’analyse du besoin reçue.
                </p>
              )}
            </section>
          )}

          <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 mb-2">
              Récapitulatif
            </p>
            <dl className="text-[13px] divide-y divide-zinc-100 dark:divide-zinc-800/80">
              <SummaryRow
                label="Statut"
                value={
                  prospect.validation_status === 'validated'
                    ? 'Validée'
                    : prospect.validation_status === 'rejected'
                      ? 'Refusée'
                      : 'En attente'
                }
              />
              {/* Ce qui est demandé se lisait uniquement en rouvrant
                  « Modifier » : l'intitulé, la durée et le tarif ne figuraient
                  même pas dans la requête de cette page. Or c'est sur eux que
                  se décide le devis. */}
              <SummaryRow
                label="Formation"
                value={formationCatalogue ?? prospect.custom_formation_title ?? '—'}
              />
              {formationCatalogue && <SummaryRow label="Origine" value="Catalogue" />}
              <SummaryRow label="Durée prévue" value={heures(prospect.custom_formation_hours)} />
              <SummaryRow label="Tarif prévu" value={tarif(prospect.custom_formation_price_cents)} />
              <SummaryRow
                label="Modalité"
                value={modalite(prospect.preferred_modality)}
              />
              <SummaryRow label="Début souhaité" value={jourFr(prospect.preferred_start_date)} />
              <SummaryRow label="Financement" value={funders.join(', ').toUpperCase() || '—'} />
              <SummaryRow label="Situation" value={situationLabel} />
              <SummaryRow label="Entreprise" value={prospect.company_name ?? '—'} />
              {/* Il identifie le client sur la convention, la facture et au BPF :
                  il se vérifie d'un coup d'œil, sans rouvrir le formulaire. */}
              <SummaryRow label="SIRET" value={formaterSiret(prospect.company_siret) ?? prospect.company_siret ?? '—'} />
              {/* La branche détermine l'OPCO de rattachement et le barème :
                  elle sert à instruire le financement. */}
              <SummaryRow label="Convention collective" value={prospect.convention_collective ?? '—'} />
              <SummaryRow label="Reçue le" value={new Date(prospect.created_at).toLocaleDateString('fr-FR')} />
              <SummaryRow
                label="Suivi par"
                value={(followedBy?.actor_user_id && actorNames.get(followedBy.actor_user_id)) || '—'}
              />
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
