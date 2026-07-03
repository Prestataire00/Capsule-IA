'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, KeyRound, Check } from 'lucide-react';
import { setNewPassword } from './actions';

const inputClass =
  'w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200/50 dark:focus:border-orange-500/60 dark:focus:ring-orange-500/20 transition placeholder:text-zinc-400';

const labelClass = 'block text-[12px] font-medium text-zinc-600 dark:text-zinc-400 mb-1.5';

export function ResetForm() {
  const router = useRouter();
  const [newPassword, setNewPwd] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await setNewPassword({ newPassword, confirmPassword });
      if (result.ok) {
        setDone(true);
        router.replace('/');
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="newPassword" className={labelClass}>
          Nouveau mot de passe
        </label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(e) => setNewPwd(e.target.value)}
          placeholder="Au moins 8 caractères"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className={labelClass}>
          Confirmer le mot de passe
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          className={inputClass}
        />
      </div>

      {error && (
        <p role="alert" className="text-[12px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {done && (
        <p className="text-[12px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
          <Check className="w-3.5 h-3.5" /> Mot de passe défini. Redirection…
        </p>
      )}

      <button
        type="submit"
        disabled={pending || done}
        className="w-full bg-orange-500 text-white text-[13px] font-medium px-4 py-2.5 rounded-lg shadow-sm hover:bg-orange-600 hover:shadow-md transition inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:bg-orange-500"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
        Définir le mot de passe
      </button>
    </form>
  );
}
