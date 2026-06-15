import { Suspense } from 'react';
import { getPublicCatalog, getPublicCatalogByOrg } from '@/features/catalog/public-catalog';
import { InscriptionForm } from './inscription-form';

export default async function InscriptionPage({
  searchParams,
}: {
  searchParams: { formation?: string; org?: string };
}) {
  // Catalogue org-scopé : par organisme (lien niveau OF) ou par formation présélectionnée.
  const formations = searchParams.org
    ? await getPublicCatalogByOrg(searchParams.org)
    : await getPublicCatalog(searchParams.formation);
  return (
    <Suspense>
      <InscriptionForm formations={formations} />
    </Suspense>
  );
}
