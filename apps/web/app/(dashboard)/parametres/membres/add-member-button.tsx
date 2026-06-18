'use client';

import { useState, useTransition } from 'react';
import { UserPlus, Loader2, Copy, Check } from 'lucide-react';
import { addMemberAction } from './members-actions';
import { ADD_MEMBER_ROLES, type AddMemberRole } from './members-schema';

const ROLE_LABELS: Record<AddMemberRole, string> = {
  admin: 'Administrateur',
  gestionnaire: 'Gestionnaire',
  comptable: 'Comptable',
  formateur: 'Formateur',
};

const ERR: Record<string, string> = {
  organization_not_found: 'Organisation introuvable.',
  forbidden: 'Réservé aux administrateurs.',
  email_already_registered: 'Cet email a déjà un compte. Utilisez une autre adresse.',
  already_member: 'Cette personne est déjà membre.',
  create_user_failed: 'Échec de la création du compte.',
  profile_failed: 'Échec de la création du profil.',
  add_member_failed: 'Échec de l’ajout du membre.',
};

const inputClass =
  'w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-200/50 dark:focus:border-orange-500/60 dark:focus:ring-orange-500/20 transition';

export function AddMemberButton() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<AddMemberRole>('gestionnaire');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setOpen(false);
    setEmail('');
    setName('');
    setRole('gestionnaire');
    setError(null);
    setCreated(null);
    setCopied(false);
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await addMemberAction({ email, fullName: name, role });
      const d = res?.data;
      if (d?.ok) setCreated({ email: d.email, tempPassword: d.tempPassword });
      else setError(ERR[d?.error ?? ''] ?? 'Une erreur est survenue.');
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-medium px-3 py-1.5 rounded-lg transition shadow-sm inline-flex items-center gap-1.5"
      >
        <UserPlus className="w-3 h-3" />
        Inviter un membre
      </button>
    );
  }

  return (
    <div className="absolute right-0 top-9 z-50 w-80 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg p-4">
      {created ? (
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-400">Membre ajouté ✅</p>
          <p className="text-[12px] text-zinc-600 dark:text-zinc-400">
            Transmettez ces identifiants à <strong>{created.email}</strong> (à changer à la première connexion) :
          </p>
          <div className="rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/70 dark:border-zinc-800 px-3 py-2 flex items-center justify-between gap-2">
            <code className="text-[12px] text-zinc-800 dark:text-zinc-200 break-all">{created.tempPassword}</code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(created.tempPassword);
                setCopied(true);
              }}
              className="flex-shrink-0 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              aria-label="Copier"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <button
            type="button"
            onClick={reset}
            className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-medium px-3 py-2 rounded-lg"
          >
            Terminé
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Inviter un membre</p>
          <div className="space-y-1">
            <label className="text-[11px] text-zinc-500">Nom complet</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Marie Dupont" className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-zinc-500">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="marie@votre-of.fr" className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-zinc-500">Rôle</label>
            <select value={role} onChange={(e) => setRole(e.target.value as AddMemberRole)} className={inputClass}>
              {ADD_MEMBER_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={submit}
              disabled={pending || name.trim() === '' || email.trim() === ''}
              className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[12px] font-medium px-3 py-2 rounded-lg transition inline-flex items-center justify-center gap-1.5"
            >
              {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Créer le membre
            </button>
            <button type="button" onClick={reset} disabled={pending} className="text-[12px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-2">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
