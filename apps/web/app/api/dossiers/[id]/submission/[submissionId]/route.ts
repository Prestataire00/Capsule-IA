import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type SubmissionRow = {
  id: string;
  file_path: string | null;
  organization_id: string;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; submissionId: string } },
) {
  // RLS staff : le gestionnaire authentifié ne voit que sa propre org.
  const sb = supabaseServer();

  const { data: raw, error } = await sb
    .schema('app')
    .from('exercise_submissions' as never)
    .select('id, file_path, organization_id')
    .eq('id', params.submissionId)
    .maybeSingle();

  if (error || !raw) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const submission = raw as SubmissionRow;

  if (!submission.file_path) {
    return NextResponse.json({ error: 'no_file' }, { status: 404 });
  }

  // Signer l'URL via service_role (Storage policy learner-submissions est service_role only)
  const admin = supabaseAdmin();
  const { data: signed, error: signError } = await admin.storage
    .from('learner-submissions')
    .createSignedUrl(submission.file_path, 120);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: 'sign_failed' }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
