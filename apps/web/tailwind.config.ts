import type { Config } from 'tailwindcss';
import colors from 'tailwindcss/colors';

// Charte v4 « Horizon couleur » : les neutres « zinc » deviennent un gris bleu nuit
// (encre #111A2E, toile #F5F7FA) et l'ancien violet d'action devient l'orange
// Capsule IA — toute l'application bascule sans réécrire chaque écran.
const horizon = {
  50: '#F5F7FA',
  100: '#ECEFF5',
  200: '#E1E6EE',
  300: '#C8D0DD',
  400: '#8E99AE',
  500: '#5F6B82',
  600: '#465269',
  700: '#334056',
  800: '#1F2940',
  900: '#111A2E',
  950: '#0A0F1C',
};

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
      colors: {
        zinc: horizon,
        violet: colors.orange,
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // Ombres en couches, très diffuses : relief net sans effet « carton ».
      boxShadow: {
        sm: '0 1px 2px -1px rgb(17 26 46 / 0.06), 0 1px 3px 0 rgb(17 26 46 / 0.04)',
        DEFAULT: '0 1px 3px 0 rgb(17 26 46 / 0.07), 0 1px 2px -1px rgb(17 26 46 / 0.05)',
        md: '0 6px 16px -4px rgb(17 26 46 / 0.08), 0 2px 4px -2px rgb(17 26 46 / 0.05)',
        lg: '0 16px 36px -10px rgb(17 26 46 / 0.14), 0 4px 10px -4px rgb(17 26 46 / 0.06)',
        xl: '0 24px 56px -16px rgb(17 26 46 / 0.2), 0 8px 16px -8px rgb(17 26 46 / 0.08)',
      },
    },
  },
  plugins: [],
} satisfies Config;
