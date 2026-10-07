import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

/**
 * Ce que le référent peut ouvrir depuis son espace, au-delà des documents :
 * une signature qui l'attend, son questionnaire, un devis de son entreprise.
 * Chaque fonction rattache l'objet à SES dossiers ou à SON entreprise — un
 * identifiant venu de l'URL ne suffit jamais.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;
const admin = () => supabaseAdmin() as unknown as Admin;

async function contactDe(contactId: string, organizationId: string) {
  const { data } = await admin()
    .schema('app')
    .from('contacts')
    .select('email, company_id')
    .eq('id', contactId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  return data as { email: string | null; company_id: string | null } | null;
}

async function sonDossier(contactId: string, organizationId: string, dossierId: string | null): Promise<boolean> {
  if (!dossierId) return false;
  const { data } = await admin()
    .schema('app')
    .from('dossiers')
    .select('contact_id, organization_id')
    .eq('id', dossierId)
    .is('deleted_at', null)
    .maybeSingle();
  const d = data as { contact_id: string | null; organization_id: string } | null;
  return Boolean(d && d.organization_id === organizationId && d.contact_id === contactId);
}

/** Une signature en attente, sur un document d'un de ses dossiers, et qui lui revient. */
export async function signatureDuReferent(
  contactId: string,
  organizationId: string,
  signatureId: string,
): Promise<{ documentId: string } | null> {
  const { data } = await admin()
    .schema('app')
    .from('document_signatures')
    .select('id, document_id, signer_kind, signer_email, status, organization_id, request_expires_at, document:documents(dossier_id)')
    .eq('id', signatureId)
    .maybeSingle();
  const s = data as unknown as {
    document_id: string;
    signer_kind: string;
    signer_email: string | null;
    status: string;
    organization_id: string;
    request_expires_at: string | null;
    document: { dossier_id: string | null } | Array<{ dossier_id: string | null }> | null;
  } | null;
  if (!s || s.status !== 'pending' || s.organization_id !== organizationId) return null;
  if (s.request_expires_at && new Date(s.request_expires_at).getTime() < Date.now()) return null;
  const doc = Array.isArray(s.document) ? s.document[0] : s.document;
  if (!(await sonDossier(contactId, organizationId, doc?.dossier_id ?? null))) return null;
  const contact = await contactDe(contactId, organizationId);
  const email = contact?.email?.trim().toLowerCase();
  const pourLui = s.signer_kind === 'company_rep' || (email && s.signer_email?.trim().toLowerCase() === email);
  return pourLui ? { documentId: s.document_id } : null;
}

/** Son questionnaire d'entreprise, pas encore rempli. */
export async function questionnaireDuReferent(
  contactId: string,
  organizationId: string,
  assignmentId: string,
): Promise<{ dossierId: string } | null> {
  const { data } = await admin()
    .schema('app')
    .from('questionnaire_assignments')
    .select('dossier_id, status, recipient_kind, recipient_contact_id, organization_id')
    .eq('id', assignmentId)
    .maybeSingle();
  const a = data as {
    dossier_id: string | null;
    status: string;
    recipient_kind: string;
    recipient_contact_id: string | null;
    organization_id: string;
  } | null;
  if (!a || a.organization_id !== organizationId || a.recipient_kind !== 'company_rep' || a.recipient_contact_id !== contactId) return null;
  if (a.status !== 'pending' && a.status !== 'in_progress') return null;
  return a.dossier_id ? { dossierId: a.dossier_id } : null;
}

/** Un devis émis pour son entreprise, avec son PDF. */
export async function devisDuReferent(contactId: string, organizationId: string, quoteId: string): Promise<{ storagePath: string } | null> {
  const contact = await contactDe(contactId, organizationId);
  if (!contact?.company_id) return null;
  const { data } = await admin()
    .schema('app')
    .from('quotes')
    .select('company_id, status, organization_id, deleted_at, document:documents(storage_path)')
    .eq('id', quoteId)
    .maybeSingle();
  const q = data as unknown as {
    company_id: string | null;
    status: string;
    organization_id: string;
    deleted_at: string | null;
    document: { storage_path: string | null } | Array<{ storage_path: string | null }> | null;
  } | null;
  if (!q || q.deleted_at || q.status === 'draft' || q.organization_id !== organizationId || q.company_id !== contact.company_id) return null;
  const doc = Array.isArray(q.document) ? q.document[0] : q.document;
  return doc?.storage_path ? { storagePath: doc.storage_path } : null;
}

/** Un e-mail que l'organisme lui a envoyé : son adresse parmi les destinataires, le même organisme. */
export async function courrielDuReferent(
  contactId: string,
  organizationId: string,
  emailLogId: string,
): Promise<{ subject: string | null; sentAt: string | null; html: string | null } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(emailLogId)) return null;
  const contact = await contactDe(contactId, organizationId);
  const email = contact?.email?.trim().toLowerCase();
  if (!email) return null;
  const { data } = await admin()
    .schema('app')
    .from('email_log')
    .select('organization_id, recipient, subject, sent_at, status, body_html')
    .eq('id', emailLogId)
    .maybeSingle();
  const r = data as { organization_id: string | null; recipient: string; subject: string | null; sent_at: string | null; status: string | null; body_html: string | null } | null;
  if (!r || r.organization_id !== organizationId || r.status !== 'sent') return null;
  const destinataires = r.recipient.split(',').map((x) => x.trim().toLowerCase());
  if (!destinataires.includes(email)) return null;
  return { subject: r.subject, sentAt: r.sent_at, html: r.body_html };
}
