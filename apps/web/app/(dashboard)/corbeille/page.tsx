// La corbeille a rejoint les Paramètres : on n'y va pas pour travailler, on y
// va pour rattraper une suppression — c'est un réglage, pas une rubrique.
// Redirection conservée pour les liens et signets existants.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function CorbeilleRedirect() {
  redirect('/parametres/corbeille');
}
