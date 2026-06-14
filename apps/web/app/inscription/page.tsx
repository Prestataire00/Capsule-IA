import { Suspense } from 'react';
import { getPublicCatalog } from '@/features/catalog/public-catalog';
import { InscriptionForm } from './inscription-form';

export default async function InscriptionPage() {
  const formations = await getPublicCatalog();
  return (
    <Suspense>
      <InscriptionForm formations={formations} />
    </Suspense>
  );
}
