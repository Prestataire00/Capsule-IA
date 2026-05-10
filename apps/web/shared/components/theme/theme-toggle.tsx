// ARCHETYPE: shared
'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

const STORAGE_KEY = 'i-a-infinity-theme';

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Sync avec le DOM après hydratation (le script anti-FOUC dans <head>
  // a déjà appliqué la bonne classe avant le rendu).
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    setMounted(true);
  }, []);

  const handleToggle = () => {
    const html = document.documentElement;
    const wasDark = html.classList.contains('dark');

    if (wasDark) {
      html.classList.remove('dark');
      html.style.colorScheme = 'light';
    } else {
      html.classList.add('dark');
      html.style.colorScheme = 'dark';
    }

    try {
      localStorage.setItem(STORAGE_KEY, wasDark ? 'light' : 'dark');
    } catch {
      /* localStorage indisponible */
    }

    setIsDark(!wasDark);
  };

  // Avant le mount : icône inerte (évite le mismatch d'hydratation).
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Changer le thème"
        suppressHydrationWarning
        className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400"
      >
        <Sun className="w-4 h-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={isDark ? 'Activer le mode clair' : 'Activer le mode sombre'}
      title={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
