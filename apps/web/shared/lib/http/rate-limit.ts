import 'server-only';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

/**
 * Limitation de débit des points d'entrée publics et coûteux (0181).
 *
 * Le compteur vit en base : l'application tourne derrière un répartiteur et
 * peut avoir plusieurs instances, où un compteur en mémoire ne compterait que
 * sa propre part.
 *
 * **Ouverture en cas de panne.** Si le compteur est indisponible (migration non
 * appliquée, base injoignable), on laisse passer en le journalisant. Bloquer
 * une inscription parce que le garde-fou est cassé ferait plus de dégâts que
 * l'abus qu'il prévient — c'est un frein contre l'automatisation, pas un
 * contrôle d'accès. Les vraies protections restent les gardes de rôle et la
 * RLS.
 */

export type Quota = { limite: number; fenetreSecondes: number };

/** Quotas par usage — dimensionnés pour gêner une boucle, pas un humain. */
export const QUOTAS = {
  /** Formulaire d'inscription public : écrit en base et déclenche un e-mail. */
  inscription: { limite: 10, fenetreSecondes: 600 },
  /** Proxy vers l'API publique de l'État : son quota est consommé en notre nom. */
  sirene: { limite: 60, fenetreSecondes: 60 },
  /** Lecture de convention par le modèle : jusqu'à 20 Mo de PDF et 300 s. */
  importIa: { limite: 20, fenetreSecondes: 3600 },
  /** Assistant : moins lourd, mais facturé au jeton. */
  assistantIa: { limite: 60, fenetreSecondes: 3600 },
} as const satisfies Record<string, Quota>;

/** L'adresse de l'appelant, telle que la transmet le proxy de Railway. */
export function adresseAppelant(headers: Headers): string {
  const transmise = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return transmise || headers.get('x-real-ip')?.trim() || 'inconnue';
}

/**
 * Une adresse IP est une donnée personnelle : on n'en garde que l'empreinte,
 * suffisante pour compter sans constituer un fichier d'adresses.
 */
const empreinte = (valeur: string): string => createHash('sha256').update(valeur).digest('hex').slice(0, 32);

/**
 * Consomme une unité de quota. `false` = appel à refuser.
 *
 * `identifiant` distingue les appelants : empreinte d'IP pour le public,
 * identifiant d'organisation ou d'utilisateur pour les usages authentifiés.
 */
export async function quotaDisponible(usage: keyof typeof QUOTAS, identifiant: string): Promise<boolean> {
  const { limite, fenetreSecondes } = QUOTAS[usage];
  try {
    const { data, error } = await supabaseAdmin()
      .schema('app')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .rpc('consommer_quota' as never, {
        p_cle: `${usage}:${empreinte(identifiant)}`,
        p_limite: limite,
        p_fenetre_secondes: fenetreSecondes,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    if (error) {
      console.error('[rate-limit] compteur indisponible, appel laissé passer', usage, error.message);
      return true;
    }
    return data !== false;
  } catch (err) {
    console.error('[rate-limit] compteur indisponible, appel laissé passer', usage, err);
    return true;
  }
}

/** Réponse HTTP normalisée d'un refus, avec le délai avant nouvelle tentative. */
export function tropDeRequetes(usage: keyof typeof QUOTAS): Response {
  return new Response(JSON.stringify({ error: 'rate_limited' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(QUOTAS[usage].fenetreSecondes),
    },
  });
}
