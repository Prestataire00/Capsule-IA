import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adresseExpediteur, expedieDepuisLeBacASable } from './resend';

// « Je veux que ça parte de cette adresse mail là, comme ça les échanges seront
// visibles : contact@capsuleia.fr » — 25/09/2026.
//
// L'adresse de l'organisme est déjà dans le CRM : `organizations.contact_email`.
// La lire là plutôt que dans une variable du serveur a trois conséquences
// concrètes : elle se change dans les paramètres sans redéploiement, elle est
// la même pour tout le monde, et l'écran peut l'AFFICHER avant d'envoyer — une
// configuration qu'on ne peut pas lire finit par expédier depuis le bac à sable
// sans que personne le remarque.

export type Expediteur = {
  /** L'en-tête « From: » complet, tel qu'il partira. */
  from: string;
  /** Le nom de l'organisme, pour la signature du message. */
  nom: string;
  /** L'adresse seule, pour le « Répondre à ». Nulle quand elle vient du serveur. */
  email: string | null;
  /** D'où vient l'adresse : la fiche de l'organisme, ou la configuration du serveur. */
  source: 'organisme' | 'serveur';
  /** Rien n'est configuré nulle part : les messages partiraient du bac à sable Resend. */
  bacASable: boolean;
};

const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Le nom affiché devant l'adresse, mis entre guillemets.
 *
 * Un nom d'organisme contenant une virgule ou un chevron casse l'en-tête
 * « From: » — le message part alors à côté, ou pas du tout.
 */
const nomAffichable = (nom: string): string =>
  `"${nom.replace(/[<>"\r\n]/g, ' ').replace(/\s+/g, ' ').trim()}"`;

/**
 * L'adresse d'expédition de l'organisme, ou à défaut celle du serveur.
 *
 * Jamais celle de l'utilisateur connecté : les liens `mailto:` ouvraient la
 * messagerie personnelle de celui qui clique, le client recevait un message
 * d'une adresse privée, et la réponse partait dans une boîte que personne
 * d'autre ne relit. Un dossier suivi à trois n'a pas de correspondance privée.
 */
export async function expediteurDeLOrganisme(
  sb: SupabaseClient,
  organizationId: string,
): Promise<Expediteur> {
  const { data } = await sb
    .schema('app')
    .from('organizations')
    .select('name, contact_email')
    .eq('id', organizationId)
    .maybeSingle();
  const row = data as { name?: string | null; contact_email?: string | null } | null;
  const nom = (row?.name ?? '').trim() || 'Capsule IA';
  const email = (row?.contact_email ?? '').trim().toLowerCase();

  // Une adresse absente ou mal saisie ne doit pas empêcher d'écrire : on retombe
  // sur la configuration du serveur, en le disant.
  if (!ADRESSE.test(email)) {
    return {
      from: adresseExpediteur(),
      nom,
      email: null,
      source: 'serveur',
      bacASable: expedieDepuisLeBacASable(),
    };
  }

  return { from: `${nomAffichable(nom)} <${email}>`, nom, email, source: 'organisme', bacASable: false };
}
