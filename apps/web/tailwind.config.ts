import type { Config } from 'tailwindcss';

export default {
  content: [
    './app/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './shared/**/*.{ts,tsx}',
  ],
  safelist: [
    { pattern: /bg-(orange|rose|blue|purple|emerald|amber)-(300|400)/ },
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // Ombres en couches, très diffuses : relief net sans effet « carton ».
      boxShadow: {
        sm: '0 1px 2px -1px rgb(9 9 11 / 0.06), 0 1px 3px 0 rgb(9 9 11 / 0.04)',
        DEFAULT: '0 1px 3px 0 rgb(9 9 11 / 0.07), 0 1px 2px -1px rgb(9 9 11 / 0.05)',
        md: '0 6px 16px -4px rgb(9 9 11 / 0.08), 0 2px 4px -2px rgb(9 9 11 / 0.05)',
        lg: '0 16px 36px -10px rgb(9 9 11 / 0.14), 0 4px 10px -4px rgb(9 9 11 / 0.06)',
        xl: '0 24px 56px -16px rgb(9 9 11 / 0.2), 0 8px 16px -8px rgb(9 9 11 / 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config;
