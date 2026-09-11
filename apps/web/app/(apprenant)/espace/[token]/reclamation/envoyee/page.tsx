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
    <div className="bg-zinc-50 dark:bg-zinc-950 min-h-[calc(100vh-3rem)]">
      <main className="max-w-xl mx-auto px-6 py-20 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto mb-6" />

        <h1 className="text-[30px] leading-tight font-extrabold text-zinc-900 dark:text-zinc-100 mb-3">
          Réclamation envoyée
        </h1>

        <p className="text-[14px] text-zinc-600 dark:text-zinc-400 mb-8">
          Nous avons bien reçu votre réclamation. Notre équipe vous répondra dans les meilleurs délais.
        </p>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-200/70 dark:divide-zinc-800 text-left mb-8">
          {reference && (
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-[12px] text-zinc-500 dark:text-zinc-400">Référence</span>
              <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
                {reference}
              </span>
            </div>
          )}
          <div className="px-5 py-3 flex items-center justify-between gap-3">
            <span className="text-[12px] text-zinc-500 dark:text-zinc-400">Statut</span>
            <span className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
              À traiter
            </span>
          </div>
          <div className="px-5 py-3 flex items-center justify-between gap-3">
            <span className="text-[12px] text-zinc-500 dark:text-zinc-400">Délai de réponse</span>
            <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-1.5 tabular-nums">
              <Clock className="w-3.5 h-3.5 text-zinc-400" /> 15 jours ouvrés
            </span>
          </div>
        </div>

        <Link
          href={`/espace/${params.token}`}
          className="inline-flex items-center gap-2 text-[13px] text-orange-600 hover:text-orange-700 dark:text-orange-400 font-semibold"
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
