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
  attendance_signature_missing: { label: 'Émargement manquant', icon: FileSignature, tone: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50' },
  dossier_hours_at_risk: { label: 'Dossier à risque (heures)', icon: Clock, tone: 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50' },
  learner_enrolled: { label: 'Inscription apprenant', icon: UserPlus, tone: 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60' },
  document_generated: { label: 'Document généré', icon: FileText, tone: 'text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800/70' },
  document_signed: { label: 'Document signé', icon: FileCheck2, tone: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50' },
  questionnaire_completed: { label: 'Questionnaire complété', icon: ClipboardCheck, tone: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50' },
  'prospect.new_demande': { label: 'Nouvelle demande', icon: Inbox, tone: 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/50' },
  'quote.draft_ready': { label: 'Devis à relire', icon: FileText, tone: 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/50' },
  'quote.signed': { label: 'Devis signé', icon: FileCheck2, tone: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50' },
};

export const NOTIF_FALLBACK: Meta = {
  label: 'Notification',
  icon: AlertTriangle,
  tone: 'text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800/70',
};

/** Lien cible d'une notification (vers le dossier concerné quand on le connaît). */
export function notifHref(n: Notif): string | null {
  const p = n.payload ?? {};
  if (typeof p.quote_id === 'string') return `/devis/${p.quote_id}`;
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
