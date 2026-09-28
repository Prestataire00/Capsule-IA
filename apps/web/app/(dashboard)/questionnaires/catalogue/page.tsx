import { redirect } from 'next/navigation';

/** L'ancien onglet « Par interlocuteur » est devenu la bibliothèque, page d'accueil des questionnaires. */
export default function AncienCatalogue() {
  redirect('/questionnaires');
}
