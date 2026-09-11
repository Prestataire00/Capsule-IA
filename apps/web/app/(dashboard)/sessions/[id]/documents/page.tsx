import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession } from '@/features/sessions/load-session';
import { LEARNER_DOCUMENT_TYPES, learnerDocumentUrl } from '@/features/documents/learner-documents';
import { DocumentSessionForm } from './document-send.client';
import { ClientDocuments, type ClientRow } from './client-documents.client';
import { LearnerDocuments, type DocumentEtat, type LearnerRow } from './learner-documents.client';

export const dynamic = 'force-dynamic';

const HALF_DAY: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soirée' };

export default async function SessionDocumentsTab({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();

  // Un client = une entreprise (tous ses salariés) ou un particulier.
  const byClient = new Map<string, ClientRow>();
  for (const l of loaded.learners) {
    const name = `${l.first_name} ${l.last_name}`.trim();
    const key = l.companyId ? `c:${l.companyId}` : `p:${l.id}`;
    const row = byClient.get(key) ?? {
      key,
      label: l.companyId ? (l.companyName ?? 'Entreprise') : name,
      companyId: l.companyId,
      learners: [],
    };
    row.learners.push(name);
    byClient.set(key, row);
  }
  const clients = [...byClient.values()].sort((a, b) =>
    !!a.companyId === !!b.companyId ? a.label.localeCompare(b.label, 'fr') : a.companyId ? -1 : 1,
  );
  const sheets = loaded.sheets.map((s) => ({ id: s.id, label: HALF_DAY[s.half_day] ?? 'Feuille' }));

  // Où en est chaque document : dernier envoi (journal d'e-mails) et dernière
  // demande de signature (documents archivés du dossier).
  const dossierIds = loaded.learners.map((l) => l.dossierId);
  const kinds = LEARNER_DOCUMENT_TYPES.map((d) => `document:${d.type}`);
  // `email_log` n'est pas dans les types générés (comme ailleurs dans le code).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const libre = sb as unknown as SupabaseClient<any, any, any>;
  const { data: envois } = dossierIds.length
    ? await libre
        .schema('app')
        .from('email_log')
        .select('dossier_id, kind, sent_at')
        .in('dossier_id', dossierIds)
        .in('kind', kinds)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
    : { data: [] };
  const dernierEnvoi = new Map<string, string>();
  for (const e of (envois ?? []) as { dossier_id: string | null; kind: string | null; sent_at: string }[]) {
    const cle = `${e.dossier_id}|${(e.kind ?? '').replace('document:', '')}`;
    if (!dernierEnvoi.has(cle)) dernierEnvoi.set(cle, e.sent_at);
  }

  const { data: docs } = dossierIds.length
    ? await sb
        .schema('app')
        .from('documents')
        .select('id, dossier_id, metadata')
        .in('dossier_id', dossierIds)
        .is('deleted_at', null)
    : { data: [] };
  const documentsDuDossier = (docs ?? []) as { id: string; dossier_id: string | null; metadata: Record<string, unknown> | null }[];
  const typeDuDocument = new Map(
    documentsDuDossier.map((d) => [d.id, `${d.dossier_id}|${String(d.metadata?.document_type ?? '')}`]),
  );
  const { data: sigs } = documentsDuDossier.length
    ? await sb
        .schema('app')
        .from('document_signatures')
        .select('document_id, status, signed_at, created_at')
        .in('document_id', documentsDuDossier.map((d) => d.id))
        .order('created_at', { ascending: false })
    : { data: [] };
  const signature = new Map<string, { statut: 'pending' | 'signed'; date: string | null }>();
  for (const s of (sigs ?? []) as { document_id: string; status: string; signed_at: string | null; created_at: string }[]) {
    const cle = typeDuDocument.get(s.document_id);
    if (!cle || cle.endsWith('|')) continue;
    if (signature.has(cle)) continue;
    if (s.status === 'signed') signature.set(cle, { statut: 'signed', date: s.signed_at });
    else if (s.status === 'pending') signature.set(cle, { statut: 'pending', date: null });
  }

  const learners: LearnerRow[] = loaded.learners.map((l) => ({
    learnerId: l.id,
    dossierId: l.dossierId,
    name: `${l.first_name} ${l.last_name}`.trim(),
    email: l.email || null,
    companyName: l.companyName,
    documents: LEARNER_DOCUMENT_TYPES.map((d): DocumentEtat => {
      const cle = `${l.dossierId}|${d.type}`;
      const sig = signature.get(cle);
      return {
        type: d.type,
        label: d.label,
        signable: d.signable,
        url: learnerDocumentUrl(d.type, l.dossierId, params.id),
        envoyeLe: dernierEnvoi.get(cle) ?? null,
        signature: sig?.statut ?? null,
        signatureLe: sig?.date ?? null,
      };
    }),
  }));

  return (
    <div className="space-y-5">
      <ClientDocuments sessionId={params.id} clients={clients} sheets={sheets} />
      {learners.length > 0 && <LearnerDocuments sessionId={params.id} learners={learners} />}
      <p className="text-[13px] text-zinc-600 dark:text-zinc-300">
        Envoyez un document déjà généré (le dernier de ce type dans chaque dossier) à <strong>tous les apprenants</strong> en
        une fois.
      </p>
      <DocumentSessionForm sessionId={params.id} learnerCount={loaded.learners.length} />
    </div>
  );
}
