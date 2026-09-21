// ARCHETYPE: command
import { notFound } from 'next/navigation';
import { Info } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { ExpensesManager, type ExpenseRow } from './expenses-manager';

export const dynamic = 'force-dynamic';

export default async function DepensesPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer() as unknown as SupabaseClient;
  const { data: dossier, error: erreurLecture } = await sb.schema('app').from('dossiers').select('id').eq('id', params.id).maybeSingle();
  // Une requête en échec n'est pas une ligne absente : sans cette
  // distinction, toute panne s'affiche en 404 (incident du 21/09/2026).
  if (erreurLecture) {
    console.error('[dépenses du dossier] lecture impossible', erreurLecture.code, erreurLecture.message);
    throw new Error(`Lecture impossible (dépenses du dossier) : ${erreurLecture.message}`);
  }
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
      <p className="text-[12px] text-zinc-600 dark:text-zinc-400 max-w-2xl rounded-lg border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 flex gap-2">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-400" />
        <span>
        Les charges opérationnelles (rémunération formateur, sous-traitance, achats du jour) se pilotent
        désormais au niveau de la <strong className="font-bold text-zinc-900 dark:text-zinc-100">session</strong> (onglet Dépenses de chaque session) et se
        consolident dans le budget de la formation. Cet onglet reste dédié aux charges nominatives du BPF.
        </span>
      </p>
      <ExpensesManager dossierId={params.id} initial={expenses} />
    </div>
  );
}
