// ARCHETYPE: shared
// Repère visuel du financement : la même pastille dans la bannière d'un
// dossier et dans la liste, pour qu'un coup d'œil suffise.
import { Landmark } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { EtatFinancement } from './prise-en-charge';

const euros = (cents: number) => (cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

type Rendu = { texte: string; classe: string; titre: string };

/**
 * Ce qu'il faut savoir en une ligne. L'ordre des cas est celui de l'urgence :
 * une réponse qu'on attend prime sur un reste à payer connu, parce que c'est
 * elle qui bloque la facturation.
 */
export function rendreFinancement(e: EtatFinancement): Rendu {
  if (e.sansFinanceur) {
    return {
      texte: 'Sans financeur',
      classe: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800/70 dark:text-zinc-400',
      titre: 'Aucun financeur rattaché : le client règle la totalité.',
    };
  }
  if (e.enAttenteDeReponse) {
    return {
      texte: `En attente ${euros(e.enAttenteCents)}`,
      classe: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
      titre: `Réponse d’un financeur attendue. Reste à payer aujourd’hui : ${euros(e.resteAPayerCents)}.`,
    };
  }
  if (e.resteAPayerCents === 0) {
    return {
      texte: 'Pris en charge',
      classe: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
      titre: 'Financement intégralement accordé.',
    };
  }
  if (e.acquisCents === 0) {
    return {
      texte: `Reste ${euros(e.resteAPayerCents)}`,
      classe: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
      titre: 'Aucune prise en charge : tout est à la charge du client.',
    };
  }
  return {
    texte: `Reste ${euros(e.resteAPayerCents)}`,
    classe: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
    titre: `Pris en charge ${euros(e.acquisCents)} — reste ${euros(e.resteAPayerCents)} à la charge du client.`,
  };
}

export function PastilleFinancement({ etat, className }: { etat: EtatFinancement; className?: string }) {
  const r = rendreFinancement(etat);
  return (
    <span
      title={r.titre}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap tabular-nums',
        r.classe,
        className,
      )}
    >
      <Landmark className="w-3 h-3 shrink-0" aria-hidden />
      {r.texte}
    </span>
  );
}

export type Part = { qui: 'Financeur' | 'Entreprise'; montant: string; detail: string; classe: string };

/**
 * Qui paie quoi, en deux cases (réunion avec Laurie, 16/10/2026) : « Reste
 * 1 800 € » ne disait pas que c'est l'entreprise qui les doit, ni que l'OPCO
 * en accordait 8 000. Pur.
 */
export function partsFinancement(e: EtatFinancement): Part[] {
  if (e.sansFinanceur) {
    return [{ qui: 'Entreprise', montant: euros(e.resteAPayerCents), detail: 'règle la totalité', classe: 'bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300' }];
  }
  const financeur: Part = e.enAttenteDeReponse
    ? {
        qui: 'Financeur',
        montant: euros(e.enAttenteCents + e.acquisCents),
        detail: e.acquisCents > 0 ? `dont ${euros(e.acquisCents)} accordés, le reste en attente` : 'en attente de réponse',
        classe: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
      }
    : e.acquisCents > 0
      ? { qui: 'Financeur', montant: euros(e.acquisCents), detail: 'accordés', classe: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' }
      : { qui: 'Financeur', montant: euros(e.refuseCents), detail: 'refusés', classe: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300' };
  const entreprise: Part = {
    qui: 'Entreprise',
    montant: euros(e.resteAPayerCents),
    detail: e.resteAPayerCents === 0 ? 'rien à sa charge' : e.enAttenteDeReponse ? 'à sa charge aujourd’hui' : 'reste à sa charge',
    classe: 'bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
  };
  return [financeur, entreprise];
}

export function PartsFinancement({ etat, className }: { etat: EtatFinancement; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {partsFinancement(etat).map((p) => (
        <span key={p.qui} className={cn('inline-flex flex-col rounded-lg px-2 py-1 leading-tight', p.classe)}>
          <span className="text-[11px] font-medium opacity-80">{p.qui}</span>
          <span className="text-[13px] font-semibold tabular-nums">{p.montant}</span>
          <span className="text-[11px]">{p.detail}</span>
        </span>
      ))}
    </div>
  );
}
