// ARCHETYPE: command
// Justification: « qui est pris, qui est libre » — une ligne par formateur sur la
// semaine. Le planning des sessions montrait les séances sans jamais montrer les
// personnes : savoir à qui confier une séance demandait un coup de téléphone.

import Link from 'next/link';
import { ChevronLeft, ChevronRight, UserCog, AlertTriangle, CalendarCheck, CircleSlash } from 'lucide-react';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { SectionLabel } from '@/shared/ui/section-label';
import { KpiCard } from '@/shared/ui/kpi-card';
import { loadSemaineFormateurs, type CaseSemaine } from '@/features/trainer-space/semaine-formateurs';
import { ETAT_LABELS, type EtatCreneau } from '@/features/trainer-space/semaine';
import { AgendaTabs } from '../agenda/agenda-tabs.client';

export const dynamic = 'force-dynamic';

const TZ = 'Europe/Paris';
const JOUR_MS = 24 * 60 * 60 * 1000;
const JOURS = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];

const jourNumFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
const semaineFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' });
const heureFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const cleDuJour = (d: Date) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Lundi de la semaine courante, décalé de `offset` semaines. */
function lundiDe(offset: number): Date {
  const d = new Date();
  const jour = d.getDay(); // 0 = dimanche
  d.setDate(d.getDate() + (jour === 0 ? -6 : 1 - jour) + offset * 7);
  d.setHours(12, 0, 0, 0);
  return d;
}

const TONS: Record<EtatCreneau, string> = {
  conflit: 'bg-red-100 dark:bg-red-950/50 border-red-400 dark:border-red-700 text-red-900 dark:text-red-200',
  seance: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200/80 dark:border-sky-900/60 text-sky-900 dark:text-sky-200',
  disponible: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-900/50',
  indisponible: 'bg-zinc-100 dark:bg-zinc-800/70 border-zinc-200 dark:border-zinc-700',
  non_renseigne: 'bg-white dark:bg-zinc-900 border-dashed border-zinc-200 dark:border-zinc-800',
};

const LEGENDE: Array<{ etat: EtatCreneau; texte: string }> = [
  { etat: 'seance', texte: 'En séance' },
  { etat: 'disponible', texte: 'Libre (déclaré)' },
  { etat: 'indisponible', texte: 'Indisponible' },
  { etat: 'non_renseigne', texte: 'Non renseigné' },
  { etat: 'conflit', texte: 'Conflit' },
];

function Case({ c }: { c: CaseSemaine }) {
  const demiJournee = c.creneau === 'matin' ? 'Matin' : 'Après-midi';
  const titre =
    c.seances.length > 0
      ? `${demiJournee} — ${ETAT_LABELS[c.etat]} : ${c.seances
          .map((s) => `${heureFmt.format(new Date(s.debut))} ${s.titre}`)
          .join(' · ')}`
      : `${demiJournee} — ${ETAT_LABELS[c.etat]}${c.note ? ` (${c.note})` : ''}`;

  const premiere = c.seances[0];
  const contenu =
    !premiere ? null : c.seances.length === 1 ? (
      <span className="block truncate text-[11px] leading-tight">
        <span className="font-semibold tabular-nums">{heureFmt.format(new Date(premiere.debut))}</span> {premiere.titre}
      </span>
    ) : (
      <span className="block text-[11px] font-semibold tabular-nums">{c.seances.length} séances</span>
    );

  const corps = (
    <span title={titre} className={`flex items-center gap-1 h-6 px-1 rounded border overflow-hidden ${TONS[c.etat]}`}>
      {c.etat === 'conflit' && <AlertTriangle className="w-3 h-3 shrink-0" />}
      {contenu}
    </span>
  );

  // Une case qui ne porte qu'une séance mène à cette séance : c'est l'action
  // qui suit presque toujours la lecture.
  return premiere && c.seances.length === 1 ? (
    <Link href={`/sessions/${premiere.id}`} className="block hover:opacity-80 transition">
      {corps}
    </Link>
  ) : (
    corps
  );
}

export default async function PlanningFormateursPage({
  searchParams,
}: {
  searchParams?: { week?: string };
}) {
  await requireAccess('dossiers');
  const me = await getCurrentMember();
  if (!me) return null;

  const offset = Number.parseInt(searchParams?.week ?? '0', 10) || 0;
  const lundi = lundiDe(offset);
  const jours = Array.from({ length: 7 }, (_, i) => new Date(lundi.getTime() + i * JOUR_MS));
  const cles = jours.map(cleDuJour);
  const aujourdhui = cleDuJour(new Date());

  const lignes = await loadSemaineFormateurs({ organizationId: me.organizationId, jours });

  const conflits = lignes.reduce((n, l) => n + l.resume.conflits, 0);
  const mobilises = lignes.filter((l) => l.resume.seances > 0).length;
  const muets = lignes.filter((l) => l.resume.libres === 0 && l.resume.seances === 0).length;

  return (
    <div className="max-w-[1400px] w-full mx-auto px-8 py-9">
      <header className="mb-6">
        <SectionLabel className="mb-2">Agenda</SectionLabel>
        <h1 className="text-[30px] leading-none font-semibold text-zinc-900 dark:text-zinc-100">
          Tous les formateurs
        </h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3 max-w-2xl">
          Une ligne par formateur, deux cases par jour (matin, après-midi) : ce qu&apos;il anime, et ce qu&apos;il a
          déclaré libre. À ouvrir avant de confier une séance.
        </p>
      </header>

      <AgendaTabs />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <KpiCard
          label="Formateurs mobilisés"
          value={`${mobilises} / ${lignes.length}`}
          icon={CalendarCheck}
          accent="blue"
          hint="Au moins une séance cette semaine"
        />
        <KpiCard
          label="Sans disponibilité déclarée"
          value={muets}
          icon={CircleSlash}
          accent="amber"
          hint="Ni séance, ni jour renseigné"
        />
        <KpiCard
          label="Conflits"
          value={conflits}
          icon={AlertTriangle}
          accent={conflits > 0 ? 'rose' : 'emerald'}
          hint="Séance posée sur une indisponibilité déclarée"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-1">
          <Link
            href={`/planning-formateurs?week=${offset - 1}`}
            aria-label="Semaine précédente"
            className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <span className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 tabular-nums px-1">
            Semaine du {semaineFmt.format(lundi)}
          </span>
          <Link
            href={`/planning-formateurs?week=${offset + 1}`}
            aria-label="Semaine suivante"
            className="w-8 h-8 rounded-md grid place-items-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            <ChevronRight className="w-4 h-4" />
          </Link>
          {offset !== 0 && (
            <Link
              href="/planning-formateurs"
              className="ml-2 text-[12px] font-medium text-orange-600 dark:text-orange-400 hover:underline"
            >
              Cette semaine
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-600 dark:text-zinc-400">
          {LEGENDE.map((l) => (
            <span key={l.etat} className="inline-flex items-center gap-1.5">
              <span className={`w-4 h-4 rounded border ${TONS[l.etat]}`} />
              {l.texte}
            </span>
          ))}
        </div>
      </div>

      {lignes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-16 text-center">
          <span className="mx-auto mb-3 w-12 h-12 rounded-xl grid place-items-center bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300">
            <UserCog className="h-6 w-6" />
          </span>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun formateur enregistré.</p>
          <Link
            href="/formateurs"
            className="inline-block mt-3 text-[12px] font-medium text-orange-600 dark:text-orange-400 hover:underline"
          >
            Ajouter un formateur
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
          <table className="w-full min-w-[1000px] border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500 w-60">
                  Formateur
                </th>
                {jours.map((j, i) => (
                  <th
                    key={cles[i]}
                    className={`px-1.5 py-2 text-[11px] font-semibold uppercase tracking-wide ${
                      cles[i] === aujourdhui
                        ? 'text-orange-600 dark:text-orange-400 bg-orange-50/60 dark:bg-orange-950/20'
                        : 'text-zinc-500'
                    }`}
                  >
                    <span className="block">{JOURS[i]}</span>
                    <span className="block text-[11px] font-normal tabular-nums opacity-70">
                      {jourNumFmt.format(j)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.trainerId} className="border-b border-zinc-100 dark:border-zinc-800/80 last:border-0">
                  <td className="px-4 py-2 align-top">
                    <Link
                      href={`/formateurs/${l.trainerId}`}
                      className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 hover:text-orange-600 dark:hover:text-orange-400 transition"
                    >
                      {l.nom}
                    </Link>
                    <span className="flex items-center gap-1.5 mt-0.5 text-[11px] text-zinc-400">
                      <span>{l.interne ? 'Interne' : 'Externe'}</span>
                      {l.resume.seances > 0 && (
                        <span className="text-sky-600 dark:text-sky-400 tabular-nums">
                          {l.resume.seances} demi-j.
                        </span>
                      )}
                      {l.resume.conflits > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-red-600 dark:text-red-400 font-medium tabular-nums">
                          <AlertTriangle className="w-3 h-3" />
                          {l.resume.conflits}
                        </span>
                      )}
                    </span>
                  </td>

                  {cles.map((cle) => (
                    <td
                      key={cle}
                      className={`px-1 py-1.5 align-top w-[11%] ${
                        cle === aujourdhui ? 'bg-orange-50/40 dark:bg-orange-950/10' : ''
                      }`}
                    >
                      <div className="space-y-1">
                        {l.cases
                          .filter((c) => c.jour === cle)
                          .map((c) => (
                            <Case key={c.creneau} c={c} />
                          ))}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
