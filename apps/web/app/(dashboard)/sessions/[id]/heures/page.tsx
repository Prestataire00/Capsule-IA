import { redirect } from 'next/navigation';

/** Les heures se lisent désormais dans le bandeau de l'onglet Émargement. */
export default function SessionHoursTab({ params }: { params: { id: string } }) {
  redirect(`/sessions/${params.id}/emargements`);
}
