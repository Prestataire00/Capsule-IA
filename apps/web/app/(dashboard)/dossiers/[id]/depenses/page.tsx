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
      <ExpensesManager dossierId={params.id} initial={expenses} />
    </div>
  );
}
