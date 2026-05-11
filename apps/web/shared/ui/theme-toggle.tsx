'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

const COOKIE_KEY = 'i-a-infinity-theme';
const ONE_YEAR = 60 * 60 * 24 * 365;

function setThemeCookie(value: 'light' | 'dark') {
  document.cookie = `${COOKIE_KEY}=${value}; path=/; max-age=${ONE_YEAR}; SameSite=Lax`;
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    setMounted(true);
  }, []);

  const handleToggle = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
    setThemeCookie(next ? 'dark' : 'light');
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={isDark ? 'Passer en mode clair' : 'Passer en mode sombre'}
      title={isDark ? 'Mode clair' : 'Mode sombre'}
      className={`w-8 h-8 rounded-lg flex items-center justify-center border border-zinc-200/60 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm text-zinc-600 dark:text-zinc-400 hover:text-violet-700 dark:hover:text-violet-300 hover:border-violet-200 dark:hover:border-violet-900/60 transition ${className}`}
    >
      {mounted ? (
        isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />
      ) : (
        <span className="w-3.5 h-3.5" />
      )}
    </button>
  );
}
