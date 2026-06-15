'use client';

import { useState, useTransition } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { changeMemberRoleAction, deactivateMemberAction } from './members-actions';
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
        setError(ERROR_LABEL[res?.data?.error ?? ''] ?? 'Échec de la désactivation.');
      }
    });

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
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
        onClick={onDeactivate}
        disabled={pending}
        className="text-[12px] text-red-600 hover:text-red-700 dark:text-red-400 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition disabled:opacity-50"
      >
        Désactiver
      </button>
    </div>
  );
}
