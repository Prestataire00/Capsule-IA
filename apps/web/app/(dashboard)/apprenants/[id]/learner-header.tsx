'use client';

import Link from 'next/link';
import { Plus, GraduationCap, Clock, TrendingUp, AlertTriangle, Mail, Phone, Accessibility, Building2 } from 'lucide-react';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import { KpiCard, AccentBar, ACCENTS } from '@/shared/ui/kpi-card';
import { AnonymizeAction } from '../../rgpd/anonymize-action';
import { DeleteEntityButton } from '@/features/corbeille/ui/delete-entity-button.client';
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

const AVATARS = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
] as const;

function avatarTone(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % AVATARS.length;
  return AVATARS[h] ?? AVATARS[0];
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
      <div className="flex items-end justify-between gap-4 flex-wrap rounded-2xl border bg-gradient-to-br from-rose-50 to-white border-rose-100 dark:from-rose-950/40 dark:to-zinc-900 dark:border-rose-900/40 px-7 py-6 shadow-sm">
        <div className="min-w-0">
          <SectionLabel className="mb-2">Apprenant</SectionLabel>
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`w-10 h-10 rounded-full grid place-items-center text-[14px] font-bold flex-shrink-0 ${avatarTone(fullName)}`}>
              {initials || '?'}
            </span>
            <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">{fullName}</h1>
            {learner.statut && (
              <span className={`inline-flex items-center h-6 px-2 rounded-md text-[12px] font-semibold ${ACCENTS.rose.soft}`}>
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
            {learner.companyName && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-300">
                <span className={`w-6 h-6 rounded-md grid place-items-center shrink-0 ${ACCENTS.blue.soft}`}>
                  <Building2 className="w-3.5 h-3.5" />
                </span>
                {learner.companyName}
              </span>
            )}
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
          <DeleteEntityButton
            entite="apprenant"
            id={learner.id}
            nom={fullName}
            article="cet apprenant"
            liens={
              summary.formationsCount > 0
                ? `${summary.formationsCount} formation${summary.formationsCount > 1 ? 's' : ''} y ${summary.formationsCount > 1 ? 'sont' : 'est'} rattachée${summary.formationsCount > 1 ? 's' : ''}.`
                : null
            }
            variant="button"
            redirigerVers="/apprenants"
          />
        </div>
      </div>

      {learner.accessibility_notes && (
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 rounded-lg px-3 py-2">
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">Accessibilité :</span> {learner.accessibility_notes}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Formations" value={summary.formationsCount} icon={GraduationCap} accent="orange" />
        <KpiCard label="Heures réalisées" value={`${summary.hoursAttended}/${summary.hoursPlanned} h`} icon={Clock} accent="blue" hint="suivies / prévues">
          <AccentBar value={summary.hoursAttended} max={summary.hoursPlanned} accent="blue" />
        </KpiCard>
        <KpiCard label="Assiduité moyenne" value={`${summary.avgAttendanceRate}%`} icon={TrendingUp} accent="emerald">
          <AccentBar value={summary.avgAttendanceRate} max={100} accent="emerald" />
        </KpiCard>
        <KpiCard label="Dossiers à risque" value={summary.atRiskCount} icon={AlertTriangle} accent={summary.atRiskCount > 0 ? 'amber' : 'teal'} />
      </div>

      {isOwnerAdmin && !learner.anonymized_at && (
        <AnonymizeAction subject={{ kind: 'learner', id: learner.id, lastName: learner.last_name }} />
      )}
    </div>
  );
}
