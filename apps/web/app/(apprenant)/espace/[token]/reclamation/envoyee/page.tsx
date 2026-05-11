// ARCHETYPE: workflow
import Link from 'next/link';
import { CheckCircle2, ArrowLeft, Clock, ShieldCheck } from 'lucide-react';

export default function ReclamationEnvoyeePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { ref?: string };
}) {
  const reference = searchParams.ref ?? null;

  return (
    <div className="bg-gradient-to-br from-zinc-50 via-violet-50/30 to-zinc-50 dark:from-zinc-950 dark:via-violet-950/15 dark:to-zinc-950 min-h-[calc(100vh-3rem)]">
      <main className="max-w-xl mx-auto px-6 py-20 text-center">
        <span className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/60 dark:to-emerald-950/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mx-auto mb-6 shadow-sm">
          <CheckCircle2 className="w-8 h-8" />
        </span>

        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mb-3">
          Réclamation envoyée
        </h1>

        <p className="text-[14px] text-zinc-600 dark:text-zinc-400 mb-8">
          Nous avons bien reçu votre réclamation. Notre équipe vous répondra dans les meilleurs délais.
        </p>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-200/60 dark:divide-zinc-800 text-left mb-8">
          {reference && (
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-[12px] text-zinc-500 dark:text-zinc-400">Référence</span>
              <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 font-mono">
                {reference}
              </span>
            </div>
          )}
          <div className="px-5 py-3 flex items-center justify-between gap-3">
            <span className="text-[12px] text-zinc-500 dark:text-zinc-400">Statut</span>
            <span className="text-[13px] font-medium text-emerald-700 dark:text-emerald-400">
              À traiter
            </span>
          </div>
          <div className="px-5 py-3 flex items-center justify-between gap-3">
            <span className="text-[12px] text-zinc-500 dark:text-zinc-400">Délai de réponse</span>
            <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-violet-500" /> 15 jours ouvrés
            </span>
          </div>
        </div>

        <Link
          href={`/espace/${params.token}`}
          className="inline-flex items-center gap-2 text-[13px] text-violet-600 hover:text-violet-700 font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Revenir à mon espace
        </Link>

        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-10 inline-flex items-center justify-center gap-1.5 w-full">
          <ShieldCheck className="w-3 h-3" />
          Traitement confidentiel · conformité Qualiopi indicateur 31
        </p>
      </main>
    </div>
  );
}
