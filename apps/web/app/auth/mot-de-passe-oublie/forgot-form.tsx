'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { requestPasswordReset } from './actions';

const inputClass =
  'w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200/50 dark:focus:border-orange-500/60 dark:focus:ring-orange-500/20 transition placeholder:text-zinc-400';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestPasswordReset({ email });
      if (result.ok) setSent(true);
      else setError(result.error);
    });
  };

  if (sent) {
    return (
      <div className="text-center space-y-3">
        <MailCheck className="w-8 h-8 text-emerald-500 mx-auto" />
        <p className="text-[13px] text-zinc-700 dark:text-zinc-300">
          Si un compte existe pour <span className="font-medium">{email}</span>, un email contenant un lien de
          réinitialisation vient d'être envoyé. Pensez à vérifier vos spams.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-violet-600 dark:text-violet-400 hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-[12px] font-medium text-zinc-600 dark:text-zinc-400">
          Adresse email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@organisme.fr"
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
        disabled={pending || email.length === 0}
        className="w-full bg-orange-500 text-white text-[13px] font-medium px-4 py-2.5 rounded-lg shadow-sm hover:bg-orange-600 hover:shadow-md transition inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:bg-orange-500"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        Envoyer le lien de réinitialisation
        {!pending && <ArrowRight className="w-3.5 h-3.5" />}
      </button>

      <Link
        href="/login"
        className="flex items-center justify-center gap-1 text-[12px] text-zinc-500 hover:text-violet-600 transition"
      >
        <ArrowLeft className="w-3 h-3" /> Retour à la connexion
      </Link>
    </form>
  );
}
