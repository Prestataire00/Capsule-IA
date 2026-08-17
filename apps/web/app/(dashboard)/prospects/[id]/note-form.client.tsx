'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';
import { inputClass } from '@/shared/ui/form-field';
import { addProspectNote } from './actions';

const CHANNELS = [
  { value: 'note', label: 'Note interne' },
  { value: 'call', label: 'Appel téléphonique' },
  { value: 'email', label: 'E-mail envoyé' },
  { value: 'meeting', label: 'Rendez-vous' },
  { value: 'sms', label: 'SMS / WhatsApp' },
] as const;

type Channel = (typeof CHANNELS)[number]['value'];

/**
 * Note de suivi sur une demande : qui a contacté la personne, ce qui s'est dit,
 * ce que l'administratif doit savoir avant de reprendre le dossier.
 */
export function ProspectNoteForm({ prospectId }: { prospectId: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [channel, setChannel] = useState<Channel>('note');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (text.trim().length < 2) {
      setError('Écrivez au moins quelques mots.');
      return;
    }
    start(async () => {
      const res = await addProspectNote({ prospectId, text: text.trim(), channel });
      const out = res?.data;
      if (out?.ok) {
        setText('');
        setChannel('note');
        router.refresh();
      } else if (res?.serverError === 'unauthenticated') {
        setError('Session expirée, reconnectez-vous.');
      } else if (out?.error === 'forbidden') {
        setError("Vous n'avez pas les droits pour commenter cette demande.");
      } else {
        setError("La note n'a pas pu être enregistrée.");
      }
    });
  };

  return (
    <div className="rounded-lg border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {CHANNELS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setChannel(c.value)}
            className={
              c.value === channel
                ? 'text-[12px] px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/50 text-orange-700 dark:text-orange-300'
                : 'text-[12px] px-2.5 py-1 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 transition'
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder="Ex. : appelée le 12/03, rappeler après le 20 — elle attend l'accord de son OPCO."
        className={`${inputClass} resize-y`}
      />

      {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[13px] font-medium px-3.5 py-1.5 rounded-md shadow-sm transition"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Ajouter la note
        </button>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
          Visible par l’équipe uniquement — jamais par le prospect.
        </span>
      </div>
    </div>
  );
}
