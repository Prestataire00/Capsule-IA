// ARCHETYPE: shared (command)
import { ChevronDown, Bell } from 'lucide-react';
import { CommandPalette } from './command-palette';
import { currentOrg, currentUser } from '@/shared/mock/data';

export function Topbar() {
  const initials = currentUser.full_name
    .split(' ')
    .map((s) => s[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="h-12 flex-shrink-0 border-b border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center px-4 gap-4">
      <button
        type="button"
        className="flex items-center gap-2 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 px-2 py-1 rounded transition"
      >
        <span className="font-medium">{currentOrg.name}</span>
        <ChevronDown className="w-3 h-3 text-zinc-400" />
      </button>

      <div className="flex-1 max-w-md">
        <CommandPalette />
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Notifications"
          className="w-8 h-8 rounded flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
        >
          <Bell className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-medium text-[11px] flex items-center justify-center"
        >
          {initials}
        </button>
      </div>
    </header>
  );
}
