import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { env } from '@/env.mjs';

/**
 * Authentification des appels machine (crons, endpoints d'administration).
 *
 * **En-tête uniquement.** Le même secret circulait auparavant en query string
 * (`?secret=…`) sur plusieurs routes : un secret dans une URL est recopié dans
 * les journaux d'accès de Railway, dans ceux du proxy, dans l'historique du
 * navigateur et dans l'en-tête `Referer` de la page suivante. Comme
 * `CRON_SECRET` est partagé par tous les crons *et* par les endpoints
 * d'administration, sa fuite donnait l'écriture sur toute la base.
 *
 * La base appelle déjà ces routes avec `Authorization: Bearer` (0147,
 * `app.call_cron_endpoint`) : retirer la query string ne change rien au
 * déclenchement automatique.
 *
 * Comparaison à temps constant, longueur vérifiée d'abord — `timingSafeEqual`
 * lève si les tampons diffèrent en taille.
 */
export function verifierSecretMachine(req: Request): boolean {
  const attendu = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const entete = req.headers.get('Authorization') ?? '';
  const recu = Buffer.from(entete);
  if (recu.length === attendu.length && timingSafeEqual(recu, attendu)) return true;

  // Variante acceptée pour les appels manuels avec curl : `x-cron-secret`.
  const brutAttendu = Buffer.from(env.CRON_SECRET);
  const brutRecu = Buffer.from(req.headers.get('x-cron-secret') ?? '');
  return brutRecu.length === brutAttendu.length && timingSafeEqual(brutRecu, brutAttendu);
}

/** Réponse commune : ne dit pas si c'est le secret ou la méthode qui fâche. */
export const refusMachine = () =>
  new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
