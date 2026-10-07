import { CheckCircle2, FileSignature, MessageSquareText, Receipt, Send } from 'lucide-react';
import type { Action } from '@/features/espace-entreprise/espace-calculs';
import { BOUTON, CARTE } from './format';

const ICONE = { signer: FileSignature, regler: Receipt, repondre: MessageSquareText, transmettre: Send } as const;
const TEINTE = {
  signer: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  regler: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  repondre: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
  transmettre: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
} as const;

/** Ce qui attend le référent : signer, régler, répondre, transmettre. */
export function VueActions({ actions }: { actions: readonly Action[] }) {
  if (actions.length === 0) {
    return (
      <div className={`${CARTE} px-5 py-10 text-center`}>
        <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" aria-hidden />
        <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Rien ne vous attend</p>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">Les documents à signer, questionnaires et factures apparaîtront ici.</p>
      </div>
    );
  }
  return (
    <ul className={`${CARTE} divide-y divide-zinc-100 dark:divide-zinc-800`}>
      {actions.map((a) => {
        const Icone = ICONE[a.nature];
        return (
          <li key={a.cle} className="px-5 py-4 flex items-start gap-3 flex-wrap">
            <span className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${TEINTE[a.nature]}`}>
              <Icone className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 flex-wrap">
                <span className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">{a.titre}</span>
                {a.urgent && (
                  <span className="inline-flex items-center h-5 px-1.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    À faire en priorité
                  </span>
                )}
              </span>
              <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">{a.detail}</span>
            </span>
            {a.lien && a.libelleLien && (
              <a href={a.lien} className={`${BOUTON} shrink-0`}>
                {a.libelleLien}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
