'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { verifyEntrepriseToken } from '@/shared/lib/entreprise-token';
import { CATEGORY_LABELS, reclamationEntrepriseSchema } from '@/features/complaints/categories';

const escapeHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Réclamation déposée par le référent du client depuis son espace entreprise
 * — c'est désormais l'entreprise qui la fait, plus le stagiaire. Le lien du
 * référent fait foi : le dossier visé doit être l'un des siens.
 */
export async function deposerReclamationEntreprise(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '');
  const base = `/espace-entreprise/${token}/reclamation`;
  const p = reclamationEntrepriseSchema.safeParse({
    token,
    dossierId: formData.get('dossierId') ?? '',
    category: formData.get('category'),
    subject: formData.get('subject'),
    description: formData.get('description'),
  });
  if (!p.success) redirect(`${base}?erreur=${encodeURIComponent(p.error.issues[0]?.message ?? 'Formulaire incomplet')}`);
  const lien = await verifyEntrepriseToken(p.data.token);
  if (!lien.ok) redirect(`/espace-entreprise/${token}`);
  const { contactId, organizationId } = lien.value;
  const admin = supabaseAdmin();

  const { data: c } = await admin
    .schema('app')
    .from('contacts')
    .select('first_name, last_name, email, company_id')
    .eq('id', contactId)
    .maybeSingle();
  const contact = c as { first_name: string | null; last_name: string | null; email: string | null; company_id: string | null } | null;

  let dossierId: string | null = null;
  if (p.data.dossierId) {
    const { data: d } = await admin
      .schema('app')
      .from('dossiers')
      .select('id')
      .eq('id', p.data.dossierId)
      .eq('organization_id', organizationId)
      .eq('contact_id' as never, contactId as never)
      .maybeSingle();
    if (!d) redirect(`${base}?erreur=${encodeURIComponent('Ce dossier ne vous concerne pas.')}`);
    dossierId = p.data.dossierId;
  }

  const nom = `${contact?.first_name ?? ''} ${contact?.last_name ?? ''}`.trim() || 'Référent client';
  const h = headers();
  const reference = `REC-${new Date().getFullYear()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  const { data: cree, error } = await admin
    .schema('app')
    .from('complaints')
    .insert({
      organization_id: organizationId,
      reference,
      dossier_id: dossierId,
      company_id: contact?.company_id ?? null,
      source: 'other',
      channel: 'espace_entreprise',
      reporter_name: nom,
      reporter_email: contact?.email ?? null,
      subject: p.data.subject,
      description: p.data.description,
      severity: 'medium',
      status: 'open',
      metadata: {
        category: p.data.category,
        category_label: CATEGORY_LABELS[p.data.category],
        submitted_from: 'espace_entreprise',
        contact_id: contactId,
        ip_address: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        user_agent: h.get('user-agent'),
      },
    } as never)
    .select('id')
    .single();
  if (error || !cree) redirect(`${base}?erreur=${encodeURIComponent('La réclamation n’a pas pu être enregistrée. Réessayez.')}`);

  const { error: evtErr } = await admin
    .schema('app')
    .from('complaint_events')
    .insert({
      organization_id: organizationId,
      complaint_id: (cree as { id: string }).id,
      kind: 'comment',
      payload: { by: nom, text: 'Réclamation envoyée depuis l’espace entreprise.', from_company: true },
    } as never);
  if (evtErr) console.error('[réclamation entreprise] historique non créé', evtErr.message);

  if (env.OF_NOTIFICATION_EMAIL) {
    const r = await sendEmail({
      to: env.OF_NOTIFICATION_EMAIL,
      subject: `Nouvelle réclamation d’un client · ${p.data.subject}`,
      html: `<p><strong>${escapeHtml(nom)}</strong>${contact?.email ? ` (${escapeHtml(contact.email)})` : ''} a déposé une réclamation depuis son espace entreprise.</p>
<p>Référence : <strong>${reference}</strong> · ${escapeHtml(CATEGORY_LABELS[p.data.category])}</p>
<p><strong>${escapeHtml(p.data.subject)}</strong></p><p style="white-space:pre-wrap">${escapeHtml(p.data.description)}</p>`,
      organizationId,
      kind: 'reclamation_entreprise',
    });
    if (!r.ok && r.reason !== 'no_api_key') console.error('[réclamation entreprise] équipe non prévenue', r.reason);
  }

  redirect(`${base}?envoyee=${reference}`);
}
