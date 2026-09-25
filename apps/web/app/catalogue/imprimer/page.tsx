// Catalogue imprimable retiré en même temps que le catalogue public : sans
// liste de formations à exposer, il n'a plus d'objet.
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function CatalogueImprimableRetire() {
  notFound();
}
