'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, MailX, Pencil, Phone } from 'lucide-react';
import { coordonneesApprenantSchema } from '@/features/espace-entreprise/coordonnees.schema';
import { modifierCoordonneesApprenant } from '../echanges-actions';

const champ =
  'w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30';

/** Coordonnées d'un salarié, que l'entreprise peut corriger elle-même. */
export function CoordonneesApprenant({
  token,
  learnerId,
  email,
  telephone,
  joignable,
}: {
  token: string;
  learnerId: string;
  email: string | null;
  telephone: string | null;
  joignable: boolean;
}) {
  const router = useRouter();
  const [edition, setEdition] = useState(false);
  const [f, setF] = useState({ email: joignable ? (email ?? '') : '', telephone: telephone ?? '' });
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();

  if (!edition) {
    return (
      <div className="space-y-1">
        <p className="text-[13px] text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1.5">
          {joignable ? <Mail className="w-3.5 h-3.5" aria-hidden /> : <MailX className="w-3.5 h-3.5 text-amber-600" aria-hidden />}
          {joignable ? email : 'Pas d’adresse e-mail : il reçoit ses documents par vous.'}
        </p>
        {telephone && (
          <p className="text-[13px] text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1.5 tabular-nums">
            <Phone className="w-3.5 h-3.5" aria-hidden />
            {telephone}
          </p>
        )}
        <button
          type="button"
          onClick={() => {
            setOk(false);
            setEdition(true);
          }}
          className="flex items-center gap-1 text-[12px] text-orange-600 dark:text-orange-400 hover:underline"
        >
          <Pencil className="w-3 h-3" aria-hidden /> {joignable || telephone ? 'Corriger ses coordonnées' : 'Ajouter ses coordonnées'}
        </button>
        {ok && <p className="text-[12px] text-emerald-700 dark:text-emerald-400">Coordonnées enregistrées.</p>}
      </div>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const p = coordonneesApprenantSchema.safeParse({ learnerId, ...f });
        if (!p.success) {
          setErreur(p.error.issues[0]?.message ?? 'Saisie invalide.');
          return;
        }
        setErreur(null);
        start(async () => {
          const r = await modifierCoordonneesApprenant(token, { learnerId, ...f });
          if (!r.ok) {
            setErreur(r.error);
            return;
          }
          setEdition(false);
          setOk(true);
          router.refresh();
        });
      }}
    >
      <label className="block text-[12px] text-zinc-600 dark:text-zinc-300">
        E-mail
        <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="prenom.nom@entreprise.fr" className={`${champ} mt-1`} />
      </label>
      <label className="block text-[12px] text-zinc-600 dark:text-zinc-300">
        Téléphone
        <input type="tel" value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value })} placeholder="06 12 34 56 78" className={`${champ} mt-1 tabular-nums`} />
      </label>
      {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-orange-500 text-white text-[12px] font-medium hover:bg-orange-600 disabled:opacity-50">
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Enregistrer
        </button>
        <button type="button" onClick={() => setEdition(false)} className="text-[12px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          Annuler
        </button>
      </div>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Ses convocations, liens d’émargement et questionnaires partiront à cette adresse.</p>
    </form>
  );
}
