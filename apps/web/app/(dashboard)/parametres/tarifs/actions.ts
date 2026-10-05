'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { guardAction } from '@/shared/lib/auth/guard-action';
import { grilleSchema, type GrilleSaisie } from '@/features/billing/grille-tarifaire.schema';
import type { GrilleTarifaire } from '@/features/billing/grille-tarifaire';

const centimes = (euros: number) => Math.round(euros * 100);

export async function enregistrerGrille(input: GrilleSaisie): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = grilleSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Grille invalide.' };
  const g = await guardAction('settings');
  if (!g.ok) return { ok: false, error: 'Seuls les propriétaires et administrateurs modifient la grille.' };

  const grille: GrilleTarifaire = {
    tarifStandardCents: centimes(p.data.tarifStandard),
    plancherHoraireCents: centimes(p.data.plancherHoraire),
    coutFormateurHoraireCents: centimes(p.data.coutFormateurHoraire),
    paliers: [...p.data.paliers]
      .sort((a, b) => a.aPartirDe - b.aPartirDe)
      .map((x) => ({ aPartirDe: x.aPartirDe, tarifHoraireCents: centimes(x.tarifHoraire) })),
  };
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('organizations')
    .update({ grille_tarifaire: grille } as never)
    .eq('id', g.member.organizationId);
  if (error) return { ok: false, error: 'La grille n’a pas été enregistrée.' };
  revalidatePath('/parametres/tarifs');
  return { ok: true };
}
