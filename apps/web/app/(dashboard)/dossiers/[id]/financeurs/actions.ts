'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { sendEmail, type EmailAttachment } from '@/shared/lib/email/resend';
import { funderEmail } from '@/shared/lib/email/templates';
import { decideTransport } from '@/shared/lib/funders/attachments';
import { guardRowAction } from '@/shared/lib/auth/guard-action';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type ActionResult = { ok: true } | { ok: false; error: string };

type StepRow = {
  email_subject_template: string;
  email_body_template: string;
  required_document_kinds: string[];
  reference_document_codes: string[];
};

type ResolvedAtt = { filename: string; storage_path: string; bytes: number };

// Résout les documents du dossier (par kind) + les CCN (par code) en chemins storage.
async function resolveAttachments(
  sb: ReturnType<typeof admin>,
  orgId: string,
  dossierId: string,
  step: StepRow,
): Promise<ResolvedAtt[]> {
  const out: ResolvedAtt[] = [];

  if (step.required_document_kinds.length > 0) {
    const { data: docs } = await sb
      .schema('app')
      .from('documents')
      .select('title, kind, storage_path, file_size_bytes, status')
      .eq('dossier_id', dossierId)
      .in('kind', step.required_document_kinds)
      .eq('status', 'ready');
    for (const d of (docs ?? []) as Array<{ title: string; storage_path: string | null; file_size_bytes: number | null }>) {
      if (d.storage_path) out.push({ filename: `${d.title}.pdf`, storage_path: d.storage_path, bytes: d.file_size_bytes ?? 0 });
    }
  }

  if (step.reference_document_codes.length > 0) {
    const { data: ccn } = await sb
      .schema('app')
      .from('document_templates')
      .select('code, title, current_version, document_template_versions(version, storage_path)')
      .eq('kind', 'convention_collective')
      .in('code', step.reference_document_codes)
      .or(`organization_id.eq.${orgId},organization_id.is.null`);
    for (const t of (ccn ?? []) as Array<{ title: string; current_version: number; document_template_versions: Array<{ version: number; storage_path: string }> }>) {
      const v = t.document_template_versions?.find((x) => x.version === t.current_version) ?? t.document_template_versions?.[0];
      if (v?.storage_path) out.push({ filename: `${t.title}.pdf`, storage_path: v.storage_path, bytes: 0 });
    }
  }

  return out;
}

export async function prepareFunderTaskDraft(taskId: string, dossierId: string): Promise<ActionResult> {
  const guard = await guardRowAction('dossier_funder_tasks', taskId, 'dossiers');
  if (!guard.ok) return { ok: false, error: guard.error };
  const sb = admin();

  const { data: task } = await sb
    .schema('app').from('dossier_funder_tasks')
    .select('id, organization_id, dossier_id, funder_id, playbook_step_id, status')
    .eq('id', taskId).maybeSingle();
  if (!task) return { ok: false, error: 'Tâche introuvable' };
  const t = task as { organization_id: string; dossier_id: string; funder_id: string; playbook_step_id: string };

  const { data: step } = await sb
    .schema('app').from('funder_playbook_steps')
    .select('email_subject_template, email_body_template, required_document_kinds, reference_document_codes')
    .eq('id', t.playbook_step_id).maybeSingle();
  if (!step) return { ok: false, error: 'Étape de playbook introuvable' };

  const { data: dossier } = await sb
    .schema('app').from('dossiers')
    .select('title, start_date, end_date').eq('id', t.dossier_id).maybeSingle();
  const { data: org } = await sb
    .schema('app').from('organizations').select('name').eq('id', t.organization_id).maybeSingle();

  const d = (dossier ?? {}) as { title?: string; start_date?: string; end_date?: string };
  const vars: Record<string, string> = {
    stagiaire: d.title ?? '',
    dossier: d.title ?? '',
    date_debut: d.start_date ?? '',
    date_fin: d.end_date ?? '',
    organisme: (org as { name?: string } | null)?.name ?? '',
  };

  const s = step as StepRow;
  const rendered = funderEmail(
    { subjectTemplate: s.email_subject_template, bodyTemplate: s.email_body_template },
    vars,
  );

  const resolved = await resolveAttachments(sb, t.organization_id, t.dossier_id, s);
  const transport = decideTransport(resolved.map((r) => r.bytes));

  await sb.schema('app').from('dossier_funder_tasks').update({
    draft_subject: rendered.subject,
    draft_html: rendered.html,
    resolved_attachments: resolved.map((r) => ({ ...r, transport })),
    status: 'drafted',
    updated_at: new Date().toISOString(),
  }).eq('id', taskId);

  revalidatePath(`/dossiers/${dossierId}`);
  return { ok: true };
}

export async function sendFunderTask(taskId: string, dossierId: string): Promise<ActionResult> {
  const guard = await guardRowAction('dossier_funder_tasks', taskId, 'dossiers');
  if (!guard.ok) return { ok: false, error: guard.error };
  const sb = admin();

  const { data: task } = await sb
    .schema('app').from('dossier_funder_tasks')
    .select('id, organization_id, dossier_id, funder_id, draft_subject, draft_html, resolved_attachments, status')
    .eq('id', taskId).maybeSingle();
  if (!task) return { ok: false, error: 'Tâche introuvable' };
  const t = task as {
    organization_id: string; dossier_id: string; funder_id: string;
    draft_subject: string | null; draft_html: string | null;
    resolved_attachments: Array<{ filename: string; storage_path: string; bytes: number; transport: string }>;
  };
  if (!t.draft_subject || !t.draft_html) return { ok: false, error: 'Brouillon non préparé' };

  const { data: funder } = await sb
    .schema('app').from('funders').select('contact_email, name').eq('id', t.funder_id).maybeSingle();
  const to = (funder as { contact_email?: string } | null)?.contact_email;
  if (!to) return { ok: false, error: 'Financeur sans email de contact' };

  const attachments: EmailAttachment[] = [];
  const links: string[] = [];
  for (const a of t.resolved_attachments ?? []) {
    if (a.transport === 'attach') {
      const { data: blob } = await sb.storage.from('documents').download(a.storage_path);
      if (blob) {
        const buf = Buffer.from(await blob.arrayBuffer());
        attachments.push({ filename: a.filename, content: buf.toString('base64') });
      }
    } else {
      const { data: signed } = await sb.storage.from('documents').createSignedUrl(a.storage_path, 60 * 60 * 24 * 7);
      if (signed?.signedUrl) links.push(`<li><a href="${signed.signedUrl}">${a.filename}</a></li>`);
    }
  }
  const html = links.length
    ? `${t.draft_html}<p>Documents volumineux (liens valables 7 jours) :</p><ul>${links.join('')}</ul>`
    : t.draft_html;

  const res = await sendEmail({ to, subject: t.draft_subject, html, attachments });
  if (!res.ok) return { ok: false, error: `Envoi échoué (${res.reason})` };

  await sb.schema('app').from('dossier_funder_tasks').update({
    status: 'sent', sent_at: new Date().toISOString(), resend_message_id: res.id, updated_at: new Date().toISOString(),
  }).eq('id', taskId);

  await sb.schema('infra').from('domain_events').insert({
    organization_id: t.organization_id, aggregate_type: 'dossier', aggregate_id: t.dossier_id,
    type: 'dossier.funder_document_sent',
    payload: { task_id: taskId, funder_id: t.funder_id, message_id: res.id },
  });

  revalidatePath(`/dossiers/${dossierId}`);
  return { ok: true };
}
