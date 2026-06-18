// ARCHETYPE: workflow
// Justification: connexion — 1 seule chose à faire, pas de nav.

import { Logo } from '@/shared/ui/logo';
import { LoginForm } from './login-form';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirectedFrom?: string };
}) {
  return (
    <div className="w-full max-w-[420px]">
      <div className="rounded-2xl border border-white/70 dark:border-zinc-800 bg-white/85 dark:bg-zinc-900/80 backdrop-blur-sm shadow-lg p-8">
        <div className="flex flex-col items-center text-center mb-7">
          <Logo size="lg" className="mb-5" />
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Ravi de vous revoir 👋
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
            Accédez à votre espace organisme de formation.
          </p>
        </div>

        <LoginForm redirectedFrom={searchParams.redirectedFrom} />
      </div>

      <p className="text-center text-[11px] text-zinc-400 dark:text-zinc-500 mt-5">
        Capsule IA · votre copilote Qualiopi
      </p>
    </div>
  );
}
