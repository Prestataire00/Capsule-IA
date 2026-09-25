'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Copy, Loader2, Send } from 'lucide-react';
import { sendCompanyQuestionnaire } from './actions';

/**
 * Demander son retour à l'entreprise cliente.
 *
 * L'organisme interrogeait le stagiaire, le financeur et le formateur — jamais
 * celui qui paie et qui décide de recommencer.
 *
 * Le lien s'affiche au lieu de partir par e-mail : on l'envoie depuis sa propre
 * messagerie, avec le mot qui va avec. Une relance client ne se délègue pas à
 * un envoi automatique.
 */
const ERREURS: Record<string, string> = {
  dossier_not_found: 'Dossier introuvable.',
  no_company: 'Ce dossier n’a pas d’entreprise cliente.',
  contact_not_linked: 'Cet interlocuteur n’appartient pas à l’entreprise du dossier.',
  assignment_create_failed: 'Le questionnaire n’a pas pu être créé.',
};

export function SendCompany({
  dossierId,
  contacts,
}: {
  dossierId: string;
  contacts: ReadonlyArray<{ id: string; nom: string; email: string | null }>;
}) {
  const router = useRouter();
  const [choisi, setChoisi] = useState(contacts[0]?.id ?? '');
  const [lien, setLien] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  const { execute, status } = useAction(sendCompanyQuestionnaire, {
    onSuccess: ({ data }) => {
      if (!data?.ok) {
        setErreur(ERREURS[(data as { error?: string } | undefined)?.error ?? ''] ?? 'La création a échoué.');
        return;
      }
      setErreur(null);
      setLien(data.lien);
      setMessage(
        data.sansAdresse
          ? 'Lien créé. Cet interlocuteur n’a pas d’adresse enregistrée : transmettez-le comme vous voulez.'
          : 'Lien créé — envoyez-le à votre interlocuteur.',
      );
      router.refresh();
    },
    onError: () => setErreur('La création a échoué.'),
  });

  if (contacts.length === 0) {
    return (
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
        Aucun interlocuteur enregistré chez ce client — ajoutez-en un sur la fiche de l’entreprise. C’est une
        personne qui répond, pas une société.
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
          aria-label="Interlocuteur destinataire"
          className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-300"
        >
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
              {c.email ? '' : ' — sans adresse'}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setLien(null);
            setMessage(null);
            setErreur(null);
            setCopie(false);
            execute({ dossierId, contactId: choisi });
          }}
          disabled={enCours || !choisi}
          className="h-9 px-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-50"
        >
          {enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Créer le lien
        </button>
      </div>

      {message && <p className="text-[12px] text-emerald-700 dark:text-emerald-400">{message}</p>}

      {lien && (
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-[11px] text-zinc-600 dark:text-zinc-300 break-all bg-zinc-50 dark:bg-zinc-950/40 px-2 py-1 rounded">
            {lien}
          </code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(`${window.location.origin}${lien}`);
              setCopie(true);
            }}
            className="h-7 px-2 rounded-md border border-zinc-200 dark:border-zinc-700 text-[11px] font-semibold text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <Copy className="w-3 h-3" /> {copie ? 'Copié' : 'Copier'}
          </button>
        </div>
      )}

      {erreur && (
        <p role="alert" className="text-[12px] font-semibold text-rose-600 dark:text-rose-400">
          {erreur}
        </p>
      )}
    </div>
  );
}
