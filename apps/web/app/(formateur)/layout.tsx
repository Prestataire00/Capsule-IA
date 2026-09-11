// ARCHETYPE: shared (mobile-first formateur)
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { FormateurHeader } from '@/features/identity/trainer-self/ui/formateur-header';
import { FormateurNav } from '@/features/identity/trainer-self/ui/formateur-nav';

export default async function FormateurLayout({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectedFrom=/formateur');

  const reader = new SupabaseMembershipReader(supabase);
  // La liaison automatique des fiches ne doit jamais empêcher l'entrée dans
  // l'espace : un échec est journalisé, les fiches déjà reliées font foi.
  try {
    await reader.linkOrphans();
  } catch (e) {
    console.error('[espace formateur] liaison des fiches impossible', e);
  }
  const [memberships, membre] = await Promise.all([reader.list(), getCurrentMember()]);

  // Aucune fiche ouverte : un membre retourne à l'espace de l'organisme, un
  // compte sans rôle interne est informé à la connexion (pas de boucle).
  if (memberships.length === 0) redirect(membre ? '/?reason=no-trainer-membership' : '/login?motif=aucun-acces');

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col">
      <FormateurHeader memberships={memberships} showOfLink={Boolean(membre)} />
      <FormateurNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}
