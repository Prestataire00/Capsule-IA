import 'server-only';
// Qui utilise déjà ces adresses dans l'organisme, et dans quels dossiers.

import type { SupabaseClient } from '@supabase/supabase-js';
import { normaliserEmail, type Porteur } from './adresse-partagee';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export async function porteursDesAdresses(sb: Client, organizationId: string, emails: readonly string[]): Promise<Map<string, Porteur[]>> {
  const cibles = [...new Set(emails.map(normaliserEmail).filter((e) => e.includes('@')))];
  const resultat = new Map<string, Porteur[]>();
  if (cibles.length === 0) return resultat;

  const { data: learners } = await sb
    .schema('app')
    .from('learners')
    .select('id, first_name, last_name, email')
    .eq('organization_id', organizationId)
    .in('email', cibles)
    .is('deleted_at', null);
  const lignes = (learners ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string }>;
  if (lignes.length === 0) return resultat;

  const ids = lignes.map((l) => l.id);
  const [{ data: titulaires }, { data: membres }] = await Promise.all([
    sb.schema('app').from('dossiers').select('id, reference, learner_id').in('learner_id', ids).is('deleted_at', null),
    sb.schema('app').from('dossier_learners').select('learner_id, dossier:dossiers(reference, deleted_at)').in('learner_id', ids),
  ]);
  const refs = new Map<string, Set<string>>();
  const ajouter = (lid: string, ref: string | null | undefined) => {
    if (!ref) return;
    refs.set(lid, (refs.get(lid) ?? new Set()).add(ref));
  };
  for (const d of (titulaires ?? []) as Array<{ reference: string; learner_id: string }>) ajouter(d.learner_id, d.reference);
  for (const m of (membres ?? []) as unknown as Array<{ learner_id: string; dossier: { reference: string; deleted_at: string | null } | { reference: string; deleted_at: string | null }[] | null }>) {
    const d = Array.isArray(m.dossier) ? m.dossier[0] : m.dossier;
    if (d && !d.deleted_at) ajouter(m.learner_id, d.reference);
  }

  for (const l of lignes) {
    const cle = normaliserEmail(l.email);
    resultat.set(cle, [
      ...(resultat.get(cle) ?? []),
      { id: l.id, prenom: l.first_name, nom: l.last_name, dossiers: [...(refs.get(l.id) ?? [])].sort() },
    ]);
  }
  return resultat;
}
