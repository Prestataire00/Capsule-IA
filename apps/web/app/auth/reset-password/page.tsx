// ARCHETYPE: workflow
// Justification: définition d'un nouveau mot de passe après clic sur le lien email — une seule action.

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Logo } from '@/shared/ui/logo';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { safeInternalPath } from '@/shared/lib/auth/email-link';
import { AuthShell } from '../_components/auth-shell';
import { ResetForm } from './reset-form';

export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();

  const invalid = !user || searchParams.error;
  const next = safeInternalPath(searchParams.next);
  const formateur = next.startsWith('/formateur');

  return (
    <AuthShell>
      <div className="w-full max-w-[420px]">
        <div className="rounded-2xl border border-white/70 dark:border-zinc-800 bg-white/85 dark:bg-zinc-900/80 backdrop-blur-sm shadow-lg p-8">
          <div className="flex flex-col items-center text-center mb-7">
            <Logo size="lg" className="mb-5" />
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {formateur ? 'Votre espace formateur' : 'Nouveau mot de passe'}
            </h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
              {formateur
                ? `Choisissez le mot de passe de votre compte${user?.email ? ` ${user.email}` : ''}.`
                : 'Choisissez un nouveau mot de passe pour votre compte.'}
            </p>
          </div>

          {invalid ? (
            <div className="text-center space-y-4">
              <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
              <p className="text-[13px] text-zinc-700 dark:text-zinc-300">
                Ce lien de réinitialisation est invalide ou a expiré. Demandez-en un nouveau.
              </p>
              <Link
                href="/auth/mot-de-passe-oublie"
                className="inline-flex items-center gap-1 text-[13px] font-medium text-violet-600 dark:text-violet-400 hover:underline"
              >
                Renvoyer un lien de réinitialisation
              </Link>
            </div>
          ) : (
            <ResetForm next={next} />
          )}
        </div>

        <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-500 mt-5">
          Capsule IA · votre copilote Qualiopi
        </p>
      </div>
    </AuthShell>
  );
}
