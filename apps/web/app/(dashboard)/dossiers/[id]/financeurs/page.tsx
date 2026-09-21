// ARCHETYPE: workflow
// Justification: tâches d'envoi par financeur (brouillon assisté + envoi 1 clic).

import { notFound } from 'next/navigation';
import { Landmark } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { EmptyState } from '@/shared/ui/empty-state';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { canManageSection } from '@/shared/lib/auth/require-access';
import { etatFinancement, resumeFinancement } from '@/features/funders/prise-en-charge';
import { PriseEnCharge, type LigneAffichee } from './prise-en-charge.client';
import { prepareFunderTaskDraft, sendFunderTask } from './actions';

const STATUS_LABEL: Record<string, string> = {
  pending: 'À préparer', ready: 'Échéance proche', drafted: 'Brouillon prêt',
  sent: 'Envoyé', done: 'Terminé', skipped: 'Ignoré',
};
const STATUS_TONE: Record<string, 'neutral' | 'warning' | 'info'> = {
  pending: 'neutral', ready: 'warning', drafted: 'info', skipped: 'neutral',
};

const ROW_GRID = 'grid grid-cols-[minmax(0,2.2fr)_110px_100px_150px_minmax(0,1.3fr)] gap-4 px-5';

export default async function FinanceursPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const { data: dossier, error: erreurLecture } = await sb.schema('app').from('dossiers')
    .select('id, total_amount_cents').eq('id', params.id).maybeSingle();
  // Une requête en échec n'est pas une ligne absente : sans cette
  // distinction, toute panne s'affiche en 404 (incident du 21/09/2026).
  if (erreurLecture) {
    console.error('[financeurs du dossier] lecture impossible', erreurLecture.code, erreurLecture.message);
    throw new Error(`Lecture impossible (financeurs du dossier) : ${erreurLecture.message}`);
  }
  if (!dossier) notFound();

  // Prod-safe : si dossier_funder_tasks n'est pas encore migrée, data=null → liste vide.
  const { data: tasks } = await sb.schema('app').from('dossier_funder_tasks')
    .select('id, due_date, status, draft_subject, resolved_attachments, funders(name)')
    .eq('dossier_id', params.id)
    .order('due_date', { ascending: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (tasks as any[]) ?? [];

  // Prise en charge : où en est le financement, et combien reste à payer.
  const { data: financeurs } = await sb
    .schema('app')
    .from('dossier_funders')
    .select('id, status, amount_cents, granted_cents, decision_note, external_file_number, funder:funders(name)')
    .eq('dossier_id', params.id)
    .order('created_at', { ascending: true });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lignesBrutes = (financeurs as any[]) ?? [];
  const lignes: LigneAffichee[] = lignesBrutes.map((f) => ({
    id: f.id as string,
    funderName: (f.funder?.name as string) ?? 'Financeur',
    amountCents: Number(f.amount_cents ?? 0),
    grantedCents: f.granted_cents == null ? null : Number(f.granted_cents),
    status: (f.status as string) ?? 'pending',
    decisionNote: (f.decision_note as string | null) ?? null,
    externalFileNumber: (f.external_file_number as string | null) ?? null,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const total = Number((dossier as any).total_amount_cents ?? 0);
  const etat = etatFinancement(total, lignes);
  const gerer = (await canManageSection('billing')) === true;

  return (
    <div className="space-y-5">

      {/* Prise en charge : l'état du financement avant les tâches d'envoi —
          c'est la question qu'on se pose en ouvrant cet onglet. */}
      <section className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-200/70 dark:border-zinc-800 bg-gradient-to-br from-emerald-50/70 to-white dark:from-emerald-950/25 dark:to-zinc-900">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className={`w-8 h-8 rounded-lg grid place-items-center ${ACCENTS.emerald.soft}`}>
              <Landmark className="w-4 h-4" />
            </span>
            <SectionLabel>Prise en charge</SectionLabel>
            <span className="text-[12px] text-zinc-500 dark:text-zinc-400">{resumeFinancement(etat)}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <Chiffre libelle="Coût total" valeur={total} />
            <Chiffre libelle="Pris en charge" valeur={etat.acquisCents} ton="text-emerald-700 dark:text-emerald-300" />
            <Chiffre libelle="En attente" valeur={etat.enAttenteCents} ton="text-amber-700 dark:text-amber-300" />
            <Chiffre
              libelle="Reste à payer"
              valeur={etat.resteAPayerCents}
              ton={etat.resteAPayerCents > 0 ? 'text-zinc-900 dark:text-zinc-100' : 'text-emerald-700 dark:text-emerald-300'}
              fort
            />
          </div>
          {etat.enAttenteDeReponse && etat.resteSiToutAccordeCents !== etat.resteAPayerCents && (
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-3 tabular-nums">
              Si tout ce qui est en attente est accordé, il restera {euros(etat.resteSiToutAccordeCents)}.
            </p>
          )}
        </div>
        <div className="px-5">
          {lignes.length === 0 ? (
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 py-5">
              Aucun financeur rattaché : le client règle la totalité.
            </p>
          ) : (
            <PriseEnCharge dossierId={params.id} lignes={lignes} gerer={gerer} />
          )}
        </div>
      </section>

      <div className="flex items-center gap-2.5">
        <span className={`w-8 h-8 rounded-lg grid place-items-center ${ACCENTS.emerald.soft}`}>
          <Landmark className="w-4 h-4" />
        </span>
        <SectionLabel>Financeurs — documents à transmettre</SectionLabel>
        <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.emerald.soft}`}>{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl">
          <EmptyState
            icon={Landmark}
            title="Aucune tâche financeur."
            description="Rattachez un financeur au dossier pour générer le calendrier d'envoi."
          />
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm overflow-x-auto">
          <div className="min-w-[760px]">
            <div className={`${ROW_GRID} h-9 items-center text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/40 border-b border-zinc-200/70 dark:border-zinc-800`}>
              <div>Financeur</div>
              <div>Échéance</div>
              <div>Pièces</div>
              <div>Statut</div>
              <div className="text-right">Actions</div>
            </div>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              {rows.map((t) => {
                const atts = (t.resolved_attachments as Array<unknown> | null) ?? [];
                const canPrepare = t.status !== 'sent' && t.status !== 'done';
                return (
                  <li key={t.id} className={`${ROW_GRID} py-3.5 items-center hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors`}>
                    <div className="min-w-0 flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS.emerald.soft}`}>
                        <Landmark className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-bold text-zinc-900 dark:text-zinc-100">{t.funders?.name ?? 'Financeur'}</p>
                        {t.draft_subject && (
                          <p className="truncate text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">Objet : {t.draft_subject}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-[13px] font-bold text-blue-700 dark:text-blue-300 tabular-nums">
                      {t.due_date ? new Date(t.due_date).toLocaleDateString('fr-FR') : <span className="font-normal text-zinc-400">—</span>}
                    </div>
                    <div className="text-[13px] text-zinc-700 dark:text-zinc-300 tabular-nums">
                      {atts.length ? (
                        <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${ACCENTS.orange.soft}`}>{`${atts.length} pièce(s)`}</span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </div>
                    <div>
                      {t.status === 'sent' || t.status === 'done' ? (
                        <StatusPill tone="success">envoyé</StatusPill>
                      ) : (
                        <StatusPill tone={STATUS_TONE[t.status] ?? 'neutral'}>{STATUS_LABEL[t.status] ?? t.status}</StatusPill>
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {canPrepare && (
                        <form action={async () => { 'use server'; await prepareFunderTaskDraft(t.id, params.id); }}>
                          <button type="submit" className="h-8 border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[12px] font-semibold px-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition">
                            Préparer
                          </button>
                        </form>
                      )}
                      {t.status === 'drafted' && (
                        <form action={async () => { 'use server'; await sendFunderTask(t.id, params.id); }}>
                          <button type="submit" className="h-8 bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-semibold px-3 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10">
                            Envoyer
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

const euros = (cents: number) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

function Chiffre({ libelle, valeur, ton, fort }: { libelle: string; valeur: number; ton?: string; fort?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.06em] font-semibold text-zinc-500 dark:text-zinc-400">{libelle}</p>
      <p className={`${fort ? 'text-[20px]' : 'text-[17px]'} font-semibold tabular-nums mt-0.5 ${ton ?? 'text-zinc-900 dark:text-zinc-100'}`}>
        {euros(valeur)}
      </p>
    </div>
  );
}
