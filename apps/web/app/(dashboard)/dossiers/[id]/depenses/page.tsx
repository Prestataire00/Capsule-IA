// ARCHETYPE: command
import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { ExpensesManager, type ExpenseRow } from './expenses-manager';

export const dynamic = 'force-dynamic';

export default async function DepensesPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer() as unknown as SupabaseClient;
  const { data: dossier } = await sb.schema('app').from('dossiers').select('id').eq('id', params.id).maybeSingle();
  if (!dossier) notFound();

  const { data: rows } = await sb
    .schema('app')
    .from('dossier_expenses')
    .select('id, kind, label, amount_cents, hours, supplier_name, incurred_on')
    .eq('dossier_id', params.id)
    .is('deleted_at', null)
    .order('incurred_on', { ascending: false, nullsFirst: false });

  const expenses = (rows ?? []) as unknown as ExpenseRow[];

  return (
    <div className="space-y-6">
      <SectionLabel>Dépenses du dossier</SectionLabel>
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 max-w-2xl">
        Charges rattachées à ce dossier (rémunération des formateurs, achats de prestations de formation,
        sous-traitance confiée à d&apos;autres organismes). Elles alimentent automatiquement le cadre
        « Charges » et la sous-traitance du Bilan Pédagogique et Financier.
      </p>
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 max-w-2xl rounded-lg border border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 px-3 py-2">
        💡 Les charges opérationnelles (rémunération formateur, sous-traitance, achats du jour) se pilotent
        désormais au niveau de la <strong>session</strong> (onglet Dépenses de chaque session) et se
        consolident dans le budget de la formation. Cet onglet reste dédié aux charges nominatives du BPF.
      </p>
      <ExpensesManager dossierId={params.id} initial={expenses} />
    </div>
  );
}
