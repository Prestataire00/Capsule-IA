import './globals.css';
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { cookies } from 'next/headers';

// Geist : sans géométrique « produit tech » ; le mono est réservé aux identifiants et codes.
const sans = GeistSans;
const mono = GeistMono;

const COOKIE_KEY = 'i-a-infinity-theme';

// Anti-FOUC pour les visiteurs SANS cookie (premier accès) :
// applique 'dark' avant l'hydratation si l'OS est en mode sombre.
const themeInitScript = `
(function() {
  try {
    if (document.cookie.indexOf('${COOKIE_KEY}=') !== -1) return;
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    }
  } catch (e) {}
})();
`;

export const metadata: Metadata = {
  title: 'Capsule IA',
  description: "Plateforme de gestion d'organismes de formation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Lit le cookie côté serveur — la classe 'dark' est posée dans le HTML SSR.
  // → pas de mismatch d'hydratation, pas de risque que React l'écrase.
  const themeCookie = cookies().get(COOKIE_KEY)?.value;
  const isDark = themeCookie === 'dark';
  const htmlClass = `${sans.variable} ${mono.variable}${isDark ? ' dark' : ''}`;

  return (
    <html
      lang="fr"
      className={htmlClass}
      style={{ colorScheme: isDark ? 'dark' : 'light' }}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
