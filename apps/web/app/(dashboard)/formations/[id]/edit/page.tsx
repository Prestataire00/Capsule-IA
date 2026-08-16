// ARCHETYPE: workflow
// Justification: édition d'une formation du catalogue — recharge colonnes + metadata.catalog,
// pré-remplit le formulaire 5 sections, écrit via Server Action updateFormation.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { FormationForm } from '@/features/formations/ui/formation-form';
import { loadOrgVat } from '@/features/formations/load-org-vat';
import { fromRow, type FormationRowLike } from '@/features/formations/mapping';

const FORMATION_COLUMNS =
  'id, code, title, summary, description, objectives, prerequisites, target_audience, ' +
  'evaluation_method, pedagogical_method, default_modality, default_duration_hours, ' +
  'default_price_cents, is_published, rncp_code, rs_code, certificateur, metadata';

export default async function EditFormationPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const [{ data: row }, { data: trainerRows }] = await Promise.all([
    sb
      .schema('app')
      .from('formations')
      .select(FORMATION_COLUMNS)
      .eq('id', params.id)
      .is('deleted_at', null)
      .maybeSingle(),
    sb.schema('app').from('trainers').select('id, first_name, last_name').is('deleted_at', null).order('last_name', { ascending: true }),
  ]);

  if (!row) return notFound();

  const initial = fromRow(row as unknown as FormationRowLike);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgVat = await loadOrgVat();

  const trainers = ((trainerRows as any[]) ?? []).map((t) => ({
    id: t.id as string,
    name: `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || 'Formateur',
  }));

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-3xl w-full mx-auto px-8 py-10">
        <Link
          href={`/formations/${params.id}`}
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour à la formation
        </Link>

        <header className="mb-8 flex items-center gap-3">
          <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-950/60 dark:to-amber-950/30 text-amber-700 dark:text-amber-300 flex items-center justify-center shadow-sm">
            <BookOpen className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Modifier la formation</h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">{initial.title}</p>
          </div>
        </header>

        <FormationForm mode="edit" formationId={params.id} initial={initial} trainers={trainers} orgVat={orgVat} />
      </div>
    </div>
  );
}
