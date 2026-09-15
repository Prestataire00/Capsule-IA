// ARCHETYPE: command
import { Users, MailPlus } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { MemberRowActions } from './member-row-actions';
import { AddMemberButton } from './add-member-button';
import { MEMBER_ROLES, type MemberRole } from './members-schema';

export const dynamic = 'force-dynamic';

// Avatar : couleur stable dérivée du nom (charte v4 « vivante »).
const AVATAR_TONES = [
  'bg-orange-100 text-orange-700 ring-orange-200/70 dark:bg-orange-950/60 dark:text-orange-300 dark:ring-orange-900/50',
  'bg-rose-100 text-rose-700 ring-rose-200/70 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900/50',
  'bg-purple-100 text-purple-700 ring-purple-200/70 dark:bg-purple-950/60 dark:text-purple-300 dark:ring-purple-900/50',
  'bg-blue-100 text-blue-700 ring-blue-200/70 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-900/50',
  'bg-emerald-100 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900/50',
  'bg-amber-100 text-amber-700 ring-amber-200/70 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900/50',
  'bg-teal-100 text-teal-700 ring-teal-200/70 dark:bg-teal-950/60 dark:text-teal-300 dark:ring-teal-900/50',
  'bg-sky-100 text-sky-700 ring-sky-200/70 dark:bg-sky-950/60 dark:text-sky-300 dark:ring-sky-900/50',
];
const avatarTone = (name: string): string => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length] ?? '';
};

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

  // Seul le propriétaire en exercice peut désigner son successeur, et sur une
  // autre ligne que la sienne.
  const isOwner = currentMember?.role === 'owner';

  const members = memberRows.map((m) => {
    const profile = profileById.get(m.user_id);
    return {
      id: m.id,
      name: profile?.full_name ?? '—',
      email: profile?.email ?? '—',
      role: m.role,
      canTransfer: isOwner && m.role !== 'owner' && m.user_id !== currentUserId,
    };
  });

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
<span className="w-7 h-7 rounded-lg grid place-items-center bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 shrink-0">
              <Users className="w-3.5 h-3.5" />
            </span>
            <SectionLabel className="tabular-nums">Membres actifs ({members.length})</SectionLabel>
          </div>
          <div className="relative">{canEdit && <AddMemberButton />}</div>
        </div>
        <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {members.map((m) => {
            const initials = m.name.split(' ').map((s) => s[0] ?? '').slice(0, 2).join('').toUpperCase();
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-rose-50/40 dark:hover:bg-rose-950/10 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-9 h-9 rounded-full ring-1 ring-inset flex items-center justify-center text-[12px] font-bold flex-shrink-0 ${avatarTone(m.name)}`}>
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 truncate">{m.name}</p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">{m.email}</p>
                  </div>
                </div>
                <MemberRowActions
                  memberId={m.id}
                  name={m.name}
                  role={asMemberRole(m.role)}
                  editable={canEdit}
                  canTransfer={m.canTransfer}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-7 h-7 rounded-lg grid place-items-center bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 shrink-0">
            <MailPlus className="w-3.5 h-3.5" />
          </span>
          <SectionLabel className="tabular-nums">Invitations en attente ({pendingInvitations.length})</SectionLabel>
        </div>
        {pendingInvitations.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-dashed border-amber-200/80 dark:border-amber-900/40 rounded-xl px-5 py-8 text-center">
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
