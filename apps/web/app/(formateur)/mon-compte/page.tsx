// ARCHETYPE: command
// Justification: tout ce qui n'est pas animer une séance — l'administratif du
// formateur, rassemblé en un point au lieu de cinq entrées de barre.

import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowRight, Receipt, Wallet, Star, UserRound, FileBadge, AlertTriangle } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SupabaseMembershipReader } from '@/features/identity/trainer-self/infrastructure/supabase-membership.reader';
import { SupabaseTrainerCompetencyRepository } from '@/features/identity/trainer-self/infrastructure/supabase-trainer-competency.repository';
import { GetCompetencyAlertsQuery } from '@/features/identity/trainer-self/application/queries/get-competency-alerts';

export const dynamic = 'force-dynamic';

type Rubrique = {
  href: string;
  titre: string;
  detail: string;
  icone: React.ComponentType<{ className?: string }>;
  ton: string;
};

const RUBRIQUES: Rubrique[] = [
  {
    href: '/mes-factures',
    titre: 'Mes factures',
    detail: 'Facturer vos séances à l’organisme, déposer une facture, suivre les règlements.',
    icone: Receipt,
    ton: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  {
    href: '/mes-frais',
    titre: 'Notes de frais',
    detail: 'Déplacements, repas, hébergement — avec leurs justificatifs.',
    icone: Wallet,
    ton: 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
  },
  {
    href: '/mes-evaluations',
    titre: 'Mes évaluations',
    detail: 'Ce que vos stagiaires ont répondu sur vos formations.',
    icone: Star,
    ton: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
  },
  {
    href: '/profil',
    titre: 'Mon profil',
    detail: 'Coordonnées, photo, présentation, et vos informations de facturation.',
    icone: UserRound,
    ton: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  },
  {
    href: '/cv',
    titre: 'CV & compétences',
    detail: 'Diplômes, certifications et habilitations — les preuves attendues par Qualiopi.',
    icone: FileBadge,
    ton: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  },
];

export default async function MonComptePage() {
  const sb = supabaseServer();
  const reader = new SupabaseMembershipReader(sb);
  const focus = cookies().get('of_focus')?.value ?? 'all';
  const memberships = await reader.list();
  const visible = focus === 'all' ? memberships : memberships.filter((m) => m.organizationId === focus);

  const alertsQuery = new GetCompetencyAlertsQuery(new SupabaseTrainerCompetencyRepository(sb));
  const alerts = await Promise.all(visible.map((m) => alertsQuery.execute(m.trainerId)));
  const expirees = alerts.reduce((s, a) => s + a.expired, 0);
  const bientot = alerts.reduce((s, a) => s + a.expiringSoon, 0);

  return (
    <div className="max-w-2xl w-full mx-auto px-4 py-6 space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-gradient-to-br from-zinc-50 to-white dark:from-zinc-900 dark:to-zinc-950 p-5 shadow-sm">
        <h1 className="text-[22px] font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">Mon compte</h1>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mt-1.5">
          Votre administratif : facturation, frais, profil et pièces justificatives. Ce qui concerne vos séances se
          trouve dans « Mes séances ».
        </p>
      </header>

      {expirees + bientot > 0 && (
        <Link
          href="/cv"
          className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/25 px-4 py-3 hover:border-amber-300 transition"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <span className="text-[13px] text-amber-800 dark:text-amber-300">
            {expirees > 0 && (
              <>
                <strong className="tabular-nums">{expirees}</strong> compétence{expirees > 1 ? 's' : ''} expirée
                {expirees > 1 ? 's' : ''}
              </>
            )}
            {expirees > 0 && bientot > 0 && ' · '}
            {bientot > 0 && (
              <>
                <strong className="tabular-nums">{bientot}</strong> bientôt expirée{bientot > 1 ? 's' : ''}
              </>
            )}
            . Sans preuve à jour, l&apos;organisme ne peut pas justifier votre intervention en audit.
          </span>
        </Link>
      )}

      <ul className="space-y-2.5">
        {RUBRIQUES.map((r) => {
          const Icone = r.icone;
          return (
            <li key={r.href}>
              <Link
                href={r.href}
                className="group rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3.5 flex items-center gap-3 hover:border-orange-300 dark:hover:border-orange-900/60 hover:shadow-sm transition"
              >
                <span className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${r.ton}`}>
                  <Icone className="w-5 h-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">{r.titre}</span>
                  <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 leading-snug">{r.detail}</span>
                </span>
                <ArrowRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600 group-hover:text-orange-500 transition shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
