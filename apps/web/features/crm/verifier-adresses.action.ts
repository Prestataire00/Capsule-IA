'use server';

import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { alerteAdresse, normaliserEmail } from './adresse-partagee';
import { porteursDesAdresses } from './porteurs-adresses';

const schema = z.array(z.object({ email: z.string().trim().max(200), prenom: z.string().max(100), nom: z.string().max(100) })).max(200);

/**
 * Pour chaque saisie, dans l'ordre, l'alerte si l'adresse est déjà utilisée
 * (null sinon) — avant
 * d'enregistrer, pour qu'on puisse corriger une faute de frappe ou donner à
 * chacun sa propre adresse. Ne bloque rien.
 */
export async function verifierAdresses(brut: z.input<typeof schema>): Promise<Array<string | null>> {
  const p = schema.safeParse(brut);
  if (!p.success) return [];
  const membre = await getCurrentMember();
  if (!membre || (can(membre.role, 'dossiers') === 'none' && can(membre.role, 'crm') === 'none')) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabaseAdmin() as unknown as SupabaseClient<any, any, any>;
  const porteurs = await porteursDesAdresses(sb, membre.organizationId, p.data.map((s) => s.email));
  return p.data.map((s) => {
    const email = normaliserEmail(s.email);
    return alerteAdresse(email, { prenom: s.prenom, nom: s.nom }, porteurs.get(email) ?? []);
  });
}
