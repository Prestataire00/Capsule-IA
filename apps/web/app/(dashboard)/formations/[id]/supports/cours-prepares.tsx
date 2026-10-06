import Link from 'next/link';
import { ArrowUpRight, BookOpen, GraduationCap, ListChecks } from 'lucide-react';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { SUPPORT_STATUS_LABELS, type SupportStatus } from '@/features/trainer-space/support-status';
import type { CoursPrepare, ElementDeCours } from '@/features/pedagogie/cours-de-la-formation';

const TON: Record<SupportStatus, 'success' | 'warning' | 'danger'> = {
  valide: 'success',
  en_attente: 'warning',
  refuse: 'danger',
};

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' });

/** Le cours que chaque formateur a préparé, séance par séance, à relire depuis la formation. */
export function CoursPrepares({ cours }: { cours: readonly CoursPrepare[] }) {
  const aValider = cours.reduce(
    (n, c) => n + [...c.exercices, ...c.supports].filter((e) => e.publie && e.statut === 'en_attente').length,
    0,
  );

  return (
    <section className="space-y-3 mb-8" aria-label="Cours préparés par les formateurs">
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className={`w-8 h-8 rounded-lg grid place-items-center ${ACCENTS.purple.soft}`}>
          <GraduationCap className="w-4 h-4" />
        </span>
        <SectionLabel>Cours préparés par les formateurs</SectionLabel>
        {aValider > 0 && (
          <span className="rounded-full px-2 py-0.5 text-[12px] font-medium tabular-nums bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
            {aValider} à valider
          </span>
        )}
      </div>

      {cours.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-6 text-center text-[13px] text-zinc-500 dark:text-zinc-400">
          Aucun formateur n’a encore préparé de cours pour les séances de cette formation.
        </p>
      ) : (
        <div className="space-y-3">
          {cours.map((c) => (
            <article
              key={`${c.ancrage}-${c.id}`}
              className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden"
            >
              <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-[color:var(--sess)] truncate">{c.titre}</p>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {c.debut ? date(c.debut) : 'Hors séance'}
                    {c.formateurs.length > 0 && <> · {c.formateurs.join(', ')}</>}
                  </p>
                </div>
                <Link
                  href={c.lien}
                  className="shrink-0 h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Relire et valider <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
              <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
                <Liste titre="Exercices et quiz" icone={ListChecks} elements={c.exercices} />
                {c.ancrage === 'seance' && <Liste titre="Supports" icone={BookOpen} elements={c.supports} />}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Liste({
  titre,
  icone: Icone,
  elements,
}: {
  titre: string;
  icone: typeof ListChecks;
  elements: readonly ElementDeCours[];
}) {
  return (
    <div className="space-y-2 min-w-0">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
        <Icone className="w-3.5 h-3.5" /> {titre} <span className="tabular-nums">({elements.length})</span>
      </p>
      {elements.length === 0 ? (
        <p className="text-[12px] text-zinc-400 dark:text-zinc-500">Rien pour l’instant.</p>
      ) : (
        <ul className="space-y-1.5">
          {elements.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block text-[13px] text-zinc-800 dark:text-zinc-200 truncate">{e.titre}</span>
                <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                  {e.nature}
                  {!e.publie && ' · brouillon du formateur'}
                </span>
              </span>
              {e.publie && <StatusPill tone={TON[e.statut]}>{SUPPORT_STATUS_LABELS[e.statut]}</StatusPill>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
