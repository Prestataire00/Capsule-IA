// ARCHETYPE: command (mobile-first, écran de gestion d'une feuille)
// Justification: feuille d'émargement live — formateur voit signatures arriver en temps réel, gros boutons d'action.

'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { QrCode, MapPin, Video, Check, UserX, ArrowLeft, X } from 'lucide-react';
import Link from 'next/link';

const session = {
  id: 's-1-4',
  startsAt: '2026-09-15T09:00:00+02:00',
  endsAt: '2026-09-15T12:30:00+02:00',
  modality: 'presentiel' as const,
  location: 'Salle Lavoisier',
  formation: 'Comptabilité Niveau 2',
};

const initialParticipants = [
  { id: 'l-1', name: 'Alice Martin', signed: false, signedAt: null as string | null },
  { id: 'l-7', name: 'Gabrielle Roux', signed: false, signedAt: null as string | null },
  { id: 'l-8', name: 'Hugo Petit', signed: false, signedAt: null as string | null },
];

export default function EmargerPage() {
  const [participants, setParticipants] = useState(initialParticipants);
  const [showQr, setShowQr] = useState(false);

  const toggleSigned = (id: string) => {
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, signed: !p.signed, signedAt: p.signed ? null : new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }
          : p,
      ),
    );
  };

  const signedCount = participants.filter((p) => p.signed).length;
  const allSigned = signedCount === participants.length;

  return (
    <div className="max-w-md w-full mx-auto px-4 py-6">
      <Link
        href="/mes-sessions"
        className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 inline-flex items-center gap-1.5 transition mb-4"
      >
        <ArrowLeft className="w-3 h-3" />
        Mes sessions
      </Link>

      <header className="mb-5">
        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-1">
          {format(parseISO(session.startsAt), 'EEEE d MMMM', { locale: fr })}
        </p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{session.formation}</h1>
        <div className="flex items-center gap-3 text-[13px] text-zinc-500 dark:text-zinc-400 mt-1.5">
          <span className="font-mono">{format(parseISO(session.startsAt), 'HH:mm')} – {format(parseISO(session.endsAt), 'HH:mm')}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1.5">
            {session.modality === 'distanciel' ? <Video className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
            {session.location}
          </span>
        </div>
      </header>

      <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-2">
        Présents · <span className="font-mono">{signedCount}/{participants.length}</span>
      </p>
      <ul className="space-y-1.5 mb-6">
        {participants.map((p) => (
          <li
            key={p.id}
            className={
              p.signed
                ? 'bg-emerald-50 dark:bg-emerald-950/30 rounded-lg px-4 py-3 flex items-center gap-3'
                : 'bg-zinc-50 dark:bg-zinc-900 rounded-lg px-4 py-3 flex items-center gap-3'
            }
          >
            <span
              className={
                p.signed
                  ? 'w-7 h-7 rounded-full bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center justify-center'
                  : 'w-7 h-7 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center'
              }
            >
              {p.signed ? <Check className="w-3.5 h-3.5" /> : '·'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium truncate">{p.name}</p>
              {p.signedAt && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-0.5">signé à {p.signedAt}</p>
              )}
            </div>
            {!p.signed && (
              <button
                type="button"
                onClick={() => toggleSigned(p.id)}
                className="border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[11px] px-2.5 py-1 rounded inline-flex items-center gap-1 hover:bg-white dark:hover:bg-zinc-950 transition"
                aria-label={`Marquer ${p.name} absent`}
              >
                <UserX className="w-3 h-3" />
                Absent
              </button>
            )}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setShowQr(true)}
        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-4 py-3 flex items-center justify-center gap-2 text-[13px] font-medium hover:bg-white dark:hover:bg-zinc-950 transition mb-2"
      >
        <QrCode className="w-4 h-4" />
        Afficher le QR pour signer
      </button>

      <button
        type="button"
        disabled={!allSigned}
        className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-medium px-4 py-3 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-40 disabled:pointer-events-none"
      >
        {allSigned ? 'Finaliser la feuille' : `Finaliser (${signedCount}/${participants.length})`}
      </button>

      {showQr && (
        <div
          className="fixed inset-0 z-50 bg-zinc-900/40 dark:bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowQr(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-200/60 dark:border-zinc-800">
              <p className="text-[13px] font-medium">Faites scanner par les apprenants</p>
              <button
                type="button"
                onClick={() => setShowQr(false)}
                aria-label="Fermer"
                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="p-8 flex flex-col items-center gap-4">
              <FakeQr />
              <p className="font-mono text-[10px] text-zinc-400 break-all text-center">
                https://app.io/signer/eyJhbGc…
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Mis à jour en temps réel · {signedCount}/{participants.length} signatures
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FakeQr() {
  return (
    <div className="w-48 h-48 grid grid-cols-12 grid-rows-12 gap-px bg-zinc-200 dark:bg-zinc-800 p-2 rounded">
      {Array.from({ length: 144 }).map((_, i) => {
        const filled = ((i * 17 + 3) % 7) < 3 || i % 5 === 0;
        return (
          <span
            key={i}
            className={filled ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-white dark:bg-zinc-950'}
          />
        );
      })}
    </div>
  );
}
