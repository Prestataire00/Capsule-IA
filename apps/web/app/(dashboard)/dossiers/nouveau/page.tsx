// ARCHETYPE: workflow
// Justification: création multi-étapes guidée — focus extrême, 1 seule chose par écran.
// Données réelles Supabase (RLS) chargées côté serveur, formulaire câblé à save_dossier.

import { supabaseServer } from '@/shared/lib/supabase/server';
import { NewDossierForm } from './_components/new-dossier-form';
import { requireAccess } from '@/shared/lib/auth/require-access';
import type {
  LearnerOption,
  FormationOption,
  TrainerOption,
  FunderOption,
  ModuleOption,
} from './_components/new-dossier-form';

export const dynamic = 'force-dynamic';

export default async function NewDossierPage() {
  await requireAccess('dossiers', 'manage');
  const sb = supabaseServer();

  const [learnersRes, formationsRes, trainersRes, fundersRes, formationModulesRes] =
    await Promise.all([
      sb
        .schema('app')
        .from('learners')
        .select('id, first_name, last_name, email, company_id')
        .is('deleted_at', null)
        .order('last_name', { ascending: true }),
      sb
        .schema('app')
        .from('formations')
        .select('id, code, title, default_duration_hours, default_price_cents, default_modality')
        .eq('is_published', true)
        .is('deleted_at', null)
        .order('title', { ascending: true }),
      sb
        .schema('app')
        .from('trainers')
        .select('id, first_name, last_name, is_internal')
        .is('deleted_at', null)
        .order('last_name', { ascending: true }),
      sb
        .schema('app')
        .from('funders')
        .select('id, name, kind')
        .is('deleted_at', null)
        .order('name', { ascending: true }),
      sb
        .schema('app')
        .from('formation_modules')
        .select('formation_id, module_id, position, duration_hours, modules(title)')
        .order('position', { ascending: true }),
    ]);

  const learners = ((learnersRes.data as unknown as Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    company_id: string | null;
  }>) ?? []).map<LearnerOption>((l) => ({
    id: l.id,
    name: `${l.first_name} ${l.last_name}`,
    email: l.email,
    companyId: l.company_id,
  }));

  const formations = ((formationsRes.data as unknown as Array<{
    id: string;
    code: string;
    title: string;
    default_duration_hours: number;
    default_price_cents: number;
    default_modality: string;
  }>) ?? []).map<FormationOption>((f) => ({
    id: f.id,
    code: f.code,
    title: f.title,
    defaultHours: f.default_duration_hours,
    defaultPriceCents: f.default_price_cents,
    defaultModality: f.default_modality,
  }));

  const trainers = ((trainersRes.data as unknown as Array<{
    id: string;
    first_name: string;
    last_name: string;
    is_internal: boolean;
  }>) ?? []).map<TrainerOption>((t) => ({
    id: t.id,
    name: `${t.first_name} ${t.last_name}`,
    isInternal: t.is_internal,
  }));

  const funders = ((fundersRes.data as unknown as Array<{
    id: string;
    name: string;
    kind: string;
  }>) ?? []).map<FunderOption>((f) => ({ id: f.id, name: f.name, kind: f.kind }));

  const modulesByFormation: Record<string, ModuleOption[]> = {};
  for (const row of (formationModulesRes.data as unknown as Array<{
    formation_id: string;
    module_id: string;
    duration_hours: number;
    modules: { title: string } | { title: string }[] | null;
  }>) ?? []) {
    const mod = Array.isArray(row.modules) ? row.modules[0] : row.modules;
    (modulesByFormation[row.formation_id] ??= []).push({
      moduleId: row.module_id,
      title: mod?.title ?? 'Module',
      durationHours: row.duration_hours,
    });
  }

  return (
    <NewDossierForm
      learners={learners}
      formations={formations}
      trainers={trainers}
      funders={funders}
      modulesByFormation={modulesByFormation}
    />
  );
}
