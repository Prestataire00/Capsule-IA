/**
 * Refus de jouer la suite E2E contre la production.
 *
 * Les specs se sèment elles-mêmes : elles créent des organisations, des
 * utilisateurs et des dossiers via le service role. Lancées avec le `.env.local`
 * du poste — qui pointe la production — elles y écriraient directement.
 *
 * Ce garde-fou s'exécute avant toute spec (`globalSetup`) et interrompt la suite
 * si la cible est le projet de production (audit CAP-21).
 */
const PROJET_PRODUCTION = 'asocsynsvryroovdittc';

export default function refuserProduction(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL absente. La suite E2E a besoin d’une base dédiée ' +
        '(`supabase start` en local, ou un projet Supabase de test).',
    );
  }

  if (url.includes(PROJET_PRODUCTION)) {
    throw new Error(
      `Refus : la suite E2E cible la PRODUCTION (${PROJET_PRODUCTION}).\n` +
        'Ces tests créent des organisations, des utilisateurs et des dossiers réels.\n' +
        'Lancez `supabase start` et pointez NEXT_PUBLIC_SUPABASE_URL sur l’instance ' +
        'locale, ou utilisez un projet Supabase dédié aux tests.',
    );
  }
}
