import 'server-only';
import { NextResponse } from 'next/server';

/**
 * Réponse d'un cron : un échec doit se voir.
 *
 * Constat de l'audit du 19/09/2026 : les crons accumulaient leurs erreurs dans
 * un tableau `errors` puis renvoyaient `{ ok: true }` en HTTP 200. Une
 * convocation Qualiopi qui ne partait pas ne réveillait donc personne — ni un
 * superviseur qui surveille le code HTTP, ni `pg_cron`, qui voit la réponse.
 *
 * Ici, la présence d'une seule erreur suffit à répondre 500, en conservant le
 * détail de ce qui a fonctionné : un cron partiellement en échec reste un cron
 * en échec, et le détail sert à savoir quoi reprendre.
 */

/** Ramasse les `errors: string[]` à tous les niveaux du corps de réponse. */
function erreursDe(valeur: unknown, profondeur = 0): string[] {
  if (profondeur > 4 || valeur === null || typeof valeur !== 'object') return [];
  const out: string[] = [];
  for (const [cle, v] of Object.entries(valeur as Record<string, unknown>)) {
    if (cle === 'errors' && Array.isArray(v)) {
      out.push(...v.filter((e): e is string => typeof e === 'string'));
    } else if ((cle === 'error' || cle === 'errorDetail') && typeof v === 'string' && v !== '') {
      // `errorDetail` est la forme employée par la synchronisation Zoom.
      out.push(v);
    } else if (typeof v === 'object') {
      out.push(...erreursDe(v, profondeur + 1));
    }
  }
  return out;
}

/** Nombre d'erreurs remontées par un corps de réponse de cron. */
export const compterErreurs = (corps: unknown): number => erreursDe(corps).length;

export function reponseCron(nom: string, corps: Record<string, unknown>): NextResponse {
  const erreurs = erreursDe(corps);
  if (erreurs.length === 0) return NextResponse.json({ ok: true, ...corps });

  // Journalisé en une ligne : sans agrégateur d'erreurs, la sortie standard de
  // Railway est le seul endroit où cela se lit.
  console.error(`[cron:${nom}] ${erreurs.length} erreur(s)`, erreurs.slice(0, 20));

  return NextResponse.json(
    { ok: false, errorCount: erreurs.length, errors: erreurs.slice(0, 20), ...corps },
    { status: 500 },
  );
}
