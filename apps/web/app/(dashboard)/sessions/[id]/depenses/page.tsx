import { notFound } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { loadSession } from '@/features/sessions/load-session';
import { ExpensesManager, type ExpenseRow } from './expenses-manager.client';

export const dynamic = 'force-dynamic';

export default async function SessionExpensesTab({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();

  if (!loaded.formation) {
    return (
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
        Cette session n'est rattachée à aucune formation : impossible d'y enregistrer des dépenses.
      </p>
    );
  }

  const { data } = await sb
    .schema('app')
    .from('formation_expenses' as never)
    .select('id, kind, label, amount_cents, supplier_name, hours, incurred_on')
    .eq('session_id', params.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  const expenses = (data as unknown as ExpenseRow[] | null) ?? [];

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-zinc-600 dark:text-zinc-300">
        Charges de cette journée de formation (rémunération formateur, sous-traitance, achats). Elles alimentent le
        budget de la formation <strong>{loaded.formation.title}</strong>.
      </p>
      <ExpensesManager sessionId={params.id} expenses={expenses} />
    </div>
  );
}
