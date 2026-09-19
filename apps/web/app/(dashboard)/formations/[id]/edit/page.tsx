// ARCHETYPE: workflow
// Justification: édition d'une formation du catalogue — recharge colonnes + metadata.catalog,
// pré-remplit le formulaire 5 sections, écrit via Server Action updateFormation.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { FormationForm } from '@/features/formations/ui/formation-form';
import { loadOrgVat } from '@/features/formations/load-org-vat';
import { loadOrgContacts } from '@/features/formations/load-org-contacts';
import { env } from '@/env.mjs';
import { fromRow, type FormationRowLike } from '@/features/formations/mapping';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { loadFormationIndicators } from '@/features/indicateurs/formation-indicators';

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
    sb.schema('app').from('trainers').select('id, first_name, last_name, photo_path, bio').is('deleted_at', null).order('last_name', { ascending: true }),
  ]);

  if (!row) return notFound();

  const initial = fromRow(row as unknown as FormationRowLike);

  const me = await getCurrentMember();
  const [orgVat, contacts, indicators] = await Promise.all([
    loadOrgVat(),
    loadOrgContacts(),
    me ? loadFormationIndicators(me.organizationId, params.id) : Promise.resolve(null),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          href={`/formations/${params.id}`}
          className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour à la formation
        </Link>

        <header className="mb-7">
          <SectionLabel className="mb-2">Catalogue</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Modifier la formation</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3">{initial.title}</p>
        </header>

        <FormationForm mode="edit" formationId={params.id} initial={initial} trainers={trainers} orgVat={orgVat} contacts={contacts} indicators={indicators} />
      </div>
    </div>
  );
}
