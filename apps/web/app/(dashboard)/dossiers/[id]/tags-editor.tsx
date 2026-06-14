// ARCHETYPE: workflow
'use client';

import { useState, useTransition } from 'react';
import { Tag, X, Plus, Loader2 } from 'lucide-react';
import { setDossierTags } from './actions';

export function TagsEditor({ dossierId, initialTags }: { dossierId: string; initialTags: string[] }) {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [draft, setDraft] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const persist = (next: string[]) => {
    setError(null);
    startTransition(async () => {
      const res = await setDossierTags(dossierId, next);
      if (res.ok) setTags(res.tags);
      else setError(res.error);
    });
  };

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setDraft('');
      return;
    }
    const next = [...tags, t];
    setDraft('');
    persist(next);
  };

  const remove = (t: string) => persist(tags.filter((x) => x !== t));

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <Tag className="w-3.5 h-3.5 text-zinc-400" />
        <p className="text-[11px] uppercase tracking-wider text-zinc-500">Tags</p>
        {pending && <Loader2 className="w-3 h-3 animate-spin text-zinc-400" />}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {tags.length === 0 && <span className="text-[12px] text-zinc-400">Aucun tag.</span>}
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full pl-3 pr-1.5 py-1 text-xs text-zinc-700 dark:text-zinc-300"
          >
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              disabled={pending}
              aria-label={`Retirer ${t}`}
              className="hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          maxLength={40}
          placeholder="Ajouter un tag…"
          className="bg-white dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-1.5 text-[13px] w-56 focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 placeholder:text-zinc-400"
        />
        <button
          type="button"
          onClick={add}
          disabled={pending || !draft.trim()}
          className="inline-flex items-center gap-1.5 border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[12px] px-3 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-950 disabled:opacity-50 transition"
        >
          <Plus className="w-3 h-3" /> Ajouter
        </button>
      </div>

      {error && <p className="text-[12px] text-red-600 dark:text-red-400 mt-2">Erreur : {error}</p>}
    </div>
  );
}
