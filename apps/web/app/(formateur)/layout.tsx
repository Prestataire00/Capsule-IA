// ARCHETYPE: shared (mobile-first formateur)
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { FormateurHeader } from '@/features/identity/trainer-self/ui/formateur-header';

export default async function FormateurLayout({ children }: { children: React.ReactNode }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/formateur');

  const reader = new SupabaseMembershipReader(supabase);
  await reader.linkOrphans(); // idempotent, ~1ms si rien à link
  const memberships = await reader.list();

  if (memberships.length === 0) {
    redirect('/?reason=no-trainer-membership');
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col">
      <FormateurHeader memberships={memberships} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
