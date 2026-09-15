'use client';

import { useState, useTransition } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { Check } from 'lucide-react';
import { changeMemberRoleAction, deactivateMemberAction, setMemberPasswordAction } from './members-actions';
import { MEMBER_ROLES, type MemberRole } from './members-schema';

const ROLE_LABEL: Record<MemberRole, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  gestionnaire: 'Gestionnaire',
  comptable: 'Comptable',
  formateur: 'Formateur',
};

// Pastille de rôle colorée (charte v4 « vivante »).
const ROLE_TONE: Record<MemberRole, string> = {
  owner: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
  gestionnaire: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  comptable: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  formateur: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
};

const ERROR_LABEL: Record<string, string> = {
  forbidden: 'Action non autorisée.',
  last_owner: 'Impossible : dernier propriétaire.',
  not_found: 'Membre introuvable.',
  owner_only: 'Seul un propriétaire peut modifier le compte d’un autre propriétaire.',
  owner_grant: 'L’organisation ne compte qu’un propriétaire : transférez-le depuis son compte.',
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
      <span className={`text-[12px] font-semibold h-6 inline-flex items-center px-2.5 rounded-full flex-shrink-0 ${ROLE_TONE[props.role]}`}>
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
        // Le motif exact plutôt qu'un « échec » muet : c'est presque toujours une
        // règle métier (dernier propriétaire, droits), pas une panne.
        const d = res?.data as { error?: string; details?: string } | undefined;
        setError(
          ERROR_LABEL[d?.error ?? ''] ??
            (d?.details ? `Échec de la mise à jour : ${d.details}` : 'Échec de la mise à jour.'),
        );
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
          className={`h-8 text-[12px] font-semibold border border-transparent rounded-lg px-2 ${ROLE_TONE[role]} focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 transition disabled:opacity-50`}
        >
          {/* « Propriétaire » n'est proposé que sur la ligne du propriétaire :
              l'organisation n'en compte qu'un, et la base refuse d'en nommer un
              second — le choix était offert puis rejeté sans explication. */}
          {MEMBER_ROLES.filter((r) => r !== 'owner' || props.role === 'owner').map((r) => (
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
          className="h-8 text-[12px] font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 px-2 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-950/30 transition disabled:opacity-50"
        >
          Mot de passe
        </button>
        <button
          type="button"
          onClick={onDeactivate}
          disabled={pending}
          className="h-8 text-[12px] font-semibold text-red-600 hover:text-red-700 dark:text-red-400 px-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition disabled:opacity-50"
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
            className="h-8 text-[12px] bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-2 w-52 focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 transition"
          />
          <button
            type="button"
            onClick={() => submitPassword(pwValue)}
            disabled={pending || pwValue.trim().length < 8}
            className="h-8 text-[12px] font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-2.5 rounded-lg shadow-sm shadow-orange-600/30 transition"
          >
            Définir
          </button>
          <button
            type="button"
            onClick={() => submitPassword('')}
            disabled={pending}
            className="h-8 text-[12px] font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 px-2 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-950/30 disabled:opacity-50"
          >
            Générer
          </button>
        </div>
      )}

      {pwDone && pwResult && (
        <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
          Nouveau mot de passe : <code className="font-mono bg-emerald-50 dark:bg-emerald-950/40 px-1 rounded-md">{pwResult}</code> — communiquez-le au membre.
        </span>
      )}
      {pwDone && !pwResult && (
        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Mot de passe modifié</span>
      )}
    </div>
  );
}
