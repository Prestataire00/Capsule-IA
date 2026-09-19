// ARCHETYPE: command
// Justification: « quels e-mails partent tout seuls, quand, et à qui ». Ces envois
// vivaient dans le code du cron, de la facturation et de l'émargement : rien dans
// l'interface ne les listait, et le journal ne montre que ce qui est déjà parti.

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Zap, AlertTriangle, CheckCheck, Clock, Settings2, CalendarCog, Info } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { KpiCard } from '@/shared/ui/kpi-card';
import { SectionLabel } from '@/shared/ui/section-label';
import {
  MOMENT_LABELS,
  PREFIXE_PROGRAMMATION,
  compterParKind,
  lignesEnvois,
  parMoment,
  type LigneEnvoi,
} from '@/features/emails/envois-automatiques';
import { EmailsTabs } from '../emails-tabs.client';

export const dynamic = 'force-dynamic';

/** Fenêtre d'observation : assez large pour qu'un cycle de formation y tienne. */
const JOURS_OBSERVES = 90;

type Trace = { kind: string | null; status: string; sent_at: string };

async function loadTraces(): Promise<Trace[]> {
  const depuis = new Date(Date.now() - JOURS_OBSERVES * 24 * 60 * 60 * 1000).toISOString();
  // RLS : un membre ne voit que les traces de son organisation.
  const { data } = await supabaseServer()
    .schema('app')
    .from('email_log' as never)
    .select('kind, status, sent_at')
    .gte('sent_at', depuis)
    .order('sent_at', { ascending: false })
    .limit(5000);
  return (data ?? []) as unknown as Trace[];
}

function Etiquette({ ligne }: { ligne: LigneEnvoi }) {
  if (ligne.alerte === 'en_echec') {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-semibold bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
        <AlertTriangle className="w-3 h-3" />
        {ligne.compteur.echecs} échec{ligne.compteur.echecs > 1 ? 's' : ''}
      </span>
    );
  }
  if (ligne.alerte === 'jamais_parti') {
    return (
      <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-medium bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        <Clock className="w-3 h-3" />
        Aucun envoi
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
      <CheckCheck className="w-3 h-3" />
      Actif
    </span>
  );
}

export default async function EnvoisAutomatiquesPage() {
  const traces = await loadTraces();
  const compteurs = compterParKind(traces);
  const lignes = lignesEnvois(compteurs);
  const groupes = parMoment(lignes);

  const actifs = lignes.filter((l) => l.alerte === null).length;
  const enEchec = lignes.filter((l) => l.alerte === 'en_echec').length;
  const programmees = compteurs.get(PREFIXE_PROGRAMMATION);
  const sansType = traces.filter((t) => !t.kind).length;

  return (
    <div className="max-w-6xl w-full mx-auto px-8 py-9">
      <header className="mb-7">
        <SectionLabel className="mb-2">Notifications</SectionLabel>
        <h1 className="text-[30px] leading-none font-semibold text-zinc-900 dark:text-zinc-100">
          Envois automatiques
        </h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3 max-w-2xl">
          Tout ce que l&apos;application envoie sans qu&apos;on le lui demande : le déclencheur, le moment, les
          destinataires — et ce qui est réellement parti ces {JOURS_OBSERVES} derniers jours.
        </p>
      </header>

      <EmailsTabs />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7">
        <KpiCard
          label="Automatisations actives"
          value={`${actifs} / ${lignes.length}`}
          icon={Zap}
          accent="emerald"
          hint={`Au moins un envoi sur ${JOURS_OBSERVES} jours`}
        />
        <KpiCard
          label="En échec"
          value={enEchec}
          icon={AlertTriangle}
          accent={enEchec > 0 ? 'rose' : 'sky'}
          href={enEchec > 0 ? '/emails?status=failed' : undefined}
          hint={enEchec > 0 ? 'Voir les traces en échec' : 'Aucun envoi refusé'}
        />
        <KpiCard
          label="Règles personnalisées"
          value={programmees?.envoyes ?? 0}
          icon={CalendarCog}
          accent="purple"
          href="/programmation"
          hint="Envois issus de vos propres règles"
        />
      </div>

      <div className="space-y-7">
        {groupes.map((g) => (
          <section key={g.moment}>
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-zinc-500 mb-2.5">
              {MOMENT_LABELS[g.moment]}
            </h2>
            <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm divide-y divide-zinc-100 dark:divide-zinc-800">
              {g.lignes.map((l) => (
                <div key={l.kind} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">{l.nom}</h3>
                        <Etiquette ligne={l} />
                      </div>
                      <p className="text-[13px] text-zinc-600 dark:text-zinc-300 mt-1.5">{l.declencheur}</p>
                      <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1">
                        <span className="text-rose-600 dark:text-rose-400 font-medium">Destinataires</span> ·{' '}
                        {l.destinataires}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="block text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                        {l.compteur.envoyes}
                      </span>
                      <span className="block text-[11px] text-zinc-400">
                        envoi{l.compteur.envoyes > 1 ? 's' : ''} / {JOURS_OBSERVES} j
                      </span>
                      {l.compteur.dernier && (
                        <span className="block text-[11px] text-zinc-400 tabular-nums mt-0.5">
                          dernier le {format(parseISO(l.compteur.dernier), 'd MMM', { locale: fr })}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-400 mt-2.5 flex items-start gap-1.5">
                    <Settings2 className="w-3 h-3 mt-0.5 shrink-0" />
                    {l.coupureKey ? (
                      <span>
                        Se coupe séance par séance, dans l&apos;onglet Automatisations de la séance.
                      </span>
                    ) : (
                      <span>{l.obligatoire}</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {sansType > 0 && (
        <p className="mt-6 text-[12px] text-zinc-500 dark:text-zinc-400 flex items-start gap-2 rounded-lg border border-zinc-200/70 dark:border-zinc-800 px-4 py-3">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-zinc-400" />
          <span>
            <span className="tabular-nums">{sansType}</span> trace{sansType > 1 ? 's' : ''} du journal
            {sansType > 1 ? ' sont' : ' est'} sans type : ce sont des envois manuels, ou des envois automatiques
            antérieurs à leur étiquetage. Ils apparaissent dans l&apos;{' '}
            <Link href="/emails" className="text-orange-600 dark:text-orange-400 hover:underline">
              historique
            </Link>
            , sans être rattachés à une ligne ci-dessus.
          </span>
        </p>
      )}
    </div>
  );
}
