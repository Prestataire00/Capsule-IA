import { notFound } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession } from '@/features/sessions/load-session';
import { DocumentSessionForm } from './document-send.client';
import { ClientDocuments, type ClientRow } from './client-documents.client';

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

  return (
    <div className="space-y-5">
      <ClientDocuments sessionId={params.id} clients={clients} sheets={sheets} />
      <p className="text-[13px] text-zinc-600 dark:text-zinc-300">
        Envoyez un document (convention, attestation…) à <strong>tous les apprenants</strong> de la session en une fois.
        Les documents se génèrent depuis chaque dossier ; ici on les diffuse à la session.
      </p>
      <DocumentSessionForm sessionId={params.id} learnerCount={loaded.learners.length} />
    </div>
  );
}
