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
        setMsg('✓ Formateur affecté');
        router.refresh();
      } else {
        setMsg(r.error === 'no_trainer' ? 'Choisissez un formateur.' : `Erreur : ${r.error}`);
      }
    });

  return (
    <div
      id="affecter-formateur"
      className="scroll-mt-24 rounded-lg border border-violet-200 dark:border-violet-900/40 bg-violet-50/50 dark:bg-violet-950/20 px-3 py-3"
    >
      <div className="flex items-center gap-2 text-[13px] font-medium text-violet-800 dark:text-violet-300 mb-2">
        <UserCog className="w-4 h-4" /> Affecter un formateur (I21)
      </div>
      {trainers.length === 0 ? (
        <p className="text-[12px] text-zinc-600 dark:text-zinc-400">
          Aucun formateur enregistré. Créez-en un dans <span className="font-medium">Formations → Formateurs</span>.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] outline-none focus:border-violet-400"
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
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 hover:bg-violet-800 disabled:opacity-60 px-3 py-2 text-[13px] font-medium text-white"
          >
            <Check className="w-4 h-4" /> {pending ? 'Affectation…' : 'Affecter'}
          </button>
          {msg && <span className="text-[12px] text-zinc-600 dark:text-zinc-400">{msg}</span>}
        </div>
      )}
    </div>
  );
}
