'use client';

import { useState, useTransition } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { login } from './actions';

const inputClass =
  'w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200/50 dark:focus:border-orange-500/60 dark:focus:ring-orange-500/20 transition placeholder:text-zinc-400';

export function LoginForm({ redirectedFrom }: { redirectedFrom?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      // En cas de succès, l'action redirige (ne renvoie pas) ; sinon on affiche l'erreur.
      const res = await login({ email, password, redirectedFrom });
      if (res && !res.ok) setError(res.error);
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-[12px] font-medium text-zinc-600 dark:text-zinc-400">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@votre-of.fr"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-[12px] font-medium text-zinc-600 dark:text-zinc-400">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className={inputClass}
        />
      </div>

      {error && (
        <p role="alert" className="text-[12px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || email.length === 0 || password.length === 0}
        className="w-full bg-orange-500 text-white text-[13px] font-medium px-4 py-2.5 rounded-lg shadow-sm hover:bg-orange-600 hover:shadow-md transition inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:bg-orange-500"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        Se connecter
        {!pending && <ArrowRight className="w-3.5 h-3.5" />}
      </button>
    </form>
  );
}
