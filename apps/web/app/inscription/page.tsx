import { Suspense } from 'react';
import { getPublicCatalog } from '@/features/catalog/public-catalog';
import { InscriptionForm } from './inscription-form';

export default async function InscriptionPage({
  searchParams,
}: {
  searchParams: { formation?: string };
}) {
  // Catalogue org-scopé : déterminé par la formation du lien d'inscription.
  const formations = await getPublicCatalog(searchParams.formation);
  return (
    <Suspense>
      <InscriptionForm formations={formations} />
    </Suspense>
  );
}
