'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export type KindOption = { value: string; label: string };

// Filtre par type de document : met à jour le paramètre `kind` de l'URL en
// conservant l'onglet et la recherche courants.
export function KindFilter({ options, value }: { options: KindOption[]; value: string }) {
  const router = useRouter();
  const params = useSearchParams();

  function onChange(next: string) {
    const sp = new URLSearchParams(params.toString());
    if (next) sp.set('kind', next);
    else sp.delete('kind');
    router.push(`/documents?${sp.toString()}`);
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Filtrer par type"
      className="h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] text-zinc-700 dark:text-zinc-300 transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10"
    >
      <option value="">Tous les types</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
