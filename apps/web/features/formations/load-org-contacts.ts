import 'server-only';
import { supabaseServer } from '@/shared/lib/supabase/server';
import type { OrgContact } from './org-contact';

export type { OrgContact };

/**
 * Contacts internes de l'organisme : les membres de l'équipe (Paramètres →
 * Membres), avec leurs coordonnées de profil. Sert à renseigner les référents
 * d'une formation sans les retaper — et à les garder cohérents entre fiches.
 */
export async function loadOrgContacts(): Promise<OrgContact[]> {
  const sb = supabaseServer();

  const { data: memberRows } = await sb
    .schema('app')
    .from('members')
    .select('user_id, role')
    .is('deleted_at', null);

  const members = (memberRows as unknown as Array<{ user_id: string; role: string }> | null) ?? [];
  if (members.length === 0) return [];

  const { data: profileRows } = await sb
    .schema('app')
    .from('profiles')
    .select('user_id, full_name, email, phone')
    .in(
      'user_id',
      members.map((m) => m.user_id),
    );

  const profiles = new Map(
    (
      (profileRows as unknown as Array<{
        user_id: string;
        full_name: string | null;
        email: string | null;
        phone: string | null;
      }> | null) ?? []
    ).map((p) => [p.user_id, p]),
  );

  return members
    .map((m) => {
      const p = profiles.get(m.user_id);
      return {
        userId: m.user_id,
        name: (p?.full_name ?? '').trim(),
        email: (p?.email ?? '').trim(),
        phone: (p?.phone ?? '').trim(),
        role: m.role,
      };
    })
    .filter((c) => c.name || c.email)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
