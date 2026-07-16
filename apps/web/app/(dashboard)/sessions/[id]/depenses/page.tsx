import { Wallet } from 'lucide-react';
import { EmptyState } from '@/shared/ui/empty-state';

export const dynamic = 'force-dynamic';

// Phase 1 : les dépenses au niveau session (charges du jour, rémunération formateur,
// sous-traitance) seront gérées ici en Phase 2 via app.formation_expenses /
// app.session_trainers. En attendant, les dépenses restent au niveau du dossier.
export default function SessionExpensesTab() {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg">
      <EmptyState
        icon={Wallet}
        title="Dépenses au niveau session — bientôt"
        description="La saisie des charges du jour (rémunération formateur, sous-traitance, achats) et le budget consolidé de la formation arrivent ici. Pour l'instant, les dépenses se gèrent depuis le dossier."
      />
    </div>
  );
}
