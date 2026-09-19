import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { type Creneau, type Declaration, isCreneau, isDispo } from './availability';
import { etatCreneau, ordreAffichage, resumeSemaine, type EtatCreneau, type ResumeSemaine } from './semaine';
import { jourParis } from './availability-store';

/**
 * La semaine de tous les formateurs, pour l'administration.
 *
 * Le piège est le rattachement séance ↔ formateur : il existe QUATRE chemins
 * (participant, `session_trainers`, dossier de la séance, dossier lié). La
 * fonction `my_trainer_session_ids()` (0150) les unit déjà côté formateur ;
 * n'en lire qu'un ici afficherait une ligne vide pour un formateur qui anime
 * réellement, et l'écran servirait à prendre une mauvaise décision.
 */

const TZ = 'Europe/Paris';

const heureParis = (iso: string): number =>
  Number(new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date(iso)));

export type SeanceSemaine = {
  readonly id: string;
  readonly titre: string;
  readonly debut: string;
  readonly fin: string;
  readonly statut: string;
  readonly jour: string;
  readonly creneaux: readonly Creneau[];
};

export type CaseSemaine = {
  readonly jour: string;
  readonly creneau: Creneau;
  readonly etat: EtatCreneau;
  readonly note: string | null;
  readonly seances: readonly SeanceSemaine[];
};

export type LigneFormateur = {
  readonly trainerId: string;
  readonly nom: string;
  readonly interne: boolean;
  readonly cases: readonly CaseSemaine[];
  readonly resume: ResumeSemaine;
};

/** Les deux demi-journées d'une séance, d'après ses heures à Paris. */
function creneauxDeLaSeance(debut: string, fin: string): Creneau[] {
  const h1 = heureParis(debut);
  const h2 = heureParis(fin);
  const couvre: Creneau[] = [];
  if (h1 < 13) couvre.push('matin');
  if (h2 > 13) couvre.push('apres_midi');
  return couvre.length === 0 ? ['matin'] : couvre;
}

/**
 * Quels formateurs animent quelles séances — l'union des quatre chemins.
 * Exporté parce que la même question se pose partout où l'on affiche « qui
 * anime » : la réponse doit être la même d'un écran à l'autre.
 */
export async function formateursParSeance(
  seances: ReadonlyArray<{ id: string; dossier_id: string | null }>,
): Promise<Map<string, Set<string>>> {
  const parSeance = new Map<string, Set<string>>();
  if (seances.length === 0) return parSeance;

  const admin = supabaseAdmin();
  const sessionIds = seances.map((s) => s.id);
  const ajoute = (sessionId: string, trainerId: string) => {
    const deja = parSeance.get(sessionId);
    if (deja) deja.add(trainerId);
    else parSeance.set(sessionId, new Set([trainerId]));
  };

  const [participants, liens, liaisons] = await Promise.all([
    admin
      .schema('app')
      .from('session_participants')
      .select('session_id, trainer_id')
      .eq('participant_kind', 'trainer')
      .in('session_id', sessionIds),
    admin
      .schema('app')
      .from('session_trainers' as never)
      .select('session_id, trainer_id, deleted_at')
      .in('session_id', sessionIds),
    admin.schema('app').from('session_dossiers').select('session_id, dossier_id').in('session_id', sessionIds),
  ]);

  for (const p of ((participants.data ?? []) as unknown as Array<{ session_id: string; trainer_id: string | null }>)) {
    if (p.trainer_id) ajoute(p.session_id, p.trainer_id);
  }
  for (const l of ((liens.data ?? []) as unknown as Array<{ session_id: string; trainer_id: string; deleted_at: string | null }>)) {
    if (!l.deleted_at) ajoute(l.session_id, l.trainer_id);
  }

  // Les deux chemins qui passent par le dossier : celui porté par la séance
  // elle-même, et ceux de la table de liaison.
  const dossiersParSeance = new Map<string, Set<string>>();
  for (const s of seances) {
    if (s.dossier_id) dossiersParSeance.set(s.id, new Set([s.dossier_id]));
  }
  for (const d of ((liaisons.data ?? []) as unknown as Array<{ session_id: string; dossier_id: string }>)) {
    const deja = dossiersParSeance.get(d.session_id);
    if (deja) deja.add(d.dossier_id);
    else dossiersParSeance.set(d.session_id, new Set([d.dossier_id]));
  }

  const tousDossiers = [...new Set([...dossiersParSeance.values()].flatMap((s) => [...s]))];
  if (tousDossiers.length > 0) {
    const { data } = await admin
      .schema('app')
      .from('dossier_trainers')
      .select('dossier_id, trainer_id')
      .in('dossier_id', tousDossiers);
    const formateursDuDossier = new Map<string, string[]>();
    for (const r of ((data ?? []) as unknown as Array<{ dossier_id: string; trainer_id: string }>)) {
      formateursDuDossier.set(r.dossier_id, [...(formateursDuDossier.get(r.dossier_id) ?? []), r.trainer_id]);
    }
    for (const [sessionId, dossierIds] of dossiersParSeance) {
      for (const dossierId of dossierIds) {
        for (const trainerId of formateursDuDossier.get(dossierId) ?? []) ajoute(sessionId, trainerId);
      }
    }
  }

  return parSeance;
}

type SeanceBrute = {
  id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  dossier_id: string | null;
  formation_id: string | null;
};

/**
 * Le nom de la formation, qui vaut mieux que « Séance » dans une case étroite.
 * La formation est portée soit par la séance, soit par son dossier — comme
 * dans l'espace formateur (`loadSessionsByIds`).
 */
async function titresParSeance(seances: readonly SeanceBrute[]): Promise<Map<string, string>> {
  const titres = new Map<string, string>();
  if (seances.length === 0) return titres;

  const admin = supabaseAdmin();
  const dossierIds = [...new Set(seances.map((s) => s.dossier_id).filter((x): x is string => Boolean(x)))];
  const { data: dossiers } = dossierIds.length
    ? await admin.schema('app').from('dossiers').select('id, formation_id').in('id', dossierIds)
    : { data: [] };
  const formationDuDossier = new Map(
    ((dossiers ?? []) as unknown as Array<{ id: string; formation_id: string | null }>).map((d) => [
      d.id,
      d.formation_id,
    ]),
  );

  const formationDe = (s: SeanceBrute) =>
    s.formation_id ?? (s.dossier_id ? (formationDuDossier.get(s.dossier_id) ?? null) : null);

  const formationIds = [...new Set(seances.map(formationDe).filter((x): x is string => Boolean(x)))];
  if (formationIds.length === 0) return titres;

  const { data: formations } = await admin
    .schema('app')
    .from('formations')
    .select('id, title')
    .in('id', formationIds);
  const titreFormation = new Map(
    ((formations ?? []) as unknown as Array<{ id: string; title: string }>).map((f) => [f.id, f.title]),
  );

  for (const s of seances) {
    const formationId = formationDe(s);
    const titre = formationId ? titreFormation.get(formationId) : null;
    if (titre) titres.set(s.id, titre);
  }
  return titres;
}

/** Une ligne par formateur, sur les jours demandés. */
export async function loadSemaineFormateurs(input: {
  organizationId: string;
  jours: readonly Date[];
}): Promise<LigneFormateur[]> {
  const admin = supabaseAdmin();
  const cles = input.jours.map(jourParis);
  const premier = cles[0]!;
  const dernier = cles[cles.length - 1]!;
  // On interroge large — un jour de marge de chaque côté — puis on retient les
  // séances par leur jour à Paris. Borner en UTC avec un décalage écrit en dur
  // ferait glisser la semaine d'une heure au changement d'heure.
  const joursAffiches = new Set(cles);
  const debut = new Date(`${premier}T00:00:00Z`);
  debut.setUTCDate(debut.getUTCDate() - 1);
  const fin = new Date(`${dernier}T00:00:00Z`);
  fin.setUTCDate(fin.getUTCDate() + 2);

  const [{ data: trainersData }, { data: sessionsData }, { data: dispoData }] = await Promise.all([
    admin
      .schema('app')
      .from('trainers')
      .select('id, first_name, last_name, is_internal')
      .eq('organization_id', input.organizationId)
      .is('deleted_at', null),
    admin
      .schema('app')
      .from('sessions')
      .select('id, title, starts_at, ends_at, status, dossier_id, formation_id')
      .eq('organization_id', input.organizationId)
      .neq('status', 'cancelled')
      .gte('starts_at', debut.toISOString())
      .lt('starts_at', fin.toISOString()),
    admin
      .schema('app')
      .from('trainer_availability' as never)
      .select('trainer_id, day, slot, kind, note')
      .eq('organization_id', input.organizationId)
      .gte('day', premier)
      .lte('day', dernier),
  ]);

  const formateurs = (trainersData ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    is_internal: boolean | null;
  }>;
  // `formation_id` (0106) manque encore aux types générés : le cast passe par
  // `unknown`, comme partout ailleurs sur les colonnes récentes.
  const brutes = ((sessionsData ?? []) as unknown as SeanceBrute[]).filter((s) =>
    joursAffiches.has(jourParis(new Date(s.starts_at))),
  );

  const [parSeance, titreDeLaSeance] = await Promise.all([
    formateursParSeance(brutes),
    titresParSeance(brutes),
  ]);

  const seances = new Map<string, SeanceSemaine>(
    brutes.map((s) => [
      s.id,
      {
        id: s.id,
        titre: titreDeLaSeance.get(s.id) ?? s.title ?? 'Séance',
        debut: s.starts_at,
        fin: s.ends_at,
        statut: s.status,
        jour: jourParis(new Date(s.starts_at)),
        creneaux: creneauxDeLaSeance(s.starts_at, s.ends_at),
      },
    ]),
  );

  // Séances rangées par formateur, jour et demi-journée.
  const agenda = new Map<string, SeanceSemaine[]>();
  for (const [sessionId, trainerIds] of parSeance) {
    const seance = seances.get(sessionId);
    if (!seance) continue;
    for (const trainerId of trainerIds) {
      for (const creneau of seance.creneaux) {
        const cle = `${trainerId}|${seance.jour}|${creneau}`;
        agenda.set(cle, [...(agenda.get(cle) ?? []), seance]);
      }
    }
  }

  // Déclarations, indexées de la même façon. Une déclaration « journée » vaut
  // pour ses deux demi-journées : `statutPourCreneaux` s'en charge, à condition
  // de lui passer les déclarations du jour telles quelles.
  const declarations = new Map<string, Declaration[]>();
  const notes = new Map<string, string>();
  for (const r of ((dispoData ?? []) as unknown as Array<{
    trainer_id: string;
    day: string;
    slot: string;
    kind: string;
    note: string | null;
  }>)) {
    if (!isCreneau(r.slot) || !isDispo(r.kind)) continue;
    const cle = `${r.trainer_id}|${r.day}`;
    declarations.set(cle, [...(declarations.get(cle) ?? []), { creneau: r.slot, kind: r.kind }]);
    if (r.note) notes.set(cle, r.note);
  }

  const lignes = formateurs.map((f) => {
    const cases: CaseSemaine[] = [];
    for (const jour of cles) {
      for (const creneau of ['matin', 'apres_midi'] as const) {
        const duJour = declarations.get(`${f.id}|${jour}`) ?? [];
        const sesSeances = agenda.get(`${f.id}|${jour}|${creneau}`) ?? [];
        cases.push({
          jour,
          creneau,
          etat: etatCreneau(duJour, creneau, sesSeances.length),
          note: notes.get(`${f.id}|${jour}`) ?? null,
          seances: sesSeances,
        });
      }
    }
    return {
      trainerId: f.id,
      nom: `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim() || 'Formateur',
      interne: f.is_internal !== false,
      cases,
      resume: resumeSemaine(cases.map((c) => c.etat)),
    };
  });

  return ordreAffichage(lignes);
}
