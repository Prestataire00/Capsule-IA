// ARCHETYPE: command
// Justification: l'ancienne adresse du planning reste valide — elle mène à la vue
// calendrier de « Mes séances », qui a absorbé le planning et les disponibilités.

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * « Planning » et « Mes séances » montraient les mêmes séances, l'une en
 * calendrier, l'autre en liste : deux entrées pour une seule question. Le
 * chemin est conservé plutôt que supprimé — un formateur l'a peut-être mis en
 * favori, et un lien mort serait un recul de plus.
 */
export default function MonPlanningPage() {
  redirect('/mes-sessions?vue=calendrier');
}
