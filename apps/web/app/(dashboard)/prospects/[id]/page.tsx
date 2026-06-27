// ARCHETYPE: workflow
// Justification: vérification des pièces + validation d'une demande (action staff tracée).

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { ArrowLeft } from 'lucide-react';
import { env } from '@/env.mjs';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { requiredDocs } from '@/features/prospect/funding';
import { ProspectDetailActions, type DocChecklistItem } from './prospect-detail-actions';

export const dynamic = 'force-dynamic';

type ProspectDoc = { key: string; label: string; storage_path: string };

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
  created_at: string;
};

type Review = { doc_key: string; status: string; rejected_reason: string | null };
type Event = { id: string; kind: string; payload: Record<string, unknown>; occurred_at: string };

const EVENT_LABELS: Record<string, string> = {
  document_verified: 'Pièce vérifiée',
  document_rejected: 'Pièce refusée',
  demande_validated: 'Demande validée',
  demande_rejected: 'Demande refusée',
  comment: 'Commentaire',
};

function admin() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async function ProspectDetailPage({ params }: { params: { id: string } }) {
  await requireAccess('crm');
  const sb = admin();

  const { data: pRow } = await sb
    .schema('app')
    .from('prospects' as never)
    .select(
      'id, organization_id, first_name, last_name, email, phone, situation, company_name, company_siret, funder_kinds, funder_kind, company_batch_id, validation_status, validation_rejected_reason, documents, created_at',
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

  // Pièces requises = financeurs + situation (entreprise si demande groupée).
  const situationForDocs = prospect.company_batch_id ? 'entreprise' : prospect.situation ?? '';
  const required = requiredDocs(prospect.funder_kinds ?? [], situationForDocs);

  // Checklist = pièces requises + pièces téléversées non requises.
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

  return (
    <div className="max-w-4xl w-full mx-auto px-8 py-8 space-y-6">
      <Link href="/prospects/nouvelles" className="text-[13px] text-zinc-500 hover:text-violet-600 inline-flex items-center gap-1">
        <ArrowLeft className="w-3.5 h-3.5" /> Nouvelles demandes
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {prospect.first_name} {prospect.last_name}
          </h1>
          <p className="text-[13px] text-zinc-500 mt-1">{prospect.email}{prospect.phone ? ` · ${prospect.phone}` : ''}</p>
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
              : 'En attente de validation'}
        </StatusPill>
      </header>

      <section className="grid grid-cols-2 gap-4 text-[13px]">
        <div className="space-y-1">
          <SectionLabel>Situation</SectionLabel>
          <p className="text-zinc-700 dark:text-zinc-300">{prospect.situation ?? '—'}{prospect.company_batch_id ? ' (inscription entreprise)' : ''}</p>
        </div>
        <div className="space-y-1">
          <SectionLabel>Financement</SectionLabel>
          <p className="text-zinc-700 dark:text-zinc-300 uppercase">{(prospect.funder_kinds ?? [prospect.funder_kind]).join(', ')}</p>
        </div>
        <div className="space-y-1">
          <SectionLabel>Entreprise</SectionLabel>
          <p className="text-zinc-700 dark:text-zinc-300">{prospect.company_name ?? '—'}{prospect.company_siret ? ` · ${prospect.company_siret}` : ''}</p>
        </div>
        <div className="space-y-1">
          <SectionLabel>Reçue le</SectionLabel>
          <p className="text-zinc-700 dark:text-zinc-300">{new Date(prospect.created_at).toLocaleDateString('fr-FR')}</p>
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Pièces justificatives</SectionLabel>
        <ProspectDetailActions
          prospectId={prospect.id}
          validationStatus={prospect.validation_status}
          docs={docs}
          canValidate={canValidate}
        />
      </section>

      <section className="space-y-3">
        <SectionLabel>Historique</SectionLabel>
        {events.length === 0 ? (
          <p className="text-[13px] text-zinc-400">Aucune action enregistrée.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="text-[12px] text-zinc-500 flex items-center gap-2">
                <span className="text-zinc-400">{new Date(e.occurred_at).toLocaleString('fr-FR')}</span>
                <span className="text-zinc-700 dark:text-zinc-300">{EVENT_LABELS[e.kind] ?? e.kind}</span>
                {typeof e.payload?.doc_key === 'string' && <span className="text-zinc-400">· {e.payload.doc_key as string}</span>}
                {typeof e.payload?.reason === 'string' && <span className="text-zinc-400 truncate">— {e.payload.reason as string}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
