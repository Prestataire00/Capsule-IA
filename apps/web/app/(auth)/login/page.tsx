// ARCHETYPE: workflow
// Justification: connexion — 1 seule chose à faire, pas de nav.

import { Logo } from '@/shared/ui/logo';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { redirectedFrom?: string; motif?: string };
}) {
  // Connexion réussie mais compte sans espace : sans message, la page semblait
  // ne pas réagir au clic. On dit avec quel compte on est connecté.
  let refus: string | null = null;
  if (searchParams.motif === 'aucun-acces') {
    const {
      data: { user },
    } = await supabaseServer().auth.getUser();
    refus = user?.email
      ? `Vous êtes connecté(e) avec ${user.email}, mais ce compte n'ouvre aucun espace : il n'est membre d'aucun organisme et n'est relié à aucune fiche formateur. Vérifiez l'adresse utilisée, ou demandez à l'organisme de vous renvoyer l'invitation.`
      : "Ce compte n'ouvre aucun espace. Vérifiez l'adresse utilisée, ou demandez à l'organisme de vous renvoyer l'invitation.";
  }

  return (
    <div className="w-full max-w-[420px]">
      <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-8">
        <div className="flex flex-col items-center text-center mb-7">
          <Logo size="lg" className="mb-5" />
          <h1 className="text-[24px] leading-tight font-extrabold text-zinc-900 dark:text-zinc-100">
            Ravi de vous revoir
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
            Accédez à votre espace organisme de formation.
          </p>
        </div>

        {refus && (
          <p role="alert" className="mb-5 text-[12px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/40 rounded-lg px-3 py-2.5">
            {refus}
          </p>
        )}

        <LoginForm redirectedFrom={searchParams.redirectedFrom} />
      </div>

      <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-500 mt-5">
        Capsule IA · votre copilote Qualiopi
      </p>
    </div>
  );
}
