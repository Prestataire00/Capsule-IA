import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { sendEmail } from '@/shared/lib/email/resend';
import { generateDocumentSignatureToken } from '@/shared/lib/document-signature-token';
import { buildDevisHtml, type DevisSession } from '@/features/documents/generate-devis-html';
import { wrapGeneratedHtml } from '@/features/documents/templates/wrap-generated-html';
import { resolveOrgVariables } from '@/features/documents/templates/resolve-org-variables';
import {
  QUOTE_VALIDITY_DAYS,
  addDays,
  canSendQuote,
  computeQuoteTotals,
  defaultUnitPriceCents,
  quoteObject,
  resolveQuoteClient,
  type QuoteClientKind,
  type QuoteLineInput,
  type QuoteStatus,
} from '../domain/quote';

/**
 * Devis « façon RFC » : un devis par client (entreprise ou particulier),
 * généré dès que le dossier a une session et une analyse du besoin, relu puis
 * envoyé en signature par l'organisme ; sa signature crée la facture brouillon.
 *
 * Toutes les fonctions reçoivent un client service_role : le périmètre
 * d'organisation est porté par les lignes lues (jamais par un paramètre client)
 * et vérifié par les Server Actions appelantes.
 */
type Sb = SupabaseClient;

const INACTIVE_STATUSES = ['cancelled', 'refused', 'expired'];

const MODALITY_LABELS: Record<string, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
};

export type QuoteRow = {
  id: string;
  organization_id: string;
  reference: string;
  status: QuoteStatus;
  client_kind: QuoteClientKind;
  company_id: string | null;
  learner_id: string | null;
  formation_id: string | null;
  session_id: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
  object: string;
  notes: string | null;
  issued_on: string;
  valid_until: string;
  vat_rate: number;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  currency: string;
  document_id: string | null;
  auto_generated: boolean;
  sent_at: string | null;
  signed_at: string | null;
  metadata: Record<string, unknown>;
};

export const QUOTE_COLUMNS =
  'id, organization_id, reference, status, client_kind, company_id, learner_id, formation_id, session_id, ' +
  'recipient_name, recipient_email, object, notes, issued_on, valid_until, vat_rate, subtotal_cents, vat_cents, ' +
  'total_cents, currency, document_id, auto_generated, sent_at, signed_at, metadata';

export type QuoteLineRow = {
  id: string;
  position: number;
  description: string;
  details: string | null;
  quantity: number;
  unit_amount_cents: number;
  vat_rate: number | null;
};

const todayParis = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

const euros = (cents: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type AddressJson = { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string };

function composeAddress(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return typeof raw === 'string' && raw.trim() ? raw : null;
  const a = raw as AddressJson;
  const parts = [
    [a.line1, a.line2].filter(Boolean).join(' '),
    [a.postal_code, a.city].filter(Boolean).join(' '),
    a.country,
  ].filter((p) => p && p.trim().length > 0);
  return parts.length ? parts.join(', ') : null;
}

// ── Numérotation ─────────────────────────────────────────────────────────────

export async function nextDocumentNumber(sb: Sb, organizationId: string, prefix: 'DEV' | 'FAC' | 'AV'): Promise<string | null> {
  const { data, error } = await sb
    .schema('app')
    .rpc('next_document_number', { p_org: organizationId, p_prefix: prefix });
  if (error || typeof data !== 'string') {
    console.error('[quotes] numérotation impossible', prefix, error);
    return null;
  }
  return data;
}

// ── Lectures internes ────────────────────────────────────────────────────────

async function loadQuoteRow(sb: Sb, quoteId: string): Promise<QuoteRow | null> {
  const { data } = await sb
    .schema('app')
    .from('quotes')
    .select(QUOTE_COLUMNS)
    .eq('id', quoteId)
    .is('deleted_at', null)
    .maybeSingle();
  return (data as unknown as QuoteRow | null) ?? null;
}

async function loadLines(sb: Sb, quoteId: string): Promise<QuoteLineRow[]> {
  const { data } = await sb
    .schema('app')
    .from('quote_lines')
    .select('id, position, description, details, quantity, unit_amount_cents, vat_rate')
    .eq('quote_id', quoteId)
    .order('position', { ascending: true });
  return ((data ?? []) as unknown as QuoteLineRow[]).map((l) => ({
    ...l,
    quantity: Number(l.quantity),
    vat_rate: l.vat_rate == null ? null : Number(l.vat_rate),
  }));
}

export async function coveredDossierIds(sb: Sb, quoteId: string): Promise<string[]> {
  const { data } = await sb
    .schema('app')
    .from('quote_dossiers')
    .select('dossier_id, created_at')
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: true });
  return ((data ?? []) as Array<{ dossier_id: string }>).map((r) => r.dossier_id);
}

/** Devis actif (ni annulé, ni refusé, ni expiré) couvrant ce dossier. */
export async function activeQuoteIdForDossier(sb: Sb, dossierId: string): Promise<string | null> {
  const { data: links } = await sb
    .schema('app')
    .from('quote_dossiers')
    .select('quote_id')
    .eq('dossier_id', dossierId);
  const ids = ((links ?? []) as Array<{ quote_id: string }>).map((l) => l.quote_id);
  if (ids.length === 0) return null;
  const { data } = await sb
    .schema('app')
    .from('quotes')
    .select('id, status, created_at')
    .in('id', ids)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  const active = ((data ?? []) as Array<{ id: string; status: string }>).find(
    (q) => !INACTIVE_STATUSES.includes(q.status),
  );
  return active?.id ?? null;
}

type SessionLite = {
  id: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  price_cents: number | null;
  status: string;
};

async function sessionsForDossiers(sb: Sb, dossierIds: string[]): Promise<SessionLite[]> {
  if (dossierIds.length === 0) return [];
  const { data: links } = await sb
    .schema('app')
    .from('session_dossiers')
    .select('session_id')
    .in('dossier_id', dossierIds);
  const ids = [...new Set(((links ?? []) as Array<{ session_id: string }>).map((l) => l.session_id))];
  if (ids.length === 0) return [];
  const { data } = await sb
    .schema('app')
    .from('sessions')
    .select('id, starts_at, ends_at, location, price_cents, status')
    .in('id', ids)
    .order('starts_at', { ascending: true });
  return ((data ?? []) as unknown as SessionLite[]).filter((s) => s.status !== 'cancelled');
}

async function hasCompletedNeedsAnalysis(sb: Sb, dossierId: string): Promise<boolean> {
  const { data } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('status, template:questionnaire_templates(kind)')
    .eq('dossier_id', dossierId);
  return ((data ?? []) as unknown as Array<{ status: string; template: { kind: string } | null }>).some(
    (a) => a.status === 'completed' && a.template?.kind === 'positionnement',
  );
}

async function notifyStaff(
  sb: Sb,
  organizationId: string,
  templateCode: string,
  subject: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await sb
    .schema('app')
    .from('notifications')
    .insert({
      organization_id: organizationId,
      channel: 'in_app',
      template_code: templateCode,
      subject,
      payload,
      status: 'sent',
      sent_at: new Date().toISOString(),
    } as never);
  if (error) console.error('[quotes] notification non enregistrée', templateCode, error);
}

// ── Génération automatique ───────────────────────────────────────────────────

export type EnsureQuoteResult =
  | { ok: true; quoteId: string; created: boolean }
  | {
      ok: false;
      reason: 'dossier_not_found' | 'no_session' | 'no_needs_analysis' | 'no_formation' | 'insert_failed';
      details?: string;
    };

/**
 * Assure le devis du dossier (idempotent). Hors `force`, il n'est établi
 * qu'une fois la session planifiée ET l'analyse du besoin reçue — l'étape 4 de
 * la frise. Un salarié d'entreprise rejoint le devis brouillon de son
 * entreprise pour la même session (quantité + 1) plutôt que d'en créer un.
 */
export async function ensureQuoteForDossier(
  sb: Sb,
  dossierId: string,
  opts: { force?: boolean; organizationId?: string } = {},
): Promise<EnsureQuoteResult> {
  const { data: dRow } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, organization_id, learner_id, company_id, formation_id, deleted_at')
    .eq('id', dossierId)
    .maybeSingle();
  const dossier = dRow as {
    id: string;
    organization_id: string;
    learner_id: string;
    company_id: string | null;
    formation_id: string | null;
    deleted_at: string | null;
  } | null;
  if (!dossier || dossier.deleted_at) return { ok: false, reason: 'dossier_not_found' };
  if (opts.organizationId && dossier.organization_id !== opts.organizationId) {
    return { ok: false, reason: 'dossier_not_found' };
  }

  const existing = await activeQuoteIdForDossier(sb, dossier.id);
  if (existing) return { ok: true, quoteId: existing, created: false };

  const sessions = await sessionsForDossiers(sb, [dossier.id]);
  if (!opts.force) {
    if (sessions.length === 0) return { ok: false, reason: 'no_session' };
    if (!(await hasCompletedNeedsAnalysis(sb, dossier.id))) return { ok: false, reason: 'no_needs_analysis' };
  }
  if (!dossier.formation_id) return { ok: false, reason: 'no_formation' };

  const session = sessions[0] ?? null;
  const client = resolveQuoteClient({ companyId: dossier.company_id, learnerId: dossier.learner_id });
  const orgId = dossier.organization_id;

  if (client.kind === 'company') {
    let query = sb
      .schema('app')
      .from('quotes')
      .select('id')
      .eq('organization_id', orgId)
      .eq('company_id', client.companyId)
      .eq('formation_id', dossier.formation_id)
      .eq('status', 'draft')
      .is('deleted_at', null);
    query = session ? query.eq('session_id', session.id) : query.is('session_id', null);
    const { data: open } = await query.order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (open) {
      const quoteId = (open as { id: string }).id;
      const { error } = await sb
        .schema('app')
        .from('quote_dossiers')
        .upsert({ quote_id: quoteId, dossier_id: dossier.id, organization_id: orgId } as never, {
          onConflict: 'quote_id,dossier_id',
        });
      if (error) return { ok: false, reason: 'insert_failed', details: error.message };
      await syncAutoLine(sb, quoteId);
      await renderQuoteDocument(sb, quoteId);
      return { ok: true, quoteId, created: false };
    }
  }

  const [{ data: fRow }, { data: oRow }, clientInfo] = await Promise.all([
    sb
      .schema('app')
      .from('formations')
      .select('title, default_price_cents, default_duration_hours, default_modality')
      .eq('id', dossier.formation_id)
      .maybeSingle(),
    sb.schema('app').from('organizations').select('vat_regime, default_vat_rate').eq('id', orgId).maybeSingle(),
    loadClientInfo(sb, client.kind, client.kind === 'company' ? client.companyId : client.learnerId),
  ]);
  const formation = (fRow ?? {}) as {
    title?: string;
    default_price_cents?: number | null;
    default_duration_hours?: number | null;
    default_modality?: string | null;
  };
  const org = (oRow ?? {}) as { vat_regime?: string | null; default_vat_rate?: number | null };

  const reference = await nextDocumentNumber(sb, orgId, 'DEV');
  if (!reference) return { ok: false, reason: 'insert_failed', details: 'numérotation' };

  const issuedOn = todayParis();
  const title = formation.title ?? 'Formation';
  const vatRate = org.vat_regime === 'subject' ? Number(org.default_vat_rate ?? 0) : 0;
  const unit = defaultUnitPriceCents(session?.price_cents, formation.default_price_cents);

  const { data: inserted, error: insErr } = await sb
    .schema('app')
    .from('quotes')
    .insert({
      organization_id: orgId,
      reference,
      status: 'draft',
      client_kind: client.kind,
      company_id: client.kind === 'company' ? client.companyId : null,
      learner_id: client.kind === 'individual' ? client.learnerId : null,
      formation_id: dossier.formation_id,
      session_id: session?.id ?? null,
      recipient_name: clientInfo.contactName,
      recipient_email: clientInfo.contactEmail,
      object: quoteObject(title, 1),
      issued_on: issuedOn,
      valid_until: addDays(issuedOn, QUOTE_VALIDITY_DAYS),
      vat_rate: vatRate,
      auto_generated: !opts.force,
      metadata: { auto_line: true, formation_title: title },
    } as never)
    .select('id')
    .single();
  if (insErr || !inserted) return { ok: false, reason: 'insert_failed', details: insErr?.message };
  const quoteId = (inserted as { id: string }).id;

  const details = [
    formation.default_duration_hours ? `${formation.default_duration_hours} h` : null,
    formation.default_modality ? (MODALITY_LABELS[formation.default_modality] ?? formation.default_modality) : null,
    'tarif par stagiaire',
  ]
    .filter(Boolean)
    .join(' · ');

  const [{ error: lineErr }, { error: linkErr }] = await Promise.all([
    sb
      .schema('app')
      .from('quote_lines')
      .insert({
        organization_id: orgId,
        quote_id: quoteId,
        position: 0,
        description: title,
        details,
        quantity: 1,
        unit_amount_cents: unit,
        vat_rate: null,
      } as never),
    sb
      .schema('app')
      .from('quote_dossiers')
      .insert({ quote_id: quoteId, dossier_id: dossier.id, organization_id: orgId } as never),
  ]);
  if (lineErr || linkErr) {
    return { ok: false, reason: 'insert_failed', details: (lineErr ?? linkErr)?.message };
  }

  await recomputeQuoteTotals(sb, quoteId);
  await renderQuoteDocument(sb, quoteId);
  await notifyStaff(sb, orgId, 'quote.draft_ready', `Devis ${reference} prêt à relire — ${clientInfo.displayName}`, {
    quote_id: quoteId,
    dossier_id: dossier.id,
  });

  return { ok: true, quoteId, created: true };
}

/**
 * Point d'entrée « best-effort » des événements du dossier (session planifiée,
 * fiche besoin reçue…) : ne lève jamais, journalise les échecs réels.
 */
export async function tryEnsureQuoteForDossier(sb: Sb, dossierId: string): Promise<void> {
  try {
    const r = await ensureQuoteForDossier(sb, dossierId);
    if (!r.ok && r.reason === 'insert_failed') console.error('[quotes] devis non généré', dossierId, r.details);
  } catch (e) {
    console.error('[quotes] devis en échec', dossierId, e);
  }
}

type ClientInfo = {
  displayName: string;
  contactName: string | null;
  contactEmail: string | null;
};

async function loadClientInfo(sb: Sb, kind: QuoteClientKind, id: string): Promise<ClientInfo> {
  if (kind === 'company') {
    const { data } = await sb
      .schema('app')
      .from('companies')
      .select('name, contact_name, contact_email')
      .eq('id', id)
      .maybeSingle();
    const c = (data ?? {}) as { name?: string; contact_name?: string | null; contact_email?: string | null };
    return {
      displayName: c.name ?? 'Entreprise',
      contactName: c.contact_name ?? c.name ?? null,
      contactEmail: c.contact_email ?? null,
    };
  }
  const { data } = await sb
    .schema('app')
    .from('learners')
    .select('first_name, last_name, email')
    .eq('id', id)
    .maybeSingle();
  const l = (data ?? {}) as { first_name?: string; last_name?: string; email?: string | null };
  const name = `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || 'Stagiaire';
  return { displayName: name, contactName: name, contactEmail: l.email ?? null };
}

/** Ligne automatique « formation × N stagiaires » : suit l'effectif tant que personne ne l'a retouchée. */
async function syncAutoLine(sb: Sb, quoteId: string): Promise<void> {
  const quote = await loadQuoteRow(sb, quoteId);
  if (!quote || quote.metadata?.auto_line !== true) {
    await recomputeQuoteTotals(sb, quoteId);
    return;
  }
  const count = (await coveredDossierIds(sb, quoteId)).length;
  const title = String(quote.metadata.formation_title ?? 'Formation');
  await Promise.all([
    sb
      .schema('app')
      .from('quote_lines')
      .update({ quantity: Math.max(1, count) } as never)
      .eq('quote_id', quoteId)
      .eq('position', 0),
    sb.schema('app').from('quotes').update({ object: quoteObject(title, Math.max(1, count)) } as never).eq('id', quoteId),
  ]);
  await recomputeQuoteTotals(sb, quoteId);
}

export async function recomputeQuoteTotals(sb: Sb, quoteId: string): Promise<void> {
  const quote = await loadQuoteRow(sb, quoteId);
  if (!quote) return;
  const lines = await loadLines(sb, quoteId);
  const totals = computeQuoteTotals(lines.map(toLineInput), Number(quote.vat_rate));
  const { error } = await sb
    .schema('app')
    .from('quotes')
    .update({
      subtotal_cents: totals.subtotalCents,
      vat_cents: totals.vatCents,
      total_cents: totals.totalCents,
    } as never)
    .eq('id', quoteId);
  if (error) console.error('[quotes] totaux non enregistrés', quoteId, error);
}

const toLineInput = (l: QuoteLineRow): QuoteLineInput => ({
  description: l.description,
  details: l.details,
  quantity: l.quantity,
  unitAmountCents: l.unit_amount_cents,
  vatRate: l.vat_rate,
});

// ── Rendu du document ────────────────────────────────────────────────────────

/**
 * (Ré)génère le document HTML du devis. Figé une fois signé : on ne réécrit
 * jamais le contenu d'un document qu'un client a signé.
 */
export async function renderQuoteDocument(sb: Sb, quoteId: string): Promise<string | null> {
  const quote = await loadQuoteRow(sb, quoteId);
  if (!quote || (quote.status !== 'draft' && quote.status !== 'sent')) return quote?.document_id ?? null;

  const dossierIds = await coveredDossierIds(sb, quoteId);
  const [lines, sessions, variables, { data: orgRow }, { data: fRow }, learnerNames, client] = await Promise.all([
    loadLines(sb, quoteId),
    sessionsForDossiers(sb, dossierIds),
    resolveOrgVariables(sb, quote.organization_id),
    sb
      .schema('app')
      .from('organizations')
      .select('name, legal_name, siret, declaration_activite, contact_email, contact_phone')
      .eq('id', quote.organization_id)
      .maybeSingle(),
    quote.formation_id
      ? sb
          .schema('app')
          .from('formations')
          .select('title, default_duration_hours, default_modality')
          .eq('id', quote.formation_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    learnersOfDossiers(sb, dossierIds),
    loadDocumentClient(sb, quote),
  ]);

  const org = (orgRow ?? {}) as {
    name?: string;
    legal_name?: string | null;
    siret?: string | null;
    declaration_activite?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
  };
  const formation = (fRow ?? {}) as {
    title?: string;
    default_duration_hours?: number | null;
    default_modality?: string | null;
  };
  const scopedSessions: DevisSession[] = (
    quote.session_id ? sessions.filter((s) => s.id === quote.session_id || sessions.length > 1) : sessions
  ).map((s) => ({ startsAt: s.starts_at, endsAt: s.ends_at, location: s.location }));

  const lineInputs = lines.map(toLineInput);
  const body = buildDevisHtml({
    reference: quote.reference,
    issuedOn: quote.issued_on,
    validUntil: quote.valid_until,
    object: quote.object,
    notes: quote.notes,
    org: {
      name: org.name ?? '',
      legalName: org.legal_name ?? null,
      siret: org.siret ?? null,
      nda: org.declaration_activite ?? null,
      address: variables['organisme_adresse'] ?? null,
      contactEmail: org.contact_email ?? null,
      contactPhone: org.contact_phone ?? null,
    },
    client: { ...client, attention: quote.client_kind === 'company' ? quote.recipient_name : null },
    formation: {
      title: formation.title ?? String(quote.metadata?.formation_title ?? 'Formation'),
      durationHours: formation.default_duration_hours ?? null,
      modality: formation.default_modality ?? null,
    },
    sessions: scopedSessions,
    learners: learnerNames,
    lines: lineInputs,
    totals: computeQuoteTotals(lineInputs, Number(quote.vat_rate)),
    vatRate: Number(quote.vat_rate),
  });
  const html = wrapGeneratedHtml(body, variables);
  const now = new Date().toISOString();

  if (quote.document_id) {
    const { error } = await sb
      .schema('app')
      .from('documents')
      .update({ content_html: html, title: `Devis ${quote.reference}`, updated_at: now } as never)
      .eq('id', quote.document_id);
    if (error) console.error('[quotes] document non mis à jour', quoteId, error);
    return quote.document_id;
  }

  const { data: doc, error } = await sb
    .schema('app')
    .from('documents')
    .insert({
      organization_id: quote.organization_id,
      dossier_id: dossierIds[0] ?? null,
      kind: 'devis',
      title: `Devis ${quote.reference}`,
      status: 'ready',
      content_html: html,
      generated_at: now,
      generation_input: { quote_id: quote.id, auto: quote.auto_generated },
      metadata: { quote_id: quote.id },
    } as never)
    .select('id')
    .single();
  if (error || !doc) {
    console.error('[quotes] document non créé', quoteId, error);
    return null;
  }
  const documentId = (doc as { id: string }).id;
  await sb.schema('app').from('quotes').update({ document_id: documentId } as never).eq('id', quoteId);
  return documentId;
}

async function learnersOfDossiers(sb: Sb, dossierIds: string[]): Promise<string[]> {
  if (dossierIds.length === 0) return [];
  const { data: dRows } = await sb.schema('app').from('dossiers').select('learner_id').in('id', dossierIds);
  const learnerIds = ((dRows ?? []) as Array<{ learner_id: string }>).map((d) => d.learner_id);
  if (learnerIds.length === 0) return [];
  const { data } = await sb
    .schema('app')
    .from('learners')
    .select('first_name, last_name')
    .in('id', learnerIds)
    .order('last_name', { ascending: true });
  return ((data ?? []) as Array<{ first_name: string; last_name: string }>).map(
    (l) => `${l.first_name} ${l.last_name}`.trim(),
  );
}

async function loadDocumentClient(
  sb: Sb,
  quote: QuoteRow,
): Promise<{ kind: QuoteClientKind; name: string; siret: string | null; address: string | null; email: string | null; phone: string | null }> {
  if (quote.client_kind === 'company' && quote.company_id) {
    const { data } = await sb
      .schema('app')
      .from('companies')
      .select('name, siret, address, contact_email, contact_phone')
      .eq('id', quote.company_id)
      .maybeSingle();
    const c = (data ?? {}) as {
      name?: string;
      siret?: string | null;
      address?: unknown;
      contact_email?: string | null;
      contact_phone?: string | null;
    };
    return {
      kind: 'company',
      name: c.name ?? 'Entreprise',
      siret: c.siret ?? null,
      address: composeAddress(c.address),
      email: quote.recipient_email ?? c.contact_email ?? null,
      phone: c.contact_phone ?? null,
    };
  }
  const { data } = quote.learner_id
    ? await sb
        .schema('app')
        .from('learners')
        .select('first_name, last_name, address, email, phone')
        .eq('id', quote.learner_id)
        .maybeSingle()
    : { data: null };
  const l = (data ?? {}) as {
    first_name?: string;
    last_name?: string;
    address?: unknown;
    email?: string | null;
    phone?: string | null;
  };
  return {
    kind: 'individual',
    name: `${l.first_name ?? ''} ${l.last_name ?? ''}`.trim() || (quote.recipient_name ?? 'Stagiaire'),
    siret: null,
    address: composeAddress(l.address),
    email: quote.recipient_email ?? l.email ?? null,
    phone: l.phone ?? null,
  };
}

// ── Édition ──────────────────────────────────────────────────────────────────

export type QuoteUpdate = {
  object: string;
  notes: string | null;
  validUntil: string;
  vatRate: number;
  recipientName: string | null;
  recipientEmail: string | null;
  lines: QuoteLineInput[];
};

/** Remplace le contenu d'un devis brouillon (lignes comprises) puis régénère son document. */
export async function updateDraftQuote(
  sb: Sb,
  quoteId: string,
  organizationId: string,
  input: QuoteUpdate,
): Promise<{ ok: true } | { ok: false; error: 'not_found' | 'not_editable' | 'db' }> {
  const quote = await loadQuoteRow(sb, quoteId);
  if (!quote || quote.organization_id !== organizationId) return { ok: false, error: 'not_found' };
  if (quote.status !== 'draft') return { ok: false, error: 'not_editable' };

  const { error: qErr } = await sb
    .schema('app')
    .from('quotes')
    .update({
      object: input.object,
      notes: input.notes,
      valid_until: input.validUntil,
      vat_rate: input.vatRate,
      recipient_name: input.recipientName,
      recipient_email: input.recipientEmail,
      // Une ligne retouchée à la main ne suit plus l'effectif automatiquement.
      metadata: { ...quote.metadata, auto_line: false },
    } as never)
    .eq('id', quoteId);
  if (qErr) return { ok: false, error: 'db' };

  const { error: delErr } = await sb.schema('app').from('quote_lines').delete().eq('quote_id', quoteId);
  if (delErr) return { ok: false, error: 'db' };
  if (input.lines.length > 0) {
    const { error: insErr } = await sb
      .schema('app')
      .from('quote_lines')
      .insert(
        input.lines.map((l, position) => ({
          organization_id: organizationId,
          quote_id: quoteId,
          position,
          description: l.description,
          details: l.details ?? null,
          quantity: l.quantity,
          unit_amount_cents: l.unitAmountCents,
          vat_rate: l.vatRate,
        })) as never,
      );
    if (insErr) return { ok: false, error: 'db' };
  }

  await recomputeQuoteTotals(sb, quoteId);
  await renderQuoteDocument(sb, quoteId);
  return { ok: true };
}

// ── Envoi en signature ───────────────────────────────────────────────────────

export type SendQuoteError =
  | 'not_found'
  | 'not_sendable'
  | 'no_recipient_email'
  | 'no_lines'
  | 'document_failed'
  | 'send_failed';

/**
 * « Valider et envoyer » : fige le devis, envoie au client (responsable de
 * l'entreprise ou particulier) un lien de signature électronique, et passe le
 * devis à « envoyé ». Un renvoi périme la demande précédente.
 */
export async function sendQuoteForSignature(
  sb: Sb,
  quoteId: string,
  organizationId: string,
): Promise<{ ok: true; email: string } | { ok: false; error: SendQuoteError }> {
  const quote = await loadQuoteRow(sb, quoteId);
  if (!quote || quote.organization_id !== organizationId) return { ok: false, error: 'not_found' };
  if (!canSendQuote(quote.status)) return { ok: false, error: 'not_sendable' };
  if (!quote.recipient_email) return { ok: false, error: 'no_recipient_email' };
  if ((await loadLines(sb, quoteId)).length === 0) return { ok: false, error: 'no_lines' };

  const documentId = await renderQuoteDocument(sb, quoteId);
  if (!documentId) return { ok: false, error: 'document_failed' };

  await sb
    .schema('app')
    .from('document_signatures')
    .update({ status: 'expired' } as never)
    .eq('document_id', documentId)
    .eq('status', 'pending');

  const expiresAt = new Date(`${quote.valid_until}T23:59:59Z`);
  const minExpiry = Date.now() + 7 * 24 * 3600 * 1000;
  const { data: sigRow, error: sigErr } = await sb
    .schema('app')
    .from('document_signatures')
    .insert({
      organization_id: organizationId,
      document_id: documentId,
      signer_kind: quote.client_kind === 'company' ? 'company_rep' : 'learner',
      signer_learner_id: quote.client_kind === 'individual' ? quote.learner_id : null,
      signer_email: quote.recipient_email,
      signer_name: quote.recipient_name ?? quote.recipient_email,
      status: 'pending',
      request_expires_at: new Date(Math.max(expiresAt.getTime(), minExpiry)).toISOString(),
    } as never)
    .select('id')
    .single();
  if (sigErr || !sigRow) return { ok: false, error: 'document_failed' };
  const signatureId = (sigRow as { id: string }).id;

  const { token } = await generateDocumentSignatureToken({ signatureId, documentId, organizationId });
  await sb
    .schema('app')
    .from('document_signatures')
    .update({ request_token_hash: createHash('sha256').update(token).digest('hex') } as never)
    .eq('id', signatureId);

  const { data: orgRow } = await sb.schema('app').from('organizations').select('name').eq('id', organizationId).maybeSingle();
  const orgName = (orgRow as { name?: string } | null)?.name ?? 'Votre organisme de formation';
  const base = (env.PUBLIC_APP_URL ?? 'https://capsule-ia.up.railway.app').replace(/\/$/, '');
  const url = `${base}/signer/document/${token}`;
  const validity = new Date(`${quote.valid_until}T12:00:00Z`).toLocaleDateString('fr-FR');
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;padding:32px;">
<div style="max-width:540px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;">
<p style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#f97316;margin:0 0 8px;">Devis à signer</p>
<h1 style="font-size:18px;margin:0 0 12px;">Devis ${escapeHtml(quote.reference)}</h1>
<p style="color:#3f3f46;font-size:14px;line-height:1.6;">Bonjour ${escapeHtml(quote.recipient_name ?? '')},</p>
<p style="color:#3f3f46;font-size:14px;line-height:1.6;">${escapeHtml(orgName)} vous adresse le devis <strong>${escapeHtml(
    quote.object,
  )}</strong>, d'un montant de <strong>${euros(quote.total_cents)}</strong>, valable jusqu'au ${validity}.</p>
<p style="margin:22px 0;"><a href="${url}" style="display:inline-block;padding:11px 20px;background:#f97316;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;">Consulter et signer le devis</a></p>
<p style="color:#a1a1aa;font-size:11px;">Si le bouton ne fonctionne pas : ${url}</p>
</div></body></html>`;

  const dossierIds = await coveredDossierIds(sb, quoteId);
  const res = await sendEmail({
    to: quote.recipient_email,
    subject: `Devis à signer — ${quote.reference}`,
    html,
    organizationId,
    dossierId: dossierIds[0],
    kind: 'quote_sent',
    metadata: { quote_id: quoteId },
  });
  if (!res.ok) return { ok: false, error: 'send_failed' };

  await sb
    .schema('app')
    .from('quotes')
    .update({ status: 'sent', sent_at: new Date().toISOString() } as never)
    .eq('id', quoteId);
  return { ok: true, email: quote.recipient_email };
}

// ── Signature → facture ──────────────────────────────────────────────────────

/** Appelé après chaque signature de document : si c'est un devis, déclenche la cascade. */
export async function onDocumentSigned(sb: Sb, documentId: string): Promise<void> {
  const { data } = await sb
    .schema('app')
    .from('quotes')
    .select('id')
    .eq('document_id', documentId)
    .is('deleted_at', null)
    .in('status', ['draft', 'sent'])
    .maybeSingle();
  if (!data) return;
  await markQuoteSigned(sb, (data as { id: string }).id, 'electronic');
}

/**
 * Passe le devis à « signé » (une seule fois, verrou par condition sur le
 * statut) puis : facture brouillon reprenant ses lignes, montant des dossiers
 * aligné sur le devis (le montant contractuel), notification.
 */
export async function markQuoteSigned(
  sb: Sb,
  quoteId: string,
  via: 'electronic' | 'manual',
): Promise<{ ok: true; invoiceId: string | null } | { ok: false; error: 'not_found' | 'already_signed' }> {
  const { data: claimed } = await sb
    .schema('app')
    .from('quotes')
    .update({ status: 'signed', signed_at: new Date().toISOString() } as never)
    .eq('id', quoteId)
    .in('status', ['draft', 'sent'])
    .select('id, organization_id, reference');
  const row = ((claimed ?? []) as Array<{ id: string; organization_id: string; reference: string }>)[0];
  if (!row) {
    const exists = await loadQuoteRow(sb, quoteId);
    return { ok: false, error: exists ? 'already_signed' : 'not_found' };
  }

  await applyQuoteAmountToDossiers(sb, quoteId);
  const invoice = await createInvoiceFromQuote(sb, quoteId);
  await notifyStaff(
    sb,
    row.organization_id,
    'quote.signed',
    `Devis ${row.reference} signé${via === 'manual' ? ' (saisie manuelle)' : ''} — facture brouillon créée`,
    { quote_id: quoteId, invoice_id: invoice.ok ? invoice.invoiceId : null },
  );
  return { ok: true, invoiceId: invoice.ok ? invoice.invoiceId : null };
}

/** Répartit le HT du devis sur les dossiers couverts (dernier dossier = reliquat des arrondis). */
async function applyQuoteAmountToDossiers(sb: Sb, quoteId: string): Promise<void> {
  const quote = await loadQuoteRow(sb, quoteId);
  const ids = await coveredDossierIds(sb, quoteId);
  if (!quote || ids.length === 0) return;
  const share = Math.floor(quote.subtotal_cents / ids.length);
  await Promise.all(
    ids.map((id, i) =>
      sb
        .schema('app')
        .from('dossiers')
        .update({
          total_amount_cents: i === ids.length - 1 ? quote.subtotal_cents - share * (ids.length - 1) : share,
        } as never)
        .eq('id', id),
    ),
  );
}

export const PROVISIONAL_PREFIX = 'PROV-';

export function isProvisionalReference(reference: string): boolean {
  return reference.startsWith(PROVISIONAL_PREFIX);
}

/**
 * Facture brouillon issue d'un devis signé (une par devis, idempotent). Elle
 * porte un numéro provisoire : le numéro définitif FAC-AAAA-NNN n'est attribué
 * qu'à l'émission, pour une numérotation continue sans trou.
 */
export async function createInvoiceFromQuote(
  sb: Sb,
  quoteId: string,
): Promise<{ ok: true; invoiceId: string; created: boolean } | { ok: false; error: 'not_found' | 'not_signed' | 'db' }> {
  const quote = await loadQuoteRow(sb, quoteId);
  if (!quote) return { ok: false, error: 'not_found' };
  if (quote.status !== 'signed') return { ok: false, error: 'not_signed' };

  const { data: existing } = await sb
    .schema('app')
    .from('invoices')
    .select('id')
    .eq('quote_id', quoteId)
    .in('kind', ['invoice', 'balance'])
    .neq('status', 'cancelled')
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (existing) return { ok: true, invoiceId: (existing as { id: string }).id, created: false };

  const [lines, dossierIds] = await Promise.all([loadLines(sb, quoteId), coveredDossierIds(sb, quoteId)]);
  const { data: inv, error } = await sb
    .schema('app')
    .from('invoices')
    .insert({
      organization_id: quote.organization_id,
      reference: `${PROVISIONAL_PREFIX}${quote.reference}-${randomBytes(2).toString('hex').toUpperCase()}`,
      dossier_id: dossierIds[0] ?? null,
      funder_id: null,
      company_id: quote.company_id,
      status: 'draft',
      subtotal_cents: quote.subtotal_cents,
      vat_cents: quote.vat_cents,
      total_cents: quote.total_cents,
      currency: quote.currency,
      payment_terms:
        quote.client_kind === 'company'
          ? 'Paiement à 30 jours à réception de facture, par virement.'
          : 'Paiement à réception de facture.',
      quote_id: quoteId,
      metadata: { quote_id: quoteId, quote_reference: quote.reference, dossier_ids: dossierIds },
    } as never)
    .select('id')
    .single();
  if (error || !inv) {
    console.error('[quotes] facture non créée', quoteId, error);
    return { ok: false, error: 'db' };
  }
  const invoiceId = (inv as { id: string }).id;

  if (lines.length > 0) {
    const { error: lErr } = await sb
      .schema('app')
      .from('invoice_lines')
      .insert(
        lines.map((l, position) => ({
          organization_id: quote.organization_id,
          invoice_id: invoiceId,
          position,
          description: l.details ? `${l.description} — ${l.details}` : l.description,
          quantity: l.quantity,
          unit_amount_cents: l.unit_amount_cents,
          vat_rate: l.vat_rate ?? Number(quote.vat_rate),
        })) as never,
      );
    if (lErr) console.error('[quotes] lignes de facture non créées', invoiceId, lErr);
  }
  return { ok: true, invoiceId, created: true };
}

/** Attribue le numéro définitif FAC-AAAA-NNN à une facture qui porte encore un numéro provisoire. */
export async function assignFinalInvoiceNumber(sb: Sb, invoiceId: string): Promise<string | null> {
  const { data } = await sb
    .schema('app')
    .from('invoices')
    .select('reference, organization_id')
    .eq('id', invoiceId)
    .maybeSingle();
  const inv = data as { reference: string; organization_id: string } | null;
  if (!inv) return null;
  if (!isProvisionalReference(inv.reference)) return inv.reference;
  const reference = await nextDocumentNumber(sb, inv.organization_id, 'FAC');
  if (!reference) return null;
  const { error } = await sb.schema('app').from('invoices').update({ reference } as never).eq('id', invoiceId);
  if (error) {
    console.error('[quotes] numéro de facture non attribué', invoiceId, error);
    return null;
  }
  return reference;
}

/** Statuts manuels : refus, annulation, remise en brouillon d'un devis envoyé. */
export async function setQuoteStatus(
  sb: Sb,
  quoteId: string,
  organizationId: string,
  status: 'refused' | 'cancelled' | 'draft',
): Promise<{ ok: true } | { ok: false; error: 'not_found' | 'invalid_transition' }> {
  const quote = await loadQuoteRow(sb, quoteId);
  if (!quote || quote.organization_id !== organizationId) return { ok: false, error: 'not_found' };
  const allowed: Record<string, QuoteStatus[]> = {
    refused: ['sent', 'draft'],
    cancelled: ['draft', 'sent', 'expired', 'refused'],
    draft: ['sent', 'expired'],
  };
  if (!allowed[status]?.includes(quote.status)) return { ok: false, error: 'invalid_transition' };

  const patch: Record<string, unknown> = { status };
  if (status === 'refused') patch.refused_at = new Date().toISOString();
  const { error } = await sb.schema('app').from('quotes').update(patch as never).eq('id', quoteId);
  if (error) return { ok: false, error: 'not_found' };

  if (quote.document_id && status !== 'refused') {
    await sb
      .schema('app')
      .from('document_signatures')
      .update({ status: 'expired' } as never)
      .eq('document_id', quote.document_id)
      .eq('status', 'pending');
  }
  return { ok: true };
}

/** Devis envoyés dont la validité est dépassée → « expiré » (tâche planifiée). */
export async function expireOverdueQuotes(sb: Sb): Promise<number> {
  const { data } = await sb
    .schema('app')
    .from('quotes')
    .update({ status: 'expired' } as never)
    .eq('status', 'sent')
    .lt('valid_until', todayParis())
    .is('deleted_at', null)
    .select('id');
  return (data ?? []).length;
}

/**
 * Filet de sécurité planifié : établit les devis des dossiers prêts (session +
 * analyse du besoin) qu'aucun événement n'aurait couverts.
 */
export async function sweepMissingQuotes(sb: Sb): Promise<{ created: number; errors: string[] }> {
  const { data: links } = await sb.schema('app').from('session_dossiers').select('dossier_id');
  const candidates = [...new Set(((links ?? []) as Array<{ dossier_id: string }>).map((l) => l.dossier_id))];
  if (candidates.length === 0) return { created: 0, errors: [] };

  const { data: covered } = await sb.schema('app').from('quote_dossiers').select('dossier_id').in('dossier_id', candidates);
  const coveredSet = new Set(((covered ?? []) as Array<{ dossier_id: string }>).map((c) => c.dossier_id));
  const { data: live } = await sb
    .schema('app')
    .from('dossiers')
    .select('id')
    .in('id', candidates.filter((id) => !coveredSet.has(id)))
    .is('deleted_at', null)
    .not('status', 'in', '(closed,archived,cancelled)');

  let created = 0;
  const errors: string[] = [];
  for (const d of (live ?? []) as Array<{ id: string }>) {
    const r = await ensureQuoteForDossier(sb, d.id);
    if (r.ok && r.created) created++;
    else if (!r.ok && r.reason === 'insert_failed') errors.push(`devis ${d.id}: ${r.details ?? 'échec'}`);
  }
  return { created, errors };
}
