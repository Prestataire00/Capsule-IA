'use client';

import { useState } from 'react';
import { Check, X, Clock, Send, Banknote, Pencil } from 'lucide-react';
import {
  STATUTS_FINANCEMENT,
  STATUT_LABELS,
  STATUT_AIDES,
  estDecide,
  type StatutFinancement,
} from '@/features/billing/domain/funding-status';
import { setDossierFunderDecision } from './actions';

/**
 * Où l'on en est avec un financeur, et ce qu'il accorde.
 *
 * Le montant accordé n'est demandé qu'après un accord : le réclamer plus tôt
 * ferait saisir un chiffre que personne ne connaît encore.
 */

const TONS: Record<StatutFinancement, string> = {
  pending: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  submitted: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  refused: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
  paid: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
};

const ICONES: Record<StatutFinancement, typeof Check> = {
  pending: Clock,
  submitted: Send,
  approved: Check,
  refused: X,
  paid: Banknote,
};

const dateFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });

export function DecisionFinanceur({
  dossierId,
  funderId,
  statut,
  demandeCents,
  accordeCents,
  note,
  decideLe,
  devise,
}: {
  dossierId: string;
  funderId: string;
  statut: StatutFinancement;
  demandeCents: number;
  accordeCents: number | null;
  note: string | null;
  decideLe: string | null;
  devise: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const Icone = ICONES[statut];

  if (!ouvert) {
    return (
      <span className="flex flex-wrap items-center gap-1.5 mt-1">
        <span className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-semibold ${TONS[statut]}`}>
          <Icone className="w-3 h-3" />
          {STATUT_LABELS[statut]}
        </span>
        {accordeCents !== null && statut !== 'refused' && (
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
            accordé {(accordeCents / 100).toLocaleString('fr-FR', { style: 'currency', currency: devise })}
          </span>
        )}
        {decideLe && (
          <span className="text-[11px] text-zinc-400 tabular-nums">le {dateFmt.format(new Date(decideLe))}</span>
        )}
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:underline inline-flex items-center gap-0.5"
        >
          <Pencil className="w-3 h-3" /> Décision
        </button>
        {note && <span className="block w-full text-[11px] text-zinc-500 dark:text-zinc-400">{note}</span>}
      </span>
    );
  }

  return (
    <form action={setDossierFunderDecision} className="mt-2 space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-2.5">
      <input type="hidden" name="dossierId" value={dossierId} />
      <input type="hidden" name="funderId" value={funderId} />

      <label className="block">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1">
          Où en est la prise en charge ?
        </span>
        <select
          name="status"
          defaultValue={statut}
          className="w-full h-8 px-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px]"
        >
          {STATUTS_FINANCEMENT.map((s) => (
            <option key={s} value={s}>
              {STATUT_LABELS[s]}
            </option>
          ))}
        </select>
        <span className="block text-[11px] text-zinc-400 mt-1">{STATUT_AIDES[statut]}</span>
      </label>

      <label className="block">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1">
          Montant accordé (€ HT)
        </span>
        <input
          name="grantedEuros"
          inputMode="decimal"
          defaultValue={accordeCents !== null ? (accordeCents / 100).toFixed(2).replace('.', ',') : ''}
          placeholder={`Demandé : ${(demandeCents / 100).toFixed(2).replace('.', ',')}`}
          className="w-full h-8 px-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px] tabular-nums"
        />
        <span className="block text-[11px] text-zinc-400 mt-1">
          Laissez vide si le financeur accorde la totalité. Ce qu&apos;il n&apos;accorde pas revient au reste à charge.
        </span>
      </label>

      <label className="block">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1">
          Motif du refus, ou numéro d&apos;accord
        </span>
        <input
          name="decisionNote"
          defaultValue={note ?? ''}
          maxLength={1000}
          placeholder="Ce qu’on relira dans six mois"
          className="w-full h-8 px-2 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[12px]"
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="h-8 px-3 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-semibold transition"
        >
          Enregistrer
        </button>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="h-8 px-2.5 rounded-md text-[12px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
        >
          Annuler
        </button>
        {estDecide(statut) && decideLe && (
          <span className="text-[11px] text-zinc-400 tabular-nums">
            Dernière décision le {dateFmt.format(new Date(decideLe))}
          </span>
        )}
      </div>
    </form>
  );
}
