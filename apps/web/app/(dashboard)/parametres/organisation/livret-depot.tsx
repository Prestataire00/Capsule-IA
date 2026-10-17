'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Check, UploadCloud } from 'lucide-react';

/** Le livret d'accueil : déposé une fois, visible dans chaque espace entreprise. */
export function LivretDepot({ depose }: { depose: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [actuel, setActuel] = useState(depose);

  const envoyer = (fichier: File) =>
    start(async () => {
      setErreur(null);
      const fd = new FormData();
      fd.set('file', fichier);
      const r = await fetch('/api/organisation/livret', { method: 'POST', body: fd });
      const corps = (await r.json().catch(() => ({ ok: false }))) as { ok: boolean; error?: string };
      if (!corps.ok) setErreur(corps.error ?? 'Le livret n’a pas pu être déposé.');
      else {
        setActuel(true);
        router.refresh();
      }
    });

  const retirer = () =>
    start(async () => {
      if (!window.confirm('Retirer le livret d’accueil de tous les espaces entreprise ?')) return;
      const r = await fetch('/api/organisation/livret', { method: 'DELETE' });
      const corps = (await r.json().catch(() => ({ ok: false }))) as { ok: boolean; error?: string };
      if (!corps.ok) setErreur(corps.error ?? 'Le livret n’a pas pu être retiré.');
      else {
        setActuel(false);
        router.refresh();
      }
    });

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl grid place-items-center text-white bg-blue-500 shadow-md shadow-blue-500/30 shrink-0">
          {actuel ? <Check className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">Livret d’accueil</h2>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            {actuel
              ? 'Déposé : chaque client le retrouve dans son espace entreprise, onglet Documents, pour le transmettre à ses salariés.'
              : 'Déposez votre livret d’accueil (PDF, 20 Mo au plus) : chaque client le retrouvera dans son espace entreprise, pour le transmettre à ses salariés.'}
          </p>
          {erreur && <p className="text-[12px] text-red-600 dark:text-red-400 mt-1">{erreur}</p>}
        </div>
        <input
          ref={input}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) envoyer(f);
          }}
        />
        {actuel && (
          <button type="button" onClick={retirer} disabled={pending} className="text-[12px] text-zinc-500 hover:text-red-600 px-2 h-8 rounded-lg disabled:opacity-50">
            Retirer
          </button>
        )}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={pending}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 h-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 shadow-sm disabled:opacity-50"
        >
          <UploadCloud className="w-3.5 h-3.5" />
          {pending ? 'Envoi…' : actuel ? 'Remplacer' : 'Déposer'}
        </button>
      </div>
    </section>
  );
}
