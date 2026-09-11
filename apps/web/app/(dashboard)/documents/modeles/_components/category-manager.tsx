'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Plus, X, Loader2, FolderPlus } from 'lucide-react';
import { createCategory, deleteCategory } from '../actions';

export type Category = { id: string; name: string };

export function CategoryManager({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const { executeAsync: runCreate } = useAction(createCategory);
  const { executeAsync: runDelete } = useAction(deleteCategory);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const res = await runCreate({ name: name.trim() });
    setBusy(false);
    if (res?.data?.ok) {
      setName('');
      router.refresh();
    }
  }

  async function remove(id: string) {
    if (!confirm('Supprimer cette catégorie ? Les modèles repasseront en « non classé ».')) return;
    const res = await runDelete({ id });
    if (res?.data?.ok) router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] font-semibold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 h-9 inline-flex items-center gap-1.5 transition"
      >
        <FolderPlus className="w-3.5 h-3.5" />
        Catégories
      </button>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-3 space-y-2 w-full">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Nouvelle catégorie"
          className="flex-1 h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-[12px] font-semibold px-3 h-9 rounded-lg transition inline-flex items-center gap-1.5"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Ajouter
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-700 px-1" aria-label="Fermer">
          <X className="w-4 h-4" />
        </button>
      </div>
      {categories.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <li
              key={c.id}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-md h-6 px-2"
            >
              {c.name}
              <button
                type="button"
                onClick={() => remove(c.id)}
                className="text-zinc-400 hover:text-red-600"
                aria-label={`Supprimer ${c.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
