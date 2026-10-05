'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserCheck } from 'lucide-react';
import { destinatairesSchema } from '@/features/trainer-space/validation-recipients.schema';
import { enregistrerDestinataires } from './destinataires-actions';

export type MembreChoix = {
  userId: string;
  nom: string;
  roleLabel: string;
  peutValider: boolean;
  choix: 'validateur' | 'copie' | null;
};

const OPTIONS = [
  { valeur: null, label: '—' },
  { valeur: 'validateur', label: 'Valide' },
  { valeur: 'copie', label: 'En copie' },
] as const;

export function Destinataires({ membres, modifiable }: { membres: MembreChoix[]; modifiable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [choix, setChoix] = useState(() => new Map(membres.map((m) => [m.userId, m.choix])));
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const noms = (role: 'validateur' | 'copie') =>
    membres.filter((m) => choix.get(m.userId) === role).map((m) => m.nom);
  const validateurs = noms('validateur');
  const copie = noms('copie');

  const enregistrer = () =>
    start(async () => {
      const valeurs = {
        validateurs: membres.filter((m) => choix.get(m.userId) === 'validateur').map((m) => m.userId),
        copie: membres.filter((m) => choix.get(m.userId) === 'copie').map((m) => m.userId),
      };
      const p = destinatairesSchema.safeParse(valeurs);
      if (!p.success) {
        setMessage({ ok: false, texte: p.error.issues[0]?.message ?? 'Choix invalide.' });
        return;
      }
      const r = await enregistrerDestinataires(p.data);
      setMessage(r.ok ? { ok: true, texte: 'Enregistré.' } : { ok: false, texte: r.error });
      if (r.ok) router.refresh();
    });

  return (
    <details className="mb-7 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm group">
      <summary className="flex items-center gap-3 p-4 cursor-pointer list-none">
        <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
          <UserCheck className="w-4 h-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Qui valide ?</span>
          <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
            {validateurs.length > 0 ? validateurs.join(', ') : 'La direction'}
            {copie.length > 0 && <> · en copie : {copie.join(', ')}</>}
          </span>
        </span>
        {modifiable && (
          <span className="ml-auto text-[12px] font-medium text-orange-600 dark:text-orange-400 group-open:hidden">
            Modifier
          </span>
        )}
      </summary>

      <div className="border-t border-zinc-100 dark:border-zinc-800 p-4 space-y-3">
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Chaque contenu déposé par un formateur part par e-mail aux validateurs, avec la copie en cc. Un validateur
          doit être propriétaire ou administrateur.
        </p>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {membres.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-[13px] text-zinc-900 dark:text-zinc-100 truncate">{m.nom}</span>
                <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">{m.roleLabel}</span>
              </span>
              <span className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 p-0.5 shrink-0">
                {OPTIONS.map((o) => {
                  const actif = choix.get(m.userId) === o.valeur;
                  const interdit = !modifiable || (o.valeur === 'validateur' && !m.peutValider);
                  return (
                    <button
                      key={o.label}
                      type="button"
                      disabled={interdit || pending}
                      onClick={() => setChoix((prev) => new Map(prev).set(m.userId, o.valeur))}
                      className={`h-7 px-2.5 rounded-md text-[12px] transition disabled:opacity-40 ${
                        actif
                          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                          : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </span>
            </li>
          ))}
        </ul>
        {modifiable && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={enregistrer}
              disabled={pending}
              className="h-9 px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-800 dark:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Enregistrer
            </button>
            {message && (
              <span className={`text-[12px] ${message.ok ? 'text-emerald-600' : 'text-red-600'}`}>{message.texte}</span>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
