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
