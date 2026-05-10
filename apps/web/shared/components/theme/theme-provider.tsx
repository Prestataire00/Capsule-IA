// ARCHETYPE: shared
'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

type Ctx = { theme: Theme; resolved: 'light' | 'dark'; setTheme: (t: Theme) => void };
const ThemeContext = createContext<Ctx | null>(null);

const STORAGE_KEY = 'i-a-infinity-theme';

const computeResolved = (t: Theme): 'light' | 'dark' => {
  if (t === 'light') return 'light';
  if (t === 'dark') return 'dark';
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyToHtml = (resolved: 'light' | 'dark') => {
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  root.style.colorScheme = resolved;
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  // Lecture initiale depuis localStorage (côté client)
  useEffect(() => {
    const stored = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null) as Theme | null;
    const initial: Theme = stored && ['light', 'dark', 'system'].includes(stored) ? stored : 'system';
    setThemeState(initial);
    setResolved(computeResolved(initial));
  }, []);

  // Application + écoute du système si theme='system'
  useEffect(() => {
    const r = computeResolved(theme);
    setResolved(r);
    applyToHtml(r);

    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = mq.matches ? 'dark' : 'light';
      setResolved(next);
      applyToHtml(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return { theme: 'system', resolved: 'light', setTheme: () => {} };
  }
  return ctx;
}
