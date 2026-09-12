'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, Check, AlertTriangle } from 'lucide-react';
import type { LegalKind } from '@/shared/lib/legifrance/mapping';
import { generateLegalDocDraft, validateLegalDoc } from './actions';

type Etat = { tone: 'ok' | 'warn' | 'err'; text: string } | null;

const TONES: Record<'ok' | 'warn' | 'err', string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  err: 'text-red-600 dark:text-red-400',
};

/**
 * Génération et validation d'un document juridique.
 *
 * Le bouton était un simple formulaire : le résultat de l'action était ignoré,
 * et un échec (clé IA absente, Légifrance injoignable, droits insuffisants)
 * rechargeait la page à l'identique — « ça ne fait rien ». L'issue est
 * désormais affichée, succès comme échec.
 */
export function LegalDocButtons({
  orgId,
  kind,
  hasDraft,
  isDraft,
}: {
  orgId: string;
  kind: LegalKind;
  hasDraft: boolean;
  isDraft: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [etat, setEtat] = useState<Etat>(null);

  const run = (action: () => Promise<{ ok: boolean; error?: string; warning?: string }>, okText: string) => {
    setEtat(null);
    start(async () => {
      try {
        const res = await action();
        if (!res.ok) {
          setEtat({ tone: 'err', text: res.error ?? 'Échec.' });
          return;
        }
        setEtat(res.warning ? { tone: 'warn', text: res.warning } : { tone: 'ok', text: okText });
        router.refresh();
      } catch (e) {
        setEtat({ tone: 'err', text: `Échec : ${e instanceof Error ? e.message : 'erreur inattendue'}` });
      }
    });
  };

  const Icon = etat?.tone === 'ok' ? Check : AlertTriangle;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => generateLegalDocDraft(orgId, kind),
              hasDraft ? 'Nouveau brouillon généré.' : 'Brouillon généré — relisez-le avant validation.',
            )
          }
          className="h-8 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[12px] font-semibold px-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 transition inline-flex items-center gap-1.5"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {hasDraft ? 'Régénérer (IA)' : 'Générer (IA)'}
        </button>

        {isDraft && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => validateLegalDoc(orgId, kind), 'Document validé — PDF généré.')}
            className="h-8 bg-orange-500 text-white text-[12px] font-semibold px-3 rounded-lg shadow-sm shadow-orange-600/30 hover:bg-orange-600 disabled:opacity-50 transition"
          >
            Valider
          </button>
        )}
      </div>

      {pending && (
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Rédaction en cours — comptez une à deux minutes pour un document complet.
        </p>
      )}
      {etat && !pending && (
        <p className={`text-[12px] inline-flex items-start gap-1.5 ${TONES[etat.tone]}`}>
          <Icon className="w-3.5 h-3.5 mt-px shrink-0" />
          {etat.text}
        </p>
      )}
    </div>
  );
}
