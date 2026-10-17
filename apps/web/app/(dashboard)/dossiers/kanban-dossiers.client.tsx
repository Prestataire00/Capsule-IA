'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { Loader2 } from 'lucide-react';
import type { DossierStatus } from '@/features/dossier/domain/value-objects/dossier-status';
import { changeDossierStatus } from './[id]/status-actions';

type Colonne = { status: DossierStatus; libelle: string; entete: string; cartes: Array<{ id: string; carte: ReactNode }> };

/**
 * Kanban des dossiers : glisser une carte dans une colonne change son statut
 * (réunion avec Laurie, 16/10/2026 — « je vais te faire un truc où tu peux
 * glisser »). La carte bouge tout de suite ; un refus la remet à sa place.
 */
export function KanbanDossiers({ colonnes, modifiable }: { colonnes: Colonne[]; modifiable: boolean }) {
  const router = useRouter();
  const { executeAsync } = useAction(changeDossierStatus);
  const [, start] = useTransition();
  const [deplaces, setDeplaces] = useState<Record<string, DossierStatus>>({});
  const [survol, setSurvol] = useState<DossierStatus | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const statutDe = (id: string, origine: DossierStatus) => deplaces[id] ?? origine;
  const toutes = colonnes.flatMap((c) => c.cartes.map((k) => ({ ...k, origine: c.status })));

  const deposer = (id: string, vers: DossierStatus) => {
    const carte = toutes.find((k) => k.id === id);
    if (!carte || statutDe(id, carte.origine) === vers) return;
    setErreur(null);
    setDeplaces((d) => ({ ...d, [id]: vers }));
    setEnCours(id);
    start(async () => {
      const res = await executeAsync({ dossierId: id, to: vers });
      setEnCours(null);
      const out = res?.data;
      if (out?.ok) {
        router.refresh();
        return;
      }
      setDeplaces((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== id)));
      setErreur(
        out?.error === 'blocked'
          ? (out.message ?? 'Changement refusé.')
          : out?.error === 'forbidden'
            ? 'Votre rôle ne permet pas de changer ce statut.'
            : 'Le statut n’a pas pu être changé.',
      );
    });
  };

  return (
    <div className="space-y-2">
      {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {colonnes.map((c) => {
          const cartes = toutes.filter((k) => statutDe(k.id, k.origine) === c.status);
          return (
            <div
              key={c.status}
              className="w-72 shrink-0 flex flex-col"
              onDragOver={(e) => {
                if (!modifiable) return;
                e.preventDefault();
                setSurvol(c.status);
              }}
              onDragLeave={() => setSurvol((s) => (s === c.status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setSurvol(null);
                const id = e.dataTransfer.getData('text/dossier');
                if (id) deposer(id, c.status);
              }}
            >
              <div className={`flex items-center justify-between px-3 h-9 rounded-t-xl text-[12px] font-bold ${c.entete}`}>
                <span>{c.libelle}</span>
                <span className="tabular-nums rounded-full px-2 py-0.5 text-[12px] font-bold bg-white/70 dark:bg-zinc-900/50">{cartes.length}</span>
              </div>
              <div
                className={`flex-1 rounded-b-xl p-2 space-y-2 min-h-[80px] transition-colors ${
                  survol === c.status ? 'bg-orange-50 ring-2 ring-orange-300 dark:bg-orange-950/30 dark:ring-orange-800' : 'bg-zinc-100/60 dark:bg-zinc-950/40'
                }`}
              >
                {cartes.length === 0 ? (
                  <p className="text-[12px] text-zinc-400 dark:text-zinc-600 text-center py-4">{modifiable ? 'Déposez un dossier ici' : '—'}</p>
                ) : (
                  cartes.map((k) => (
                    <div
                      key={k.id}
                      draggable={modifiable}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/dossier', k.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      className={`relative ${modifiable ? 'cursor-grab active:cursor-grabbing' : ''} ${enCours === k.id ? 'opacity-60' : ''}`}
                    >
                      {k.carte}
                      {enCours === k.id && <Loader2 className="absolute top-2 right-2 w-4 h-4 animate-spin text-orange-500" aria-label="Enregistrement" />}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
