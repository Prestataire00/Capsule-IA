'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus } from 'lucide-react';
import { ajoutJourJSchema } from '../ajout-jour-j.schema';
import { ajouterStagiaireJourJ } from '../ajout-jour-j';

/** Ajouter un stagiaire présent qui n'est pas sur la liste : il signe aussitôt. */
export function AjoutJourJ({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, start] = useTransition();

  const ajouter = () =>
    start(async () => {
      setMessage(null);
      const saisie = ajoutJourJSchema.safeParse({ sessionId, prenom, nom, email });
      if (!saisie.success) return setMessage({ ok: false, texte: saisie.error.issues[0]?.message ?? 'Saisie invalide.' });
      const r = await ajouterStagiaireJourJ(saisie.data);
      if (!r.ok) return setMessage({ ok: false, texte: r.error });
      setMessage({ ok: true, texte: r.message });
      setPrenom('');
      setNom('');
      setEmail('');
      router.refresh();
    });

  const champ =
    'h-9 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] min-w-0';

  if (!ouvert) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setOuvert(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          <UserPlus className="w-4 h-4" /> Ajouter un stagiaire présent
        </button>
        {message?.ok && <span className="text-[12px] text-emerald-600 dark:text-emerald-400">{message.texte}</span>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm space-y-3">
      <p className="text-[13px] text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
        <UserPlus className="w-4 h-4 text-rose-600 dark:text-rose-400" /> Stagiaire présent, absent de la liste
      </p>
      <div className="grid sm:grid-cols-3 gap-2">
        <input value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Prénom" aria-label="Prénom" className={champ} />
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" aria-label="Nom" className={champ} />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail (facultatif)"
          aria-label="E-mail"
          inputMode="email"
          className={champ}
        />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={ajouter}
          disabled={pending}
          className="h-9 px-4 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Ajouter à la feuille
        </button>
        <button type="button" onClick={() => setOuvert(false)} className="h-9 px-3 text-[13px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          Fermer
        </button>
        {message && (
          <span className={`text-[12px] ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {message.texte}
          </span>
        )}
      </div>
    </div>
  );
}
