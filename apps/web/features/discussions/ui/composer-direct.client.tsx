'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, Paperclip, Send, X } from 'lucide-react';
import { messageDirectSchema } from '../discussion.schema';

/** Écrire dans une conversation directe : tous les participants sont prévenus. */
export function ComposerDirect({
  conversationId,
  envoyer,
  initial = '',
  fichierVers,
}: {
  conversationId: string;
  /** Texte de départ, par exemple « @Prénom Nom » du destinataire — effaçable. */
  initial?: string;
  /** Joindre un document : la route qui le reçoit, et les champs qui l'accompagnent. */
  fichierVers?: { url: string; champs: Readonly<Record<string, string>> };
  envoyer: (input: { conversationId: string; body: string }) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [body, setBody] = useState(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [fichier, setFichier] = useState<File | null>(null);
  const choix = useRef<HTMLInputElement>(null);

  const soumettre = () =>
    start(async () => {
      setErreur(null);
      if (fichier && fichierVers) {
        const fd = new FormData();
        fd.set('file', fichier);
        fd.set('body', body.trim() === initial.trim() ? '' : body);
        for (const [k, v] of Object.entries(fichierVers.champs)) fd.set(k, v);
        const res = await fetch(fichierVers.url, { method: 'POST', body: fd });
        const r = (await res.json().catch(() => ({ ok: false, error: 'Le document n’est pas parti.' }))) as { ok: boolean; error?: string };
        if (!r.ok) return setErreur(r.error ?? 'Le document n’est pas parti.');
        setFichier(null);
        setBody(initial);
        router.refresh();
        return;
      }
      const p = messageDirectSchema.safeParse({ conversationId, body });
      if (!p.success) return setErreur(p.error.issues[0]?.message ?? 'Message invalide.');
      const r = await envoyer(p.data);
      if (!r.ok) return setErreur(r.error);
      setBody(initial);
      router.refresh();
    });

  return (
    <div className="space-y-2">
      <label htmlFor={`direct-${conversationId}`} className="sr-only">
        Message
      </label>
      <textarea
        id={`direct-${conversationId}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) soumettre();
        }}
        rows={3}
        maxLength={4000}
        placeholder="Écrire un message"
        className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3.5 py-2.5 text-[14px] resize-y focus:outline-none focus:ring-2 focus:ring-orange-500/30"
      />
      <div className="flex items-center gap-2 flex-wrap">
        {fichierVers && (
          <>
            <input
              ref={choix}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx,.txt"
              onChange={(e) => setFichier(e.target.files?.[0] ?? null)}
            />
            {fichier ? (
              <span className="inline-flex items-center gap-1.5 h-8 pl-2 pr-1 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 text-[12px] max-w-[240px]">
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{fichier.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setFichier(null);
                    if (choix.current) choix.current.value = '';
                  }}
                  aria-label="Retirer le document"
                  className="w-6 h-6 grid place-items-center rounded hover:bg-blue-100 dark:hover:bg-blue-900/50"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => choix.current?.click()}
                className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[12px] text-zinc-600 dark:text-zinc-300 inline-flex items-center gap-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <Paperclip className="w-3.5 h-3.5" /> Joindre un document
              </button>
            )}
          </>
        )}
        <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Ctrl + Entrée pour envoyer. Chaque participant est prévenu.
          {erreur && <span className="text-red-600 dark:text-red-400"> · {erreur}</span>}
        </span>
        <button
          type="button"
          onClick={soumettre}
          disabled={pending || (!fichier && (body.trim() === '' || body.trim() === initial.trim()))}
          className="ml-auto h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Envoyer
        </button>
      </div>
    </div>
  );
}
