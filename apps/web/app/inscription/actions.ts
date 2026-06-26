'use server';

import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { sendEmail } from '@/shared/lib/email/resend';
import {
  prospectConfirmationEmail,
  prospectInternalNotificationEmail,
} from '@/shared/lib/email/templates';
import { derivePrimaryFunder } from '@/features/prospect/funding';
import {
  prospectFieldsSchema,
  companyEnrollmentSchema,
  MAX_FILE_SIZE,
  ALLOWED_FILE_TYPES,
  type ProspectFields,
} from './schema';

const FUNDER_LABELS: Record<ProspectFields['funderKinds'][number], string> = {
  opco: 'OPCO',
  cpf: 'CPF',
  faf_ca: 'FAF / Chef d’entreprise',
  agefiph: 'Agefiph',
  entreprise: 'Entreprise',
  autofinancement: 'Autofinancement',
};

const SITUATION_LABELS: Record<ProspectFields['situation'], string> = {
  salarie: 'Salarié(e)',
  demandeur: "Demandeur d'emploi",
  independant: 'Indépendant(e)',
  particulier: 'Particulier',
};

export type SubmitResult =
  | { ok: true; prospectId: string }
  | { ok: false; error: string; details?: unknown };

type ProspectDocMetadata = {
  key: string;
  label: string;
  storage_path: string;
  size: number;
  content_type: string;
  uploaded_at: string;
};

// Untyped admin client — `prospects` n'est pas encore dans Database (le
// regénérera via `pnpm db:types` une fois la migration appliquée).
const adminClient = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

function nullify(v: string | undefined | null) {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

export async function submitProspect(formData: FormData): Promise<SubmitResult> {
  const payloadRaw = formData.get('payload');
  if (typeof payloadRaw !== 'string') {
    return { ok: false, error: 'missing_payload' };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return { ok: false, error: 'invalid_payload_json' };
  }

  const parsed = prospectFieldsSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', details: parsed.error.flatten() };
  }
  const fields: ProspectFields = parsed.data;

  const fileEntries: { key: string; file: File }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('file_')) continue;
    if (!(value instanceof File) || value.size === 0) continue;
    if (value.size > MAX_FILE_SIZE) {
      return { ok: false, error: 'file_too_large', details: { key, size: value.size } };
    }
    if (!ALLOWED_FILE_TYPES.includes(value.type as (typeof ALLOWED_FILE_TYPES)[number])) {
      return { ok: false, error: 'invalid_file_type', details: { key, type: value.type } };
    }
    fileEntries.push({ key: key.slice('file_'.length), file: value });
  }

  const supabase = adminClient();
  const h = headers();
  const ipHeader = h.get('x-forwarded-for') ?? h.get('x-real-ip');
  const ip = ipHeader ? ipHeader.split(',')[0]?.trim() ?? null : null;

  const isIndividual =
    fields.situation === 'independant' || fields.situation === 'particulier';

  // Résout l'OF + le titre depuis la formation choisie (service-role → hors RLS).
  // Rattache le prospect au bon OF pour qu'il apparaisse dans SON triage.
  const formationId = nullify(fields.formationId);
  let organizationId: string | null = null;
  let formationTitle: string | null = null;
  if (formationId) {
    const { data: formation } = await supabase
      .schema('app')
      .from('formations')
      .select('organization_id, title')
      .eq('id', formationId)
      .is('deleted_at', null)
      .maybeSingle();
    if (formation) {
      organizationId = (formation as { organization_id: string }).organization_id;
      formationTitle = (formation as { title: string }).title;
    }
  }

  const insertRow = {
    organization_id: organizationId,
    civility: fields.civility ?? null,
    first_name: fields.firstName,
    last_name: fields.lastName,
    email: fields.email,
    phone: nullify(fields.phone),
    birth_date: nullify(fields.birthDate),
    rqth: fields.rqth,
    formation_id: formationId,
    preferred_modality: nullify(fields.preferredModality),
    preferred_start_date: nullify(fields.preferredStartDate),
    message: nullify(fields.message),
    situation: fields.situation,
    company_name: nullify(fields.companyName),
    company_siret: isIndividual ? null : fields.companySiret || null,
    company_address: isIndividual ? null : fields.companyAddress ?? null,
    referent_name: isIndividual ? null : fields.referentName || null,
    referent_email: isIndividual ? null : fields.referentEmail || null,
    referent_phone: isIndividual ? null : fields.referentPhone || null,
    funder_kinds: fields.funderKinds,
    funder_kind: derivePrimaryFunder(fields.funderKinds),
    needs_analysis: fields.needsAnalysis ?? null,
    source: 'web_form',
    ip_address: ip,
    user_agent: h.get('user-agent') ?? null,
  };

  const { data: prospect, error: insertErr } = await supabase
    .schema('app')
    .from('prospects')
    .insert(insertRow as never)
    .select('id')
    .single();

  if (insertErr || !prospect) {
    console.error('[submitProspect] insert failed', insertErr);
    return { ok: false, error: 'db_insert_failed', details: insertErr?.message };
  }

  const prospectId = (prospect as { id: string }).id;
  const uploaded: ProspectDocMetadata[] = [];

  for (const { key, file } of fileEntries) {
    const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'bin';
    const path = `${prospectId}/${key}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await supabase.storage
      .from('prospect-documents')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadErr) {
      console.error(`[submitProspect] upload failed for ${key}`, uploadErr);
      continue;
    }

    uploaded.push({
      key,
      label: file.name,
      storage_path: path,
      size: file.size,
      content_type: file.type,
      uploaded_at: new Date().toISOString(),
    });
  }

  if (uploaded.length > 0) {
    const { error: updateErr } = await supabase
      .schema('app')
      .from('prospects')
      .update({ documents: uploaded })
      .eq('id', prospectId);

    if (updateErr) {
      console.error('[submitProspect] documents update failed', updateErr);
    }
  }

  // Notifications email — non bloquantes. Si pas de RESEND_API_KEY,
  // sendEmail renvoie { ok:false, reason:'no_api_key' } silencieusement.
  // formationTitle déjà résolu plus haut (avec organization_id).
  const funderLabel = fields.funderKinds
    .map((k) => FUNDER_LABELS[k])
    .join(', ');

  const baseEmailData = {
    firstName: fields.firstName,
    lastName: fields.lastName,
    email: fields.email,
    formationTitle,
    funderLabel,
    prospectId,
  };

  const confirmation = prospectConfirmationEmail(baseEmailData);
  void sendEmail({
    to: fields.email,
    subject: confirmation.subject,
    html: confirmation.html,
    replyTo: env.OF_NOTIFICATION_EMAIL,
  }).then((r) => {
    if (!r.ok && r.reason !== 'no_api_key') {
      console.error('[submitProspect] confirmation email failed', r);
    }
  });

  if (env.OF_NOTIFICATION_EMAIL) {
    const dashboardUrl = env.PUBLIC_APP_URL
      ? `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/prospects/${prospectId}`
      : null;
    const notif = prospectInternalNotificationEmail({
      ...baseEmailData,
      situation: SITUATION_LABELS[fields.situation],
      companyName: nullify(fields.companyName),
      message: nullify(fields.message),
      phone: nullify(fields.phone),
      rqth: fields.rqth,
      documentsCount: uploaded.length,
      dashboardUrl,
    });
    void sendEmail({
      to: env.OF_NOTIFICATION_EMAIL,
      subject: notif.subject,
      html: notif.html,
      replyTo: fields.email,
    }).then((r) => {
      if (!r.ok && r.reason !== 'no_api_key') {
        console.error('[submitProspect] internal notif email failed', r);
      }
    });
  }

  return { ok: true, prospectId };
}

export type CompanySubmitResult =
  | { ok: true; count: number }
  | { ok: false; error: string; details?: unknown };

/**
 * Inscription groupée par une entreprise : un prospect par salarié, partageant
 * entreprise / référent / formation / financement. Pas de documents à ce stade
 * (l'OF les collecte au triage). Emails non bloquants : confirmation au référent
 * + notification interne récapitulative.
 */
export async function submitCompanyEnrollment(formData: FormData): Promise<CompanySubmitResult> {
  const payloadRaw = formData.get('payload');
  if (typeof payloadRaw !== 'string') {
    return { ok: false, error: 'missing_payload' };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return { ok: false, error: 'invalid_payload_json' };
  }

  const parsed = companyEnrollmentSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', details: parsed.error.flatten() };
  }
  const fields = parsed.data;

  const supabase = adminClient();
  const h = headers();
  const ipHeader = h.get('x-forwarded-for') ?? h.get('x-real-ip');
  const ip = ipHeader ? ipHeader.split(',')[0]?.trim() ?? null : null;
  const userAgent = h.get('user-agent') ?? null;

  // Rattache au bon OF + récupère le titre via la formation choisie (hors RLS).
  const formationId = nullify(fields.formationId);
  let organizationId: string | null = null;
  let formationTitle: string | null = null;
  if (formationId) {
    const { data: formation } = await supabase
      .schema('app')
      .from('formations')
      .select('organization_id, title')
      .eq('id', formationId)
      .is('deleted_at', null)
      .maybeSingle();
    if (formation) {
      organizationId = (formation as { organization_id: string }).organization_id;
      formationTitle = (formation as { title: string }).title;
    }
  }

  const primaryFunder = derivePrimaryFunder(fields.funderKinds);
  const companyAddress = fields.companyAddress ?? null;
  // Regroupe les salariés inscrits en une même soumission (un prospect chacun).
  const companyBatchId = crypto.randomUUID();

  const rows = fields.employees.map((emp) => ({
    organization_id: organizationId,
    civility: emp.civility ?? null,
    first_name: emp.firstName,
    last_name: emp.lastName,
    email: emp.email,
    phone: nullify(emp.phone),
    birth_date: nullify(emp.birthDate),
    rqth: emp.rqth,
    formation_id: formationId,
    preferred_modality: nullify(fields.preferredModality),
    preferred_start_date: nullify(fields.preferredStartDate),
    message: nullify(fields.message),
    situation: 'salarie' as const,
    company_name: fields.companyName,
    company_siret: fields.companySiret || null,
    company_siren: fields.companySiren || null,
    company_address: companyAddress,
    referent_name: fields.referentName || null,
    referent_email: fields.referentEmail || null,
    referent_phone: fields.referentPhone || null,
    company_headcount_n1: fields.companyHeadcountN1 ?? null,
    employees_to_train: fields.employeesToTrain ?? null,
    training_budget_used: fields.trainingBudgetUsed ?? null,
    company_batch_id: companyBatchId,
    funder_kinds: fields.funderKinds,
    funder_kind: primaryFunder,
    needs_analysis: emp.needsAnalysis ?? null,
    source: 'web_form_company',
    ip_address: ip,
    user_agent: userAgent,
  }));

  const { data: inserted, error: insertErr } = await supabase
    .schema('app')
    .from('prospects')
    .insert(rows as never)
    .select('id');

  if (insertErr || !inserted) {
    console.error('[submitCompanyEnrollment] insert failed', insertErr);
    return { ok: false, error: 'db_insert_failed', details: insertErr?.message };
  }
  const insertedRows = inserted as { id: string }[];
  const count = insertedRows.length;
  const firstId = insertedRows[0]?.id ?? '';

  const funderLabel = fields.funderKinds.map((k) => FUNDER_LABELS[k]).join(', ');

  // Confirmation au référent (s'il a laissé un email).
  if (fields.referentEmail) {
    const confirmation = prospectConfirmationEmail({
      firstName: fields.referentName || fields.companyName,
      lastName: '',
      email: fields.referentEmail,
      formationTitle,
      funderLabel,
      prospectId: firstId,
    });
    void sendEmail({
      to: fields.referentEmail,
      subject: confirmation.subject,
      html: confirmation.html,
      replyTo: env.OF_NOTIFICATION_EMAIL,
    }).then((r) => {
      if (!r.ok && r.reason !== 'no_api_key') {
        console.error('[submitCompanyEnrollment] confirmation email failed', r);
      }
    });
  }

  // Notification interne récapitulative à l'OF.
  if (env.OF_NOTIFICATION_EMAIL) {
    const dashboardUrl = env.PUBLIC_APP_URL
      ? `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/prospects`
      : null;
    const employeesList = fields.employees
      .map((e) => `${e.firstName} ${e.lastName} (${e.email})`)
      .join(', ');
    const notif = prospectInternalNotificationEmail({
      firstName: fields.companyName,
      lastName: `${count} salarié${count > 1 ? 's' : ''}`,
      email: fields.referentEmail || '',
      formationTitle,
      funderLabel,
      prospectId: firstId,
      situation: `Inscription entreprise — ${count} salarié${count > 1 ? 's' : ''}`,
      companyName: fields.companyName,
      message: employeesList,
      phone: nullify(fields.referentPhone),
      rqth: false,
      documentsCount: 0,
      dashboardUrl,
    });
    void sendEmail({
      to: env.OF_NOTIFICATION_EMAIL,
      subject: notif.subject,
      html: notif.html,
      replyTo: fields.referentEmail || undefined,
    }).then((r) => {
      if (!r.ok && r.reason !== 'no_api_key') {
        console.error('[submitCompanyEnrollment] internal notif email failed', r);
      }
    });
  }

  return { ok: true, count };
}
