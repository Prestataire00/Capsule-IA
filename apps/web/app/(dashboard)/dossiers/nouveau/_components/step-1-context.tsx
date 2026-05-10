// ARCHETYPE: workflow (sous-écran step 1)
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { learners, formations } from '@/shared/mock/data';

export function Step1Context() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Pour qui et quelle formation ?</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
          Sélectionnez l'apprenant, la formation et la période. Tout sera personnalisable ensuite.
        </p>
      </div>

      <div className="space-y-4">
        <Field label="Apprenant *">
          <select
            defaultValue={learners[0]?.id}
            className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700"
          >
            {learners.map((l) => (
              <option key={l.id} value={l.id}>
                {l.firstName} {l.lastName} — {l.email}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Formation *">
          <select
            defaultValue={formations[0]?.id}
            className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700"
          >
            {formations.filter((f) => f.isPublished).map((f) => (
              <option key={f.id} value={f.id}>
                {f.code} — {f.title} · {f.defaultHours}h
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date de début *">
            <input
              type="date"
              defaultValue="2026-09-01"
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700"
            />
          </Field>
          <Field label="Date de fin *">
            <input
              type="date"
              defaultValue="2026-12-15"
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2 text-[13px] focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700"
            />
          </Field>
        </div>

        <Field label="Modalité *">
          <div className="grid grid-cols-4 gap-2">
            {(['presentiel', 'distanciel', 'hybride', 'afest'] as const).map((m, i) => (
              <label
                key={m}
                className={
                  i === 0
                    ? 'border border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md px-3 py-2 text-[13px] text-center cursor-pointer'
                    : 'border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md px-3 py-2 text-[13px] text-center cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900'
                }
              >
                <input type="radio" name="modality" value={m} className="sr-only" defaultChecked={i === 0} />
                {m}
              </label>
            ))}
          </div>
        </Field>
      </div>

      <div className="flex items-center justify-end pt-4">
        <Link
          href="/dossiers/nouveau?step=2"
          className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-md transition shadow-sm inline-flex items-center gap-2"
        >
          Suivant
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 block mb-2">
        {label}
      </span>
      {children}
    </label>
  );
}
