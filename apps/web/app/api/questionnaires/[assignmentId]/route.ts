import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { generateQuestionnairePDF, type QuestionnairePdfInput } from '@/features/documents/generate-questionnaire-pdf';
import { loadOrgBranding } from '@/features/documents/load-org-branding';
import type { QuestionnaireSchema } from '@/features/questionnaire/schema';

export const dynamic = 'force-dynamic';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'];

async function resolveAdminOrgId(sb: ReturnType<typeof admin>, userId: string): Promise<string | null> {
  const { data } = await sb
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  const m = data as { organization_id: string; role: string } | null;
  if (!m || !ADMIN_ROLES.includes(m.role)) return null;
  return m.organization_id;
}

function formatAnswer(schema: QuestionnaireSchema, id: string, raw: unknown): string {
  if (raw === undefined || raw === null || raw === '') return '—';
  const q = schema.questions.find((x) => x.id === id);
  if (!q) return String(raw);
  if (q.type === 'rating') return `${raw}/${q.max}`;
  if (q.type === 'nps') return `${raw}/10`;
  return String(raw);
}

export async function GET(_req: NextRequest, { params }: { params: { assignmentId: string } }) {
  // Garde : admin authentifié de l'org propriétaire.
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const sb = admin();
  const orgId = await resolveAdminOrgId(sb, user.id);
  if (!orgId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: aData } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, organization_id, template_id, dossier_id, recipient_name')
    .eq('id', params.assignmentId)
    .maybeSingle();
  const assignment = aData as {
    organization_id: string;
    template_id: string;
    dossier_id: string;
    recipient_name: string | null;
  } | null;
  if (!assignment || assignment.organization_id !== orgId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const [{ data: tData }, { data: rData }, { data: oData }, { data: dData }] = await Promise.all([
    sb.schema('app').from('questionnaire_templates').select('title, schema').eq('id', assignment.template_id).maybeSingle(),
    sb.schema('app').from('questionnaire_responses').select('answers, submitted_at').eq('assignment_id', params.assignmentId).maybeSingle(),
    sb.schema('app').from('organizations').select('name, siret, declaration_activite').eq('id', orgId).maybeSingle(),
    sb.schema('app').from('dossiers').select('reference, formation:formations(title)').eq('id', assignment.dossier_id).maybeSingle(),
  ]);

  const template = tData as { title: string; schema: QuestionnaireSchema } | null;
  const response = rData as { answers: Record<string, unknown>; submitted_at: string | null } | null;
  if (!template || !response) return NextResponse.json({ error: 'no_response' }, { status: 404 });

  const org = oData as { name: string; siret: string | null; declaration_activite: string | null } | null;
  const dossier = dData as { reference: string; formation: { title: string } | null } | null;

  const branding = await loadOrgBranding(sb as never, orgId);

  const input: QuestionnairePdfInput = {
    organization: {
      name: org?.name ?? 'Organisme de formation',
      siret: org?.siret ?? null,
      nda: org?.declaration_activite ?? null,
    },
    logoPng: branding.logoPng,
    dossierReference: dossier?.reference ?? '—',
    formationTitle: dossier?.formation?.title ?? '—',
    questionnaireTitle: template.title,
    respondent: assignment.recipient_name,
    submittedAt: response.submitted_at,
    answers: template.schema.questions.map((q) => ({
      label: q.label,
      value: formatAnswer(template.schema, q.id, response.answers?.[q.id]),
    })),
  };

  const pdfBytes = await generateQuestionnairePDF(input);
  const filename = `questionnaire-${dossier?.reference ?? params.assignmentId}.pdf`;

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
    },
  });
}
