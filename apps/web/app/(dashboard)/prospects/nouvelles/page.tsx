// La page « Nouvelles demandes » est fusionnée avec « Demandes » (/prospects),
// qui regroupe validation des pièces (→ conversion auto) et pipeline.
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function NouvellesDemandesRedirect() {
  redirect('/prospects');
}
