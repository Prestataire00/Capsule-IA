import type { QuoteStatus } from '@/features/billing/domain/quote';

export const QUOTE_STATUS_TONE: Record<QuoteStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  draft: 'warning',
  sent: 'info',
  signed: 'success',
  refused: 'danger',
  expired: 'neutral',
  cancelled: 'neutral',
};

export const QUOTE_ERROR_LABELS: Record<string, string> = {
  forbidden: 'Droits insuffisants sur la facturation.',
  not_found: 'Devis introuvable.',
  not_editable: 'Ce devis a déjà été envoyé : remettez-le en brouillon pour le modifier.',
  not_sendable: 'Ce devis ne peut plus être envoyé.',
  no_recipient_email: 'Renseignez l’e-mail du destinataire avant l’envoi.',
  no_lines: 'Ajoutez au moins une ligne au devis.',
  document_failed: 'Le document du devis n’a pas pu être préparé.',
  send_failed: 'L’e-mail n’est pas parti : vérifiez la configuration d’envoi.',
  invalid_transition: 'Changement de statut impossible depuis l’état actuel.',
  already_signed: 'Ce devis est déjà signé.',
  not_signed: 'Le devis doit être signé pour être facturé.',
  db: 'Erreur d’enregistrement, réessayez.',
  dossier_not_found: 'Dossier introuvable.',
  no_formation: 'Le dossier n’est rattaché à aucune formation.',
  insert_failed: 'Le devis n’a pas pu être créé.',
  no_session: 'Aucune session planifiée pour ce dossier.',
  no_needs_analysis: 'L’analyse du besoin n’a pas encore été reçue.',
  percent_out_of_range: 'Pourcentage d’acompte entre 1 et 99 %.',
  individual_cap: 'Particulier : l’acompte est plafonné à 30 % du prix (art. L.6353-6).',
  exceeds_quote: 'Le cumul des acomptes atteindrait le montant du devis : facturez le solde.',
  already_invoiced: 'La facture du devis est déjà émise : plus d’acompte possible.',
};

/** Message d'erreur lisible depuis le retour d'une Server Action (next-safe-action), ou null si succès. */
export function actionError(res: unknown): string | null {
  const r = res as
    | { data?: { ok?: boolean; error?: string }; serverError?: unknown; validationErrors?: unknown }
    | undefined;
  if (!r) return 'Pas de réponse du serveur, réessayez.';
  if (r.serverError) return 'Erreur serveur, réessayez.';
  if (r.validationErrors) return 'Saisie invalide : vérifiez les champs du devis.';
  if (r.data?.ok === false) return QUOTE_ERROR_LABELS[r.data.error ?? ''] ?? `Erreur (${r.data.error ?? 'inconnue'}).`;
  return null;
}

export const formatEuros = (cents: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

export const formatDate = (iso: string | null): string =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('fr-FR') : '—';
