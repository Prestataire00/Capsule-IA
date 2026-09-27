'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Send } from 'lucide-react';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { INTERLOCUTEURS, type Interlocuteur } from '@/features/questionnaire/cartographie';
import { MOMENTS, cleMoment, libelleMoment, lireCleMoment, jourParis } from '@/features/questionnaire/programmation-seance';
import { envoyerQuestionnaireMaintenant, programmerQuestionnaire } from './actions';

export type LigneQuestionnaire = {
  templateId: string;
  titre: string;
  interlocuteur: Interlocuteur;
  etape: string;
  coche: boolean;
  moment: string;
  jourEnvoi: string;
  envoyeLe: string | null;
  bilan: string | null;
  suivi: { total: number; repondu: number } | null;
};

const dateCourte = (jour: string) => {
  const [y, m, d] = jour.split('-');
  return `${d}/${m}/${y}`;
};
const dateHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function Ligne({ sessionId, l, gerer }: { sessionId: string; l: LigneQuestionnaire; gerer: boolean }) {
  const router = useRouter();
  const [coche, setCoche] = useState(l.coche);
  const [moment, setMoment] = useState(l.moment);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, start] = useTransition();
  const [envoi, startEnvoi] = useTransition();

  const enregistrer = (c: boolean, m: string) => {
    const avant = { coche, moment };
    setCoche(c);
    setMoment(m);
    setMessage(null);
    start(async () => {
      const r = await programmerQuestionnaire({ sessionId, templateId: l.templateId, coche: c, moment: m });
      if (!r.ok) {
        setCoche(avant.coche);
        setMoment(avant.moment);
        setMessage({ ok: false, texte: r.error });
      } else router.refresh();
    });
  };

  const envoyer = () => {
    if (!confirm(`Envoyer « ${l.titre} » maintenant ?`)) return;
    setMessage(null);
    startEnvoi(async () => {
      const r = await envoyerQuestionnaireMaintenant({ sessionId, templateId: l.templateId, moment });
      setMessage(r.ok ? { ok: true, texte: r.message ?? 'Envoyé.' } : { ok: false, texte: r.error });
      if (r.ok) {
        setCoche(true);
        router.refresh();
      }
    });
  };

  const aujourdhui = jourParis(new Date());
  const m = lireCleMoment(moment);
  const statut = l.envoyeLe
    ? `Envoyé le ${dateHeure.format(new Date(l.envoyeLe))}`
    : !coche
      ? null
      : l.jourEnvoi <= aujourdhui
        ? 'Part au prochain passage (aujourd’hui)'
        : `Prévu le ${dateCourte(l.jourEnvoi)}`;

  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${
        coche
          ? 'border-orange-200 bg-orange-50/50 dark:border-orange-900/50 dark:bg-orange-950/20'
          : 'border-zinc-200/70 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/40'
      }`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={coche}
        aria-label={`Envoyer « ${l.titre} »`}
        disabled={!gerer || pending}
        onClick={() => enregistrer(!coche, moment)}
        className={`w-5 h-5 rounded-md grid place-items-center shrink-0 border transition ${
          coche ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-600'
        } disabled:opacity-60`}
      >
        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : coche ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : null}
      </button>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{l.titre}</p>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
          {[statut, l.bilan, l.suivi ? `${l.suivi.repondu}/${l.suivi.total} répondu${l.suivi.repondu > 1 ? 's' : ''}` : null]
            .filter(Boolean)
            .join(' · ') || 'Non envoyé'}
        </p>
        {message && (
          <p role={message.ok ? 'status' : 'alert'} className={`text-[12px] mt-0.5 ${message.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {message.texte}
          </p>
        )}
      </div>

      {gerer ? (
        <select
          value={moment}
          disabled={pending}
          onChange={(e) => enregistrer(coche, e.target.value)}
          aria-label="Moment d’envoi"
          className="text-[12px] tabular-nums px-2 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        >
          {!MOMENTS.some((x) => cleMoment(x) === moment) && m && <option value={moment}>{libelleMoment(m)}</option>}
          {MOMENTS.map((x) => (
            <option key={cleMoment(x)} value={cleMoment(x)}>
              {libelleMoment(x)}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-[12px] text-zinc-500 tabular-nums">{m ? libelleMoment(m) : ''}</span>
      )}

      {gerer && (
        <button
          type="button"
          onClick={envoyer}
          disabled={envoi}
          title={l.envoyeLe ? 'Renvoyer — seuls ceux qui ne l’ont pas encore reçu le recevront' : 'Envoyer maintenant'}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 disabled:opacity-50"
        >
          {envoi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{l.envoyeLe ? 'Renvoyer' : 'Envoyer'}</span>
        </button>
      )}
    </li>
  );
}

export function QuestionnairesSeance({ sessionId, lignes, gerer }: { sessionId: string; lignes: LigneQuestionnaire[]; gerer: boolean }) {
  if (lignes.length === 0) {
    return <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Aucun questionnaire actif. Créez-en un pour le cocher ici.</p>;
  }
  return (
    <div className="space-y-5">
      {INTERLOCUTEURS.map((i) => {
        const duGroupe = lignes.filter((l) => l.interlocuteur === i.cle);
        if (duGroupe.length === 0) return null;
        const coches = duGroupe.filter((l) => l.coche).length;
        return (
          <section key={i.cle} className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-4 space-y-2">
            <div className="flex items-center justify-between gap-3 px-1 pb-1">
              <h2 className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
                <span className={`inline-flex items-center h-6 px-2 rounded-full text-[12px] font-medium ${ACCENTS[i.accent].soft}`}>{i.label}</span>
              </h2>
              <span className="text-[12px] text-zinc-500 tabular-nums">
                {coches}/{duGroupe.length} coché{coches > 1 ? 's' : ''}
              </span>
            </div>
            <ul className="space-y-2">
              {duGroupe.map((l) => (
                <Ligne key={l.templateId} sessionId={sessionId} l={l} gerer={gerer} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
