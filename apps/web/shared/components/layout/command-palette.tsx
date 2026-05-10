// ARCHETYPE: shared (utilisé en command)
'use client';

import { Search, ArrowRight, FolderOpen, Users, Plus, ShieldCheck, MessageSquareWarning } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/shared/lib/cn';

const suggestions = [
  { href: '/dossiers/nouveau', icon: Plus, label: 'Créer un dossier', kbd: '⌘N' },
  { href: '/dossiers', icon: FolderOpen, label: 'Voir tous les dossiers', kbd: '⌘D' },
  { href: '/apprenants', icon: Users, label: 'Apprenants' },
  { href: '/qualiopi', icon: ShieldCheck, label: 'Tableau Qualiopi' },
  { href: '/reclamations', icon: MessageSquareWarning, label: 'Réclamations' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filtered = suggestions.filter((s) =>
    s.label.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full max-w-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 flex items-center gap-2 hover:border-zinc-300 dark:hover:border-zinc-700 transition text-left"
      >
        <Search className="w-3.5 h-3.5 text-zinc-400" />
        <span className="text-[13px] text-zinc-400 dark:text-zinc-500 flex-1">
          Rechercher, naviguer, agir…
        </span>
        <kbd className="font-mono text-[10px] bg-white dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 dark:text-zinc-400">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-zinc-900/20 dark:bg-zinc-950/60 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200/60 dark:border-zinc-800">
              <Search className="w-3.5 h-3.5 text-zinc-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tape pour rechercher…"
                className="flex-1 text-[13px] bg-transparent focus:outline-none text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
              />
              <kbd className="font-mono text-[10px] text-zinc-400">esc</kbd>
            </div>
            <ul className="py-1 max-h-80 overflow-y-auto">
              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-[13px] text-zinc-400">Aucun résultat.</li>
              ) : (
                filtered.map((s) => {
                  const Icon = s.icon;
                  return (
                    <li key={s.href}>
                      <Link
                        href={s.href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 text-[13px] transition',
                          'hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300',
                        )}
                      >
                        <Icon className="w-4 h-4 text-zinc-400" />
                        <span className="flex-1">{s.label}</span>
                        {s.kbd && (
                          <kbd className="font-mono text-[10px] text-zinc-400">{s.kbd}</kbd>
                        )}
                        <ArrowRight className="w-3 h-3 text-zinc-300" />
                      </Link>
                    </li>
                  );
                })
              )}
            </ul>
            <div className="border-t border-zinc-200/60 dark:border-zinc-800 px-3 py-1.5 text-[10px] font-mono text-zinc-400 flex justify-between">
              <span>↑↓ naviguer · ⏎ ouvrir</span>
              <span>cmd palette</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
