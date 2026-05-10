import './globals.css';
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

// Script anti-FOUC : applique la classe `dark` au <html> AVANT l'hydratation React.
// Lit le choix de l'utilisateur (localStorage) ou retombe sur prefers-color-scheme.
const themeInitScript = `
(function() {
  try {
    var stored = localStorage.getItem('i-a-infinity-theme');
    var isDark;
    if (stored === 'light') {
      isDark = false;
    } else if (stored === 'dark') {
      isDark = true;
    } else {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    var root = document.documentElement;
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
    root.style.colorScheme = isDark ? 'dark' : 'light';
  } catch (e) {}
})();
`;

export const metadata: Metadata = {
  title: 'i-a-infinity OF',
  description: "Plateforme de gestion d'organismes de formation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
