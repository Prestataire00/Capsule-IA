import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { nomDuDossier } from '@/features/dossier/referent';
import { membresParRole } from '@/features/trainer-space/validation-recipients';

/**
 * Qui fait partie de la discussion d'équipe d'un dossier (0204) : ses
 * formateurs, la direction et les gestionnaires de l'organisme. Seuls ceux qui ont un compte peuvent
 * être mentionnés : on ne prévient pas une fiche sans adresse de connexion.
 */

type Admin = ReturnType<typeof supabaseAdmin>;

export type MembreDiscussion = {
  /** Son compte ; pour un formateur qui n'en a pas encore, l'id de sa fiche. */
  readonly userId: string;
  readonly nom: string;
  readonly email: string | null;
  readonly role: 'formateur' | 'equipe';
  /** Formateur sans compte : le mentionner lui envoie son invitation. */
  readonly sansCompte: boolean;
  /** Sa fonction, telle que l'écran l'affiche (Direction, Gestion, Formateur). */
  readonly fonction: string;
  readonly trainerId: string | null;
  readonly prenom: string | null;
};

async function formateursDuDossier(admin: Admin, dossierId: string): Promise<MembreDiscussion[]> {
  const [{ data: dt }, { data: directes }, { data: liees }] = await Promise.all([
    admin.schema('app').from('dossier_trainers').select('trainer_id').eq('dossier_id', dossierId),
    admin.schema('app').from('sessions').select('id').eq('dossier_id', dossierId),
    admin.schema('app').from('session_dossiers').select('session_id').eq('dossier_id', dossierId),
  ]);
  const sessionIds = [
    ...((directes ?? []) as Array<{ id: string }>).map((s) => s.id),
    ...((liees ?? []) as Array<{ session_id: string }>).map((s) => s.session_id),
  ];
  const { data: st } = sessionIds.length
    ? await admin.schema('app').from('session_trainers' as never).select('trainer_id').in('session_id', sessionIds).is('deleted_at', null)
    : { data: [] };
  const ids = [
    ...new Set([
      ...((dt ?? []) as Array<{ trainer_id: string }>).map((t) => t.trainer_id),
      ...((st ?? []) as Array<{ trainer_id: string }>).map((t) => t.trainer_id),
    ]),
  ];
  if (ids.length === 0) return [];
  const { data: t } = await admin
    .schema('app')
    .from('trainers')
    .select('id, user_id, first_name, last_name, email')
    .in('id', ids)
    .is('deleted_at', null);
  return (
    (t ?? []) as Array<{ id: string; user_id: string | null; first_name: string | null; last_name: string | null; email: string | null }>
  ).map((f) => ({
    userId: f.user_id ?? f.id,
    nom: `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim() || f.email || 'Formateur',
    email: f.email,
    role: 'formateur' as const,
    fonction: f.user_id === null ? 'Formateur · sans compte' : 'Formateur',
    sansCompte: f.user_id === null,
    trainerId: f.id,
    prenom: f.first_name,
  }));
}

const FONCTION: Record<string, string> = { owner: 'Direction', admin: 'Direction', gestionnaire: 'Gestion' };

async function equipeOrganisme(admin: Admin, organizationId: string): Promise<MembreDiscussion[]> {
  const membres = await membresParRole(admin, organizationId, ['owner', 'admin', 'gestionnaire']);
  const roleDe = new Map(membres.map((m) => [m.userId, m.role]));
  const userIds = [...new Set(membres.map((m) => m.userId))];
  if (userIds.length === 0) return [];
  const { data: p } = await admin.schema('app').from('profiles').select('user_id, full_name, email').in('user_id', userIds);
  const profils = new Map(
    ((p ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>).map((x) => [x.user_id, x]),
  );
  return userIds.map((id) => ({
    userId: id,
    nom: profils.get(id)?.full_name?.trim() || profils.get(id)?.email || 'Membre',
    email: profils.get(id)?.email ?? null,
    role: 'equipe' as const,
    fonction: FONCTION[roleDe.get(id) ?? ''] ?? 'Équipe',
    sansCompte: false,
    trainerId: null,
    prenom: null,
  }));
}

/** L'équipe d'un dossier, sans doublon (un admin peut aussi être formateur). */
export async function equipeDuDossier(organizationId: string, dossierId: string): Promise<MembreDiscussion[]> {
  const admin = supabaseAdmin();
  const [formateurs, equipe] = await Promise.all([
    formateursDuDossier(admin, dossierId),
    equipeOrganisme(admin, organizationId),
  ]);
  const vus = new Set<string>();
  return [...equipe, ...formateurs].filter((m) => !vus.has(m.userId) && vus.add(m.userId));
}

export type LibelleDossier = { readonly id: string; readonly reference: string; readonly titre: string; readonly formation: string | null };

/** « Nom du dossier · formation » pour la liste des discussions. */
export async function libellesDossiers(ids: readonly string[]): Promise<Map<string, LibelleDossier>> {
  const out = new Map<string, LibelleDossier>();
  if (ids.length === 0) return out;
  const { data } = await supabaseAdmin()
    .schema('app')
    .from('dossiers')
    .select('id, reference, nom, learner:learners!dossiers_learner_id_fkey(first_name, last_name, email), company:companies(name), formation:formations(title)')
    .in('id', [...ids]);
  const un = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  for (const d of (data ?? []) as unknown as Array<{
    id: string;
    reference: string;
    nom: string | null;
    learner: { first_name: string | null; last_name: string | null; email: string | null } | null;
    company: { name: string | null } | null;
    formation: { title: string | null } | null;
  }>) {
    const l = un(d.learner);
    const { nom } = nomDuDossier({
      nom: d.nom,
      learner: l ? { firstName: l.first_name, lastName: l.last_name, email: l.email } : null,
      companyName: un(d.company)?.name ?? null,
    });
    out.set(d.id, { id: d.id, reference: d.reference, titre: nom, formation: un(d.formation)?.title ?? null });
  }
  return out;
}

/** Les dossiers en cours de l'organisme, pour ouvrir une discussion. */
export async function dossiersEnCours(organizationId: string, limite = 300): Promise<string[]> {
  const { data } = await supabaseAdmin()
    .schema('app')
    .from('dossiers')
    .select('id')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .not('status', 'in', '(archived,cancelled)')
    .order('created_at', { ascending: false })
    .limit(limite);
  return ((data ?? []) as Array<{ id: string }>).map((d) => d.id);
}

/**
 * Un fil de discussion = un dossier (demande d'Ismael, 06/10/2026 : « la
 * messagerie par dossier, pas par session »). Une séance ouvre la discussion
 * de son dossier. Les colonnes de séance posées par 0210 restent inutilisées.
 */
export type FilDiscussion = { readonly kind: 'dossier'; readonly id: string; readonly organizationId: string };

export async function filDe(id: string): Promise<FilDiscussion | null> {
  const { data: d } = await supabaseAdmin().schema('app').from('dossiers').select('organization_id').eq('id', id).is('deleted_at', null).maybeSingle();
  return d ? { kind: 'dossier', id, organizationId: (d as { organization_id: string }).organization_id } : null;
}

/** La colonne qui porte le fil, pour écrire un message ou une lecture. */
export const colonneDuFil = (fil: FilDiscussion): { dossier_id: string } => ({ dossier_id: fil.id });

/** L'équipe d'un fil : celle de son dossier. */
export const equipeDuFil = equipeDuDossier;

/** Les libellés des fils : ceux de leurs dossiers. */
export const libellesFils = libellesDossiers;
