import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import {
  type Creneau,
  type Declaration,
  type Dispo,
  type Statut,
  creneauxPourHeures,
  creneauxRemplaces,
  isCreneau,
  isDispo,
  statutDuJour,
  statutPourCreneaux,
} from './availability';

/**
 * Lecture et écriture des disponibilités (0166).
 *
 * Les heures d'une séance sont ramenées au fuseau de Paris avant d'en déduire
 * les demi-journées : une séance de 9 h vue depuis un serveur en UTC tombe
 * sinon à 8 h, et un jour d'été bascule du bon côté de midi par accident.
 */

const TZ = 'Europe/Paris';

const heureParis = (iso: string): number =>
  Number(new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date(iso)));

export const jourParis = (d: Date): string =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export type JourDeclare = { day: string; creneau: Creneau; kind: Dispo; note: string | null };

type Row = { day: string; slot: string; kind: string; note: string | null; trainer_id: string };

const versDeclarations = (rows: readonly Row[]): Declaration[] =>
  rows
    .filter((r) => isCreneau(r.slot) && isDispo(r.kind))
    .map((r) => ({ creneau: r.slot as Creneau, kind: r.kind as Dispo }));

/** Les déclarations d'un formateur sur une plage de jours (son planning). */
export async function loadMesDisponibilites(
  trainerId: string,
  du: string,
  au: string,
): Promise<JourDeclare[]> {
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('trainer_availability' as never)
    .select('day, slot, kind, note, trainer_id')
    .eq('trainer_id', trainerId)
    .gte('day', du)
    .lte('day', au)
    .order('day', { ascending: true });
  if (error) {
    console.error('[dispos] lecture impossible', trainerId, error.message);
    return [];
  }
  return ((data ?? []) as unknown as Row[])
    .filter((r) => isCreneau(r.slot) && isDispo(r.kind))
    .map((r) => ({ day: r.day, creneau: r.slot as Creneau, kind: r.kind as Dispo, note: r.note }));
}

/**
 * Déclare un créneau. Poser « journée » efface les demi-journées (et
 * l'inverse) : deux réponses contradictoires pour le même moment n'ont pas de
 * sens, et c'est la dernière qui compte.
 */
export async function declarerDisponibilite(input: {
  organizationId: string;
  trainerId: string;
  day: string;
  creneau: Creneau;
  kind: Dispo;
  note?: string | null;
}): Promise<boolean> {
  const admin = supabaseAdmin();
  const { error: delErr } = await admin
    .schema('app')
    .from('trainer_availability' as never)
    .delete()
    .eq('trainer_id', input.trainerId)
    .eq('day', input.day)
    .in('slot', creneauxRemplaces(input.creneau));
  if (delErr) {
    console.error('[dispos] remplacement impossible', input.trainerId, delErr.message);
    return false;
  }

  const { error } = await admin
    .schema('app')
    .from('trainer_availability' as never)
    .insert({
      organization_id: input.organizationId,
      trainer_id: input.trainerId,
      day: input.day,
      slot: input.creneau,
      kind: input.kind,
      note: input.note?.trim() || null,
    } as never);
  if (error) console.error('[dispos] déclaration non enregistrée', input.trainerId, error.message);
  return !error;
}

/** Retire toute déclaration d'un jour : le formateur repasse en « non renseigné ». */
export async function effacerJour(trainerId: string, day: string): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('trainer_availability' as never)
    .delete()
    .eq('trainer_id', trainerId)
    .eq('day', day);
  return !error;
}

export type DisponibiliteFormateur = {
  readonly trainerId: string;
  readonly name: string;
  readonly statut: Statut;
  readonly note: string | null;
  /** Déjà en séance sur ce créneau : un fait, pas une déclaration. */
  readonly dejaEnSeance: number;
};

/**
 * Qui est libre ce jour-là, pour l'écran de création de séance.
 *
 * Deux sources se cumulent : ce que le formateur a déclaré, et ce que
 * l'agenda dit déjà. Une séance déjà posée prime sur toute déclaration —
 * c'est un fait, pas une intention.
 */
export async function loadDisponibilitesDuJour(input: {
  organizationId: string;
  startsAt: string;
  endsAt: string;
}): Promise<DisponibiliteFormateur[]> {
  const admin = supabaseAdmin();
  const jour = jourParis(new Date(input.startsAt));
  const besoins = creneauxPourHeures(heureParis(input.startsAt), heureParis(input.endsAt));

  const [{ data: trainersData }, { data: dispoData }, { data: sessionsData }] = await Promise.all([
    admin
      .schema('app')
      .from('trainers')
      .select('id, first_name, last_name')
      .eq('organization_id', input.organizationId)
      .is('deleted_at', null)
      .order('last_name', { ascending: true }),
    admin
      .schema('app')
      .from('trainer_availability' as never)
      .select('day, slot, kind, note, trainer_id')
      .eq('organization_id', input.organizationId)
      .eq('day', jour),
    // Séances de ce jour qui chevauchent le créneau demandé.
    admin
      .schema('app')
      .from('sessions')
      .select('id, starts_at, ends_at, status')
      .eq('organization_id', input.organizationId)
      .neq('status', 'cancelled')
      .lt('starts_at', input.endsAt)
      .gt('ends_at', input.startsAt),
  ]);

  const trainers = (trainersData ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>;
  const rows = (dispoData ?? []) as unknown as Row[];
  const seances = (sessionsData ?? []) as Array<{ id: string }>;

  const occupation = new Map<string, number>();
  if (seances.length > 0) {
    const { data: liens } = await admin
      .schema('app')
      .from('session_trainers' as never)
      .select('trainer_id, session_id')
      .in('session_id', seances.map((s) => s.id));
    for (const l of (liens ?? []) as unknown as Array<{ trainer_id: string }>) {
      occupation.set(l.trainer_id, (occupation.get(l.trainer_id) ?? 0) + 1);
    }
  }

  const parFormateur = new Map<string, Row[]>();
  for (const r of rows) parFormateur.set(r.trainer_id, [...(parFormateur.get(r.trainer_id) ?? []), r]);

  return trainers.map((t) => {
    const siennes = parFormateur.get(t.id) ?? [];
    const dejaEnSeance = occupation.get(t.id) ?? 0;
    const declare = statutPourCreneaux(versDeclarations(siennes), besoins);
    return {
      trainerId: t.id,
      name: `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || 'Formateur',
      statut: dejaEnSeance > 0 ? 'indisponible' : declare,
      note: siennes.find((r) => r.note)?.note ?? null,
      dejaEnSeance,
    };
  });
}

export { statutDuJour };
