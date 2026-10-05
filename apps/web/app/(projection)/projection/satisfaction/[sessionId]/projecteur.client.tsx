'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Smartphone, Star } from 'lucide-react';

type Etat = {
  qr: string;
  rotatesAt: number;
  attendus: number;
  repondus: number;
  participants: Array<{ nom: string; repondu: boolean }>;
};

/** QR tournant (dix secondes) et réponses qui tombent en direct. */
export function ProjecteurSatisfaction({ sessionId, titre }: { sessionId: string; titre: string }) {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const charger = useCallback(async (): Promise<number | null> => {
    try {
      const res = await fetch(`/api/satisfaction/${sessionId}/live`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const lu = (await res.json()) as Etat;
      setEtat(lu);
      setErreur(false);
      return lu.rotatesAt;
    } catch {
      setErreur(true);
      return null;
    }
  }, [sessionId]);

  useEffect(() => {
    let actif = true;
    // Recalée sur la rotation du code : le QR change pile quand il expire.
    const boucle = async () => {
      const prochaine = await charger();
      if (!actif) return;
      const attente = prochaine ? Math.max(1000, prochaine - Date.now() + 150) : 3000;
      minuteur.current = setTimeout(boucle, Math.min(attente, 10_000));
    };
    void boucle();
    return () => {
      actif = false;
      if (minuteur.current) clearTimeout(minuteur.current);
    };
  }, [charger]);

  return (
    <main className="min-h-screen bg-white text-zinc-900 flex flex-col">
      <header className="px-8 py-5 border-b border-zinc-100 flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl grid place-items-center bg-amber-100 text-amber-700">
          <Star className="w-5 h-5" />
        </span>
        <div>
          <p className="text-[13px] text-zinc-500">Questionnaire de satisfaction</p>
          <h1 className="text-[22px] font-semibold">{titre}</h1>
        </div>
        {etat && (
          <p className="ml-auto text-[28px] font-semibold tabular-nums">
            {etat.repondus}
            <span className="text-zinc-400"> / {etat.attendus}</span>
            <span className="block text-[13px] font-normal text-zinc-500 text-right">ont répondu</span>
          </p>
        )}
      </header>
      <div className="flex-1 grid lg:grid-cols-[auto_1fr] gap-10 items-center px-8 py-8">
        <div className="flex flex-col items-center gap-4">
          <div className="bg-white rounded-2xl p-4 shadow-lg ring-1 ring-zinc-200">
            {etat?.qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={etat.qr} alt="QR code du questionnaire, renouvelé toutes les dix secondes" className="w-[min(70vw,460px)] h-auto aspect-square [image-rendering:pixelated]" />
            ) : (
              <div className="w-[min(70vw,460px)] aspect-square animate-pulse bg-zinc-100 rounded-xl" />
            )}
          </div>
          <p className="text-[20px] font-semibold inline-flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-orange-500" aria-hidden /> Scannez avec votre téléphone
          </p>
          <p className="text-[15px] text-zinc-500">Deux minutes pour donner votre avis sur la formation.</p>
          {erreur && <p className="text-[13px] text-red-600">Connexion perdue, nouvel essai…</p>}
        </div>
        {etat && etat.participants.length > 0 && (
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2 content-start">
            {etat.participants.map((p, i) => (
              <li
                key={i}
                className={`flex items-center gap-2 rounded-xl px-4 py-3 text-[17px] ${p.repondu ? 'bg-emerald-50 text-emerald-800' : 'bg-zinc-50 text-zinc-500'}`}
              >
                {p.repondu ? <Check className="w-5 h-5 text-emerald-600" /> : <span className="w-5 h-5 rounded-full border-2 border-zinc-300" />}
                {p.nom}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
