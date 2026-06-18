import 'server-only';
import { cache } from 'react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

export type CurrentMember = {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  organizationId: string;
};

/**
 * Membre connecté réel (profil + rôle + org), résolu via service_role pour rester
 * robuste vis-à-vis de la RLS. `null` si non authentifié ou sans membership actif.
 * Remplace le mock `currentUser` dans l'UI (topbar, accueil, sidebar).
 */
export const getCurrentMember = cache(async (): Promise<CurrentMember | null> => {
  const { data: auth } = await supabaseServer().auth.getUser();
  if (!auth.user) return null;

  const admin = supabaseAdmin();
  const [{ data: profile }, { data: member }] = await Promise.all([
    admin.schema('app').from('profiles').select('full_name, email').eq('user_id', auth.user.id).maybeSingle(),
    admin
      .schema('app')
      .from('members')
      .select('organization_id, role')
      .eq('user_id', auth.user.id)
      .is('deleted_at', null)
      .order('is_default_org', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const m = member as { organization_id: string; role: string } | null;
  if (!m) return null;
  const p = profile as { full_name: string; email: string } | null;

  return {
    userId: auth.user.id,
    fullName: p?.full_name ?? auth.user.email ?? 'Utilisateur',
    email: p?.email ?? auth.user.email ?? '',
    role: m.role,
    organizationId: m.organization_id,
  };
});

/** Libellé FR d'un rôle membre. */
export function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    owner: 'Propriétaire',
    admin: 'Administrateur',
    gestionnaire: 'Gestionnaire',
    comptable: 'Comptable',
    formateur: 'Formateur',
    commercial: 'Commercial',
    referent: 'Référent',
  };
  return labels[role] ?? role;
}

/** Initiales pour l'avatar (2 lettres). */
export function initialsOf(fullName: string): string {
  return fullName
    .split(' ')
    .map((s) => s[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
