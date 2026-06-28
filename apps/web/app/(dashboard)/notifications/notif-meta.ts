import type { ComponentType } from 'react';
import {
  AlertTriangle,
  FileSignature,
  Clock,
  UserPlus,
  FileText,
  FileCheck2,
  ClipboardCheck,
  Inbox,
} from 'lucide-react';

export type Notif = {
  id: string;
  template_code: string;
  subject: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  related_aggregate_type: string | null;
  related_aggregate_id: string | null;
  read_at?: string | null;
};

type Meta = { label: string; icon: ComponentType<{ className?: string }>; tone: string };

export const NOTIF_META: Record<string, Meta> = {
  attendance_signature_missing: { label: 'Émargement manquant', icon: FileSignature, tone: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30' },
  dossier_hours_at_risk: { label: 'Dossier à risque (heures)', icon: Clock, tone: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30' },
  learner_enrolled: { label: 'Inscription apprenant', icon: UserPlus, tone: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30' },
  document_generated: { label: 'Document généré', icon: FileText, tone: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' },
  document_signed: { label: 'Document signé', icon: FileCheck2, tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' },
  questionnaire_completed: { label: 'Questionnaire complété', icon: ClipboardCheck, tone: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30' },
  'prospect.new_demande': { label: 'Nouvelle demande', icon: Inbox, tone: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30' },
};

export const NOTIF_FALLBACK: Meta = {
  label: 'Notification',
  icon: AlertTriangle,
  tone: 'text-zinc-500 bg-zinc-100 dark:bg-zinc-800',
};

/** Lien cible d'une notification (vers le dossier concerné quand on le connaît). */
export function notifHref(n: Notif): string | null {
  const p = n.payload ?? {};
  // Demandes (prospects) : lien vers la fiche de la demande.
  if (n.related_aggregate_type === 'prospect') {
    const prospectId = (p.prospect_id as string | undefined) ?? n.related_aggregate_id ?? undefined;
    if (prospectId) return `/prospects/${prospectId}`;
  }
  const dossierId =
    (p.dossier_id as string | undefined) ??
    (n.related_aggregate_type === 'dossier' ? n.related_aggregate_id ?? undefined : undefined);
  if (!dossierId) return null;
  switch (n.template_code) {
    case 'attendance_signature_missing':
      return `/dossiers/${dossierId}/emargements`;
    case 'dossier_hours_at_risk':
      return `/dossiers/${dossierId}/heures`;
    case 'document_generated':
    case 'document_signed':
      return `/dossiers/${dossierId}/documents`;
    case 'questionnaire_completed':
      return `/dossiers/${dossierId}/questionnaires`;
    default:
      return `/dossiers/${dossierId}`;
  }
}
