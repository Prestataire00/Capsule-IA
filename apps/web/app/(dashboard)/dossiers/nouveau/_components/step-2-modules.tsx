// ARCHETYPE: workflow (sous-écran step 2)
import Link from 'next/link';
import { ArrowLeft, ArrowRight, GripVertical, X, Plus } from 'lucide-react';
import { trainers } from '@/shared/mock/data';

const defaultModules = [
  { id: 'tmp-1', position: 0, title: 'Comptabilité générale', durationHours: 14 },
  { id: 'tmp-2', position: 1, title: 'TVA & cas spéciaux', durationHours: 21 },
  { id: 'tmp-3', position: 2, title: 'Bilan & liasse', durationHours: 21 },
  { id: 'tmp-4', position: 3, title: 'Synthèse & cas pratique', durationHours: 14 },
];

export function Step2Modules() {
  const total = defaultModules.reduce((acc, m) => acc + m.durationHours, 0);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Modules et formateur</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
          Personnalisez les modules de la formation pour ce dossier précis.
        </p>
      </div>

      <section>
        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-2">
          Modules · <span className="font-mono">{total} h</span>
        </p>
        <ul className="space-y-1.5">
          {defaultModules.map((m, i) => (
            <li
              key={m.id}
              className="bg-zinc-50 dark:bg-zinc-900 rounded-lg px-3 py-2.5 flex items-center gap-3 group"
            >
              <GripVertical className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 cursor-grab" />
              <span className="font-mono text-[11px] text-zinc-400 w-4">{i + 1}.</span>
              <span className="text-[13px] text-zinc-900 dark:text-zinc-100 flex-1 truncate">{m.title}</span>
              <input
                type="number"
                defaultValue={m.durationHours}
                className="w-14 bg-white dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded px-2 py-1 text-[13px] text-right focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700"
              />
              <span className="text-[11px] text-zinc-400">h</span>
              <button
                type="button"
                aria-label="Retirer"
                className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-600 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mt-2 text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter un module
        </button>
      </section>

      <section>
        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-2">
          Formateur référent *
        </p>
        <select
          defaultValue={trainers[0]?.id}
          className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700"
        >
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.firstName} {t.lastName} {t.isInternal ? '(interne)' : '(externe)'}
            </option>
          ))}
        </select>
      </section>

      <div className="flex items-center justify-between pt-4">
        <Link
          href="/dossiers/nouveau?step=1"
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Précédent
        </Link>
        <Link
          href="/dossiers/nouveau?step=3"
          className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-md transition shadow-sm inline-flex items-center gap-2"
        >
          Suivant
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
