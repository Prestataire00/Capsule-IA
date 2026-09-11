// ARCHETYPE: workflow
// Justification: création d'une formation au catalogue — formulaire 5 sections (forme SoSafe),
// écrit dans app.formations + metadata.catalog via Server Action.

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { FormationForm } from '@/features/formations/ui/formation-form';
import { loadOrgVat } from '@/features/formations/load-org-vat';
import { loadOrgContacts } from '@/features/formations/load-org-contacts';
import { env } from '@/env.mjs';
import { requireAccess } from '@/shared/lib/auth/require-access';

export default async function NouvelleFormationPage() {
  await requireAccess('catalogue', 'manage');
  const sb = supabaseServer();
  const { data: trainerRows } = await sb
    .schema('app')
    .from('trainers')
    .select('id, first_name, last_name, photo_path, bio')
    .is('deleted_at', null)
    .order('last_name', { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [orgVat, contacts] = await Promise.all([loadOrgVat(), loadOrgContacts()]);

  const trainers = ((trainerRows as any[]) ?? []).map((t) => ({
    id: t.id as string,
    name: `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || 'Formateur',
    photoUrl: t.photo_path
      ? `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/trainer-photos/${t.photo_path}`
      : null,
    bio: (t.bio as string | null) ?? '',
  }));

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-3xl w-full mx-auto px-8 py-9">
        <Link
          href="/formations"
          className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour au catalogue
        </Link>

        <header className="mb-7">
          <SectionLabel className="mb-2">Catalogue</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Nouvelle formation</h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
            Ajoutez une formation au catalogue de votre OF.
          </p>
        </header>

        <FormationForm mode="create" trainers={trainers} orgVat={orgVat} contacts={contacts} />
      </div>
    </div>
  );
}
