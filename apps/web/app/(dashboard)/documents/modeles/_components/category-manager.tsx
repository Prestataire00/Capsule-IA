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
        className="text-[12px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5"
      >
        <FolderPlus className="w-3.5 h-3.5" />
        Catégories
      </button>
    );
  }

  return (
    <div className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-3 space-y-2 w-full">
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Nouvelle catégorie"
          className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-1.5 text-[13px]"
        />
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-[12px] px-3 py-1.5 rounded-md inline-flex items-center gap-1.5"
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
              className="inline-flex items-center gap-1 text-[12px] bg-zinc-100 dark:bg-zinc-800 rounded px-2 py-1"
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
