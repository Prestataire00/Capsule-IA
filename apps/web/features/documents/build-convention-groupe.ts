import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildConventionInput } from './build-convention-input';
import type { DossierPayer } from './dossier-payers';

/**
 * La convention d'un groupe du dossier (0194).
 *
 * Une entreprise forme seize personnes en deux groupes de huit, qui ne viennent
 * pas les mêmes jours. Une seule convention pour les seize dit des dates et un
 * volume horaire qu'aucun des deux groupes ne suit réellement.
 *
 * Choix d'Ismael le 24/09/2026 : les deux restent possibles, au moment de
 * générer. Celle du dossier ne change pas ; celle-ci ne diffère que par trois
 * choses — la liste nominative, les dates, et le volume horaire — parce que ce
 * sont les trois seules qui dépendent du groupe. Le prestataire, le client, le
 * programme et le tarif sont ceux du dossier.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export type ConventionGroupe = {
  readonly organizationId: string;
  readonly nomGroupe: string;
  /** Prêt pour `generateConventionPDF`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly input: any;
  readonly effectif: number;
};

export async function buildConventionGroupe(
  sb: Client,
  dossierId: string,
  groupeId: string,
  payer: DossierPayer | null,
): Promise<ConventionGroupe | null> {
  const { data: groupeRow } = await sb
    .schema('app')
    .from('dossier_groupes')
    .select('id, nom, dossier_id')
    .eq('id', groupeId)
    .eq('dossier_id', dossierId)
    .maybeSingle();
  const groupe = groupeRow as { nom: string } | null;
  if (!groupe) return null;

  const built = await buildConventionInput(sb as never, dossierId, payer);
  if (!built) return null;

  // ── Les stagiaires du groupe, et eux seuls ────────────────────────────────
  const { data: membresRows } = await sb
    .schema('app')
    .from('dossier_groupe_membres')
    .select('learner_id')
    .eq('groupe_id', groupeId);
  const learnerIds = ((membresRows ?? []) as Array<{ learner_id: string }>).map((m) => m.learner_id);
  const { data: apprenantsRows } = learnerIds.length
    ? await sb
        .schema('app')
        .from('learners')
        .select('first_name, last_name, email, birth_date')
        .in('id', learnerIds)
        .is('deleted_at', null)
    : { data: [] };
  const participants = (
    (apprenantsRows ?? []) as Array<{
      first_name: string;
      last_name: string;
      email: string | null;
      birth_date: string | null;
    }>
  )
    .map((a) => ({
      firstName: a.first_name,
      lastName: a.last_name,
      email: a.email ?? '',
      birthDate: a.birth_date,
    }))
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr'));

  // ── Les dates et les heures du groupe, et non celles du dossier ───────────
  //
  // Le dossier court du premier au dernier jour, tous groupes confondus. Une
  // convention qui annoncerait cette période au Groupe A l'engagerait sur des
  // journées où il n'est pas attendu — et le volume horaire signé ne
  // correspondrait pas à ce qu'il suit. Sans séance rattachée au groupe, on
  // garde celles du dossier : mieux vaut la période large que pas de date.
  const { data: seancesRows } = await sb
    .schema('app')
    .from('sessions')
    .select('starts_at, ends_at, duration_hours')
    .eq('groupe_id', groupeId)
    .neq('status', 'cancelled')
    .order('starts_at', { ascending: true });
  const seances = (seancesRows ?? []) as Array<{
    starts_at: string;
    ends_at: string;
    duration_hours: number | string | null;
  }>;

  const dossier = { ...built.input.dossier };
  if (seances.length > 0) {
    dossier.startDate = seances[0]!.starts_at.slice(0, 10);
    dossier.endDate = seances[seances.length - 1]!.ends_at.slice(0, 10);
    const heures = seances.reduce((n, s) => n + Number(s.duration_hours ?? 0), 0);
    if (heures > 0) dossier.totalHours = heures;
  }

  return {
    organizationId: built.organizationId,
    nomGroupe: groupe.nom,
    effectif: participants.length,
    input: {
      ...built.input,
      dossier,
      participants,
      // Plusieurs noms sur un même document : c'est l'exemplaire du client.
      // Le déduire du nombre de participants échouerait sur un groupe d'un
      // seul, qui reste une convention d'entreprise.
      audience: 'entreprise' as const,
    },
  };
}
