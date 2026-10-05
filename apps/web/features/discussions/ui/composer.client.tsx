'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AtSign, Loader2, Send } from 'lucide-react';
import { messageEquipeSchema } from '../discussion.schema';
import { mentionsDans, type Participant } from '../mentions';

export type MembreChip = Participant & { readonly role: 'formateur' | 'equipe' };

/**
 * Écrire à l'équipe du dossier. On mentionne en cliquant sur un nom (ou en
 * tapant @Nom) : seules les personnes mentionnées sont prévenues.
 */
export function ComposerEquipe({
  dossierId,
  membres,
  envoyer,
}: {
  dossierId: string;
  membres: readonly MembreChip[];
  envoyer: (input: { dossierId: string; body: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const zone = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const mentionnes = new Set(mentionsDans(body, membres));

  const mentionner = (m: MembreChip) => {
    const el = zone.current;
    const insert = `@${m.nom} `;
    const pos = el?.selectionStart ?? body.length;
    const avant = body.slice(0, pos);
    const espace = avant.length > 0 && !/\s$/.test(avant) ? ' ' : '';
    const suivant = `${avant}${espace}${insert}${body.slice(pos)}`;
    setBody(suivant);
    requestAnimationFrame(() => {
      el?.focus();
      const curseur = avant.length + espace.length + insert.length;
      el?.setSelectionRange(curseur, curseur);
    });
  };

  const soumettre = () =>
    start(async () => {
      setErreur(null);
      const p = messageEquipeSchema.safeParse({ dossierId, body });
      if (!p.success) return setErreur(p.error.issues[0]?.message ?? 'Message invalide.');
      if (mentionnes.size === 0) return setErreur('Mentionnez au moins une personne : cliquez sur son nom.');
      const r = await envoyer(p.data);
      if (!r.ok) return setErreur(r.error);
      setBody('');
      router.refresh();
    });

  const [choix, setChoix] = useState(false);

  return (
    <div className="space-y-2">
      <label htmlFor={`message-${dossierId}`} className="sr-only">
        Message
      </label>
      <textarea
        id={`message-${dossierId}`}
        ref={zone}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) soumettre();
        }}
        rows={3}
        maxLength={4000}
        placeholder="Écrire un message · @ pour mentionner quelqu’un"
        className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3.5 py-2.5 text-[14px] resize-y focus:outline-none focus:ring-2 focus:ring-orange-500/30"
      />
      {choix && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Personnes à mentionner">
          {membres.map((m) => (
            <button
              key={m.userId}
              type="button"
              onClick={() => mentionner(m)}
              aria-pressed={mentionnes.has(m.userId)}
              className={`h-7 px-2.5 rounded-full text-[12px] transition ${
                mentionnes.has(m.userId)
                  ? 'bg-rose-500 text-white'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70'
              }`}
            >
              {m.nom}
              {m.role === 'formateur' && <span className="opacity-70"> · formateur</span>}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setChoix((v) => !v)}
          aria-expanded={choix}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          <AtSign className="w-3.5 h-3.5" /> Mentionner
        </button>
        <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
          {mentionnes.size > 0
            ? `${mentionnes.size} personne${mentionnes.size > 1 ? 's' : ''} prévenue${mentionnes.size > 1 ? 's' : ''}`
            : 'Ctrl + Entrée pour envoyer. Seules les personnes mentionnées sont prévenues.'}
          {erreur && <span className="text-red-600 dark:text-red-400"> · {erreur}</span>}
        </span>
        <button
          type="button"
          onClick={soumettre}
          disabled={pending || body.trim() === ''}
          className="ml-auto h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Envoyer
        </button>
      </div>
    </div>
  );
}
