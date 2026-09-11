import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/shared/lib/email/resend';
import { reminderDue } from '../domain/invoice-kinds';
import { addDays } from '../domain/quote';
import { sendQuoteForSignature } from '../quotes/quote-service';
import { buildInvoicePdf } from './invoice-pdf';
import { creditedCents } from './credit-notes';

// Relances : de paiement (facture échue) et de signature (devis qui expire).
// Automatiques seulement si l'organisme les a activées (organizations.
// auto_payment_reminders) ; le bouton manuel reste disponible en toute hypothèse.
type Sb = SupabaseClient;

const todayParis = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(cents / 100);

/** Relance de paiement (PDF joint) au payeur, tracée dans metadata. */
export async function sendInvoiceReminder(
  sb: Sb,
  invoiceId: string,
  organizationId: string,
  opts: { automatic?: boolean } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pdf = await buildInvoicePdf(sb, invoiceId, organizationId);
  if (!pdf) return { ok: false, error: 'invoice_not_found' };
  const inv = pdf.header;
  if (inv.kind === 'credit_note') return { ok: false, error: 'is_credit_note' };
  if (!pdf.recipient.email) return { ok: false, error: 'no_recipient_email' };

  const { data: paidRows } = await sb.schema('app').from('payments').select('amount_cents').eq('invoice_id', inv.id);
  const paid = ((paidRows ?? []) as Array<{ amount_cents: number }>).reduce((s, p) => s + Number(p.amount_cents), 0);
  const due = Math.max(0, Number(inv.total_cents) - paid - (await creditedCents(sb, inv.id)));
  if (due === 0) return { ok: false, error: 'nothing_due' };
  const dueLabel = inv.due_at ? new Date(`${inv.due_at}T12:00:00Z`).toLocaleDateString('fr-FR') : null;
  const overdue = inv.due_at ? inv.due_at < todayParis() : false;

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;color:#18181b;line-height:1.55;background:#fafafa;margin:0;padding:24px;">
  <div style="max-width:580px;margin:0 auto;">
    <div style="background:white;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#d97706;font-weight:600;margin:0 0 8px;">Relance de paiement</p>
      <h1 style="font-size:20px;font-weight:600;margin:0 0 16px;">Facture ${escapeHtml(inv.reference)}</h1>
      <p style="font-size:13px;color:#52525b;margin:0 0 20px;">
        Bonjour ${escapeHtml(pdf.recipient.attention ?? pdf.recipient.name)},<br>
        Sauf erreur de notre part, la facture <strong>${escapeHtml(inv.reference)}</strong> présente un solde de
        <strong>${money(due, inv.currency)}</strong> à ce jour.
        ${dueLabel ? `Son échéance ${overdue ? 'était fixée' : 'est fixée'} au <strong>${dueLabel}</strong>.` : ''}
        Nous vous remercions de bien vouloir procéder à son règlement dans les meilleurs délais. La facture est jointe à ce message.
      </p>
      <p style="font-size:12px;color:#a1a1aa;margin:24px 0 0;">Si le règlement a déjà été effectué, merci de ne pas tenir compte de ce message.</p>
    </div>
  </div>
</body></html>`;

  const result = await sendEmail({
    to: pdf.recipient.email,
    subject: `Relance — facture ${inv.reference} (${money(due, inv.currency)})`,
    html,
    attachments: [{ filename: `facture-${inv.reference}.pdf`, content: Buffer.from(pdf.bytes).toString('base64') }],
    organizationId,
    dossierId: inv.dossier_id ?? undefined,
    kind: opts.automatic ? 'invoice_reminder_auto' : 'invoice_reminder',
    metadata: { invoice_id: inv.id },
  });
  if (!result.ok) return { ok: false, error: result.reason };

  const meta = (inv.metadata ?? {}) as Record<string, unknown>;
  const count = typeof meta.reminder_count === 'number' ? meta.reminder_count : 0;
  const nowIso = new Date().toISOString();
  await sb
    .schema('app')
    .from('invoices')
    .update({ metadata: { ...meta, last_reminder_at: nowIso, reminder_count: count + 1 }, updated_at: nowIso } as never)
    .eq('id', inv.id)
    .eq('organization_id', organizationId);
  return { ok: true };
}

async function orgsWithAutoReminders(sb: Sb): Promise<string[]> {
  const { data } = await sb.schema('app').from('organizations').select('id').eq('auto_payment_reminders', true);
  return ((data ?? []) as Array<{ id: string }>).map((o) => o.id);
}

/**
 * Tâche planifiée : relances de paiement (lendemain de l'échéance, puis tous
 * les 15 jours, 3 au plus) et rappel de signature 3 jours avant l'expiration
 * d'un devis — pour les organismes qui les ont activées.
 */
export async function runAutomaticReminders(sb: Sb): Promise<{ invoices: number; quotes: number; errors: string[] }> {
  const orgIds = await orgsWithAutoReminders(sb);
  if (orgIds.length === 0) return { invoices: 0, quotes: 0, errors: [] };
  const today = todayParis();
  const errors: string[] = [];

  const { data: invRows } = await sb
    .schema('app')
    .from('invoices')
    .select('id, organization_id, due_at, metadata')
    .in('organization_id', orgIds)
    .in('status', ['issued', 'overdue', 'partially_paid'])
    .neq('kind', 'credit_note')
    .lt('due_at', today)
    .is('deleted_at', null);
  let invoices = 0;
  for (const inv of (invRows ?? []) as Array<{ id: string; organization_id: string; due_at: string | null; metadata: Record<string, unknown> | null }>) {
    const meta = inv.metadata ?? {};
    const due = reminderDue({
      dueAt: inv.due_at,
      today,
      reminderCount: typeof meta.reminder_count === 'number' ? meta.reminder_count : 0,
      lastReminderAt: typeof meta.last_reminder_at === 'string' ? meta.last_reminder_at : null,
    });
    if (!due) continue;
    const r = await sendInvoiceReminder(sb, inv.id, inv.organization_id, { automatic: true });
    if (r.ok) invoices++;
    else if (r.error !== 'nothing_due' && r.error !== 'no_api_key') errors.push(`relance ${inv.id}: ${r.error}`);
  }

  const { data: quoteRows } = await sb
    .schema('app')
    .from('quotes')
    .select('id, organization_id, metadata')
    .in('organization_id', orgIds)
    .eq('status', 'sent')
    .eq('valid_until', addDays(today, 3))
    .is('deleted_at', null);
  let quotes = 0;
  for (const q of (quoteRows ?? []) as Array<{ id: string; organization_id: string; metadata: Record<string, unknown> | null }>) {
    if (q.metadata?.expiry_reminder_sent_at) continue;
    const r = await sendQuoteForSignature(sb, q.id, q.organization_id);
    if (!r.ok) {
      errors.push(`rappel devis ${q.id}: ${r.error}`);
      continue;
    }
    quotes++;
    await sb
      .schema('app')
      .from('quotes')
      .update({ metadata: { ...(q.metadata ?? {}), expiry_reminder_sent_at: new Date().toISOString() } } as never)
      .eq('id', q.id);
  }

  return { invoices, quotes, errors };
}
