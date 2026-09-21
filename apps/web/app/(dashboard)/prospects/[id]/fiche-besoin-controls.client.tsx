'use client';

import { useState, useTransition } from 'react';
import { Loader2, Pencil, Send } from 'lucide-react';
import { FormulaireFicheBesoin } from '@/features/questionnaire/ui/formulaire-fiche-besoin.client';
import type { ReponsesFicheBesoin } from '@/features/questionnaire/fiche-besoin';
import { envoyerFicheBesoinDemande, saisirFicheBesoinDemande } from './fiche-besoin-actions';

/**
 * Les deux gestes possibles sur la fiche besoin d'une demande : l'envoyer au
 * client, ou la remplir soi-même — typiquement pendant l'appel téléphonique,
 * au moment où le besoin se dit.
 */
export function FicheBesoinControls({
  prospectId,
  reponses,
  aUneAdresse,
}: {
  prospectId: string;
  reponses: ReponsesFicheBesoin | null;
  aUneAdresse: boolean;
}) {
  const [saisie, setSaisie] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, demarrer] = useTransition();

  const envoyer = () => {
    setMessage(null);
    setErreur(null);
    demarrer(async () => {
      const r = await envoyerFicheBesoinDemande(prospectId);
      if (r.ok) setMessage(r.message);
      else setErreur(r.error);
    });
  };

  if (saisie) {
    return (
      <div className="mt-3 rounded-xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/30 p-4">
        <FormulaireFicheBesoin
          valeurs={reponses}
          enregistrer={async (r) => saisirFicheBesoinDemande(prospectId, r)}
          libelleBouton="Enregistrer la fiche besoin"
          messageSucces="Fiche besoin enregistrée."
        />
        <button
          type="button"
          onClick={() => setSaisie(false)}
          className="mt-3 text-[12px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Fermer
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={envoyer}
          disabled={envoi || !aUneAdresse}
          title={aUneAdresse ? undefined : 'Cette demande n’a pas d’adresse e-mail.'}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-orange-500 text-white text-[13px] font-medium hover:bg-orange-600 disabled:opacity-50 shadow-sm shadow-orange-600/20"
        >
          {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {reponses ? 'Renvoyer au client' : 'Envoyer la fiche besoin'}
        </button>
        <button
          type="button"
          onClick={() => setSaisie(true)}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          <Pencil className="w-4 h-4" /> {reponses ? 'Modifier' : 'Remplir moi-même'}
        </button>
      </div>
      {message && <p className="text-[12px] text-emerald-700 dark:text-emerald-400 mt-2">{message}</p>}
      {erreur && <p className="text-[12px] text-red-600 dark:text-red-400 mt-2">{erreur}</p>}
    </div>
  );
}
