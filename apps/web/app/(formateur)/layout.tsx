// ARCHETYPE: command (shell)
// Justification: shell de l'espace formateur, sur la charpente de l'espace
// organisme — barre latérale à gauche, barre du haut, contenu.

import { redirect } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { FormateurRailServer } from '@/features/identity/trainer-self/ui/formateur-rail-server';
import { FormateurTopbar } from '@/features/identity/trainer-self/ui/formateur-topbar';

export default async function FormateurLayout({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const moi = memberships[0];
  const nom = moi ? `${moi.firstName} ${moi.lastName}`.trim() : undefined;

  return (
    <div className="min-h-screen flex bg-zinc-50 dark:bg-zinc-950">
      <FormateurRailServer nom={nom} />
      <div className="flex-1 min-w-0 flex flex-col">
        <FormateurTopbar memberships={memberships} showOfLink={Boolean(membre)} />
        <main className="relative isolate flex-1 min-w-0 overflow-x-hidden bg-app-canvas">{children}</main>
      </div>
    </div>
  );
}
