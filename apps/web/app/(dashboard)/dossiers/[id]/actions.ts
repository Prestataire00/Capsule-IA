'use server';

import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/shared/lib/supabase/server';

export type SetTagsResult = { ok: true; tags: string[] } | { ok: false; error: string };

const MAX_TAGS = 20;
const MAX_LEN = 40;

function normalize(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().slice(0, MAX_LEN);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

export async function setDossierTags(dossierId: string, tags: string[]): Promise<SetTagsResult> {
  if (!dossierId) return { ok: false, error: 'missing_dossier' };
  const clean = normalize(Array.isArray(tags) ? tags : []);

  const sb = supabaseServer();
  // RLS : seul le staff de l'organisation propriétaire peut mettre à jour le dossier.
  const { error } = await sb.schema('app').from('dossiers').update({ tags: clean }).eq('id', dossierId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/dossiers/${dossierId}`);
  return { ok: true, tags: clean };
}
