// ARCHETYPE: command
import { cookies } from 'next/headers';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { SupabaseTrainerSelfRepository } from '@/features/identity/trainer-self/infrastructure/supabase-trainer-self.repository';
import { SupabaseAvatarStorage } from '@/features/identity/trainer-self/infrastructure/supabase-avatar.storage';
import { GetMyProfileQuery } from '@/features/identity/trainer-self/application/queries/get-my-profile';
import { ProfileForm } from '@/features/identity/trainer-self/ui/profile-form';
import { GraduationCap } from 'lucide-react';

export default async function ProfilPage() {
  const supabase = supabaseServer();
  const memberships = await new SupabaseMembershipReader(supabase).list();
  const focus = cookies().get('of_focus')?.value ?? 'all';

  const active =
    focus === 'all'
      ? memberships[0] ?? null
      : memberships.find((m) => m.organizationId === focus) ?? memberships[0] ?? null;

  if (!active) return null;

  const repo = new SupabaseTrainerSelfRepository(supabase);
  const profile = await new GetMyProfileQuery(repo).execute(active.trainerId);
  const avatarUrl = profile.avatarPath
    ? new SupabaseAvatarStorage(supabase).publicUrl(profile.avatarPath)
    : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <header className="flex items-center gap-3 mb-6">
        <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-100 to-rose-100 dark:from-orange-950/50 dark:to-rose-950/30 text-orange-700 dark:text-orange-300 flex items-center justify-center shadow-sm">
          <GraduationCap className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-[20px] font-semibold text-zinc-900 dark:text-zinc-100">Mon profil</h1>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            Vous éditez votre profil chez <strong>{active.organizationName}</strong>
            {memberships.length > 1 && ' — cochez "Appliquer à tous" pour synchroniser'}
          </p>
        </div>
      </header>

      <ProfileForm
        memberships={memberships}
        activeTrainerIds={[active.trainerId]}
        initial={{
          firstName: profile.firstName,
          lastName: profile.lastName,
          phone: profile.phone,
          bio: profile.bio,
          specialties: profile.specialties,
          email: profile.email,
          isInternal: profile.isInternal,
          siret: profile.siret,
          hourlyRateCents: profile.hourlyRateCents,
          avatarPath: profile.avatarPath,
          avatarUrl,
        }}
      />
    </div>
  );
}
