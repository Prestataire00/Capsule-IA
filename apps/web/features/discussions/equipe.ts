import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { nomDuDossier } from '@/features/dossier/referent';
import { loadDesignations } from '@/features/trainer-space/validation-recipients';

/**
 * Qui fait partie de la discussion d'équipe d'un dossier (0204) : ses
 * formateurs, et l'équipe pédagogique de l'organisme — validateurs et copie
 * désignés (0203), sinon la direction. Seuls ceux qui ont un compte peuvent
 * être mentionnés : on ne prévient pas une fiche sans adresse de connexion.
 */

type Admin = ReturnType<typeof supabaseAdmin>;

export type MembreDiscussion = {
  readonly userId: string;
  readonly nom: string;
  readonly email: string | null;
  readonly role: 'formateur' | 'equipe';
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
    .select('user_id, first_name, last_name, email')
    .in('id', ids)
    .is('deleted_at', null)
    .not('user_id', 'is', null);
  return ((t ?? []) as Array<{ user_id: string; first_name: string | null; last_name: string | null; email: string | null }>).map(
    (f) => ({
      userId: f.user_id,
      nom: `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim() || f.email || 'Formateur',
      email: f.email,
      role: 'formateur' as const,
    }),
  );
}

async function equipeOrganisme(admin: Admin, organizationId: string): Promise<MembreDiscussion[]> {
  const designations = await loadDesignations(admin, organizationId);
  let userIds = [...new Set(designations.map((d) => d.userId))];
  if (userIds.length === 0) {
    const { data } = await admin
      .schema('app')
      .from('members')
      .select('user_id')
      .eq('organization_id', organizationId)
      .in('role', ['owner', 'admin'])
      .is('deleted_at', null);
    userIds = [...new Set(((data ?? []) as Array<{ user_id: string }>).map((m) => m.user_id))];
  }
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
