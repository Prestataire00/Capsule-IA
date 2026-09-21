'use client';

import { useState, useTransition } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { CHAMPS_FICHE_BESOIN, type ReponsesFicheBesoin } from '@/features/questionnaire/fiche-besoin';

/**
 * Le formulaire de fiche besoin, un seul pour deux usages : le client qui
 * répond depuis son lien, et l'organisme qui le remplit au téléphone. Deux
 * formulaires séparés finiraient par poser deux questions différentes.
 */
export function FormulaireFicheBesoin({
  valeurs,
  enregistrer,
  libelleBouton = 'Envoyer mes réponses',
  messageSucces = 'Merci, vos réponses sont enregistrées.',
}: {
  valeurs?: ReponsesFicheBesoin | null;
  enregistrer: (reponses: ReponsesFicheBesoin) => Promise<{ ok: true } | { ok: false; error: string }>;
  libelleBouton?: string;
  messageSucces?: string;
}) {
  const [reponses, setReponses] = useState<ReponsesFicheBesoin>(valeurs ?? {});
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState(false);
  const [envoi, demarrer] = useTransition();

  const champ =
    'w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-orange-400/40';

  if (fait) {
    return (
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 p-5 text-center">
        <Check className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
        <p className="text-[15px] font-medium text-emerald-800 dark:text-emerald-200">{messageSucces}</p>
      </div>
    );
  }

  const soumettre = () => {
    setErreur(null);
    if (String(reponses.objectives ?? '').trim() === '') {
      setErreur('Merci d’indiquer au moins vos objectifs.');
      return;
    }
    demarrer(async () => {
      const r = await enregistrer(reponses);
      if (r.ok) setFait(true);
      else setErreur(r.error);
    });
  };

  return (
    <div className="space-y-5">
      {CHAMPS_FICHE_BESOIN.map((c) => (
        <div key={c.cle}>
          <label className="block text-[13px] font-medium text-zinc-800 dark:text-zinc-200 mb-1.5">
            {c.label}
            {c.requis && <span className="text-orange-600"> *</span>}
          </label>
          {c.type === 'rating' ? (
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setReponses((v) => ({ ...v, [c.cle]: n }))}
                  className={`w-10 h-10 rounded-lg border text-[14px] font-semibold tabular-nums transition ${
                    Number(reponses[c.cle]) === n
                      ? 'bg-orange-500 text-white border-orange-500'
                      : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-orange-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              rows={3}
              maxLength={2000}
              value={String(reponses[c.cle] ?? '')}
              onChange={(e) => setReponses((v) => ({ ...v, [c.cle]: e.target.value }))}
              className={champ}
            />
          )}
        </div>
      ))}

      {erreur && <p className="text-[13px] text-red-600 dark:text-red-400">{erreur}</p>}

      <button
        type="button"
        onClick={soumettre}
        disabled={envoi}
        className="inline-flex items-center gap-2 h-11 px-5 rounded-lg bg-orange-500 text-white text-[14px] font-semibold hover:bg-orange-600 disabled:opacity-60 shadow-sm shadow-orange-600/20"
      >
        {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        {libelleBouton}
      </button>
    </div>
  );
}
