'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, Send } from 'lucide-react';
import { ecrireAuClient } from './ecrire-actions';

/**
 * Écrire au client depuis le dossier.
 *
 * Le bouton ouvrait `mailto:` — donc la messagerie personnelle de celui qui
 * clique. Le client recevait un message d'une adresse privée, l'échange
 * n'apparaissait nulle part, et la réponse partait dans une boîte que personne
 * d'autre ne relit. Un dossier suivi à trois n'a pas de correspondance privée.
 */
export function EcrireAuClient({
  dossierId,
  destinataires,
}: {
  dossierId: string;
  /** Les personnes connues du dossier : référent, stagiaires. */
  destinataires: ReadonlyArray<{ email: string; nom: string; role: string }>;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [a, setA] = useState(destinataires[0]?.email ?? '');
  const [objet, setObjet] = useState('');
  const [message, setMessage] = useState('');
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className="text-[13px] font-semibold px-3 h-9 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition"
      >
        <Mail className="w-3.5 h-3.5" /> Écrire au client
      </button>
    );
  }

  const champ =
    'w-full text-[13px] px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30';

  return (
    <div className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 space-y-3 max-w-xl">
      <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100">Écrire au client</p>
      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
        Le message part sous l’adresse de l’organisme, et s’inscrit dans l’historique du dossier. Les réponses
        reviennent donc à l’organisme, pas dans votre boîte personnelle.
      </p>

      <label className="block text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
        Destinataire
        {destinataires.length > 0 ? (
          <select value={a} onChange={(e) => setA(e.target.value)} className={`${champ} mt-1`}>
            {destinataires.map((d) => (
              <option key={d.email} value={d.email}>
                {d.nom} — {d.role} ({d.email})
              </option>
            ))}
          </select>
        ) : (
          <input
            type="email"
            value={a}
            onChange={(e) => setA(e.target.value)}
            placeholder="adresse@client.fr"
            className={`${champ} mt-1`}
          />
        )}
      </label>

      <label className="block text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
        Objet
        <input value={objet} onChange={(e) => setObjet(e.target.value)} maxLength={200} className={`${champ} mt-1`} />
      </label>

      <label className="block text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">
        Message
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={7}
          maxLength={5000}
          className={`${champ} mt-1 h-auto`}
        />
      </label>

      {retour && (
        <p
          role="alert"
          className={`text-[12px] font-semibold ${
            retour.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
          }`}
        >
          {retour.texte}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={enCours}
          onClick={() => {
            setRetour(null);
            demarrer(async () => {
              const r = await ecrireAuClient({ dossierId, destinataire: a, objet, message });
              setRetour({ ok: r.ok, texte: r.ok ? r.message : r.error });
              if (r.ok) {
                setObjet('');
                setMessage('');
                router.refresh();
              }
            });
          }}
          className="h-9 px-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {enCours ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Envoyer
        </button>
        <button
          type="button"
          disabled={enCours}
          onClick={() => setOuvert(false)}
          className="h-9 px-2.5 rounded-lg text-[13px] text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
