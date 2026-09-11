'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clock, Eye, EyeOff, Lock, Maximize2, Minimize2, Smartphone } from 'lucide-react';
import { ROTATION_MS, type LivePayload } from '@/features/attendance/room-live';

const POLL_MS = 3_000;

const heure = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(iso));

const PASTILLE: Record<string, { label: string; ton: string }> = {
  complet: { label: 'Entrée + sortie', ton: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  entree_seule: { label: 'Présent', ton: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
  a_signer: { label: 'En attente', ton: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400' },
  absent: { label: 'Absent', ton: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
  excuse: { label: 'Excusé', ton: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300' },
};

/**
 * Écran du formateur, à projeter : QR code qui change toutes les dix secondes,
 * compteur et liste des participants mis à jour en continu. Les noms peuvent
 * être masqués quand l'écran est visible de toute la salle.
 */
export function RoomProjector({ sheetId, title, halfDayLabel }: { sheetId: string; title: string; halfDayLabel: string }) {
  const [data, setData] = useState<LivePayload | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [noms, setNoms] = useState(true);
  const [pleinEcran, setPleinEcran] = useState(false);
  const [reste, setReste] = useState(1);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const charger = useCallback(async () => {
    try {
      const res = await fetch(`/api/attendance/${sheetId}/live`, { cache: 'no-store' });
      if (res.status === 401) return setErreur('Votre session a expiré : reconnectez-vous pour reprendre la projection.');
      if (!res.ok) return setErreur('Feuille introuvable ou accès refusé.');
      setErreur(null);
      setData((await res.json()) as LivePayload);
    } catch {
      setErreur('Connexion perdue — nouvelle tentative…');
    }
  }, [sheetId]);

  // Rechargement régulier, et juste après chaque changement de code.
  useEffect(() => {
    let actif = true;
    const boucle = async () => {
      if (!document.hidden) await charger();
      if (actif) minuteur.current = setTimeout(boucle, POLL_MS);
    };
    void boucle();
    return () => {
      actif = false;
      if (minuteur.current) clearTimeout(minuteur.current);
    };
  }, [charger]);

  useEffect(() => {
    if (!data?.rotatesAt) return;
    const t = setTimeout(() => void charger(), Math.max(0, data.rotatesAt - Date.now()) + 150);
    return () => clearTimeout(t);
  }, [data?.rotatesAt, charger]);

  // Barre de décompte avant le prochain code.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (data?.rotatesAt) setReste(Math.min(1, Math.max(0, (data.rotatesAt - Date.now()) / ROTATION_MS)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data?.rotatesAt]);

  useEffect(() => {
    const maj = () => setPleinEcran(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', maj);
    return () => document.removeEventListener('fullscreenchange', maj);
  }, []);

  const basculerPleinEcran = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  const apprenants = data?.participants.filter((p) => p.kind === 'learner') ?? [];
  const formateurs = data?.participants.filter((p) => p.kind === 'trainer') ?? [];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 lg:px-10 py-4 flex items-center justify-between gap-4 border-b border-zinc-200/60 dark:border-zinc-800">
        <div className="min-w-0">
          <p className="text-[12px] uppercase tracking-wider text-zinc-500">Émargement · {halfDayLabel}</p>
          <h1 className="text-[20px] lg:text-[24px] font-semibold tracking-tight truncate">{title}</h1>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => setNoms((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            aria-pressed={!noms}
          >
            {noms ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {noms ? 'Masquer les noms' : 'Afficher les noms'}
          </button>
          <button
            type="button"
            onClick={basculerPleinEcran}
            className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
          >
            {pleinEcran ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            {pleinEcran ? 'Quitter le plein écran' : 'Plein écran'}
          </button>
        </div>
      </header>

      {erreur && (
        <p role="alert" className="mx-6 lg:mx-10 mt-4 text-[13px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
          {erreur}
        </p>
      )}

      <main className="flex-1 grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-8 px-6 lg:px-10 py-8">
        <section className="flex flex-col items-center justify-center gap-5" aria-label="QR code d’émargement">
          {data?.finalized ? (
            <div className="text-center space-y-3">
              <Lock className="w-12 h-12 mx-auto text-zinc-400" />
              <p className="text-[20px] font-semibold">Feuille clôturée</p>
              <p className="text-[13px] text-zinc-500">Cette demi-journée ne peut plus être signée.</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl p-4 shadow-lg ring-1 ring-zinc-200 dark:ring-zinc-700">
                {data?.qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.qr} alt="QR code d’émargement, renouvelé toutes les dix secondes" className="w-[min(70vw,460px)] h-auto aspect-square [image-rendering:pixelated]" />
                ) : (
                  <div className="w-[min(70vw,460px)] aspect-square animate-pulse bg-zinc-100 rounded-xl" />
                )}
                <div className="mt-3 h-1.5 rounded-full bg-zinc-100 overflow-hidden" aria-hidden>
                  <div className="h-full bg-orange-500 motion-safe:transition-[width] motion-safe:duration-100" style={{ width: `${reste * 100}%` }} />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-[20px] lg:text-[24px] font-semibold tracking-tight inline-flex items-center gap-2">
                  <Smartphone className="w-6 h-6 text-orange-500" aria-hidden />
                  Scannez avec l’appareil photo de votre téléphone
                </p>
                <p className="text-[15px] text-zinc-500">
                  Le code change toutes les dix secondes. Pas de téléphone ? Signalez-vous au formateur.
                </p>
              </div>
            </>
          )}
        </section>

        <section className="flex flex-col gap-4 min-h-0" aria-label="Présences en direct">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[12px] uppercase tracking-wider text-zinc-500">Présents</p>
              <p className="text-[48px] leading-none font-semibold tabular-nums">
                {data?.entered ?? '–'}
                <span className="text-[24px] text-zinc-400"> / {data?.expected ?? '–'}</span>
              </p>
            </div>
            {data && (
              <p className="text-[13px] text-zinc-500 inline-flex items-center gap-1.5 tabular-nums">
                <Clock className="w-4 h-4" aria-hidden />
                {heure(data.windowStart)}–{heure(data.windowEnd)} · {data.exited} sortie{data.exited > 1 ? 's' : ''} signée{data.exited > 1 ? 's' : ''}
              </p>
            )}
          </div>

          {data && data.expected > 0 && (
            <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden" aria-hidden>
              <div className="h-full bg-emerald-500 motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${(data.entered / data.expected) * 100}%` }} />
            </div>
          )}

          {noms ? (
            <ul className="grid sm:grid-cols-2 gap-2 overflow-y-auto pr-1" aria-live="polite">
              {[...formateurs, ...apprenants].map((p) => {
                const pastille = PASTILLE[p.state] ?? PASTILLE.a_signer!;
                const signe = p.state === 'complet' || p.state === 'entree_seule';
                return (
                  <li
                    key={p.key}
                    className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border ${
                      signe ? 'border-emerald-200 dark:border-emerald-900/60' : 'border-zinc-200/70 dark:border-zinc-800'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0 text-[15px]">
                      {signe ? <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden /> : <span className="w-4 h-4 flex-shrink-0 rounded-full border-2 border-zinc-300 dark:border-zinc-600" aria-hidden />}
                      <span className="truncate">{p.name}</span>
                      {p.kind === 'trainer' && <span className="text-[11px] text-blue-600 dark:text-blue-400">formateur</span>}
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full flex-shrink-0 ${pastille.ton}`}>{pastille.label}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[13px] text-zinc-500">Noms masqués pendant la projection.</p>
          )}
        </section>
      </main>
    </div>
  );
}
