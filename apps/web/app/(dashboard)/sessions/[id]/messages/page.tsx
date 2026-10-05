import { notFound, redirect } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession } from '@/features/sessions/load-session';

/**
 * La discussion d'une séance vit dans la messagerie (celle de son dossier, ou
 * son propre fil sans dossier) : plus de second fil ici, qui faisait doublon.
 */
export default async function SessionMessagesPage({ params }: { params: { id: string } }) {
  const loaded = await loadSession(supabaseServer(), params.id);
  if (!loaded) notFound();
  const fil = loaded.session.dossier_id ?? (loaded.dossierIds.length === 1 ? loaded.dossierIds[0]! : params.id);
  redirect(`/messagerie?dossier=${fil}`);
}
