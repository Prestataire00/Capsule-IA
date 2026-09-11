// ARCHETYPE: workflow
// Justification: vérification des pièces + validation d'une demande (action staff tracée).

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Fraunces } from 'next/font/google';
import { createClient } from '@supabase/supabase-js';
import { ArrowLeft, ClipboardList, History, FileCheck2 } from 'lucide-react';
import { env } from '@/env.mjs';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { ProspectNoteForm } from './note-form.client';
import { StatusPill } from '@/shared/ui/status-pill';
import { requiredDocs } from '@/features/prospect/funding';
import { ProspectDetailActions, type DocChecklistItem } from './prospect-detail-actions';
import { ConvertButton } from '../convert-button';
import { QUOTE_STATUS_LABELS, type QuoteStatus } from '@/features/billing/domain/quote';

export const dynamic = 'force-dynamic';

// Police éditoriale chaleureuse pour les titres (change le rendu « fade » par défaut).
const display = Fraunces({ subsets: ['latin'], weight: ['500', '600'], display: 'swap' });

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
  funder_kinds: string[] | null;
  funder_kind: string;
  company_batch_id: string | null;
  validation_status: 'pending_validation' | 'validated' | 'rejected';
  validation_rejected_reason: string | null;
  documents: ProspectDoc[] | null;
  needs_analysis: NeedsAnalysis | null;
  created_at: string;
};

function Answer({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] tracking-wider uppercase text-amber-600/80 dark:text-amber-400/70 mb-0.5 font-semibold">
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

function SectionTitle({ icon: Icon, children }: { icon: typeof ClipboardList; children: React.ReactNode }) {
  return (
    <h2 className={`${display.className} text-[18px] font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2`}>
      <Icon className="h-4 w-4 text-orange-500" />
      {children}
    </h2>
  );
}


function KeyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{label}</p>
      <p className="text-[13px] text-zinc-800 dark:text-zinc-200 mt-0.5 break-words">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-zinc-900 dark:text-zinc-100 text-right break-words">{value}</dd>
    </div>
  );
}

export default async function ProspectDetailPage({ params }: { params: { id: string } }) {
  await requireAccess('crm');
  const sb = admin();

  const { data: pRow } = await sb
    .schema('app')
    .from('prospects' as never)
    .select(
      'id, organization_id, first_name, last_name, email, phone, situation, company_name, company_siret, funder_kinds, funder_kind, company_batch_id, validation_status, validation_rejected_reason, documents, needs_analysis, created_at',
    )
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle();
  const prospect = pRow as unknown as Prospect | null;
  if (!prospect) notFound();

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
      {/* Barre d'action collante : identité + les trois gestes principaux, toujours atteignables */}
      <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-white/85 dark:bg-zinc-950/85 backdrop-blur border-b border-zinc-200/60 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/prospects"
            className="text-[13px] text-zinc-500 hover:text-orange-600 inline-flex items-center gap-1 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Demandes
          </Link>
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-orange-400 text-white text-[13px] font-semibold">
            {initials || '?'}
          </span>
          <h1 className={`${display.className} text-[20px] font-semibold text-zinc-900 dark:text-zinc-100 truncate`}>
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

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <a
              href={`mailto:${prospect.email}`}
              className="text-[13px] px-3 py-2 rounded-lg border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 transition"
            >
              Envoyer un e-mail
            </a>
            <Link
              href="/agenda"
              className="text-[13px] px-3 py-2 rounded-lg border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 transition"
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
          <section className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <SectionTitle icon={ClipboardList}>Fiche besoin</SectionTitle>
              <div className="ml-auto flex flex-wrap gap-1.5">
                {n?.currentLevel != null && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-medium">
                    Niveau : {LEVEL_LABELS[n.currentLevel] ?? n.currentLevel}
                  </span>
                )}
                {funders.length > 0 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 font-medium">
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
              <p className="text-[13px] text-zinc-400">Aucune fiche besoin renseignée.</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 rounded-xl border border-zinc-200/60 dark:border-zinc-800 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200/60 dark:divide-zinc-800 overflow-hidden">
              <KeyFact label="Situation" value={`${situationLabel}${prospect.company_batch_id ? ' · entreprise' : ''}`} />
              <KeyFact label="Entreprise" value={prospect.company_name ?? '—'} />
              <KeyFact label="Reçue le" value={new Date(prospect.created_at).toLocaleDateString('fr-FR')} />
            </div>
          </section>

          <section id="pieces" className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <SectionTitle icon={FileCheck2}>Pièces justificatives</SectionTitle>
              <span className="ml-auto text-[12px] text-zinc-500 dark:text-zinc-400">
                {providedCount} / {docs.length} fournie{docs.length > 1 ? 's' : ''}
              </span>
            </div>
            <ProspectDetailActions
              prospectId={prospect.id}
              validationStatus={prospect.validation_status}
              docs={docs}
              canValidate={canValidate}
            />
            <p
              className={
                missingRequired === 0
                  ? 'text-[12px] text-emerald-600 dark:text-emerald-400'
                  : 'text-[12px] text-amber-600 dark:text-amber-400'
              }
            >
              {missingRequired === 0
                ? '● Aucune pièce bloquante — la demande peut avancer.'
                : `● ${missingRequired} pièce${missingRequired > 1 ? 's' : ''} obligatoire${missingRequired > 1 ? 's' : ''} à vérifier avant validation.`}
            </p>
          </section>

          <section className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-5 space-y-3">
            <SectionTitle icon={History}>Suivi &amp; historique</SectionTitle>
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
                      <span className="text-zinc-800 dark:text-zinc-200 font-medium">
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
                      <span className="block text-zinc-400 dark:text-zinc-500">
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
          <section className="rounded-2xl border border-orange-100/80 dark:border-zinc-800 bg-gradient-to-br from-orange-50 via-rose-50 to-amber-50 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-900 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-orange-400 text-white text-[15px] font-semibold">
                {initials || '?'}
              </span>
              <div className="min-w-0">
                <p className={`${display.className} text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 truncate`}>
                  {prospect.first_name} {prospect.last_name}
                </p>
                <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Demande {reference}</p>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-[13px]">
              <a href={`mailto:${prospect.email}`} className="block text-zinc-700 dark:text-zinc-300 hover:text-orange-600 truncate">
                {prospect.email}
              </a>
              {prospect.phone ? (
                <a href={`tel:${prospect.phone}`} className="block text-zinc-700 dark:text-zinc-300 hover:text-orange-600">
                  {prospect.phone}
                </a>
              ) : (
                <p className="text-zinc-400 dark:text-zinc-500">Téléphone non renseigné</p>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Prochaine action
            </p>
            <div>
              <p className={`${display.className} text-[16px] font-semibold text-zinc-900 dark:text-zinc-100`}>
                {nextAction.title}
              </p>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1">{nextAction.why}</p>
            </div>
            {prospect.validation_status === 'validated' ? (
              <ConvertButton prospectId={prospect.id} label="Inscrire à une formation" variant="primary" />
            ) : (
              <a
                href="#pieces"
                className="w-full inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2.5 rounded-lg shadow-sm transition"
              >
                Voir les pièces
              </a>
            )}
            <a
              href={`mailto:${prospect.email}`}
              className="w-full inline-flex items-center justify-center gap-2 border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-4 py-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
            >
              Relancer par e-mail
            </a>
          </section>

          {convertedDossierId && (
            <section className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Devis
              </p>
              {devis ? (
                <>
                  <p className="text-[13px] text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {devis.reference} · {QUOTE_STATUS_LABELS[devis.status]}
                  </p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Établi le {new Date(devis.created_at).toLocaleDateString('fr-FR')}
                    {devis.status === 'draft' ? ' — à relire avant envoi.' : '.'}
                  </p>
                  <Link
                    href={`/devis/${devis.id}`}
                    className="w-full inline-flex items-center justify-center gap-2 border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-4 py-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
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

          <section className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
              Récapitulatif
            </p>
            <dl className="text-[13px] divide-y divide-zinc-100 dark:divide-zinc-800">
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
              <SummaryRow label="Financement" value={funders.join(', ').toUpperCase() || '—'} />
              <SummaryRow label="Situation" value={situationLabel} />
              <SummaryRow label="Entreprise" value={prospect.company_name ?? '—'} />
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
