'use client';

import Link from 'next/link';
import { Plus, GraduationCap, Clock, TrendingUp, AlertTriangle, Mail, Phone, Accessibility } from 'lucide-react';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { AnonymizeAction } from '../../rgpd/anonymize-action';
import { EditLearnerDialog } from './edit-learner-dialog';
import type { LearnerSummary } from './summary';

type Learner = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  position: string | null;
  statut: string | null;
  rqth: boolean;
  accessibility_notes: string | null;
  anonymized_at: string | null;
  companyName: string | null;
};

const STATUT_LABEL: Record<string, string> = {
  salarie: 'Salarié',
  dirigeant: 'Dirigeant',
  independant: 'Indépendant',
};

function KeyFigure({
  label,
  value,
  hint,
  icon: Icon,
  warning,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white dark:bg-zinc-900 p-5 shadow-sm ${
        warning ? 'border-amber-300 dark:border-amber-900/60' : 'border-zinc-200/70 dark:border-zinc-800'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400">{label}</p>
        <Icon className={`w-4 h-4 ${warning ? 'text-amber-500' : 'text-zinc-400'}`} />
      </div>
      <p className="mt-2 text-[26px] leading-none font-extrabold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</p>
      {hint && <p className="mt-2 text-[12px] text-zinc-500 dark:text-zinc-400">{hint}</p>}
    </div>
  );
}

export function LearnerHeader({
  learner,
  summary,
  isOwnerAdmin,
}: {
  learner: Learner;
  summary: LearnerSummary;
  isOwnerAdmin: boolean;
}) {
  const fullName = `${learner.first_name} ${learner.last_name}`.trim();
  const initials = `${learner.first_name?.[0] ?? ''}${learner.last_name?.[0] ?? ''}`.toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <SectionLabel className="mb-2">Apprenant</SectionLabel>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="w-10 h-10 rounded-full grid place-items-center text-[14px] font-bold flex-shrink-0 bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              {initials || '?'}
            </span>
            <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">{fullName}</h1>
            {learner.statut && (
              <span className="inline-flex items-center h-6 px-2 rounded-md text-[12px] font-semibold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {STATUT_LABEL[learner.statut] ?? learner.statut}
              </span>
            )}
            {learner.rqth && (
              <StatusPill tone="info">
                <Accessibility className="w-3 h-3 -ml-0.5" /> RQTH
              </StatusPill>
            )}
          </div>
          <div className="flex items-center gap-4 text-[14px] text-zinc-500 dark:text-zinc-400 flex-wrap mt-3">
            <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{learner.email}</span>
            {learner.phone && (
              <span className="inline-flex items-center gap-1.5 tabular-nums"><Phone className="w-3.5 h-3.5" />{learner.phone}</span>
            )}
            {learner.companyName && <span className="font-semibold text-zinc-700 dark:text-zinc-300">{learner.companyName}</span>}
            {learner.position && <span>{learner.position}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {!learner.anonymized_at && <EditLearnerDialog learner={learner} />}
          <Link
            href={`/dossiers/nouveau?learnerId=${learner.id}`}
            className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Nouveau dossier
          </Link>
        </div>
      </div>

      {learner.accessibility_notes && (
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-lg px-3 py-2">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Accessibilité :</span> {learner.accessibility_notes}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KeyFigure label="Formations" value={summary.formationsCount} icon={GraduationCap} />
        <KeyFigure label="Heures réalisées" value={`${summary.hoursAttended}/${summary.hoursPlanned} h`} icon={Clock} hint="suivies / prévues" />
        <KeyFigure label="Assiduité moyenne" value={`${summary.avgAttendanceRate}%`} icon={TrendingUp} />
        <KeyFigure label="Dossiers à risque" value={summary.atRiskCount} icon={AlertTriangle} warning={summary.atRiskCount > 0} />
      </div>

      {isOwnerAdmin && !learner.anonymized_at && (
        <AnonymizeAction subject={{ kind: 'learner', id: learner.id, lastName: learner.last_name }} />
      )}
    </div>
  );
}
