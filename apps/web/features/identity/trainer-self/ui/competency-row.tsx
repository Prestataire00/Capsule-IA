'use client';

import { useState } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { Trash2, Copy, FileText, MoreHorizontal } from 'lucide-react';
import { removeCompetencyAction, duplicateCompetencyAction } from '@/app/(formateur)/cv/actions';

type CompetencyVM = {
  id: string;
  kind: 'diploma' | 'certification' | 'experience' | 'cv';
  title: string;
  issuer: string | null;
  obtainedAt: string | null;
  expiresAt: string | null;
  documentPath: string | null;
  status: 'valid' | 'expiring_soon' | 'expired' | 'no_expiry';
};

type MembershipVM = {
  organizationId: string;
  organizationName: string;
  trainerId: string;
};

const STATUS_STYLES = {
  valid: 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400',
  expiring_soon: 'bg-purple-200 dark:bg-purple-950/50 text-purple-800 dark:text-purple-300',
  expired: 'bg-red-200 dark:bg-red-950/50 text-red-800 dark:text-red-300',
  no_expiry: 'bg-zinc-50 dark:bg-zinc-950 text-zinc-500 dark:text-zinc-500',
} as const;

const STATUS_LABELS = {
  valid: 'Valide',
  expiring_soon: 'Expire bientôt',
  expired: 'Expirée',
  no_expiry: '—',
} as const;

export function CompetencyRow({
  competency,
  memberships,
  activeTrainerId,
}: {
  competency: CompetencyVM;
  memberships: MembershipVM[];
  activeTrainerId: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const remove = useAction(removeCompetencyAction);
  const dup = useAction(duplicateCompetencyAction);

  const otherOrgs = memberships.filter((m) => m.trainerId !== activeTrainerId);

  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-zinc-200/60 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:shadow-sm transition">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {competency.documentPath && <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />}
          <h3 className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {competency.title}
          </h3>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_STYLES[competency.status]}`}>
            {STATUS_LABELS[competency.status]}
          </span>
        </div>
        <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
          {competency.issuer && <>{competency.issuer} · </>}
          {competency.obtainedAt}
          {competency.expiresAt && <> → {competency.expiresAt}</>}
        </div>
      </div>

      <div className="relative shrink-0">
        <button
          data-testid="competency-menu-button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          <MoreHorizontal className="w-3.5 h-3.5 text-zinc-500" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 min-w-[200px] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-md z-10">
            {otherOrgs.length > 0 && (
              <button
                onClick={() => {
                  dup.execute({
                    sourceCompetencyId: competency.id,
                    targetOrganizationIds: otherOrgs.map((o) => o.organizationId),
                  });
                  setMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-[12px] hover:bg-zinc-50 dark:hover:bg-zinc-900 inline-flex items-center gap-2"
              >
                <Copy className="w-3 h-3" /> Dupliquer vers mes autres OF
              </button>
            )}
            <button
              onClick={() => {
                if (confirm('Supprimer cette compétence ?')) {
                  remove.execute({ competencyId: competency.id });
                }
                setMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-[12px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 inline-flex items-center gap-2"
            >
              <Trash2 className="w-3 h-3" /> Supprimer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
