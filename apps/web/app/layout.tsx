import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'i-a-infinity OF',
  description: 'Plateforme de gestion d\'organismes de formation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
