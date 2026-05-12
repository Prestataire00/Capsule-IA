// apps/web/app/(formateur)/page.tsx
// ARCHETYPE: workflow
import Link from 'next/link';
import { cookies } from 'next/headers';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { SupabaseTrainerCompetencyRepository } from '@/features/identity/trainer-self/infrastructure/supabase-trainer-competency.repository';
import { GetCompetencyAlertsQuery } from '@/features/identity/trainer-self/application/queries/get-competency-alerts';
import { Calendar, ClipboardList, FileText, GraduationCap, AlertTriangle } from 'lucide-react';

export default async function FormateurDashboard() {
  const supabase = supabaseServer();
  const reader = new SupabaseMembershipReader(supabase);
  const memberships = await reader.list();
  const focus = cookies().get('of_focus')?.value ?? 'all';

  const visible = focus === 'all' ? memberships : memberships.filter(m => m.organizationId === focus);

  const compRepo = new SupabaseTrainerCompetencyRepository(supabase);
  const alertsQuery = new GetCompetencyAlertsQuery(compRepo);
  const alerts = await Promise.all(visible.map(m => alertsQuery.execute(m.trainerId)));
  const totalExpiring = alerts.reduce((s, a) => s + a.expiringSoon, 0);
  const totalExpired  = alerts.reduce((s, a) => s + a.expired, 0);

  const firstName = visible[0]?.firstName ?? '';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-50 to-rose-50 dark:from-orange-950/30 dark:to-rose-950/20 p-6 shadow-sm border border-orange-100/50 dark:border-orange-900/30">
        <h1 className="text-[24px] font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
          Bonjour {firstName} 👋
        </h1>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1">
          Vous êtes formateur chez <strong>{visible.length}</strong> organisme{visible.length > 1 ? 's' : ''} de formation
          {focus !== 'all' && ' (filtré)'}.
        </p>
        {(totalExpiring > 0 || totalExpired > 0) && (
          <div className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/70 dark:bg-zinc-950/40 border border-purple-200 dark:border-purple-900/40 text-[12px]">
            <AlertTriangle className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            <span>
              {totalExpired > 0 && <><strong className="text-red-700 dark:text-red-300">{totalExpired}</strong> compétence{totalExpired > 1 ? 's' : ''} expirée{totalExpired > 1 ? 's' : ''}</>}
              {totalExpiring > 0 && totalExpired > 0 && ' · '}
              {totalExpiring > 0 && <><strong className="text-purple-700 dark:text-purple-300">{totalExpiring}</strong> bientôt expirée{totalExpiring > 1 ? 's' : ''}</>}
            </span>
            <Link href="/cv" className="ml-2 text-orange-600 dark:text-orange-400 hover:underline">Mettre à jour →</Link>
          </div>
        )}
      </section>

      {/* Mes OFs */}
      {memberships.length > 1 && (
        <section>
          <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 mb-3">Mes organismes</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visible.map((m, i) => (
              <div key={m.trainerId} className="p-4 rounded-xl border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">{m.organizationName}</h3>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${m.isInternal ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400'}`}>
                    {m.isInternal ? 'Interne' : 'Externe'}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-500 mt-1">
                  {alerts[i]!.expired + alerts[i]!.expiringSoon === 0 ? 'Profil OK' : 'Compétences à vérifier'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Raccourcis */}
      <section>
        <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 mb-3">Raccourcis</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <ShortcutCard href="/profil" icon={<GraduationCap className="w-4 h-4" />} label="Mon profil" />
          <ShortcutCard href="/cv" icon={<FileText className="w-4 h-4" />} label="Mon CV" />
          <ShortcutCard href="/mes-sessions" icon={<Calendar className="w-4 h-4" />} label="Mes sessions" subtle />
          <ShortcutCard href="/emarger" icon={<ClipboardList className="w-4 h-4" />} label="Émargements" subtle />
        </div>
      </section>
    </div>
  );
}

function ShortcutCard({ href, icon, label, subtle }: { href: string; icon: React.ReactNode; label: string; subtle?: boolean }) {
  return (
    <Link
      href={href}
      className={`p-3 rounded-xl border border-zinc-200/60 dark:border-zinc-800 ${subtle ? 'bg-zinc-50/50 dark:bg-zinc-950/50' : 'bg-white dark:bg-zinc-950'} hover:shadow-md transition flex flex-col items-start gap-1.5`}
    >
      <span className="text-zinc-600 dark:text-zinc-400">{icon}</span>
      <span className="text-[12px] font-medium text-zinc-900 dark:text-zinc-100">{label}</span>
    </Link>
  );
}
