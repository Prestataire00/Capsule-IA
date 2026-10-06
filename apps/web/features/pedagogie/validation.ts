import 'server-only';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { estForme, FORME_LABELS, type ContenuExercice, type Forme } from './kinds';
import { lireQuestions } from './store';
import { parseTexteATrou } from './cloze';
import type { QuestionQuiz } from './quiz';
import { etiquettesDossiers, type DossierConcerne } from './dossiers-concernes';

/**
 * File de validation des contenus pédagogiques (0172).
 *
 * Même règle que les supports (0165) : ce qu'un intervenant extérieur prépare
 * n'atteint les stagiaires qu'avec l'accord de la direction. Le quiz est
 * montré en entier — bonnes réponses comprises — car c'est précisément ce que
 * l'administrateur doit vérifier.
 */

export type CoursAValider = {
  readonly id: string;
  readonly kind: Forme;
  readonly formeLabel: string;
  readonly title: string;
  readonly instructions: string | null;
  readonly questions: QuestionQuiz[];
  readonly contenu: ContenuExercice;
  readonly trous: string[];
  readonly aiAssisted: boolean;
  readonly submittedAt: string;
  readonly authorName: string;
  readonly authorUserId: string | null;
  readonly dossier: DossierConcerne | null;
  /** La séance que le quiz prépare, quand il en prépare une. */
  readonly seance: { readonly id: string; readonly titre: string | null; readonly debut: string | null } | null;
};

export async function loadCoursAValider(organizationId: string): Promise<CoursAValider[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .schema('app')
    .from('exercises' as never)
    .select(
      'id, kind, title, instructions, questions, content, ai_assisted, submitted_at, created_by, dossier_id, session_id',
    )
    .eq('organization_id', organizationId)
    .eq('validation_status', 'en_attente')
    .eq('is_published', true)
    .is('deleted_at', null)
    .order('submitted_at', { ascending: true })
    .limit(100);
  if (error) {
    console.error('[pedagogie] file de validation illisible', organizationId, error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    kind: string | null;
    title: string;
    instructions: string | null;
    questions: unknown;
    content: unknown;
    ai_assisted: boolean | null;
    submitted_at: string;
    created_by: string | null;
    dossier_id: string;
    session_id: string | null;
  }>;
  if (rows.length === 0) return [];

  const idsSeances = [...new Set(rows.map((r) => r.session_id).filter((x): x is string => Boolean(x)))];
  const [{ data: auteurs }, dossiers, { data: seancesData }] = await Promise.all([
    admin
      .schema('app')
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', [...new Set(rows.map((r) => r.created_by).filter((x): x is string => Boolean(x)))]),
    etiquettesDossiers(admin, organizationId, rows.map((r) => r.dossier_id)),
    idsSeances.length
      ? admin.schema('app').from('sessions').select('id, title, starts_at').eq('organization_id', organizationId).in('id', idsSeances)
      : Promise.resolve({ data: [] }),
  ]);
  const noms = new Map(
    ((auteurs ?? []) as Array<{ user_id: string; full_name: string | null }>).map((p) => [p.user_id, p.full_name]),
  );
  const seances = new Map(
    ((seancesData ?? []) as Array<{ id: string; title: string | null; starts_at: string | null }>).map((x) => [x.id, x]),
  );

  return rows.map((r) => {
    const kind = estForme(r.kind) ? r.kind : 'devoir';
    const contenu = (r.content ?? {}) as ContenuExercice;
    return {
      id: r.id,
      kind,
      formeLabel: FORME_LABELS[kind],
      title: r.title,
      instructions: r.instructions,
      questions: lireQuestions(r.questions),
      contenu,
      trous: kind === 'texte_a_trou' ? [...parseTexteATrou(contenu.texte ?? '').reponses] : [],
      aiAssisted: Boolean(r.ai_assisted),
      submittedAt: r.submitted_at,
      authorName: (r.created_by ? noms.get(r.created_by) : null) ?? 'Formateur',
      authorUserId: r.created_by,
      dossier: dossiers.get(r.dossier_id) ?? null,
      seance: (() => {
        const x = r.session_id ? seances.get(r.session_id) : undefined;
        return x ? { id: x.id, titre: x.title, debut: x.starts_at } : null;
      })(),
    };
  });
}

export async function countCoursAValider(organizationId: string): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .schema('app')
    .from('exercises' as never)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('validation_status', 'en_attente')
    .eq('is_published', true)
    .is('deleted_at', null);
  return error ? 0 : (count ?? 0);
}

export type CoursDecide = {
  readonly id: string;
  readonly dossierId: string;
  readonly title: string;
  readonly authorUserId: string | null;
};

/** Valide ou refuse. L'organisation est dans le filtre, pas seulement chez l'appelant. */
export async function decideCours(input: {
  organizationId: string;
  exerciseId: string;
  decision: 'valide' | 'refuse';
  reviewerUserId: string;
  reason?: string | null;
}): Promise<CoursDecide | null> {
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('exercises' as never)
    .update({
      validation_status: input.decision,
      validated_by: input.reviewerUserId,
      validated_at: new Date().toISOString(),
      rejection_reason: input.decision === 'refuse' ? (input.reason ?? null) : null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', input.exerciseId)
    .eq('organization_id', input.organizationId)
    .eq('validation_status', 'en_attente')
    .is('deleted_at', null)
    .select('id, dossier_id, title, created_by')
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('[pedagogie] décision non enregistrée', input.exerciseId, error.message);
    return null;
  }
  const r = data as unknown as { id: string; dossier_id: string; title: string; created_by: string | null };
  return { id: r.id, dossierId: r.dossier_id, title: r.title, authorUserId: r.created_by };
}
