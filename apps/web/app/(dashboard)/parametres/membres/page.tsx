// ARCHETYPE: command
import { Users } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { MemberRowActions } from './member-row-actions';
import { AddMemberButton } from './add-member-button';
import { MEMBER_ROLES, type MemberRole } from './members-schema';

export const dynamic = 'force-dynamic';

const pendingInvitations: Array<{ email: string; role: string; sentAt: string }> = [];

const asMemberRole = (role: string): MemberRole =>
  (MEMBER_ROLES as readonly string[]).includes(role) ? (role as MemberRole) : 'formateur';

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  is_default_org: boolean;
};

type ProfileRow = {
  user_id: string;
  full_name: string;
  email: string;
};

export default async function ParametresMembresPage() {
  const sb = supabaseServer();

  const { data: auth } = await sb.auth.getUser();
  const currentUserId = auth.user?.id ?? null;

  // Membres de l'organisation (RLS-scopé). Le profil (nom/email) est joint via user_id.
  const { data: membersData } = await sb
    .schema('app')
    .from('members')
    .select('id, user_id, role, is_default_org')
    .is('deleted_at', null);
  const memberRows = (membersData as unknown as MemberRow[] | null) ?? [];

  // L'utilisateur courant peut muter s'il est owner/admin de l'org.
  const currentMember = memberRows.find((m) => m.user_id === currentUserId);
  const canEdit = currentMember?.role === 'owner' || currentMember?.role === 'admin';

  const userIds = memberRows.map((m) => m.user_id);
  const { data: profilesData } = userIds.length
    ? await sb
        .schema('app')
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', userIds)
    : { data: [] };
  const profileById = new Map(
    ((profilesData as unknown as ProfileRow[] | null) ?? []).map((p) => [p.user_id, p]),
  );

  const members = memberRows.map((m) => {
    const profile = profileById.get(m.user_id);
    return {
      id: m.id,
      name: profile?.full_name ?? '—',
      email: profile?.email ?? '—',
      role: m.role,
    };
  });

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-zinc-400" />
            <SectionLabel className="tabular-nums">Membres actifs ({members.length})</SectionLabel>
          </div>
          <div className="relative">{canEdit && <AddMemberButton />}</div>
        </div>
        <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {members.map((m) => {
            const initials = m.name.split(' ').map((s) => s[0] ?? '').slice(0, 2).join('').toUpperCase();
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-full bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 ring-1 ring-inset ring-orange-200/70 dark:ring-orange-900/50 flex items-center justify-center text-[12px] font-bold flex-shrink-0">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{m.name}</p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{m.email}</p>
                  </div>
                </div>
                <MemberRowActions memberId={m.id} role={asMemberRole(m.role)} editable={canEdit} />
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <SectionLabel className="tabular-nums">Invitations en attente ({pendingInvitations.length})</SectionLabel>
        </div>
        {pendingInvitations.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-dashed border-zinc-200/80 dark:border-zinc-800 rounded-xl px-5 py-8 text-center">
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
              Aucune invitation en attente.
            </p>
          </div>
        ) : (
          <ul>
            {pendingInvitations.map((inv, i) => (
              <li key={i}>{inv.email}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
