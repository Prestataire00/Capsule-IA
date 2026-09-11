'use client';

import { useState, useTransition } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { changeMemberRoleAction, deactivateMemberAction, setMemberPasswordAction } from './members-actions';
import { MEMBER_ROLES, type MemberRole } from './members-schema';

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  gestionnaire: 'Gestionnaire',
  comptable: 'Comptable',
  formateur: 'Formateur',
};

const ERROR_LABEL: Record<string, string> = {
  forbidden: 'Action non autorisée.',
  last_owner: 'Impossible : dernier propriétaire.',
  not_found: 'Membre introuvable.',
  owner_only: 'Seul un propriétaire peut désactiver un autre propriétaire.',
  self: 'Vous ne pouvez pas désactiver votre propre compte.',
  rls_denied:
    'Refusé par la base : votre session ne vous reconnaît pas comme administrateur. Déconnectez-vous puis reconnectez-vous, et réessayez.',
};

export function MemberRowActions(props: {
  memberId: string;
  role: MemberRole;
  editable: boolean;
}) {
  const [role, setRole] = useState<MemberRole>(props.role);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const changeRole = useAction(changeMemberRoleAction);
  const deactivate = useAction(deactivateMemberAction);
  const setPassword = useAction(setMemberPasswordAction);

  const [pwOpen, setPwOpen] = useState(false);
  const [pwValue, setPwValue] = useState('');
  const [pwResult, setPwResult] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);

  const submitPassword = (password: string) =>
    start(async () => {
      setError(null);
      setPwResult(null);
      setPwDone(false);
      const res = await setPassword.executeAsync({ memberId: props.memberId, password });
      if (res?.data?.ok) {
        setPwDone(true);
        setPwResult(res.data.password ?? null); // non-null seulement si généré
        setPwValue('');
      } else {
        setError(ERROR_LABEL[res?.data?.error ?? ''] ?? 'Échec de la modification du mot de passe.');
      }
    });

  if (!props.editable) {
    return (
      <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 flex-shrink-0">
        {ROLE_LABEL[props.role]}
      </span>
    );
  }

  const onRoleChange = (next: MemberRole) =>
    start(async () => {
      setError(null);
      const res = await changeRole.executeAsync({ memberId: props.memberId, role: next });
      if (res?.data?.ok) {
        setRole(next);
      } else {
        setError(ERROR_LABEL[res?.data?.error ?? ''] ?? 'Échec de la mise à jour.');
      }
    });

  const onDeactivate = () =>
    start(async () => {
      setError(null);
      const res = await deactivate.executeAsync({ memberId: props.memberId });
      if (!res?.data?.ok) {
        const d = res?.data as { error?: string; details?: string } | undefined;
        setError(
          ERROR_LABEL[d?.error ?? ''] ??
            (d?.details ? `Échec de la désactivation : ${d.details}` : 'Échec de la désactivation.'),
        );
      }
    });

  return (
    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
      <div className="flex items-center gap-2">
        {error && <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span>}
        <select
          value={role}
          disabled={pending}
          onChange={(e) => onRoleChange(e.target.value as MemberRole)}
          className="text-[12px] bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-2 py-1 disabled:opacity-50"
        >
          {MEMBER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setPwOpen((v) => !v);
            setPwResult(null);
            setPwDone(false);
          }}
          disabled={pending}
          className="text-[12px] text-orange-600 hover:text-orange-700 dark:text-orange-400 px-2 py-1 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-950/30 transition disabled:opacity-50"
        >
          Mot de passe
        </button>
        <button
          type="button"
          onClick={onDeactivate}
          disabled={pending}
          className="text-[12px] text-red-600 hover:text-red-700 dark:text-red-400 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition disabled:opacity-50"
        >
          Désactiver
        </button>
      </div>

      {pwOpen && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={pwValue}
            onChange={(e) => setPwValue(e.target.value)}
            placeholder="Nouveau mot de passe (min. 8)"
            className="text-[12px] bg-white dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-2 py-1 w-52"
          />
          <button
            type="button"
            onClick={() => submitPassword(pwValue)}
            disabled={pending || pwValue.trim().length < 8}
            className="text-[12px] font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-2.5 py-1 rounded-lg"
          >
            Définir
          </button>
          <button
            type="button"
            onClick={() => submitPassword('')}
            disabled={pending}
            className="text-[12px] text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-950/30 disabled:opacity-50"
          >
            Générer
          </button>
        </div>
      )}

      {pwDone && pwResult && (
        <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
          Nouveau mot de passe : <code className="font-mono bg-emerald-50 dark:bg-emerald-950/40 px-1 rounded">{pwResult}</code> — communiquez-le au membre.
        </span>
      )}
      {pwDone && !pwResult && (
        <span className="text-[11px] text-emerald-700 dark:text-emerald-400">Mot de passe modifié ✓</span>
      )}
    </div>
  );
}
