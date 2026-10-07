// ARCHETYPE: command
// Justification: le suivi des e-mails partis — combien, lesquels, ce qu'il en
// est advenu — en un coup d'œil, puis le détail ligne à ligne.

import Link from 'next/link';
import { AlertTriangle, CheckCheck, Inbox, Mail, MailOpen, PenLine, Search } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { KpiCard } from '@/shared/ui/kpi-card';
import { StatusPill } from '@/shared/ui/status-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { SectionLabel } from '@/shared/ui/section-label';
import {
  ETATS,
  chiffres,
  etatDe,
  filtrer,
  libelleEnvoi,
  repartitionParType,
  serieParJour,
  type LigneJournal,
} from '@/features/emails/journal';
import { EmailsTabs } from './emails-tabs.client';

export const dynamic = 'force-dynamic';

type SearchParams = { p?: string; etat?: string; type?: string; q?: string; dossier?: string; status?: string };

const PERIODES = [
  { jours: 7, libelle: '7 jours' },
  { jours: 30, libelle: '30 jours' },
  { jours: 90, libelle: '3 mois' },
] as const;

const dateHeure = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const jourCourt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' });
const jourLong = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const nombre = new Intl.NumberFormat('fr-FR');

const MAX_LIGNES = 300;

// Lecture sous RLS : un membre ne voit que le journal de son organisme
// (politique email_log_member_read).
async function chargerJournal(depuis: Date, dossier: string | null): Promise<LigneJournal[]> {
  let q = supabaseServer()
    .schema('app')
    .from('email_log' as never)
    .select('id, kind, recipient, subject, status, sent_at, delivered_at, opened_at, clicked_at, bounced_at, open_count, dossier_id, provider_id')
    .gte('sent_at', depuis.toISOString())
    .order('sent_at', { ascending: false })
    .limit(5000);
  if (dossier) q = q.eq('dossier_id', dossier);
  const { data, error } = await q;
  if (error) throw new Error(`Journal des e-mails illisible : ${error.message}`);
  return ((data ?? []) as unknown as Array<{
    id: string;
    kind: string | null;
    recipient: string;
    subject: string | null;
    status: string | null;
    sent_at: string;
    delivered_at: string | null;
    opened_at: string | null;
    clicked_at: string | null;
    bounced_at: string | null;
    open_count: number | null;
    dossier_id: string | null;
    provider_id: string | null;
  }>).map((r) => ({
    id: r.id,
    kind: r.kind,
    recipient: r.recipient,
    subject: r.subject,
    status: r.status,
    sentAt: r.sent_at,
    deliveredAt: r.delivered_at,
    openedAt: r.opened_at,
    clickedAt: r.clicked_at,
    bouncedAt: r.bounced_at,
    openCount: r.open_count,
    dossierId: r.dossier_id,
    providerId: r.provider_id,
  }));
}

async function libellesDossiers(ids: readonly string[]): Promise<Map<string, { reference: string; client: string | null }>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabaseServer()
    .schema('app')
    .from('dossiers')
    .select('id, reference, nom, company:companies!dossiers_company_id_fkey(name), learner:learners!dossiers_learner_id_fkey(first_name, last_name)')
    .in('id', [...ids]);
  return new Map(
    ((data ?? []) as unknown as Array<{
      id: string;
      reference: string;
      nom: string | null;
      company: { name: string | null } | null;
      learner: { first_name: string | null; last_name: string | null } | null;
    }>).map((d) => [
      d.id,
      {
        reference: d.reference,
        client: d.company?.name ?? d.nom ?? (`${d.learner?.first_name ?? ''} ${d.learner?.last_name ?? ''}`.trim() || null),
      },
    ]),
  );
}

export default async function EmailsPage({ searchParams }: { searchParams: SearchParams }) {
  const jours = PERIODES.find((p) => String(p.jours) === searchParams.p)?.jours ?? 30;
  const maintenant = new Date();
  const depuis = new Date(maintenant.getTime() - jours * 86_400_000);
  const dossier = searchParams.dossier && /^[0-9a-f-]{36}$/i.test(searchParams.dossier) ? searchParams.dossier : null;
  // Ancien lien « ?status=failed » (page des envois automatiques) : les problèmes.
  const etat = searchParams.etat ?? (searchParams.status === 'failed' ? 'probleme' : undefined);

  const toutes = await chargerJournal(depuis, dossier);
  const lignes = filtrer(toutes, { etat, type: searchParams.type, q: searchParams.q });
  const n = chiffres(lignes);
  const serie = serieParJour(lignes, jours, maintenant);
  const types = repartitionParType(lignes);
  const typesDuMenu = repartitionParType(toutes, 100).filter((t) => t.kind !== '__autres');
  const affichees = lignes.slice(0, MAX_LIGNES);
  const dossiers = await libellesDossiers([...new Set(affichees.map((l) => l.dossierId).filter((x): x is string => Boolean(x)))]);

  const lien = (changes: Partial<SearchParams>) => {
    const p = new URLSearchParams();
    const tout = { p: String(jours), etat, type: searchParams.type, q: searchParams.q, dossier: dossier ?? undefined, ...changes };
    for (const [k, v] of Object.entries(tout)) if (v) p.set(k, v);
    return `/emails?${p.toString()}`;
  };
  const filtre = Boolean(etat || searchParams.type || searchParams.q || dossier);

  return (
    <div className="max-w-7xl w-full mx-auto px-4 sm:px-8 py-9">
      <header className="mb-7 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <SectionLabel className="mb-2">Communication</SectionLabel>
          <h1 className="text-[30px] leading-none font-semibold text-zinc-900 dark:text-zinc-100">E-mails envoyés</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3">
            Tout ce qui est parti de l’application, et ce qu’il en est advenu.
          </p>
        </div>
        <Link
          href="/emails/nouveau"
          className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium shadow-sm transition"
        >
          <PenLine className="w-4 h-4" />
          Rédiger un e-mail
        </Link>
      </header>

      <EmailsTabs />

      {/* Les filtres, sur une ligne, au-dessus de tout ce qu'ils filtrent. */}
      <form action="/emails" className="mb-6 flex flex-wrap items-center gap-2">
        <input type="hidden" name="p" value={jours} />
        {dossier && <input type="hidden" name="dossier" value={dossier} />}
        <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden" role="group" aria-label="Période">
          {PERIODES.map((p) => (
            <Link
              key={p.jours}
              href={lien({ p: String(p.jours) })}
              aria-current={p.jours === jours ? 'true' : undefined}
              className={`h-9 px-3 inline-flex items-center text-[13px] ${
                p.jours === jours
                  ? 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 font-medium'
                  : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              {p.libelle}
            </Link>
          ))}
        </div>
        <label className="sr-only" htmlFor="filtre-type">
          Type d’envoi
        </label>
        <select
          id="filtre-type"
          name="type"
          defaultValue={searchParams.type ?? ''}
          className="h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-[13px] max-w-[240px]"
        >
          <option value="">Tous les envois</option>
          {typesDuMenu.map((t) => (
            <option key={t.kind} value={t.kind}>
              {t.libelle} ({t.total})
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="filtre-etat">
          État
        </label>
        <select
          id="filtre-etat"
          name="etat"
          defaultValue={etat ?? ''}
          className="h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-[13px]"
        >
          <option value="">Tous les états</option>
          <option value="probleme">Problèmes (non partis, rejetés)</option>
          {ETATS.map((e) => (
            <option key={e.cle} value={e.cle}>
              {e.libelle}
            </option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
          <label className="sr-only" htmlFor="filtre-q">
            Rechercher
          </label>
          <input
            id="filtre-q"
            name="q"
            defaultValue={searchParams.q ?? ''}
            placeholder="Destinataire, objet, type…"
            className="w-full h-9 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 pl-9 pr-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500/30"
          />
        </div>
        <button type="submit" className="h-9 px-3.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800">
          Filtrer
        </button>
        {filtre && (
          <Link href={`/emails?p=${jours}`} className="text-[13px] text-orange-600 dark:text-orange-400 hover:underline">
            Tout afficher
          </Link>
        )}
      </form>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" aria-label="Chiffres de la période">
        <KpiCard label="Partis" value={nombre.format(n.partis)} icon={Mail} accent="blue" hint={`sur ${PERIODES.find((p) => p.jours === jours)?.libelle}`} />
        <KpiCard label="Délivrés" value={nombre.format(n.delivres)} icon={CheckCheck} accent="sky" hint="confirmés par la messagerie du destinataire" />
        <KpiCard
          label="Lus"
          value={nombre.format(n.lus)}
          icon={MailOpen}
          accent="emerald"
          hint={n.tauxLecture === null ? '—' : `${n.tauxLecture} % des envois partis`}
        />
        <KpiCard
          label="Problèmes"
          value={nombre.format(n.problemes)}
          icon={AlertTriangle}
          accent={n.problemes > 0 ? 'rose' : 'emerald'}
          href={n.problemes > 0 ? lien({ etat: 'probleme' }) : undefined}
          hint={n.problemes > 0 ? 'non partis ou adresses rejetées' : 'aucun'}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] mb-8">
        <EnvoisParJour serie={serie} />
        <EnvoisParType types={types} total={lignes.length} lien={(type) => lien({ type })} />
      </div>

      <section aria-label="Journal des e-mails">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <SectionLabel>Journal</SectionLabel>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            {lignes.length > MAX_LIGNES
              ? `Les ${MAX_LIGNES} plus récents sur ${nombre.format(lignes.length)} — affinez avec les filtres.`
              : `${nombre.format(lignes.length)} e-mail${lignes.length > 1 ? 's' : ''}`}
          </p>
        </div>
        {affichees.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
            <EmptyState
              icon={Inbox}
              title={filtre ? 'Aucun e-mail ne correspond' : 'Aucun envoi sur la période'}
              description="Convocations, questionnaires, documents, factures… apparaissent ici dès leur envoi, avec leur état."
            />
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead className="bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800">
                <tr className="text-left text-[11px] font-medium uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
                  <th className="px-4 py-2.5">Envoyé</th>
                  <th className="px-4 py-2.5">Destinataire</th>
                  <th className="px-4 py-2.5">Envoi</th>
                  <th className="px-4 py-2.5">État</th>
                  <th className="px-4 py-2.5">Dossier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {affichees.map((l) => {
                  const e = ETATS.find((x) => x.cle === etatDe(l))!;
                  const d = l.dossierId ? dossiers.get(l.dossierId) : undefined;
                  const sansSuivi = e.cle === 'envoye' && Boolean(l.providerId?.includes('@') || l.providerId?.startsWith('gmail:'));
                  return (
                    <tr key={l.id} className="align-top hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors">
                      <td className="px-4 py-3 text-[13px] text-zinc-600 dark:text-zinc-400 tabular-nums whitespace-nowrap">
                        {dateHeure.format(new Date(l.sentAt))}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-zinc-900 dark:text-zinc-100 max-w-[240px] truncate" title={l.recipient}>
                        {l.recipient}
                      </td>
                      <td className="px-4 py-3 max-w-[360px]">
                        <span className="block text-[13px] text-zinc-900 dark:text-zinc-100">{libelleEnvoi(l.kind)}</span>
                        {l.subject && (
                          <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 truncate" title={l.subject}>
                            {l.subject}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusPill tone={e.ton}>
                          {e.libelle}
                          {e.cle === 'lu' && l.openCount && l.openCount > 1 ? ` ×${l.openCount}` : ''}
                        </StatusPill>
                        {sansSuivi && <span className="block text-[11px] text-zinc-400 mt-1">sans suivi de lecture</span>}
                      </td>
                      <td className="px-4 py-3 text-[13px]">
                        {l.dossierId ? (
                          <Link href={`/dossiers/${l.dossierId}`} className="hover:underline">
                            <span className="font-mono text-[12px] text-zinc-600 dark:text-zinc-400">{d?.reference ?? 'Dossier'}</span>
                            {d?.client && <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 truncate max-w-[200px]">{d.client}</span>}
                          </Link>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-3 max-w-3xl">
          « Délivré », « Lu » et « Lien ouvert » sont confirmés pour les e-mails partis de l’adresse de l’organisme. Ceux
          de la boîte des cours (Gmail) restent à « Envoyé » : leur lecture n’est pas suivie.
        </p>
      </section>
    </div>
  );
}

/** Une barre par jour : partis en bas, problèmes au-dessus. Survol : le détail du jour. */
function EnvoisParJour({ serie }: { serie: ReturnType<typeof serieParJour> }) {
  const max = Math.max(1, ...serie.map((j) => j.partis + j.echecs));
  const pas = serie.length > 31 ? 14 : serie.length > 10 ? 5 : 1;
  const total = serie.reduce((n, j) => n + j.partis + j.echecs, 0);
  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5" aria-label="Envois par jour">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Envois par jour</h2>
        <div className="flex items-center gap-3 text-[12px] text-zinc-600 dark:text-zinc-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 dark:bg-blue-400" aria-hidden /> Partis
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500 dark:bg-red-400" aria-hidden /> Problèmes
          </span>
        </div>
      </div>
      {total === 0 ? (
        <p className="h-44 grid place-items-center text-[13px] text-zinc-500 dark:text-zinc-400">Aucun envoi sur la période.</p>
      ) : (
        <>
          <div className="relative h-44 flex items-end gap-[2px] border-b border-zinc-200 dark:border-zinc-700" role="img" aria-label={`${total} e-mails sur la période`}>
            <span className="absolute left-0 top-0 text-[11px] text-zinc-400 tabular-nums">{max}</span>
            {serie.map((j) => {
              const jour = new Date(`${j.jour}T12:00:00Z`);
              return (
                <div key={j.jour} className="group relative flex-1 h-full flex flex-col justify-end items-stretch min-w-0" tabIndex={0}>
                  {j.echecs > 0 && (
                    <div className="bg-red-500 dark:bg-red-400 rounded-t mb-[2px]" style={{ height: `${(j.echecs / max) * 100}%` }} />
                  )}
                  {j.partis > 0 && (
                    <div
                      className={`bg-blue-500 dark:bg-blue-400 group-hover:bg-blue-600 dark:group-hover:bg-blue-300 ${j.echecs > 0 ? '' : 'rounded-t'}`}
                      style={{ height: `${(j.partis / max) * 100}%` }}
                    />
                  )}
                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block group-focus:block z-10 whitespace-nowrap rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1.5 shadow-md text-[12px]">
                    <span className="block font-medium text-zinc-900 dark:text-zinc-100 first-letter:uppercase">{jourLong.format(jour)}</span>
                    <span className="block text-zinc-600 dark:text-zinc-300 tabular-nums">{j.partis} parti{j.partis > 1 ? 's' : ''}</span>
                    {j.echecs > 0 && <span className="block text-zinc-600 dark:text-zinc-300 tabular-nums">{j.echecs} problème{j.echecs > 1 ? 's' : ''}</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-[2px] mt-1.5">
            {serie.map((j, i) => (
              <span key={j.jour} className="flex-1 min-w-0 text-[11px] text-zinc-400 tabular-nums text-center overflow-visible whitespace-nowrap">
                {i % pas === 0 ? jourCourt.format(new Date(`${j.jour}T12:00:00Z`)) : ''}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** Quels envois partent le plus ; un clic filtre le journal. */
function EnvoisParType({
  types,
  total,
  lien,
}: {
  types: ReturnType<typeof repartitionParType>;
  total: number;
  lien: (type: string) => string;
}) {
  const max = Math.max(1, ...types.map((t) => t.total));
  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5" aria-label="Envois par type">
      <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 mb-4">Par type d’envoi</h2>
      {types.length === 0 ? (
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun envoi.</p>
      ) : (
        <ul className="space-y-2.5">
          {types.map((t) => {
            const contenu = (
              <>
                <span className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="text-zinc-800 dark:text-zinc-200 truncate">{t.libelle}</span>
                  <span className="text-zinc-600 dark:text-zinc-400 tabular-nums shrink-0">
                    {t.total}
                    {t.echecs > 0 && <span className="text-red-600 dark:text-red-400"> · {t.echecs} pb</span>}
                    <span className="text-zinc-400"> · {Math.round((t.total / Math.max(1, total)) * 100)} %</span>
                  </span>
                </span>
                <span className="mt-1 block h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <span className="block h-full rounded-full bg-blue-500 dark:bg-blue-400" style={{ width: `${(t.total / max) * 100}%` }} />
                </span>
              </>
            );
            return (
              <li key={t.kind}>
                {t.kind === '__autres' ? (
                  <div>{contenu}</div>
                ) : (
                  <Link href={lien(t.kind)} className="block rounded-md -mx-1.5 px-1.5 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                    {contenu}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
