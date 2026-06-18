'use client';

import Link from 'next/link';
import { Plus, GraduationCap, Clock, TrendingUp, AlertTriangle, Mail, Phone, Accessibility } from 'lucide-react';
import { StatCard } from '@/shared/ui/stat-card';
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-2xl font-medium text-zinc-900 dark:text-zinc-100">{fullName}</h1>
            {learner.statut && (
              <span className="text-[12px] text-zinc-500 dark:text-zinc-400">{STATUT_LABEL[learner.statut] ?? learner.statut}</span>
            )}
            {learner.rqth && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 inline-flex items-center gap-1">
                <Accessibility className="w-2.5 h-2.5" /> RQTH
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-[13px] text-zinc-600 dark:text-zinc-400 flex-wrap">
            <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{learner.email}</span>
            {learner.phone && <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{learner.phone}</span>}
            {learner.companyName && <span>{learner.companyName}</span>}
            {learner.position && <span>{learner.position}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {!learner.anonymized_at && <EditLearnerDialog learner={learner} />}
          <Link
            href={`/dossiers/nouveau?learnerId=${learner.id}`}
            className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] px-3 py-1.5 rounded-md transition inline-flex items-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" /> Nouveau dossier
          </Link>
        </div>
      </div>

      {learner.accessibility_notes && (
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-lg px-3 py-2">
          <strong className="font-medium">Accessibilité :</strong> {learner.accessibility_notes}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Formations" value={summary.formationsCount} icon={GraduationCap} accent="violet" />
        <StatCard label="Heures réalisées" value={`${summary.hoursAttended}/${summary.hoursPlanned} h`} icon={Clock} accent="blue" hint="suivies / prévues" />
        <StatCard label="Assiduité moyenne" value={`${summary.avgAttendanceRate}%`} icon={TrendingUp} accent="emerald" />
        <StatCard
          label="Dossiers à risque"
          value={summary.atRiskCount}
          icon={AlertTriangle}
          accent={summary.atRiskCount > 0 ? 'amber' : 'zinc'}
          hintTone={summary.atRiskCount > 0 ? 'warning' : 'neutral'}
        />
      </div>

      {isOwnerAdmin && !learner.anonymized_at && (
        <AnonymizeAction subject={{ kind: 'learner', id: learner.id, lastName: learner.last_name }} />
      )}
    </div>
  );
}
