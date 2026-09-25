'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Loader2, Send } from 'lucide-react';
import { sendTrainerQuestionnaire } from './actions';

/**
 * Demander son retour à un formateur du dossier, sans attendre la fin.
 *
 * Le questionnaire partait déjà tout seul le lendemain d'un dossier terminé.
 * C'était le seul moment possible : un dossier clos sans que l'automatisation
 * parte, une session qui s'est mal passée, un client qui s'interroge — rien ne
 * permettait de le demander.
 */
const ERREURS: Record<string, string> = {
  dossier_not_found: 'Dossier introuvable.',
  trainer_not_linked: 'Ce formateur n’est pas rattaché au dossier.',
  trainer_not_found: 'Formateur introuvable.',
  assignment_create_failed: 'Le questionnaire n’a pas pu être créé.',
};

export function SendTrainer({
  dossierId,
  formateurs,
}: {
  dossierId: string;
  formateurs: ReadonlyArray<{ id: string; nom: string; email: string | null }>;
}) {
  const router = useRouter();
  const [choisi, setChoisi] = useState(formateurs[0]?.id ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [lien, setLien] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const { execute, status } = useAction(sendTrainerQuestionnaire, {
    onSuccess: ({ data }) => {
      if (!data?.ok) {
        setErreur(ERREURS[(data as { error?: string } | undefined)?.error ?? ''] ?? 'L’envoi a échoué.');
        return;
      }
      setErreur(null);
      setLien(data.lien);
      setMessage(
        data.envoye
          ? 'Questionnaire envoyé au formateur.'
          : 'Questionnaire prêt — ce formateur n’a pas d’adresse, transmettez-lui le lien.',
      );
      router.refresh();
    },
    onError: () => setErreur('L’envoi a échoué.'),
  });

  if (formateurs.length === 0) {
    return (
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
        Aucun formateur sur ce dossier : désignez-en un pour lui demander son retour.
      </p>
    );
  }

  const enCours = status === 'executing';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={choisi}
          onChange={(e) => setChoisi(e.target.value)}
          aria-label="Formateur destinataire"
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-300"
        >
          {formateurs.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nom}
              {f.email ? '' : ' — sans adresse'}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setLien(null);
            setErreur(null);
            execute({ dossierId, trainerId: choisi });
          }}
          disabled={enCours || !choisi}
          className="h-9 px-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-50"
        >
          {enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Demander son retour
        </button>
      </div>

      {message && <p className="text-[12px] text-emerald-700 dark:text-emerald-400">{message}</p>}
      {lien && (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 break-all">
          Lien&nbsp;: <span className="tabular-nums">{lien}</span>
        </p>
      )}
      {erreur && (
        <p role="alert" className="text-[12px] font-semibold text-rose-600 dark:text-rose-400">
          {erreur}
        </p>
      )}
    </div>
  );
}
