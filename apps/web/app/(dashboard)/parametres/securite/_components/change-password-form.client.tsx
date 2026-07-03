'use client';

import { useState, useTransition } from 'react';
import { Loader2, KeyRound, Check } from 'lucide-react';
import { changePasswordAction } from '../actions';

const inputClass =
  'w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200/50 dark:focus:border-orange-500/60 dark:focus:ring-orange-500/20 transition placeholder:text-zinc-400';

const labelClass = 'block text-[12px] font-medium text-zinc-600 dark:text-zinc-400 mb-1.5';

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    startTransition(async () => {
      const result = await changePasswordAction({ currentPassword, newPassword, confirmPassword });
      if (result.ok) {
        setDone(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      <div>
        <label htmlFor="currentPassword" className={labelClass}>
          Mot de passe actuel
        </label>
        <input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => {
            setCurrentPassword(e.target.value);
            setDone(false);
          }}
          placeholder="••••••••"
          className={inputClass}
        />
      </div>

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
          onChange={(e) => {
            setNewPassword(e.target.value);
            setDone(false);
          }}
          placeholder="Au moins 8 caractères"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className={labelClass}>
          Confirmer le nouveau mot de passe
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setDone(false);
          }}
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
          <Check className="w-3.5 h-3.5" /> Mot de passe mis à jour.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-orange-500 text-white text-[13px] font-medium px-4 py-2.5 rounded-lg shadow-sm hover:bg-orange-600 hover:shadow-md transition inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:bg-orange-500"
      >
        {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
        Mettre à jour le mot de passe
      </button>
    </form>
  );
}
