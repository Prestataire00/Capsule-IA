// ARCHETYPE: shared
'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from './theme-provider';

export function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolved === 'dark';
  const toggle = () => setTheme(isDark ? 'light' : 'dark');

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
      title={isDark ? 'Mode clair' : 'Mode sombre'}
      className="relative w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
    >
      <Sun
        className={
          'w-4 h-4 absolute transition-all duration-300 ' +
          (isDark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0')
        }
      />
      <Moon
        className={
          'w-4 h-4 absolute transition-all duration-300 ' +
          (isDark ? '-rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100')
        }
      />
    </button>
  );
}
