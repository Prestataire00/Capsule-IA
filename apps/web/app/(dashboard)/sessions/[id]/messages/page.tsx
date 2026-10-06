import { notFound, redirect } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession } from '@/features/sessions/load-session';

/**
 * La discussion se tient par dossier, dans la messagerie : une séance ouvre
 * celle de son dossier. Sans dossier, retour à la séance.
 */
export default async function SessionMessagesPage({ params }: { params: { id: string } }) {
  const loaded = await loadSession(supabaseServer(), params.id);
  if (!loaded) notFound();
  const dossier = loaded.session.dossier_id ?? loaded.dossierIds[0] ?? null;
  redirect(dossier ? `/messagerie?dossier=${dossier}` : `/sessions/${params.id}`);
}
