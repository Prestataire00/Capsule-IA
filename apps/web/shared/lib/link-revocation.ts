import 'server-only';

/**
 * Révocation des liens envoyés par e-mail (audit CAP-14).
 *
 * Un jeton n'est pas révoqué individuellement — l'organisme ne connaît pas les
 * `jti`, qui ne lui sont affichés nulle part. La révocation porte sur un
 * **dossier** et pose une date butoir : tout jeton émis avant cette date est
 * refusé, tout lien réémis ensuite fonctionne (table `app.link_revocations`,
 * migration 0131).
 */

type Cache = { readonly at: number; readonly revokedAt: number | null; readonly echec?: boolean };

/**
 * Mémoire courte (30 s) : la vérification est appelée à chaque rendu de page de
 * l'espace apprenant, pour une donnée qui ne change qu'à l'initiative d'un
 * membre de l'organisme.
 */
const CACHE_MS = 30_000;
/** Une base injoignable ne doit pas être réinterrogée à chaque rendu. */
const CACHE_ECHEC_MS = 5_000;
/**
 * La vérification s'insère dans le chemin critique de toute page à jeton : elle
 * ne doit jamais faire attendre. Au-delà, on laisse passer (cf. défaut ouvert
 * assumé ci-dessous).
 */
const DELAI_MS = 2_000;

const cache = new Map<string, Cache>();

async function revokedAtFor(dossierId: string): Promise<number | null> {
  const hit = cache.get(dossierId);
  if (hit && Date.now() - hit.at < (hit.echec ? CACHE_ECHEC_MS : CACHE_MS)) return hit.revokedAt;

  // Import différé : ce module est importé par les vérificateurs de jetons, qui
  // sont eux-mêmes chargés très tôt. On évite de tirer le client Supabase dans
  // des contextes qui n'en ont pas besoin.
  const { supabaseAdmin } = await import('@/shared/lib/supabase/admin');
  const requete = supabaseAdmin()
    .schema('app')
    .from('link_revocations')
    .select('revoked_at')
    .eq('dossier_id', dossierId)
    .maybeSingle();

  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const { data, error } = await Promise.race([
    Promise.resolve(requete),
    new Promise<{ data: null; error: { message: string } }>((resolve) => {
      minuteur = setTimeout(() => resolve({ data: null, error: { message: 'délai dépassé' } }), DELAI_MS);
    }),
  ]).finally(() => clearTimeout(minuteur));

  if (error) {
    // Défaut ouvert assumé. Un échec ici signifie que la base est injoignable ou
    // que la migration 0131 n'est pas encore appliquée — dans les deux cas, la
    // page qui suit ne peut de toute façon charger aucune donnée, puisqu'elle
    // interroge la même base. Fermer l'accès n'apporterait aucune protection et
    // priverait les apprenants légitimes de leur espace.
    console.warn('[link-revocation] vérification impossible:', error.message);
    cache.set(dossierId, { at: Date.now(), revokedAt: null, echec: true });
    return null;
  }

  const revokedAt = data?.revoked_at ? Date.parse(data.revoked_at as string) : null;
  cache.set(dossierId, { at: Date.now(), revokedAt });
  return revokedAt;
}

/**
 * `issuedAt` est le claim `iat` du jeton, en secondes.
 *
 * Un jeton **sans** `iat` face à un dossier révoqué est refusé : ce sont les
 * jetons émis avant la mise en place de la révocation, donc nécessairement
 * antérieurs à toute date butoir.
 */
export async function isLinkRevoked(
  dossierId: string | null | undefined,
  issuedAt: number | undefined,
): Promise<boolean> {
  if (!dossierId) return false;
  const revokedAt = await revokedAtFor(dossierId);
  if (revokedAt === null) return false;
  if (issuedAt === undefined) return true;
  return issuedAt * 1000 < revokedAt;
}

/** Purge l'entrée mémoire d'un dossier, après révocation par un membre. */
export function forgetRevocation(dossierId: string): void {
  cache.delete(dossierId);
}
