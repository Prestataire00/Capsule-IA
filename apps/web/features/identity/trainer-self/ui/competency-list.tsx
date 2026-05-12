import 'server-only';
import type { TrainerCompetency } from '../domain/trainer-competency';
import { CompetencyRow } from './competency-row';
import type { TrainerMembership } from '../application/ports';

const KIND_LABELS = {
  diploma: 'Diplômes',
  certification: 'Certifications',
  experience: 'Expériences',
  cv: 'CV',
} as const;

export function CompetencyList({
  competencies,
  memberships,
  activeTrainerId,
}: {
  competencies: TrainerCompetency[];
  memberships: TrainerMembership[];
  activeTrainerId: string;
}) {
  const grouped: Record<'diploma' | 'certification' | 'experience' | 'cv', TrainerCompetency[]> = {
    diploma: [],
    certification: [],
    experience: [],
    cv: [],
  };
  for (const c of competencies) grouped[c.kind].push(c);

  return (
    <div className="space-y-6">
      {(['diploma', 'certification', 'experience', 'cv'] as const).map((kind) => (
        <section key={kind}>
          <h2 className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300 mb-2 uppercase tracking-wide">
            {KIND_LABELS[kind]} <span className="text-zinc-400">· {grouped[kind].length}</span>
          </h2>
          <div className="space-y-1.5">
            {grouped[kind].length === 0 && (
              <p className="text-[12px] text-zinc-400 italic py-2">Aucun élément</p>
            )}
            {grouped[kind].map((c) => (
              <CompetencyRow
                key={c.id}
                competency={{
                  id: c.id as string,
                  kind: c.kind,
                  title: c.title,
                  issuer: c.issuer,
                  obtainedAt: c.obtainedAt ? c.obtainedAt.toISOString().slice(0, 10) : null,
                  expiresAt: c.expiresAt ? c.expiresAt.toISOString().slice(0, 10) : null,
                  documentPath: c.documentPath,
                  status: c.status,
                }}
                memberships={memberships.map((m) => ({
                  organizationId: m.organizationId as string,
                  organizationName: m.organizationName,
                  trainerId: m.trainerId as string,
                }))}
                activeTrainerId={activeTrainerId}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
