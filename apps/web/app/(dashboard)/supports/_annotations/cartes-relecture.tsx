import { ExternalLink, FileText, Link2, ListChecks, PenLine, Sparkles } from 'lucide-react';
import { FORME_LABELS } from '@/features/pedagogie/kinds';
import type { Travail } from '@/features/pedagogie/store';
import type { SessionResource } from '@/features/trainer-space/session-resources';
import { SUPPORT_STATUS_LABELS, type SupportStatus } from '@/features/trainer-space/support-status';
import type { Annotation } from '@/features/pedagogie/annotations-store';
import { ContenuCours } from '@/features/pedagogie/ui/contenu-cours';
import { AnnotationItem, cibleDe } from '@/features/pedagogie/ui/annotation-item';
import { CoursDecision } from '../cours-decision.client';
import { DecisionButtons } from '../decision-buttons.client';
import { Annoter, RetirerAnnotation } from './annoter.client';

/**
 * Relire ce que le formateur a préparé, au même endroit : le contenu en
 * entier, la décision, et les annotations en couleur. Sert l'onglet Cours de
 * la séance ; la file « À valider » garde sa présentation compacte.
 */

const STATUT_TON: Record<SupportStatus, string> = {
  en_attente: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  valide: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  refuse: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
};

function Statut({ statut, publie }: { statut: SupportStatus; publie: boolean }) {
  if (!publie) {
    return (
      <span className="inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        Brouillon du formateur
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium ${STATUT_TON[statut]}`}>
      {SUPPORT_STATUS_LABELS[statut]}
    </span>
  );
}

function Annotations({
  annotations,
  questions,
  meId,
  peutValider,
}: {
  annotations: readonly Annotation[];
  questions: ReadonlyArray<{ id: string }>;
  meId: string;
  peutValider: boolean;
}) {
  if (annotations.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {annotations.map((a) => (
        <AnnotationItem
          key={a.id}
          annotation={a}
          cible={cibleDe(a, questions)}
          action={peutValider || a.authorUserId === meId ? <RetirerAnnotation annotationId={a.id} /> : undefined}
        />
      ))}
    </ul>
  );
}

export function CarteCours({
  travail,
  annotations,
  peutValider,
  meId,
}: {
  travail: Travail;
  annotations: readonly Annotation[];
  peutValider: boolean;
  meId: string;
}) {
  const ouvertes = annotations.filter((a) => !a.resolvedAt).length;
  return (
    <li className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex items-start gap-3">
          <span
            className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${
              travail.kind === 'devoir'
                ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                : 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
            }`}
          >
            {travail.kind === 'devoir' ? <PenLine className="w-4 h-4" /> : <ListChecks className="w-4 h-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">{travail.title}</p>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                {FORME_LABELS[travail.kind]}
              </span>
              <Statut statut={travail.validationStatus} publie={travail.isPublished} />
              {travail.aiAssisted && (
                <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  <Sparkles className="w-3 h-3" /> brouillon IA
                </span>
              )}
              {ouvertes > 0 && (
                <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {ouvertes} annotation{ouvertes > 1 ? 's' : ''} à traiter
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      <ContenuCours
        kind={travail.kind}
        instructions={travail.instructions}
        questions={travail.questions}
        contenu={travail.contenu}
        annotations={annotations}
      />

      {travail.validationStatus === 'refuse' && travail.rejectionReason && (
        <p className="text-[12px] text-red-600 dark:text-red-400">Motif du refus : {travail.rejectionReason}</p>
      )}

      <Annotations annotations={annotations} questions={travail.questions} meId={meId} peutValider={peutValider} />

      {peutValider && (
        <div className="flex flex-col gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <Annoter
            targetKind="cours"
            targetId={travail.id}
            questions={travail.questions.map((q, i) => ({ id: q.id, label: `Question ${i + 1}` }))}
          />
          {travail.isPublished && travail.validationStatus === 'en_attente' && <CoursDecision exerciseId={travail.id} />}
        </div>
      )}
    </li>
  );
}

export function CarteSupport({
  support,
  annotations,
  peutValider,
  meId,
}: {
  support: SessionResource;
  annotations: readonly Annotation[];
  peutValider: boolean;
  meId: string;
}) {
  return (
    <li className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex items-start gap-3">
          <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0 bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
            {support.kind === 'lien' ? <Link2 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">{support.title}</p>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <Statut statut={support.validationStatus} publie={support.isPublished} />
            </span>
            {support.description && (
              <p className="text-[12px] text-zinc-600 dark:text-zinc-400 mt-1.5 whitespace-pre-wrap">{support.description}</p>
            )}
          </div>
        </div>
        {support.url && (
          <a
            href={support.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-orange-600 dark:text-orange-400 hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Ouvrir
          </a>
        )}
      </div>

      {support.validationStatus === 'refuse' && support.rejectionReason && (
        <p className="text-[12px] text-red-600 dark:text-red-400">Motif du refus : {support.rejectionReason}</p>
      )}

      <Annotations annotations={annotations} questions={[]} meId={meId} peutValider={peutValider} />

      {peutValider && (
        <div className="flex flex-col gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
          <Annoter targetKind="support" targetId={support.id} />
          {support.isPublished && support.validationStatus === 'en_attente' && <DecisionButtons resourceId={support.id} />}
        </div>
      )}
    </li>
  );
}
