import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { creerVisioDeSeance } from './visio';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

/** Assez loin pour que le lien précède le rappel 48 h ; borné pour ménager l'API Google. */
const HORIZON_JOURS = 60;
const PAR_PASSAGE = 20;

/**
 * Le lien Meet se crée tout seul (demande d'Ismael, 2026-10-07) : toute séance
 * à distance ou hybride à venir sans lien en reçoit un, sur l'agenda de la
 * boîte générique — que la création ait échoué, que la séance soit passée en
 * distanciel après coup ou qu'elle soit née par un chemin qui ne le crée pas.
 * Sans agenda d'organisme connecté, rien : le bouton « Générer » reste là.
 * Le lien part ensuite à l'entreprise depuis la boîte générique, et Google
 * invite stagiaires, formateur et référent.
 */
export async function creerLesVisiosManquantes(sb: Sb, maintenant = new Date()): Promise<{ creees: number; echecs: number }> {
  const { data, error } = await sb
    .schema('app')
    .from('sessions')
    .select('id')
    .in('modality', ['distanciel', 'hybride'])
    .is('remote_url', null)
    .neq('status', 'cancelled')
    .gt('starts_at', maintenant.toISOString())
    .lt('starts_at', new Date(maintenant.getTime() + HORIZON_JOURS * 86_400_000).toISOString())
    .order('starts_at', { ascending: true })
    .limit(PAR_PASSAGE);
  if (error) {
    console.error('[visio] séances sans lien illisibles', error.message);
    return { creees: 0, echecs: 0 };
  }
  let creees = 0;
  let echecs = 0;
  for (const { id } of (data ?? []) as Array<{ id: string }>) {
    // Pas de membre : seul l'agenda de l'organisme (boîte générique) organise.
    const r = await creerVisioDeSeance(sb, id, null);
    if (r === 'created') creees += 1;
    else if (r === 'failed') {
      echecs += 1;
      console.error('[visio] Meet non créé', id);
    }
  }
  return { creees, echecs };
}
