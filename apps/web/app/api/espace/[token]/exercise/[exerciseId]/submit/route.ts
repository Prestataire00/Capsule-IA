import { NextResponse, type NextRequest } from 'next/server';
import { verifyApprenantToken } from '@/shared/lib/apprenant-token';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'application/zip',
]);

type ExerciseRow = {
  id: string;
  organization_id: string;
  dossier_id: string;
  is_published: boolean;
  deleted_at: string | null;
};

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string; exerciseId: string } },
) {
  // ── 1. Vérification du token apprenant ───────────────────────────────────
  const verified = await verifyApprenantToken(params.token);
  if (!verified.ok) {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }
  const { learnerId, organizationId, dossierId } = verified.value;

  // ── 2. Parse FormData ────────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid_form_data' }, { status: 400 });
  }

  const content = (formData.get('content') as string | null) ?? null;
  const file = formData.get('file') instanceof File
    ? (formData.get('file') as File)
    : null;

  // Au moins une preuve requise
  if (!content && !file) {
    return NextResponse.json(
      { error: 'at_least_one_proof_required' },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();

  // ── 3. Charge et vérifie l'exercice (service_role) ───────────────────────
  const { data: exerciseRaw } = await admin
    .schema('app')
    .from('exercises' as never)
    .select('id, organization_id, dossier_id, is_published, deleted_at')
    .eq('id', params.exerciseId)
    .maybeSingle();

  const exercise = exerciseRaw as ExerciseRow | null;

  if (
    !exercise ||
    exercise.deleted_at !== null ||
    exercise.is_published !== true ||
    exercise.organization_id !== organizationId ||
    exercise.dossier_id !== dossierId
  ) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // ── 4. Upload du fichier si présent ─────────────────────────────────────
  let filePath: string | null = null;

  if (file) {
    // Validation du type MIME
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'unsupported_media_type', allowed: [...ALLOWED_MIME_TYPES] },
        { status: 415 },
      );
    }

    const fileBytes = await file.arrayBuffer();
    const storagePath = `${organizationId}/${params.exerciseId}/${crypto.randomUUID()}-${file.name}`;

    const { error: uploadError } = await admin.storage
      .from('learner-submissions')
      .upload(storagePath, fileBytes, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: 'upload_failed' }, { status: 500 });
    }

    filePath = storagePath;
  }

  // ── 5. Upsert de la soumission (service_role, bypass RLS intentionnel) ───
  // Politique : un nouveau rendu repasse status='submitted' et met à jour
  // content/file_path/submitted_at. Les champs grade/feedback/graded_at/graded_by
  // sont laissés inchangés par l'upsert (onConflict ne les inclut pas).
  const upsertPayload: Record<string, unknown> = {
    organization_id: organizationId,
    exercise_id: params.exerciseId,
    learner_id: learnerId,
    content: content ?? null,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
  };

  // Ne remplace le file_path que si un nouveau fichier a été soumis.
  // Si pas de nouveau fichier, on exclut file_path du payload afin que
  // l'upsert conserve la valeur existante via onConflictDoUpdate partiel.
  // Supabase .upsert() met à jour uniquement les colonnes du payload → OK.
  if (filePath !== null) {
    upsertPayload['file_path'] = filePath;
  }

  const { error: upsertError } = await admin
    .schema('app')
    .from('exercise_submissions' as never)
    .upsert(upsertPayload as never, {
      onConflict: 'exercise_id,learner_id',
      ignoreDuplicates: false,
    });

  if (upsertError) {
    return NextResponse.json({ error: 'submission_failed' }, { status: 500 });
  }

  // ── 6. Redirect vers la page exercices ──────────────────────────────────
  return NextResponse.redirect(
    new URL(`/espace/${params.token}/exercices`, req.url),
    303,
  );
}
