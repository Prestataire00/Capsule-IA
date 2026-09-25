// ARCHETYPE: shared
// Le panneau « À traiter » de l'accueil : ce qui réclame l'attention, classé.
import Link from 'next/link';
import { AlertTriangle, Clock, Eye, CheckCircle2, ShieldCheck, ArrowUpRight } from 'lucide-react';
import type { Gravite, Signal } from './signaux';
import type { SignauxDuJour } from './load-signaux';

const TONS: Record<Gravite, { pastille: string; puce: string; libelle: string }> = {
  bloquant: {
    pastille: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
    puce: 'bg-red-500',
    libelle: 'Bloquant',
  },
  urgent: {
    pastille: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    puce: 'bg-amber-500',
    libelle: 'Urgent',
  },
  a_surveiller: {
    pastille: 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
    puce: 'bg-sky-400',
    libelle: 'À surveiller',
  },
};

const ICONES: Record<Gravite, typeof AlertTriangle> = {
  bloquant: AlertTriangle,
  urgent: Clock,
  a_surveiller: Eye,
};

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

function Ligne({ s }: { s: Signal }) {
  const ton = TONS[s.gravite];
  const Icone = ICONES[s.gravite];
  return (
    <li>
      <Link
        href={s.href}
        className="group flex items-start gap-3 px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-950/60 transition"
      >
        <span className={`mt-0.5 w-6 h-6 rounded-lg grid place-items-center shrink-0 ${ton.pastille}`}>
          <Icone className="w-3.5 h-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{s.titre}</span>
            {s.montantCents !== null && s.montantCents > 0 && (
              <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                {euro.format(s.montantCents / 100)}
              </span>
            )}
          </span>
          <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">{s.detail}</span>
        </span>
        <ArrowUpRight className="w-3.5 h-3.5 mt-1 shrink-0 text-zinc-300 dark:text-zinc-600 group-hover:text-orange-500 transition" />
      </Link>
    </li>
  );
}

/**
 * Ce panneau remplace « aller voir dix écrans ».
 *
 * Quand il est vide, il le dit franchement plutôt que de disparaître : une
 * absence de signal est une information, et un panneau qui s'efface laisse
 * croire qu'on a oublié de regarder.
 */
export function SignauxPanel({ etat, max = 8 }: { etat: SignauxDuJour; max?: number }) {
  const { signaux, parGravite, arriere } = etat;
  const montres = signaux.slice(0, max);
  const reste = signaux.length - montres.length;

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-zinc-200/60 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          À traiter aujourd&apos;hui
        </h2>
        <span className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          {(['bloquant', 'urgent', 'a_surveiller'] as const)
            .filter((g) => parGravite[g] > 0)
            .map((g) => (
              <span key={g} className="inline-flex items-center gap-1 tabular-nums">
                <span className={`w-1.5 h-1.5 rounded-full ${TONS[g].puce}`} />
                {parGravite[g]} {TONS[g].libelle.toLowerCase()}
              </span>
            ))}
        </span>
      </div>

      {signaux.length === 0 ? (
        <p className="px-5 py-8 text-[13px] text-zinc-500 dark:text-zinc-400 flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          Rien ne réclame votre attention aujourd&apos;hui.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {montres.map((s) => (
            <Ligne key={`${s.code}-${s.href}-${s.titre}`} s={s} />
          ))}
        </ul>
      )}

      {(reste > 0 || arriere.dossiers > 0) && (
        <div className="px-5 py-2.5 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          {reste > 0 ? <span className="tabular-nums">et {reste} autre(s) signal(aux)</span> : <span />}
          {arriere.dossiers > 0 && (
            <Link
              href="/qualiopi"
              className="inline-flex items-center gap-1.5 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
              title="Dossiers dont la conformité est en retard depuis plus d’un mois — hors de la liste du jour pour ne pas la noyer"
            >
              <ShieldCheck className="w-3 h-3" />
              <span className="tabular-nums">
                {arriere.dossiers} dossier(s) en retard de conformité · {arriere.indicateurs} indicateur(s)
              </span>
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
