'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/shared/types/database';

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

/**
 * Client Supabase du navigateur.
 *
 * Il ne passe PAS par `@/env.mjs` : ce module valide aussi les secrets serveur
 * (service_role, clés de signature), absents du navigateur par construction —
 * l'importer ici faisait planter à l'affichage toute page qui s'en servait
 * (fiche demande, 28/09/2026). Seules les variables NEXT_PUBLIC_*, lues par
 * leur nom exact, sont injectées dans le bundle client au build.
 */
export const supabaseBrowser = () => {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY absents du build.');
  cached = createBrowserClient<Database>(url, anon);
  return cached;
};
