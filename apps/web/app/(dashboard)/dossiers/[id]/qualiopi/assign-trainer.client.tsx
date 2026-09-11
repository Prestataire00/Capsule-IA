'use client';
// ARCHETYPE: command
// Contrôle inline « Affecter un formateur » sur la page Qualiopi du dossier.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserCog, Check } from 'lucide-react';
import { assignDossierTrainer } from './trainer-actions';

type Trainer = { id: string; name: string };

export function AssignTrainer({
  dossierId,
  trainers,
  currentTrainerId,
}: {
  dossierId: string;
  trainers: Trainer[];
  currentTrainerId: string | null;
}) {
  const [sel, setSel] = useState(currentTrainerId ?? '');
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () =>
    start(async () => {
      const r = await assignDossierTrainer(dossierId, sel);
      if (r.ok) {
        setMsg('Formateur affecté');
        router.refresh();
      } else {
        setMsg(r.error === 'no_trainer' ? 'Choisissez un formateur.' : `Erreur : ${r.error}`);
      }
    });

  return (
    <div
      id="affecter-formateur"
      className="scroll-mt-24 rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm px-4 py-3"
    >
      <div className="flex items-center gap-2 text-[13px] font-bold text-zinc-900 dark:text-zinc-100 mb-2">
        <UserCog className="w-4 h-4 text-zinc-400" /> Affecter un formateur (I21)
      </div>
      {trainers.length === 0 ? (
        <p className="text-[12px] text-zinc-600 dark:text-zinc-400">
          Aucun formateur enregistré. Créez-en un dans <span className="font-semibold">Formations → Formateurs</span>.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            className="h-9 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-[13px] transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10"
          >
            <option value="">— Choisir un formateur —</option>
            {trainers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !sel}
            className="inline-flex items-center gap-1.5 h-9 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-60 px-3 text-[13px] font-semibold text-white transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10"
          >
            <Check className="w-4 h-4" /> {pending ? 'Affectation…' : 'Affecter'}
          </button>
          {msg && <span className="text-[12px] text-zinc-600 dark:text-zinc-400">{msg}</span>}
        </div>
      )}
    </div>
  );
}
