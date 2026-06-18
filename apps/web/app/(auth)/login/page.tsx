// ARCHETYPE: workflow
// Justification: connexion — 1 seule chose à faire, pas de nav.

import { LoginForm } from './login-form';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirectedFrom?: string };
}) {
  return (
    <div className="w-full max-w-[400px]">
      <div className="text-center mb-7">
        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-1">
          Capsule IA
        </p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Se connecter</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
          Accédez à votre espace organisme de formation.
        </p>
      </div>

      <LoginForm redirectedFrom={searchParams.redirectedFrom} />
    </div>
  );
}
