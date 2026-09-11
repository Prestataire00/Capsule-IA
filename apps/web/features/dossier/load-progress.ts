import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Avancement d'un dossier, de sa création à la facture réglée.
 *
 * Chaque étape est **déduite des données réelles** (questionnaires, sessions,
 * documents, signatures, émargements, factures) : rien à cocher à la main, donc
 * rien qui puisse mentir sur l'état d'un dossier. La date affichée est celle du
 * fait qui a validé l'étape.
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

const DEVIS_KINDS = ['devis'];
const CONVENTION_KINDS = ['convention'];

type DocRow = { id: string; kind: string; created_at: string };

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
    { data: quoteLinkRows },
  ] = await Promise.all([
    sb.schema('app').from('dossiers').select('created_at, status').eq('id', dossierId).maybeSingle(),
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
    sb.schema('app').from('attendance_sheets').select('finalized_at').eq('dossier_id', dossierId),
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
    sb.schema('app').from('quote_dossiers').select('quote_id').eq('dossier_id', dossierId),
  ]);

  const dossier = dossierRow as { created_at: string; status: string } | null;
  const sessions = (sessionRows ?? []) as Array<{ created_at: string | null }>;
  const documents = (documentRows ?? []) as DocRow[];
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

  const devis = documents.filter((d) => DEVIS_KINDS.includes(d.kind));
  const conventions = documents.filter((d) => CONVENTION_KINDS.includes(d.kind));

  // Envoi et signature se lisent sur les demandes de signature du document
  // concerné : c'est le seul signal qui dise DE QUEL document il s'agit (le
  // journal d'e-mails, lui, ne trace qu'un « document_email » anonyme).
  const signatures = async (docs: DocRow[]) => {
    if (docs.length === 0) {
      return { requestedAt: null as string | null, signedAt: null as string | null };
    }
    const { data } = await sb
      .schema('app')
      .from('document_signatures')
      .select('created_at, signed_at')
      .in(
        'document_id',
        docs.map((d) => d.id),
      );
    const rows = (data ?? []) as Array<{ created_at: string | null; signed_at: string | null }>;
    return {
      requestedAt: earliest(rows.map((r) => r.created_at)),
      signedAt: earliest(rows.map((r) => r.signed_at)),
    };
  };

  const [devisSig, conventionSig] = await Promise.all([signatures(devis), signatures(conventions)]);

  // Devis structurés (un par client, entreprise ou particulier) : ils portent
  // eux-mêmes leurs dates d'envoi et de signature, y compris pour les dossiers
  // d'un lot entreprise dont le document est rattaché à un autre dossier.
  const quoteIds = ((quoteLinkRows ?? []) as Array<{ quote_id: string }>).map((q) => q.quote_id);
  const { data: quoteRows } = quoteIds.length
    ? await sb
        .schema('app')
        .from('quotes')
        .select('status, created_at, sent_at, signed_at')
        .in('id', quoteIds)
        .is('deleted_at', null)
    : { data: [] };
  const quotes = (
    (quoteRows ?? []) as Array<{ status: string; created_at: string; sent_at: string | null; signed_at: string | null }>
  ).filter((q) => !['cancelled', 'refused', 'expired'].includes(q.status));

  // Un devis peut aussi partir par e-mail sans demande de signature.
  const documentEmail = emails.find((e) => (e.kind ?? '') === 'document_email');
  const devisSentAt =
    earliest(quotes.map((q) => q.sent_at)) ??
    devisSig.requestedAt ??
    (devis.length > 0 ? (documentEmail?.created_at ?? null) : null);
  const devisSignedAt = earliest(quotes.map((q) => q.signed_at)) ?? devisSig.signedAt;

  // « Gagné » : devis signé, ou dossier engagé (planifié et au-delà) — beaucoup
  // d'accords se concluent par e-mail, sans signature électronique.
  const engaged = ['scheduled', 'active', 'completed', 'closed', 'archived'].includes(
    dossier?.status ?? '',
  );

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
      key: 'devis',
      label: 'Devis préparé',
      hint: 'Le devis s’établit automatiquement dès que la session est planifiée et l’analyse du besoin reçue.',
      done: devis.length > 0 || quotes.length > 0,
      at: earliest([...quotes.map((q) => q.created_at), ...devis.map((d) => d.created_at)]),
      href: `${base}/facturation`,
    },
    {
      key: 'devis_sent',
      label: 'Devis envoyé',
      hint: 'Relisez le devis puis « Valider et envoyer au client ».',
      done: Boolean(devisSentAt),
      at: devisSentAt,
      href: `${base}/facturation`,
    },
    {
      key: 'devis_signed',
      label: 'Devis signé / Gagné',
      hint: 'En attente de l’accord du client.',
      done: Boolean(devisSignedAt) || engaged,
      at: devisSignedAt,
      href: `${base}/facturation`,
    },
    {
      key: 'convention',
      label: 'Convention préparée',
      hint: 'Générez la convention de formation depuis l’onglet Documents.',
      done: conventions.length > 0,
      at: earliest(conventions.map((d) => d.created_at)),
      href: `${base}/documents`,
    },
    {
      key: 'convention_signed',
      label: 'Convention signée',
      hint: 'En attente de la signature du client.',
      done: Boolean(conventionSig.signedAt),
      at: conventionSig.signedAt,
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
