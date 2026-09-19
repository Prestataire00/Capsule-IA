// ARCHETYPE: command
// Justification: informations de la session façon RFC — dates, formateur, lieu, capacité, tarif, CA prévisionnel,
// coût formateur, notes, devis associés — puis l'avancement en quatre temps.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AlertTriangle, ArrowUpRight, Check, Circle, Clock } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { canManageSection } from '@/shared/lib/auth/require-access';
import { StatusPill } from '@/shared/ui/status-pill';
import { loadSession } from '@/features/sessions/load-session';
import { loadBoardFacts } from '@/features/sessions/load-session-board';
import { buildBoard, type BoardStep } from '@/features/sessions/session-board';
import { estTarifBase, formatEuros, ligneSeance } from '@/features/trainer-space/billing-rules';
import { SessionInfoEdit } from './session-info-edit';

export const dynamic = 'force-dynamic';

const TZ = 'Europe/Paris';
const dateHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const DEVIS: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' | 'warning' }> = {
  draft: { label: 'Brouillon', tone: 'neutral' },
  sent: { label: 'Envoyé', tone: 'info' },
  signed: { label: 'Signé', tone: 'success' },
  refused: { label: 'Refusé', tone: 'danger' },
  expired: { label: 'Expiré', tone: 'warning' },
  cancelled: { label: 'Annulé', tone: 'neutral' },
};

type Devis = { id: string; reference: string; object: string; status: string; subtotal_cents: number; total_cents: number; company_id: string | null; learner_id: string | null };
type Formateur = { id: string; first_name: string; last_name: string; tarif_base: string | null; tarif_cents: number | null };

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-[13px] text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-[13px] text-zinc-900 dark:text-zinc-100">{children}</dd>
    </div>
  );
}

export default async function SessionOverview({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const loaded = await loadSession(sb, params.id);
  if (!loaded) notFound();
  const { session, formation, learners, dossierIds } = loaded;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = sb as unknown as SupabaseClient<any, any, any>;

  const [{ data: extra }, { data: st }, { data: dt }, { data: devisData }, { data: form }, gerer, facts] = await Promise.all([
    db.schema('app').from('sessions').select('price_cents, capacity_max, notes').eq('id', session.id).maybeSingle(),
    db.schema('app').from('session_trainers').select('trainer_id, hourly_rate_cents, amount_cents').eq('session_id', session.id).is('deleted_at', null),
    dossierIds.length ? db.schema('app').from('dossier_trainers').select('trainer_id').in('dossier_id', dossierIds) : Promise.resolve({ data: [] }),
    db
      .schema('app')
      .from('quotes')
      .select('id, reference, object, status, subtotal_cents, total_cents, company_id, learner_id')
      .eq('session_id', session.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    formation ? db.schema('app').from('formations').select('default_price_cents').eq('id', formation.id).maybeSingle() : Promise.resolve({ data: null }),
    canManageSection('dossiers'),
    loadBoardFacts(sb, loaded),
  ]);
  const infos = (extra ?? {}) as { price_cents?: number | null; capacity_max?: number | null; notes?: string | null };
  const seanceFormateurs = (st ?? []) as { trainer_id: string; hourly_rate_cents: number | null; amount_cents: number | null }[];
  const formateurId = seanceFormateurs[0]?.trainer_id ?? ((dt ?? []) as { trainer_id: string }[])[0]?.trainer_id ?? null;
  const { data: fData } = formateurId
    ? await db.schema('app').from('trainers').select('id, first_name, last_name, tarif_base, tarif_cents').eq('id', formateurId).maybeSingle()
    : { data: null };
  const formateur = fData as Formateur | null;
  const devis = (devisData ?? []) as Devis[];

  // Capacité.
  const n = learners.length;
  const cap = infos.capacity_max ?? null;
  const ratio = cap ? n / cap : 0;
  const tonCapacite = ratio >= 1 ? 'text-red-600 dark:text-red-400' : ratio >= 0.8 ? 'text-orange-600 dark:text-orange-400' : 'text-emerald-600 dark:text-emerald-400';
  const barreCapacite = ratio >= 1 ? 'bg-red-500' : ratio >= 0.8 ? 'bg-orange-500' : 'bg-emerald-500';

  // Tarif et CA prévisionnel : devis envoyés ou signés, sinon tarif × participants non couverts.
  const tarifFormation = (form as { default_price_cents?: number } | null)?.default_price_cents ?? null;
  const tarif = infos.price_cents ?? (tarifFormation && tarifFormation > 0 ? tarifFormation : null);
  const devisValables = devis.filter((d) => d.status === 'sent' || d.status === 'signed');
  const couverts = learners.filter((l) => devisValables.some((d) => (l.companyId && d.company_id === l.companyId) || d.learner_id === l.id));
  const ca =
    devisValables.length || tarif
      ? devisValables.reduce((t, d) => t + Number(d.subtotal_cents), 0) + (n - couverts.length) * Number(tarif ?? 0)
      : null;

  // Coût formateur : son tarif (heure, jour, séance) appliqué à la séance ; un tarif posé sur la séance l'emporte.
  const particulier = seanceFormateurs.find((s) => s.trainer_id === formateurId);
  const cout = formateur
    ? ligneSeance(
        {
          id: session.id,
          title: formation?.title ?? 'Séance',
          startsAt: session.starts_at,
          endsAt: session.ends_at,
          forfaitCents: particulier?.amount_cents == null ? null : Number(particulier.amount_cents),
          tauxHoraireCents: particulier?.hourly_rate_cents == null ? null : Number(particulier.hourly_rate_cents),
        },
        estTarifBase(formateur.tarif_base) ? formateur.tarif_base : null,
        formateur.tarif_cents == null ? null : Number(formateur.tarif_cents),
      )
    : null;

  const board = buildBoard(facts, `/sessions/${params.id}`);

  return (
    <div className="space-y-5">
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100">Informations</h2>
          {gerer && (
            <SessionInfoEdit
              sessionId={session.id}
              initial={{
                capacityMax: cap ? String(cap) : '',
                priceEuros: infos.price_cents != null ? String(Number(infos.price_cents) / 100).replace('.', ',') : '',
                notes: infos.notes ?? '',
              }}
            />
          )}
        </div>
        <dl className="space-y-4">
          <Champ label="Dates & horaires">
            <span className="tabular-nums">
              Du {dateHeure.format(new Date(session.starts_at))} au {dateHeure.format(new Date(session.ends_at))}
            </span>
          </Champ>
          <Champ label="Formateur">
            {formateur ? (
              <Link href={`/formateurs/${formateur.id}`} className="text-orange-600 dark:text-orange-400 hover:underline">
                {formateur.first_name} {formateur.last_name}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4" aria-hidden /> Non assigné
              </span>
            )}
          </Champ>
          <Champ label="Lieu">{session.location || <span className="text-zinc-400">{session.modality === 'distanciel' ? 'À distance' : 'Non défini'}</span>}</Champ>
          <Champ label="Capacité">
            {cap ? (
              <div className="space-y-2">
                <p className="tabular-nums">
                  <span className={tonCapacite}>
                    {n}/{cap} participant{cap > 1 ? 's' : ''}
                  </span>{' '}
                  <span className="text-zinc-500">
                    ({Math.max(0, cap - n)} place{Math.max(0, cap - n) > 1 ? 's' : ''} restante{Math.max(0, cap - n) > 1 ? 's' : ''})
                  </span>
                </p>
                <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                  <div className={`h-full ${barreCapacite}`} style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }} />
                </div>
              </div>
            ) : (
              <span className="tabular-nums">
                {n} participant{n > 1 ? 's' : ''} <span className="text-zinc-400">· capacité non définie</span>
              </span>
            )}
          </Champ>
          <Champ label="Tarif / participant">
            {tarif ? (
              <span className="tabular-nums">
                {formatEuros(Number(tarif))}
                {infos.price_cents != null && tarifFormation !== null && Number(infos.price_cents) !== Number(tarifFormation) && (
                  <span className="ml-2 text-[12px] text-amber-700 dark:text-amber-400">(prix de la séance)</span>
                )}
              </span>
            ) : (
              <span className="text-zinc-400 italic">Non renseigné</span>
            )}
          </Champ>
          <Champ label="CA prévisionnel">
            {ca !== null ? <span className="font-semibold tabular-nums">{formatEuros(ca)}</span> : <span className="text-zinc-400 italic">Non renseigné</span>}
          </Champ>
          <Champ label="Coût formateur">
            {cout ? (
              <span className="tabular-nums">
                {formatEuros(cout.totalCents)}{' '}
                <span className="text-[12px] text-zinc-500">
                  ({cout.quantity.toLocaleString('fr-FR')} {cout.unit} × {formatEuros(cout.unitPriceCents)})
                </span>
              </span>
            ) : (
              <span className="text-zinc-400 italic">Non renseigné{formateur ? ' — tarif à saisir sur la fiche du formateur' : ''}</span>
            )}
          </Champ>
          {infos.notes && (
            <Champ label="Notes">
              <span className="whitespace-pre-line">{infos.notes}</span>
            </Champ>
          )}
        </dl>
      </section>

      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-5">
        <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Devis associé{devis.length > 1 ? 's' : ''}</h2>
        {devis.length === 0 ? (
          <p className="text-[13px] text-zinc-500">Aucun devis rattaché à cette séance.</p>
        ) : (
          <ul className="space-y-2">
            {devis.map((d) => {
              const s = DEVIS[d.status] ?? { label: d.status, tone: 'neutral' as const };
              return (
                <li key={d.id}>
                  <Link href={`/devis/${d.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition">
                    <span className="min-w-0">
                      <span className="block font-mono text-[13px] text-zinc-900 dark:text-zinc-100">DEVIS N° {d.reference}</span>
                      <span className="block text-[12px] text-zinc-500 truncate">{d.object}</span>
                      <span className="block text-[12px] text-zinc-700 dark:text-zinc-300 tabular-nums">{formatEuros(Number(d.total_cents))}</span>
                    </span>
                    <StatusPill tone={s.tone}>{s.label}</StatusPill>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Avancement de la session">
        <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Avancement</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {board.map((col) => {
            const faites = col.steps.filter((s) => s.state === 'fait').length;
            return (
              <div key={col.title} className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg shadow-sm p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{col.title}</h3>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {faites}/{col.steps.length}
                  </span>
                </div>
                <ul className="space-y-1">
                  {col.steps.map((s) => (
                    <Etape key={s.key} step={s} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const ICONE = { fait: Check, en_cours: Clock, a_faire: Circle } as const;
const TON = {
  fait: 'text-emerald-600 dark:text-emerald-400',
  en_cours: 'text-amber-600 dark:text-amber-400',
  a_faire: 'text-zinc-300 dark:text-zinc-600',
} as const;

function Etape({ step }: { step: BoardStep }) {
  const Icone = ICONE[step.state];
  const contenu = (
    <>
      <Icone className={`w-4 h-4 flex-shrink-0 ${TON[step.state]}`} aria-hidden />
      <span className="flex-1 text-[13px] text-zinc-700 dark:text-zinc-300">{step.label}</span>
      {step.compte && (
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">{step.total === 0 ? '—' : `${step.done}/${step.total}`}</span>
      )}
      {step.href && <ArrowUpRight className="w-3 h-3 text-zinc-400 opacity-0 group-hover:opacity-100 transition" aria-hidden />}
    </>
  );
  return (
    <li>
      {step.href ? (
        <Link href={step.href} className="group flex items-center gap-2 -mx-2 px-2 py-1.5 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition">
          {contenu}
        </Link>
      ) : (
        <div className="flex items-center gap-2 py-1.5">{contenu}</div>
      )}
    </li>
  );
}
