'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { StatusPill } from '@/shared/ui/status-pill';
import { STATUTS_FINANCEMENT, estDecide, libelleStatut, tonStatut } from '@/features/funders/prise-en-charge';
import { enregistrerDecisionFinanceur } from './actions';

export type LigneAffichee = {
  id: string;
  funderName: string;
  amountCents: number;
  grantedCents: number | null;
  status: string;
  decisionNote: string | null;
  externalFileNumber: string | null;
};

const euros = (cents: number) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

const champ =
  'w-full h-9 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-400/40';

export function PriseEnCharge({
  dossierId,
  lignes,
  gerer,
}: {
  dossierId: string;
  lignes: LigneAffichee[];
  gerer: boolean;
}) {
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
      {lignes.map((l) => (
        <LigneFinanceur key={l.id} dossierId={dossierId} ligne={l} gerer={gerer} />
      ))}
    </ul>
  );
}

function LigneFinanceur({ dossierId, ligne, gerer }: { dossierId: string; ligne: LigneAffichee; gerer: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [statut, setStatut] = useState(ligne.status);
  const [montant, setMontant] = useState(
    ligne.grantedCents != null ? String(ligne.grantedCents / 100) : String(ligne.amountCents / 100),
  );
  const [note, setNote] = useState(ligne.decisionNote ?? '');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, demarrer] = useTransition();

  const decide = estDecide(statut);
  const aide = STATUTS_FINANCEMENT.find((s) => s.valeur === statut)?.aide;

  const enregistrer = () => {
    setErreur(null);
    const brut = montant.replace(',', '.').trim();
    const cents = decide && brut !== '' ? Math.round(Number(brut) * 100) : null;
    if (decide && brut !== '' && !Number.isFinite(cents)) {
      setErreur('Montant illisible.');
      return;
    }
    demarrer(async () => {
      const r = await enregistrerDecisionFinanceur({
        dossierId,
        ligneId: ligne.id,
        statut,
        montantAccordeCents: cents,
        note,
      });
      if (r.ok) setOuvert(false);
      else setErreur(r.error);
    });
  };

  const accorde = ligne.grantedCents ?? (ligne.status === 'approved' || ligne.status === 'paid' ? ligne.amountCents : null);

  return (
    <li className="py-3.5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">{ligne.funderName}</p>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums flex flex-wrap gap-x-3">
            <span>Demandé {euros(ligne.amountCents)}</span>
            {accorde != null && (
              <span className={accorde < ligne.amountCents ? 'text-amber-700 dark:text-amber-400' : undefined}>
                Accordé {euros(accorde)}
              </span>
            )}
            {ligne.externalFileNumber && <span>Dossier n° {ligne.externalFileNumber}</span>}
          </p>
          {ligne.decisionNote && !ouvert && (
            <p className="text-[12px] text-zinc-600 dark:text-zinc-400 mt-1 italic">{ligne.decisionNote}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusPill tone={tonStatut(ligne.status)}>{libelleStatut(ligne.status)}</StatusPill>
          {gerer && !ouvert && (
            <button
              type="button"
              onClick={() => setOuvert(true)}
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <Pencil className="w-3.5 h-3.5" /> Modifier
            </button>
          )}
        </div>
      </div>

      {ouvert && (
        <div className="mt-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/30 p-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
              Statut
              <select value={statut} onChange={(e) => setStatut(e.target.value)} className={`${champ} mt-1`}>
                {STATUTS_FINANCEMENT.map((s) => (
                  <option key={s.valeur} value={s.valeur}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
              Montant accordé
              <input
                type="text"
                inputMode="decimal"
                value={decide ? montant : ''}
                onChange={(e) => setMontant(e.target.value)}
                disabled={!decide}
                placeholder={decide ? String(ligne.amountCents / 100) : 'après décision'}
                className={`${champ} mt-1 tabular-nums disabled:opacity-50`}
              />
            </label>
          </div>
          {aide && <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{aide}</p>}
          <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block">
            Motif du refus, ou numéro d’accord
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              placeholder="Ce qu’on relira dans six mois"
              className={`${champ} mt-1`}
            />
          </label>
          {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={enregistrer}
              disabled={envoi}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-orange-500 text-white text-[13px] font-medium hover:bg-orange-600 disabled:opacity-60 shadow-sm shadow-orange-600/20"
            >
              {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Enregistrer
            </button>
            <button
              type="button"
              onClick={() => {
                setOuvert(false);
                setErreur(null);
                setStatut(ligne.status);
              }}
              disabled={envoi}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-900"
            >
              <X className="w-4 h-4" /> Annuler
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
