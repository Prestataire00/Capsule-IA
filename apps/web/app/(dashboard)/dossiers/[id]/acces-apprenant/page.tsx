import { redirect } from 'next/navigation';

// L'espace apprenant a laissé place à l'espace entreprise du référent
// (demande d'Ismael, 05/10/2026) : les anciens liens y mènent.
export default function AccesApprenantPage({ params }: { params: { id: string } }) {
  redirect(`/dossiers/${params.id}/espace-entreprise`);
}
