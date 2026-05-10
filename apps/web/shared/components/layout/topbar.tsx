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
    <header className="h-14 flex-shrink-0 border-b border-zinc-200/60 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-40 flex items-center px-5 gap-4">
      <button
        type="button"
        className="flex items-center gap-2.5 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 px-2 py-1.5 rounded-md transition"
      >
        <span className="w-6 h-6 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center text-[10px] font-medium">
          {currentOrg.name.split(' ').map((s) => s[0]).slice(0, 2).join('')}
        </span>
        <span className="font-medium">{currentOrg.name}</span>
        <ChevronDown className="w-3 h-3 text-zinc-400" />
      </button>

      <div className="flex-1 max-w-md">
        <CommandPalette />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Notifications"
          className="relative w-8 h-8 rounded-md flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
        </button>
        <button
          type="button"
          className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium text-[11px] flex items-center justify-center hover:opacity-80 transition"
          aria-label={currentUser.full_name}
          title={currentUser.full_name}
        >
          {initials}
        </button>
      </div>
    </header>
  );
}
