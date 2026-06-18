import 'server-only';
import { supabaseServer } from '@/shared/lib/supabase/server';
import type { FormationChoice, CategoryChoice } from './_components/template-editor';

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
