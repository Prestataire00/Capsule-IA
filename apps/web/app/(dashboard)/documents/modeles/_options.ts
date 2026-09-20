import 'server-only';
import { supabaseServer } from '@/shared/lib/supabase/server';
import type { FormationChoice, CategoryChoice, DossierChoice } from './_components/template-editor';

export async function loadFormations(): Promise<FormationChoice[]> {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('formations')
    .select('id, title')
    .is('deleted_at', null)
    .order('title', { ascending: true });
  return ((data as unknown as Array<{ id: string; title: string }>) ?? []).map((f) => ({
    id: f.id,
    title: f.title,
  }));
}

export async function loadDossiers(): Promise<DossierChoice[]> {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, reference, learner:learners!dossiers_learner_id_fkey(first_name, last_name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  return (
    (data as unknown as Array<{
      id: string;
      reference: string;
      learner: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
    }>) ?? []
  ).map((d) => {
    const l = Array.isArray(d.learner) ? d.learner[0] : d.learner;
    const name = l ? [l.first_name, l.last_name].filter(Boolean).join(' ') : '';
    return { id: d.id, label: name ? `${d.reference} — ${name}` : d.reference };
  });
}

export async function loadCategories(): Promise<CategoryChoice[]> {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('document_categories' as never)
    .select('id, name')
    .order('position', { ascending: true });
  return ((data as unknown as Array<{ id: string; name: string }>) ?? []).map((c) => ({
    id: c.id,
    name: c.name,
  }));
}
