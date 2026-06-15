'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

const SOURCES = ['email', 'phone', 'questionnaire', 'in_person', 'other'] as const;
const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

export async function createComplaint(fd: FormData): Promise<void> {
  const sb = admin();
  const { data: org } = await sb.schema('app').from('organizations').select('id').limit(1).maybeSingle();
  const orgId = (org as { id?: string } | null)?.id;
  if (!orgId) redirect('/reclamations?error=no_org');

  const subject = str(fd, 'subject');
  const description = str(fd, 'description');
  if (!subject || !description) redirect('/reclamations/nouvelle?error=missing');

  const sourceRaw = str(fd, 'source');
  const source = sourceRaw && (SOURCES as readonly string[]).includes(sourceRaw) ? sourceRaw : 'other';
  const sevRaw = str(fd, 'severity');
  const severity = sevRaw && (SEVERITIES as readonly string[]).includes(sevRaw) ? sevRaw : 'medium';

  const reference = `RC-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36).slice(-5).toUpperCase()}`;

  const { error } = await sb.schema('app').from('complaints').insert({
    organization_id: orgId,
    reference,
    source,
    subject,
    description,
    severity,
    reporter_name: str(fd, 'reporterName'),
    reporter_email: str(fd, 'reporterEmail'),
    status: 'open',
  });
  if (error) redirect(`/reclamations/nouvelle?error=${encodeURIComponent(error.message)}`);
  redirect('/reclamations');
}
