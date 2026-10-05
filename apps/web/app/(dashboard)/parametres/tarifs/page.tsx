// ARCHETYPE: command
// Justification: régler la grille tarifaire appliquée par défaut aux devis,
// conventions, demandes et propositions.

import { redirect } from 'next/navigation';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { SectionLabel } from '@/shared/ui/section-label';
import { chargerGrille } from '@/features/billing/grille-store';
import { GrilleForm } from './grille-form.client';

export const dynamic = 'force-dynamic';

export default async function TarifsPage() {
  await requireAccess('settings', 'manage');
  const me = await getCurrentMember();
  if (!me) redirect('/login');
  const grille = await chargerGrille(me.organizationId);
  return (
    <div className="space-y-6">
      <div>
        <SectionLabel className="mb-2">Tarifs</SectionLabel>
        <h2 className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-100">Grille tarifaire</h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2 max-w-2xl">
          Tarif par heure et par stagiaire, dégressif avec l’effectif, et plancher facturé par heure de séance pour les
          petits groupes. Elle s’applique par défaut aux devis, conventions, demandes et propositions. Un prix saisi sur
          une demande, une formation, une séance ou un dossier l’emporte toujours.
        </p>
      </div>
      <GrilleForm initiale={grille} />
    </div>
  );
}
