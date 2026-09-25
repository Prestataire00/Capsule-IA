// Le catalogue public est retiré : Capsule IA ne vend que du sur-mesure, il n'y
// a pas de liste de formations à exposer.
//
// La page n'est pas supprimée mais rendue introuvable — le jour où un catalogue
// aurait du sens, il suffira de rétablir cette page. Le programme d'une
// formation, lui, reste public et partageable : /catalogue/<id>.
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function CataloguePublicRetire() {
  notFound();
}
