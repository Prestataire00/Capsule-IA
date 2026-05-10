// ARCHETYPE: command
// Justification: liste des feuilles d'émargement avec progress de signatures + alertes manquantes.

import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ClipboardCheck, AlertTriangle, MapPin, Video } from 'lucide-react';
import { sessionsByDossier, dossiers, formationTitle } from '@/shared/mock/data';
import { IdPill } from '@/shared/ui/id-pill';
import { ProgressBar } from '@/shared/ui/progress-bar';
import { StatCard } from '@/shared/ui/stat-card';

type Sheet = {
  id: string; sessionId: string; dossierId: string;
  startsAt: string; endsAt: string;
  modality: 'presentiel' | 'distanciel' | 'hybride' | 'afest';
  location: string | null;
  signed: number; total: number;
  status: 'planned' | 'in_progress' | 'done';
};

const sheets: Sheet[] = Object.entries(sessionsByDossier).flatMap(([did, list]) =>
  list.map((s) => ({
    id: `sheet-${s.id}`, sessionId: s.id, dossierId: did,
    startsAt: s.startsAt, endsAt: s.endsAt, modality: s.modality,
    location: s.location,
    signed: s.attendanceCount, total: s.attendanceTotal,
    status: s.status === 'cancelled' ? 'planned' : s.status as Sheet['status'],
  })),
);

export default function EmargementsPage() {
  const total = sheets.length;
  const finalized = sheets.filter((s) => s.status === 'done' && s.signed === s.total).length;
  const incomplete = sheets.filter((s) => (s.status === 'done' || s.status === 'in_progress') && s.signed < s.total).length;
  const planned = sheets.filter((s) => s.status === 'planned').length;

  return (
    <div className="max-w-7xl w-full mx-auto px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Émargements</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-1">
          Feuilles de présence par session — preuve Qualiopi indicateur 22.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Feuilles ouvertes" value={total} icon={ClipboardCheck} accent="violet" />
        <StatCard label="Finalisées" value={finalized} icon={ClipboardCheck} accent="emerald" hint={`${Math.round((finalized / Math.max(total, 1)) * 100)}% du total`} hintTone="success" />
        <StatCard label="Incomplètes" value={incomplete} icon={AlertTriangle} accent="amber" hint={incomplete > 0 ? 'à finaliser' : '—'} hintTone={incomplete > 0 ? 'warning' : 'neutral'} />
        <StatCard label="À venir" value={planned} icon={ClipboardCheck} accent="blue" />
      </section>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-[140px_140px_1fr_140px_180px_100px] gap-3 px-5 py-2.5 text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 border-b border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40">
          <div>Date</div>
          <div>Dossier</div>
          <div>Formation</div>
          <div>Modalité</div>
          <div>Présences</div>
          <div>Statut</div>
        </div>
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {sheets.map((s) => {
            const dossier = dossiers.find((d) => d.id === s.dossierId);
            if (!dossier) return null;
            const isFull = s.signed === s.total;
            const tone = s.status === 'planned' ? 'zinc' : isFull ? 'emerald' : 'amber';
            return (
              <li key={s.id}>
                <Link
                  href={`/dossiers/${dossier.id}/emargements`}
                  className="grid grid-cols-[140px_140px_1fr_140px_180px_100px] gap-3 px-5 py-3 items-center text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
                >
                  <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                    {format(parseISO(s.startsAt), 'dd MMM HH:mm', { locale: fr })}
                  </span>
                  <IdPill>{dossier.reference}</IdPill>
                  <span className="text-zinc-900 dark:text-zinc-100 truncate">{formationTitle(dossier.formationId)}</span>
                  <span className="text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
                    {s.modality === 'distanciel' ? <Video className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                    {s.location ?? 'Distanciel'}
                  </span>
                  <div className="flex items-center gap-2">
                    <ProgressBar value={s.signed} max={s.total} tone={tone === 'zinc' ? 'zinc' : isFull ? 'emerald' : 'amber'} size="sm" />
                    <span className="text-[11px] font-mono text-zinc-700 dark:text-zinc-300 tabular-nums w-9 text-right">
                      {s.signed}/{s.total}
                    </span>
                  </div>
                  <span className={
                    s.status === 'planned'
                      ? 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 w-fit'
                      : isFull
                      ? 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 w-fit'
                      : 'text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 w-fit'
                  }>
                    {s.status === 'planned' ? 'à venir' : isFull ? 'finalisée' : 'incomplète'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
