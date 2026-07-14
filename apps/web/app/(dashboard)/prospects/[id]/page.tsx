// ARCHETYPE: workflow
// Justification: vérification des pièces + validation d'une demande (action staff tracée).

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Fraunces } from 'next/font/google';
import { createClient } from '@supabase/supabase-js';
import {
  ArrowLeft,
  Briefcase,
  Wallet,
  Building2,
  CalendarDays,
  ClipboardList,
  History,
  FileCheck2,
} from 'lucide-react';
import { env } from '@/env.mjs';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { StatusPill } from '@/shared/ui/status-pill';
import { requiredDocs } from '@/features/prospect/funding';
import { ProspectDetailActions, type DocChecklistItem } from './prospect-detail-actions';

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

const INFO_TONES = {
  blue: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 ring-blue-100 dark:ring-blue-900/40',
  amber: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 ring-amber-100 dark:ring-amber-900/40',
  rose: 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 ring-rose-100 dark:ring-rose-900/40',
  emerald:
    'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 ring-emerald-100 dark:ring-emerald-900/40',
} as const;

function InfoCard({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof Briefcase;
  tone: keyof typeof INFO_TONES;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ring-1 ${INFO_TONES[tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {label}
      </p>
      <p className="text-[13px] text-zinc-800 dark:text-zinc-200 mt-0.5 break-words">{value}</p>
    </div>
  );
}

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
type Event = { id: string; kind: string; payload: Record<string, unknown>; occurred_at: string };

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
    sb.schema('app').from('prospect_events' as never).select('id, kind, payload, occurred_at').eq('prospect_id', params.id).order('occurred_at', { ascending: false }),
  ]);
  const reviews = (reviewRows ?? []) as unknown as Review[];
  const events = (eventRows ?? []) as unknown as Event[];

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

  return (
    <div className="max-w-4xl w-full mx-auto px-8 py-8 space-y-7">
      <Link
        href="/prospects"
        className="text-[13px] text-zinc-500 hover:text-orange-600 inline-flex items-center gap-1 transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Demandes
      </Link>

      {/* Hero chaleureux (orange → rose), avatar initiales */}
      <header className="rounded-3xl border border-orange-100/80 dark:border-zinc-800 bg-gradient-to-br from-orange-50 via-rose-50 to-amber-50 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-900 p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-orange-400 text-white text-[18px] font-semibold shadow-sm">
              {initials || '?'}
            </span>
            <div className="min-w-0">
              <h1 className={`${display.className} text-[30px] leading-tight font-semibold text-zinc-900 dark:text-zinc-100`}>
                {prospect.first_name} {prospect.last_name}
              </h1>
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                {prospect.email}
                {prospect.phone ? ` · ${prospect.phone}` : ''}
              </p>
            </div>
          </div>
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
        </div>
      </header>

      {/* Infos clés colorées */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <InfoCard
          icon={Briefcase}
          tone="blue"
          label="Situation"
          value={`${situationLabel}${prospect.company_batch_id ? ' · entreprise' : ''}`}
        />
        <InfoCard icon={Wallet} tone="amber" label="Financement" value={funders.join(', ').toUpperCase() || '—'} />
        <InfoCard icon={Building2} tone="rose" label="Entreprise" value={prospect.company_name ?? '—'} />
        <InfoCard
          icon={CalendarDays}
          tone="emerald"
          label="Reçue le"
          value={new Date(prospect.created_at).toLocaleDateString('fr-FR')}
        />
      </section>

      {(() => {
        const n = prospect.needs_analysis;
        if (!n || (!n.objectives && !n.expectations && !n.constraints && !n.accommodations && !n.typologyContext && n.currentLevel == null)) {
          return null;
        }
        return (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <SectionTitle icon={ClipboardList}>Fiche besoin</SectionTitle>
              {n.currentLevel != null && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-medium">
                  Niveau : {LEVEL_LABELS[n.currentLevel] ?? n.currentLevel}
                </span>
              )}
            </div>
            <div className="border border-amber-100/80 dark:border-zinc-800 rounded-2xl px-5 py-4 space-y-3 bg-amber-50/40 dark:bg-zinc-950/40">
              <Answer label="Objectifs" value={n.objectives} />
              <Answer label="Attentes" value={n.expectations} />
              <Answer label="Contraintes" value={n.constraints} />
              <Answer label="Besoin d'aménagement" value={n.accommodations} />
              <Answer label="Contexte / typologie" value={n.typologyContext} />
            </div>
          </section>
        );
      })()}

      <section className="space-y-3">
        <SectionTitle icon={FileCheck2}>Pièces justificatives</SectionTitle>
        <ProspectDetailActions
          prospectId={prospect.id}
          validationStatus={prospect.validation_status}
          docs={docs}
          canValidate={canValidate}
        />
      </section>

      <section className="space-y-3">
        <SectionTitle icon={History}>Historique</SectionTitle>
        {events.length === 0 ? (
          <p className="text-[13px] text-zinc-400">Aucune action enregistrée.</p>
        ) : (
          <ul className="space-y-0">
            {events.map((e, i) => (
              <li key={e.id} className="flex items-start gap-3 text-[12px]">
                <span className="flex flex-col items-center self-stretch">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-orange-400 ring-2 ring-orange-100 dark:ring-orange-900/40" />
                  {i < events.length - 1 && <span className="w-px flex-1 bg-zinc-200 dark:bg-zinc-800" />}
                </span>
                <span className="pb-3">
                  <span className="text-zinc-800 dark:text-zinc-200 font-medium">
                    {EVENT_LABELS[e.kind] ?? e.kind}
                  </span>
                  {typeof e.payload?.doc_key === 'string' && (
                    <span className="text-zinc-400"> · {e.payload.doc_key as string}</span>
                  )}
                  {typeof e.payload?.reason === 'string' && (
                    <span className="text-zinc-400 truncate"> — {e.payload.reason as string}</span>
                  )}
                  <span className="block text-zinc-400 dark:text-zinc-500">
                    {new Date(e.occurred_at).toLocaleString('fr-FR')}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
