// ARCHETYPE: command
import Link from 'next/link';
import { Users, UserPlus, Crown } from 'lucide-react';
import { currentUser } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';

// Mock — un seul membre actif (le owner) pour la VF
const members = [{
  id: currentUser.id,
  name: currentUser.full_name,
  email: currentUser.email,
  role: currentUser.role,
  joinedAt: '2024-03-15',
}];

const pendingInvitations: Array<{ email: string; role: string; sentAt: string }> = [];

const ROLE_LABEL: Record<string, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  staff: 'Staff',
  viewer: 'Lecture seule',
};

export default function ParametresMembresPage() {
  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-violet-500" />
            <SectionLabel>Membres actifs ({members.length})</SectionLabel>
          </div>
          <Link
            href="#"
            className="bg-violet-600 hover:bg-violet-700 text-white text-[12px] font-medium px-3 py-1.5 rounded-lg transition shadow-sm inline-flex items-center gap-1.5"
          >
            <UserPlus className="w-3 h-3" />
            Inviter un membre
          </Link>
        </div>
        <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800">
          {members.map((m) => {
            const initials = m.name.split(' ').map((s) => s[0] ?? '').slice(0, 2).join('').toUpperCase();
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-950/60 dark:to-violet-950/30 text-violet-700 dark:text-violet-300 flex items-center justify-center text-[12px] font-semibold flex-shrink-0">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{m.name}</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono truncate">{m.email}</p>
                  </div>
                </div>
                <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 inline-flex items-center gap-1 flex-shrink-0">
                  <Crown className="w-2.5 h-2.5" />
                  {ROLE_LABEL[m.role] ?? m.role}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <SectionLabel>Invitations en attente ({pendingInvitations.length})</SectionLabel>
        </div>
        {pendingInvitations.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl px-5 py-8 text-center">
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
