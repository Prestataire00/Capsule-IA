// ARCHETYPE: workflow
// Justification: connexion — 1 seule chose à faire, pas de nav.

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { InfoCallout } from '@/shared/ui/info-callout';

export default function LoginPage() {
  return (
    <div className="w-full max-w-[400px]">
      <div className="text-center mb-7">
        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-1">
          i-a-infinity OF
        </p>
        <h1 className="text-2xl font-medium">Se connecter</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
          Entrez votre email pour recevoir un lien magique.
        </p>
      </div>

      <form className="space-y-4">
        <input
          type="email"
          required
          placeholder="vous@votre-of.fr"
          className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2.5 text-[13px] focus:outline-none focus:border-zinc-300 dark:focus:border-zinc-700 placeholder:text-zinc-400"
        />
        <Link
          href="/"
          className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-medium px-4 py-2.5 rounded-md hover:bg-zinc-800 dark:hover:bg-zinc-200 transition inline-flex items-center justify-center gap-2"
        >
          Recevoir un lien
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </form>

      <InfoCallout tone="info" className="mt-6">
        <strong>Mode démo</strong> · pas d'auth réelle ; cliquez sur le bouton pour entrer dans l'app.
      </InfoCallout>
    </div>
  );
}
