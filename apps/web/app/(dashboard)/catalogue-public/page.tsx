// Capsule IA ne vend que du sur-mesure : il n'y a pas de catalogue public à
// diffuser, seulement des formations montées pour un client. Cette page gérait
// le lien partageable et la liste des formations publiées.
//
// Redirection conservée pour les liens et signets existants. Le programme d'une
// formation reste partageable individuellement, depuis sa fiche.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function CataloguePublicRedirect() {
  redirect('/formations');
}
