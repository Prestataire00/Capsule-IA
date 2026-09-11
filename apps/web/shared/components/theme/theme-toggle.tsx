// ARCHETYPE: shared
'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

const COOKIE_KEY = 'i-a-infinity-theme';

const setCookie = (value: 'light' | 'dark') => {
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${COOKIE_KEY}=${value}; path=/; max-age=${oneYear}; SameSite=Lax`;
};

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Source de vérité = la classe 'dark' actuelle sur <html>
    // (posée par le serveur via cookie, ou par le script anti-FOUC).
    setIsDark(document.documentElement.classList.contains('dark'));
    setMounted(true);
  }, []);

  const handleToggle = () => {
    const html = document.documentElement;
    const wasDark = html.classList.contains('dark');
    const next: 'light' | 'dark' = wasDark ? 'light' : 'dark';

    // 1. Toggle classe immédiate (effet visuel instantané)
    if (next === 'dark') {
      html.classList.add('dark');
      html.style.colorScheme = 'dark';
    } else {
      html.classList.remove('dark');
      html.style.colorScheme = 'light';
    }

    // 2. Persiste dans le cookie (lu par le SSR au prochain render)
    setCookie(next);

    setIsDark(next === 'dark');
  };

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
      className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
