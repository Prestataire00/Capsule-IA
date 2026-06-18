// ARCHETYPE: workflow
// Justification: création d'une formation au catalogue — formulaire 5 sections (forme SoSafe),
// écrit dans app.formations + metadata.catalog via Server Action.

import Link from 'next/link';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { FormationForm } from '@/features/formations/ui/formation-form';
import { requireAccess } from '@/shared/lib/auth/require-access';

export default async function NouvelleFormationPage() {
  await requireAccess('catalogue', 'manage');
  const sb = supabaseServer();
  const { data: trainerRows } = await sb
    .schema('app')
    .from('trainers')
    .select('id, first_name, last_name')
    .is('deleted_at', null)
    .order('last_name', { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trainers = ((trainerRows as any[]) ?? []).map((t) => ({
    id: t.id as string,
    name: `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || 'Formateur',
  }));

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-3xl w-full mx-auto px-8 py-10">
        <Link
          href="/formations"
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour au catalogue
        </Link>

        <header className="mb-8 flex items-center gap-3">
          <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-950/60 dark:to-amber-950/30 text-amber-700 dark:text-amber-300 flex items-center justify-center shadow-sm">
            <BookOpen className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Nouvelle formation</h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Ajoutez une formation au catalogue de votre OF.
            </p>
          </div>
        </header>

        <FormationForm mode="create" trainers={trainers} />
      </div>
    </div>
  );
}
