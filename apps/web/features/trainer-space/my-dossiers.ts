import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { hasTrainerSpace } from '@/shared/lib/auth/landing';
import { exigerLecture } from '@/shared/lib/supabase/echec-lecture';
import { estTitulaireProvisoire } from '@/features/dossier/referent';

/**
 * Dossiers confiés au formateur connecté.
 *
 * Un dossier lui est confié par `app.dossier_trainers` ; `my_trainer_dossier_ids`
 * (0150) en tire aussi ceux de ses séances. La RLS lui ouvre la ligne entière —
 * y compris le montant. **C'est donc ici que se joue le cloisonnement** : on
 * énumère les colonnes utiles à son travail, et jamais l'argent
 * (`total_amount_cents`, `price_cents`, financeurs, devis, factures, dépenses).
 *
 * La lecture passe par le client de la requête, sous RLS : aucun service role,
 * donc aucun moyen d'élargir l'accès par erreur.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

/** Colonnes du dossier visibles par un formateur. Aucune n'est financière. */
const COLONNES_DOSSIER =
  'id, reference, status, modality, start_date, end_date, total_hours, notes, accessibility_notes, company_id, formation_id, learner_id, contact_id';

export type DossierConfie = {
  readonly id: string;
  readonly reference: string;
  readonly status: string;
  readonly modality: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly totalHours: number | null;
  readonly formationTitle: string | null;
  readonly companyName: string | null;
  readonly learnerName: string | null;
};

export type ReferentClient = {
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly position: string | null;
  readonly email: string | null;
  readonly phone: string | null;
};

export type ApprenantDuDossier = {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string | null;
  readonly phone: string | null;
};

export type SeanceDuDossier = {
  readonly id: string;
  readonly title: string | null;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly modality: string;
  readonly location: string | null;
  readonly status: string;
};

export type DossierDetail = {
  readonly dossier: DossierConfie;
  readonly notes: string | null;
  readonly accessibilityNotes: string | null;
  readonly referent: ReferentClient | null;
  readonly apprenants: ApprenantDuDossier[];
  readonly seances: SeanceDuDossier[];
};

const nom = (p: { first_name?: string | null; last_name?: string | null } | null | undefined): string | null => {
  const v = [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim();
  return v === '' ? null : v;
};

/** Le compte connecté est-il un formateur, et ce dossier lui est-il confié ? */
export async function requireMyTrainerDossier(
  dossierId: string,
): Promise<{ ok: true; sb: Client; userId: string } | { ok: false }> {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID.test(dossierId)) return { ok: false };
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user || !(await hasTrainerSpace(user.id))) return { ok: false };

  const { data: ids, error } = await sb.schema('app').rpc('my_trainer_dossier_ids' as never);
  // Un refus doit venir de la liste, pas d'une panne.
  exigerLecture('dossiers du formateur', error);
  if (!((ids ?? []) as string[]).includes(dossierId)) return { ok: false };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ok: true, sb: sb as unknown as SupabaseClient<any, any, any>, userId: user.id };
}

type LigneDossier = {
  id: string;
  reference: string;
  status: string;
  modality: string;
  start_date: string;
  end_date: string;
  total_hours: number | null;
  notes: string | null;
  accessibility_notes: string | null;
  company_id: string | null;
  formation_id: string | null;
  learner_id: string | null;
  contact_id: string | null;
};

async function habiller(
  sb: Client,
  lignes: LigneDossier[],
): Promise<Map<string, { formationTitle: string | null; companyName: string | null; learnerName: string | null }>> {
  const ids = <T,>(v: (T | null)[]) => [...new Set(v.filter((x): x is T => Boolean(x)))];
  const formationIds = ids(lignes.map((d) => d.formation_id));
  const companyIds = ids(lignes.map((d) => d.company_id));
  const learnerIds = ids(lignes.map((d) => d.learner_id));

  const [formations, entreprises, apprenants] = await Promise.all([
    formationIds.length
      ? sb.schema('app').from('formations').select('id, title').in('id', formationIds)
      : Promise.resolve({ data: [] }),
    companyIds.length
      ? sb.schema('app').from('companies').select('id, name').in('id', companyIds)
      : Promise.resolve({ data: [] }),
    learnerIds.length
      ? sb.schema('app').from('learners').select('id, first_name, last_name, email').in('id', learnerIds)
      : Promise.resolve({ data: [] }),
  ]);

  const titre = new Map(((formations.data ?? []) as { id: string; title: string }[]).map((f) => [f.id, f.title]));
  const raison = new Map(((entreprises.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  // Un titulaire provisoire (« Stagiaires à désigner », adresse en .invalid)
  // n'est pas une personne : l'afficher comme apprenant ferait croire au
  // formateur qu'il a un stagiaire inscrit. On l'écarte ici, une fois.
  const apprenant = new Map(
    (
      (apprenants.data ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null }[]
    ).map((l) => [l.id, estTitulaireProvisoire(l.email) ? null : nom(l)]),
  );

  return new Map(
    lignes.map((d) => [
      d.id,
      {
        formationTitle: d.formation_id ? (titre.get(d.formation_id) ?? null) : null,
        companyName: d.company_id ? (raison.get(d.company_id) ?? null) : null,
        learnerName: d.learner_id ? (apprenant.get(d.learner_id) ?? null) : null,
      },
    ]),
  );
}

export async function loadMyDossiers(sb: Client): Promise<DossierConfie[]> {
  const { data, error } = await sb
    .schema('app')
    .from('dossiers')
    .select(COLONNES_DOSSIER)
    .is('deleted_at', null)
    .order('start_date', { ascending: false })
    .limit(200);
  if (error) {
    console.error('[espace formateur] dossiers illisibles', error.message);
    return [];
  }
  const lignes = (data ?? []) as unknown as LigneDossier[];
  const extra = await habiller(sb, lignes);

  return lignes.map((d) => ({
    id: d.id,
    reference: d.reference,
    status: d.status,
    modality: d.modality,
    startDate: d.start_date,
    endDate: d.end_date,
    totalHours: d.total_hours,
    ...(extra.get(d.id) ?? { formationTitle: null, companyName: null, learnerName: null }),
  }));
}

export async function loadMyDossier(sb: Client, dossierId: string): Promise<DossierDetail | null> {
  const { data, error: erreurDossier } = await sb
    .schema('app')
    .from('dossiers')
    .select(COLONNES_DOSSIER)
    .eq('id', dossierId)
    .is('deleted_at', null)
    .maybeSingle();
  exigerLecture('dossier du formateur', erreurDossier);
  const d = data as unknown as LigneDossier | null;
  if (!d) return null;

  const extra = (await habiller(sb, [d])).get(d.id) ?? {
    formationTitle: null,
    companyName: null,
    learnerName: null,
  };

  // Référent du client : c'est l'interlocuteur du formateur, pas un élément
  // financier — même si c'est lui qui reçoit les factures côté organisme.
  let referent: ReferentClient | null = null;
  if (d.contact_id) {
    const { data: c } = await sb
      .schema('app')
      .from('contacts')
      .select('first_name, last_name, position, email, phone')
      .eq('id', d.contact_id)
      .maybeSingle();
    const ct = c as { first_name: string | null; last_name: string | null; position: string | null; email: string | null; phone: string | null } | null;
    if (ct) {
      referent = {
        firstName: ct.first_name,
        lastName: ct.last_name,
        position: ct.position,
        email: ct.email,
        phone: ct.phone,
      };
    }
  }

  // Séances du dossier : rattachement direct ou table de liaison.
  const { data: liens } = await sb.schema('app').from('session_dossiers').select('session_id').eq('dossier_id', d.id);
  const idsLies = ((liens ?? []) as { session_id: string }[]).map((l) => l.session_id);
  const [directes, liees] = await Promise.all([
    sb
      .schema('app')
      .from('sessions')
      .select('id, title, starts_at, ends_at, modality, location, status')
      .eq('dossier_id', d.id)
      .order('starts_at', { ascending: true }),
    idsLies.length
      ? sb
          .schema('app')
          .from('sessions')
          .select('id, title, starts_at, ends_at, modality, location, status')
          .in('id', idsLies)
          .order('starts_at', { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  type LigneSeance = {
    id: string;
    title: string | null;
    starts_at: string;
    ends_at: string;
    modality: string;
    location: string | null;
    status: string;
  };
  const parId = new Map<string, LigneSeance>();
  for (const s of [...((directes.data ?? []) as LigneSeance[]), ...((liees.data ?? []) as LigneSeance[])]) {
    parId.set(s.id, s);
  }
  const seances = [...parId.values()]
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((s) => ({
      id: s.id,
      title: s.title,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      modality: s.modality,
      location: s.location,
      status: s.status,
    }));

  // Apprenants : le titulaire du dossier, plus les participants des séances.
  const apprenantIds = new Set<string>();
  if (d.learner_id) apprenantIds.add(d.learner_id);
  if (seances.length > 0) {
    const { data: parts } = await sb
      .schema('app')
      .from('session_participants')
      .select('learner_id, source')
      .eq('participant_kind', 'learner')
      .in(
        'session_id',
        seances.map((s) => s.id),
      );
    for (const p of (parts ?? []) as { learner_id: string | null; source: string | null }[]) {
      if (p.learner_id && p.source !== 'manual_remove') apprenantIds.add(p.learner_id);
    }
  }
  const { data: gens } = apprenantIds.size
    ? await sb
        .schema('app')
        .from('learners')
        .select('id, first_name, last_name, email, phone')
        .in('id', [...apprenantIds])
    : { data: [] };
  const apprenants = ((gens ?? []) as { id: string; first_name: string; last_name: string; email: string | null; phone: string | null }[])
    .filter((l) => !estTitulaireProvisoire(l.email))
    .map((l) => ({ id: l.id, firstName: l.first_name, lastName: l.last_name, email: l.email, phone: l.phone }))
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fr'));

  return {
    dossier: {
      id: d.id,
      reference: d.reference,
      status: d.status,
      modality: d.modality,
      startDate: d.start_date,
      endDate: d.end_date,
      totalHours: d.total_hours,
      ...extra,
    },
    notes: d.notes,
    accessibilityNotes: d.accessibility_notes,
    referent,
    apprenants,
    seances,
  };
}
