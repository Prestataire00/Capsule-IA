// ARCHETYPE: workflow (security setup)
// Justification: enrollment MFA TOTP — workflow obligatoire pour owner/admin/comptable
// après 7j. Cf. FR-004 et sprint plan V2 STORY-A3.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, ShieldAlert, ArrowLeft } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { EnrollFlow } from './_components/enroll-flow';
import { DisableMfaButton } from './_components/disable-mfa-button';

export const dynamic = 'force-dynamic';

export default async function MfaPage() {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // listFactors : nécessite session active. Retourne tous les facteurs (verified + unverified).
  const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors();
  if (factorsErr) {
    return (
      <div className="space-y-4">
        <Header />
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-4 text-[13px] text-red-700 dark:text-red-300">
          Erreur lors de la récupération des facteurs MFA : {factorsErr.message}
        </div>
      </div>
    );
  }

  const verifiedTotp = factorsData?.totp?.find((f) => f.status === 'verified') ?? null;

  return (
    <div className="space-y-6">
      <Header />

      {verifiedTotp ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="flex-1 space-y-1">
              <p className="text-[15px] font-bold text-emerald-900 dark:text-emerald-100">
                MFA activée sur votre compte
              </p>
              <p className="text-[13px] text-emerald-700 dark:text-emerald-300">
                Vous utilisez un second facteur TOTP. Application : {verifiedTotp.friendly_name ?? 'Authenticator'}.
              </p>
              <p className="text-[12px] text-emerald-600 dark:text-emerald-400 mt-2 tabular-nums">
                Désactivée le {new Date(verifiedTotp.updated_at).toLocaleDateString('fr-FR')}.
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-emerald-200 dark:border-emerald-900">
            <DisableMfaButton factorId={verifiedTotp.id} />
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4">
            <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="text-[14px] font-bold text-amber-900 dark:text-amber-100">
                MFA non activée
              </p>
              <p className="text-[13px] text-amber-700 dark:text-amber-300">
                Recommandé pour les rôles owner, admin et comptable.
                Obligatoire après 7 jours de présence sur ces rôles.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <SectionLabel>Activer la MFA TOTP</SectionLabel>
            <EnrollFlow />
          </div>

          <div className="mt-6 text-[12px] text-zinc-500 dark:text-zinc-400 space-y-1">
            <p className="font-semibold text-zinc-700 dark:text-zinc-300">Applications compatibles :</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Google Authenticator (iOS, Android)</li>
              <li>1Password (toutes plateformes)</li>
              <li>Microsoft Authenticator</li>
              <li>Authy</li>
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="space-y-3">
      <Link
        href="/parametres/securite"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400 hover:text-orange-600 dark:hover:text-orange-400 transition"
      >
        <ArrowLeft className="w-3 h-3" />
        Sécurité
      </Link>
      <h1 className="text-[20px] leading-tight font-extrabold text-zinc-900 dark:text-zinc-100">Authentification à 2 facteurs</h1>
    </div>
  );
}
