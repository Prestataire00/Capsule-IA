// ARCHETYPE: workflow
// Justification: corriger une demande déjà saisie — coquille, SIRET, formation.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import type { FormationOption, ValeursDemande } from '../../nouvelle/demande-form.client';
import { ModifierDemande } from './modifier.client';

export const dynamic = 'force-dynamic';

type Ligne = {
  id: string;
  civility: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  birth_date: string | null;
  rqth: boolean | null;
  situation: string;
  funder_kind: string;
  company_name: string | null;
  company_siret: string | null;
  convention_collective: string | null;
  referent_name: string | null;
  referent_email: string | null;
  referent_phone: string | null;
  formation_id: string | null;
  custom_formation_title: string | null;
  custom_formation_hours: number | null;
  custom_formation_price_cents: number | null;
  preferred_modality: string | null;
  preferred_start_date: string | null;
  message: string | null;
  converted_dossier_id: string | null;
};

export default async function ModifierDemandePage({ params }: { params: { id: string } }) {
  await requireAccess('crm', 'manage');
  const sb = supabaseServer();

  const [{ data: ligne, error: erreurLecture }, { data: formationsRows }] = await Promise.all([
    sb
      .schema('app')
      .from('prospects')
      .select(
        'id, civility, first_name, last_name, email, phone, birth_date, rqth, situation, funder_kind, ' +
          'company_name, company_siret, convention_collective, referent_name, referent_email, referent_phone, ' +
          'formation_id, custom_formation_title, custom_formation_hours, custom_formation_price_cents, ' +
          'preferred_modality, preferred_start_date, message, converted_dossier_id',
      )
      .eq('id', params.id)
      .is('deleted_at', null)
      .maybeSingle(),
    sb
      .schema('app')
      .from('formations')
      .select('id, title, code, default_price_cents, default_duration_hours')
      .is('deleted_at', null)
      .order('title', { ascending: true })
      .limit(300),
  ]);

  // Une requête en échec n'est pas une demande absente (incident du 21/09/2026).
  if (erreurLecture) {
    console.error('[demande] lecture impossible', erreurLecture.code, erreurLecture.message);
    throw new Error(`Lecture impossible (demande) : ${erreurLecture.message}`);
  }
  if (!ligne) notFound();
  const d = ligne as unknown as Ligne;

  const formations: FormationOption[] = (
    (formationsRows ?? []) as Array<{
      id: string;
      title: string;
      code: string | null;
      default_price_cents: number | null;
      default_duration_hours: number | null;
    }>
  ).map((f) => ({
    id: f.id,
    title: f.title,
    code: f.code,
    priceCents: Number(f.default_price_cents ?? 0),
    hours: Number(f.default_duration_hours ?? 0),
  }));

  const valeurs: ValeursDemande = {
    civility: d.civility ?? '',
    firstName: d.first_name,
    lastName: d.last_name,
    email: d.email,
    phone: d.phone ?? '',
    birthDate: d.birth_date ?? '',
    rqth: Boolean(d.rqth),
    situation: d.situation,
    funderKind: d.funder_kind,
    companyName: d.company_name ?? '',
    companySiret: d.company_siret ?? '',
    conventionCollective: d.convention_collective ?? '',
    referentName: d.referent_name ?? '',
    referentEmail: d.referent_email ?? '',
    referentPhone: d.referent_phone ?? '',
    // Le mode se déduit de ce qui est renseigné : une formation du catalogue,
    // un intitulé libre, ou rien encore.
    formationMode: d.formation_id ? 'catalogue' : d.custom_formation_title ? 'sur-mesure' : 'plus-tard',
    formationId: d.formation_id ?? '',
    customTitle: d.custom_formation_title ?? '',
    customHours: d.custom_formation_hours != null ? String(d.custom_formation_hours) : '',
    customPrice: d.custom_formation_price_cents != null ? String(d.custom_formation_price_cents / 100) : '',
    preferredModality: d.preferred_modality ?? '',
    preferredStartDate: d.preferred_start_date ?? '',
    message: d.message ?? '',
  };

  return (
    <div className="max-w-4xl w-full mx-auto px-8 py-9">
      <Link
        href={`/prospects/${params.id}`}
        className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-5"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Retour à la demande
      </Link>

      <SectionLabel className="mb-2">Modifier</SectionLabel>
      <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100 mb-2">
        {d.first_name} {d.last_name}
      </h1>

      {d.converted_dossier_id && (
        // Dit avant, pas après : corriger un nom ici ne renomme pas le
        // titulaire du dossier déjà ouvert.
        <p className="text-[13px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-3 py-2 mb-5">
          Cette demande a déjà été convertie. Les corrections apportées ici ne modifient pas le dossier créé.
        </p>
      )}

      <ModifierDemande prospectId={params.id} formations={formations} valeurs={valeurs} />
    </div>
  );
}
