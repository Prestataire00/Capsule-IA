import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { etapesVers, statutAttendu, type Statut } from './avancement-automatique';

/**
 * Fait avancer les dossiers dont les séances ont commencé ou sont finies
 * (passage toutes les 15 minutes). Chaque étape vérifie le statut de départ :
 * un clic de l'équipe entre deux passages l'emporte toujours.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

const PRESENTS = ['present', 'late', 'remote'];

export async function avancerLesDossiers(
  sb: Sb,
  maintenant = new Date(),
): Promise<{ avances: number; clotures: number; enAttenteQualiopi: number; errors: string[] }> {
  const avancement = await avancerSelonLesSeances(sb, maintenant);
  const cloture = await cloreLesDossiersRegles(sb);
  return { avances: avancement.avances, ...cloture, errors: [...avancement.errors, ...cloture.errors] };
}

/** Un blocage Qualiopi n'est pas une panne : le dossier attend ses preuves. */
export const estBlocageQualiopi = (message: string): boolean => message.includes('qualiopi_closing_blocked');

/**
 * Terminé et entièrement réglé → clôturé. Rattrape ce que l'événement
 * « facture réglée » n'a pas pu faire : un dossier bloqué par Qualiopi le
 * jour du règlement se clôt dès que ses preuves sont là.
 */
async function cloreLesDossiersRegles(sb: Sb): Promise<{ clotures: number; enAttenteQualiopi: number; errors: string[] }> {
  const errors: string[] = [];
  const { data: termines } = await sb.schema('app').from('dossiers').select('id').eq('status', 'completed').is('deleted_at', null).limit(500);
  const ids = ((termines ?? []) as Array<{ id: string }>).map((d) => d.id);
  if (ids.length === 0) return { clotures: 0, enAttenteQualiopi: 0, errors };
  const { data: factures } = await sb
    .schema('app')
    .from('invoices')
    .select('dossier_id, status, kind')
    .in('dossier_id', ids)
    .is('deleted_at', null);
  const parDossier = new Map<string, string[]>();
  for (const f of (factures ?? []) as Array<{ dossier_id: string; status: string; kind: string | null }>) {
    if (f.kind === 'credit_note') continue;
    parDossier.set(f.dossier_id, [...(parDossier.get(f.dossier_id) ?? []), f.status]);
  }
  let clotures = 0;
  let enAttenteQualiopi = 0;
  for (const [id, statuts] of parDossier) {
    const regle = statuts.some((x) => x === 'paid') && statuts.every((x) => x === 'paid' || x === 'cancelled');
    if (!regle) continue;
    const { error } = await sb
      .schema('app')
      .from('dossiers')
      .update({ status: 'closed', updated_at: new Date().toISOString() } as never)
      .eq('id', id)
      .eq('status', 'completed');
    if (!error) clotures += 1;
    else if (estBlocageQualiopi(error.message)) enAttenteQualiopi += 1;
    else errors.push(`${id} clôture : ${error.message}`);
  }
  return { clotures, enAttenteQualiopi, errors };
}

async function avancerSelonLesSeances(sb: Sb, maintenant: Date): Promise<{ avances: number; errors: string[] }> {
  const errors: string[] = [];
  // Les séances commencées depuis moins de 60 jours : leurs dossiers sont les seuls à pouvoir bouger.
  const { data: recentes, error } = await sb
    .schema('app')
    .from('sessions')
    .select('id, dossier_id')
    .neq('status', 'cancelled')
    .lte('starts_at', maintenant.toISOString())
    .gte('starts_at', new Date(maintenant.getTime() - 60 * 864e5).toISOString());
  if (error) return { avances: 0, errors: [`séances : ${error.message}`] };
  const idsRecentes = ((recentes ?? []) as Array<{ id: string; dossier_id: string | null }>).map((s) => s.id);
  if (idsRecentes.length === 0) return { avances: 0, errors };
  const { data: liens } = await sb.schema('app').from('session_dossiers').select('dossier_id').in('session_id', idsRecentes);
  const candidats = [
    ...new Set([
      ...((recentes ?? []) as Array<{ dossier_id: string | null }>).map((s) => s.dossier_id),
      ...((liens ?? []) as Array<{ dossier_id: string }>).map((l) => l.dossier_id),
    ].filter((x): x is string => Boolean(x))),
  ];
  if (candidats.length === 0) return { avances: 0, errors };

  const { data: dossiersRows } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, status')
    .in('id', candidats)
    .in('status', ['draft', 'pending_validation', 'scheduled', 'active'])
    .is('deleted_at', null);
  const dossiers = (dossiersRows ?? []) as Array<{ id: string; status: Statut }>;
  if (dossiers.length === 0) return { avances: 0, errors };
  const ids = dossiers.map((d) => d.id);

  // Toutes les séances de ces dossiers, futures comprises : la dernière décide de la fin.
  const [{ data: directes }, { data: liees }] = await Promise.all([
    sb.schema('app').from('sessions').select('id, dossier_id, starts_at, ends_at').in('dossier_id', ids).neq('status', 'cancelled'),
    sb.schema('app').from('session_dossiers').select('dossier_id, session:sessions!inner(id, starts_at, ends_at, status)').in('dossier_id', ids),
  ]);
  const seancesDe = new Map<string, Map<string, { debut: string; fin: string }>>();
  const ajouter = (d: string, id: string, debut: string, fin: string) => {
    const m = seancesDe.get(d) ?? new Map();
    m.set(id, { debut, fin });
    seancesDe.set(d, m);
  };
  for (const s of (directes ?? []) as Array<{ id: string; dossier_id: string; starts_at: string; ends_at: string }>) ajouter(s.dossier_id, s.id, s.starts_at, s.ends_at);
  for (const l of (liees ?? []) as unknown as Array<{ dossier_id: string; session: { id: string; starts_at: string; ends_at: string; status: string } | null }>) {
    if (l.session && l.session.status !== 'cancelled') ajouter(l.dossier_id, l.session.id, l.session.starts_at, l.session.ends_at);
  }

  // Les présences émargées, pour les brouillons et dossiers en validation.
  const aProuver = dossiers.filter((d) => d.status === 'draft' || d.status === 'pending_validation').map((d) => d.id);
  const presencesDe = new Map<string, number>();
  if (aProuver.length > 0) {
    const seancesAProuver = [...new Set(aProuver.flatMap((d) => [...(seancesDe.get(d)?.keys() ?? [])]))];
    const { data: feuilles } = seancesAProuver.length
      ? await sb.schema('app').from('attendance_sheets').select('id, session_id').in('session_id', seancesAProuver)
      : { data: [] };
    const feuilleSeance = new Map(((feuilles ?? []) as Array<{ id: string; session_id: string }>).map((f) => [f.id, f.session_id]));
    const { data: signatures } = feuilleSeance.size
      ? await sb
          .schema('app')
          .from('attendance_signatures')
          .select('attendance_sheet_id')
          .in('attendance_sheet_id', [...feuilleSeance.keys()])
          .eq('participant_kind', 'learner')
          .in('status', PRESENTS)
      : { data: [] };
    for (const s of (signatures ?? []) as Array<{ attendance_sheet_id: string }>) {
      const seance = feuilleSeance.get(s.attendance_sheet_id);
      for (const d of aProuver) if (seance && seancesDe.get(d)?.has(seance)) presencesDe.set(d, (presencesDe.get(d) ?? 0) + 1);
    }
  }

  let avances = 0;
  for (const d of dossiers) {
    const seances = [...(seancesDe.get(d.id)?.values() ?? [])];
    if (seances.length === 0) continue;
    const cible = statutAttendu({
      statut: d.status,
      premierDebut: seances.map((s) => s.debut).sort()[0] ?? null,
      derniereFin: seances.map((s) => s.fin).sort().at(-1) ?? null,
      presences: presencesDe.get(d.id) ?? 0,
      maintenant,
    });
    if (!cible) continue;
    let courant: Statut = d.status;
    for (const etape of etapesVers(d.status, cible)) {
      const { error: e } = await sb
        .schema('app')
        .from('dossiers')
        .update({ status: etape, updated_at: new Date().toISOString() } as never)
        .eq('id', d.id)
        .eq('status', courant);
      if (e) {
        errors.push(`${d.id} ${courant} → ${etape} : ${e.message}`);
        break;
      }
      courant = etape;
    }
    if (courant !== d.status) avances += 1;
  }
  return { avances, errors };
}
