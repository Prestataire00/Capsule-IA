'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import { login } from './actions';

const inputClass =
  'w-full h-10 bg-white dark:bg-zinc-950/40 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 transition placeholder:text-zinc-400';

/**
 * Les valeurs sont lues dans le formulaire à l'envoi : le remplissage
 * automatique (trousseau Safari, gestionnaires de mots de passe) ne prévient
 * pas toujours React, et un bouton désactivé « tant que vide » ne réagissait
 * alors plus au clic.
 */
export function LoginForm({ redirectedFrom }: { redirectedFrom?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    if (!email || !password) {
      setError('Renseignez votre e-mail et votre mot de passe.');
      return;
    }
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
        <label htmlFor="email" className="block text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="vous@votre-of.fr"
          className={inputClass}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className={inputClass}
        />
      </div>

      <div className="flex justify-end -mt-1">
        <Link
          href="/auth/mot-de-passe-oublie"
          className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-orange-600 dark:hover:text-orange-400 transition"
        >
          Mot de passe oublié ?
        </Link>
      </div>

      {error && (
        <p role="alert" className="text-[12px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full h-10 bg-orange-500 text-white text-[13px] font-semibold px-4 rounded-lg shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 hover:bg-orange-600 transition inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:bg-orange-500"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        Se connecter
        {!pending && <ArrowRight className="w-3.5 h-3.5" />}
      </button>
    </form>
  );
}
