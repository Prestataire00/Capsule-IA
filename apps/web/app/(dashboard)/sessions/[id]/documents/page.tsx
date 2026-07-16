import { notFound } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession } from '@/features/sessions/load-session';
import { DocumentSessionForm } from './document-send.client';

export const dynamic = 'force-dynamic';

export default async function SessionDocumentsTab({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-zinc-600 dark:text-zinc-300">
        Envoyez un document (convention, attestation…) à <strong>tous les apprenants</strong> de la session en une fois.
        Les documents se génèrent depuis chaque dossier ; ici on les diffuse à la session.
      </p>
      <DocumentSessionForm sessionId={params.id} learnerCount={loaded.learners.length} />
    </div>
  );
}
