import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Avancement d'un dossier, de sa création à la facture réglée.
 *
 * Chaque étape est **déduite des données réelles** (sessions, documents,
 * signatures, émargements, factures) : rien à cocher à la main, donc rien qui
 * puisse mentir sur l'état d'un dossier. La date affichée est celle du fait qui
 * a validé l'étape.
 */
export type ProgressStep = {
  key: string;
  label: string;
  /** Ce qui manque, montré quand l'étape n'est pas franchie. */
  hint: string;
  done: boolean;
  at: string | null;
  href: string | null;
};

export type DossierProgress = {
  steps: ProgressStep[];
  doneCount: number;
  /** Première étape non franchie — ce sur quoi il faut travailler maintenant. */
  current: ProgressStep | null;
};

const CONVENTION_KINDS = ['convention', 'devis'];

export async function loadDossierProgress(
  sb: SupabaseClient,
  dossierId: string,
): Promise<DossierProgress> {
  const [
    { data: dossierRow },
    { data: sessionRows },
    { data: documentRows },
    { data: assignmentRows },
    { data: sheetRows },
    { data: invoiceRows },
    { data: emailRows },
  ] = await Promise.all([
    sb
      .schema('app')
      .from('dossiers')
      .select('created_at, status, start_date, end_date')
      .eq('id', dossierId)
      .maybeSingle(),
    sb.schema('app').from('session_dossiers').select('created_at').eq('dossier_id', dossierId),
    sb
      .schema('app')
      .from('documents')
      .select('id, kind, created_at')
      .eq('dossier_id', dossierId)
      .is('deleted_at', null),
    sb
      .schema('app')
      .from('questionnaire_assignments')
      .select('status, updated_at, template:questionnaire_templates(kind)')
      .eq('dossier_id', dossierId),
    sb
      .schema('app')
      .from('attendance_sheets')
      .select('finalized_at')
      .eq('dossier_id', dossierId),
    sb
      .schema('app')
      .from('invoices')
      .select('status, paid_at')
      .eq('dossier_id', dossierId)
      .is('deleted_at', null),
    sb
      .schema('app')
      .from('email_log')
      .select('kind, created_at')
      .eq('dossier_id', dossierId)
      .eq('status', 'sent'),
  ]);

  const dossier = dossierRow as { created_at: string; status: string } | null;
  const sessions = (sessionRows ?? []) as Array<{ created_at: string | null }>;
  const documents = (documentRows ?? []) as Array<{ id: string; kind: string; created_at: string }>;
  const assignments = (assignmentRows ?? []) as unknown as Array<{
    status: string;
    updated_at: string | null;
    template: { kind: string } | null;
  }>;
  const sheets = (sheetRows ?? []) as Array<{ finalized_at: string | null }>;
  const invoices = (invoiceRows ?? []) as Array<{ status: string; paid_at: string | null }>;
  const emails = (emailRows ?? []) as Array<{ kind: string | null; created_at: string }>;

  const earliest = (dates: Array<string | null | undefined>): string | null => {
    const valid = dates.filter((d): d is string => Boolean(d)).sort();
    return valid[0] ?? null;
  };

  // Analyse du besoin : questionnaire de positionnement renseigné.
  const positioning = assignments.find(
    (a) => a.template?.kind === 'positionnement' && a.status === 'completed',
  );

  const conventions = documents.filter((d) => CONVENTION_KINDS.includes(d.kind));
  const conventionSent = emails.find((e) => (e.kind ?? '').includes('convention') || (e.kind ?? '') === 'dossier_entree');

  // Signature : au moins une convention signée (date = première signature).
  let signedAt: string | null = null;
  if (conventions.length > 0) {
    const { data: signatureRows } = await sb
      .schema('app')
      .from('document_signatures')
      .select('signed_at')
      .in(
        'document_id',
        conventions.map((d) => d.id),
      )
      .not('signed_at', 'is', null);
    signedAt = earliest(((signatureRows ?? []) as Array<{ signed_at: string | null }>).map((r) => r.signed_at));
  }

  const finalizedSheets = sheets.filter((s) => s.finalized_at);
  const trainingDone =
    ['completed', 'closed', 'archived'].includes(dossier?.status ?? '') ||
    (sheets.length > 0 && finalizedSheets.length === sheets.length);

  const paidInvoice = invoices.find((i) => i.status === 'paid');

  const base = `/dossiers/${dossierId}`;
  const steps: ProgressStep[] = [
    {
      key: 'created',
      label: 'Dossier créé',
      hint: '',
      done: Boolean(dossier),
      at: dossier?.created_at ?? null,
      href: null,
    },
    {
      key: 'needs',
      label: 'Analyse du besoin reçue',
      hint: 'Envoyez le questionnaire de positionnement à l’apprenant.',
      done: Boolean(positioning),
      at: positioning?.updated_at ?? null,
      href: `${base}/questionnaires`,
    },
    {
      key: 'session',
      label: 'Session planifiée',
      hint: 'Aucune session rattachée à ce dossier.',
      done: sessions.length > 0,
      at: earliest(sessions.map((s) => s.created_at)),
      href: `${base}/sessions`,
    },
    {
      key: 'convention',
      label: 'Convention préparée',
      hint: 'Générez la convention (ou le devis) depuis l’onglet Documents.',
      done: conventions.length > 0,
      at: earliest(conventions.map((d) => d.created_at)),
      href: `${base}/documents`,
    },
    {
      key: 'sent',
      label: 'Convention envoyée',
      hint: 'La convention n’a pas encore été adressée au client.',
      done: Boolean(conventionSent),
      at: conventionSent?.created_at ?? null,
      href: `${base}/documents`,
    },
    {
      key: 'signed',
      label: 'Convention signée',
      hint: 'En attente de la signature du client.',
      done: Boolean(signedAt),
      at: signedAt,
      href: `${base}/documents`,
    },
    {
      key: 'done',
      label: 'Formation réalisée',
      hint: 'Feuilles d’émargement à finaliser, ou dossier à passer en terminé.',
      done: trainingDone,
      at: null,
      href: `${base}/emargements`,
    },
    {
      key: 'paid',
      label: 'Facture réglée',
      hint: invoices.length === 0 ? 'Aucune facture émise.' : 'Facture émise, règlement en attente.',
      done: Boolean(paidInvoice),
      at: paidInvoice?.paid_at ?? null,
      href: `${base}/facturation`,
    },
  ];

  return {
    steps,
    doneCount: steps.filter((s) => s.done).length,
    current: steps.find((s) => !s.done) ?? null,
  };
}
