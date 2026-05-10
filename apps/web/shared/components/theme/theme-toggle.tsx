// ARCHETYPE: shared
'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

const STORAGE_KEY = 'i-a-infinity-theme';

export function ThemeToggle() {
  const [theme, setThemeState] = useState<'light' | 'dark' | null>(null);

  // Lit le thème actuel depuis le DOM au mount (la classe 'dark' a déjà été
  // appliquée par le script anti-FOUC dans <head>).
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setThemeState(isDark ? 'dark' : 'light');
  }, []);

  const toggle = () => {
    const root = document.documentElement;
    const current = root.classList.contains('dark') ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';

    if (next === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.colorScheme = next;

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage indisponible */
    }

    setThemeState(next);
  };

  // Avant le mount, on rend un placeholder neutre pour éviter le mismatch
  // d'hydratation (le serveur ne connaît pas la préférence du user).
  if (theme === null) {
    return (
      <button
        type="button"
        aria-label="Changer le thème"
        className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400"
      >
        <Sun className="w-4 h-4 opacity-50" />
      </button>
    );
  }

  const isDark = theme === 'dark';
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
