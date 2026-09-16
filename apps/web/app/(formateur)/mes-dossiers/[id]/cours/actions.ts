'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireMyTrainerDossier } from '@/features/trainer-space/my-dossiers';
import { problemesDuQuiz, MAX_CHOIX, MAX_QUESTIONS, type QuestionQuiz } from '@/features/pedagogie/quiz';
import { FORMES, problemesDuContenu, type ContenuExercice, type Forme } from '@/features/pedagogie/kinds';
import { parseTexteATrou } from '@/features/pedagogie/cloze';
import { genererBrouillon, type BrouillonIA } from '@/features/pedagogie/generate-with-ai';
import { chargerContexteFormation } from '@/features/pedagogie/contexte';
import { creerTravail, majTravail, supprimerTravail } from '@/features/pedagogie/store';

/**
 * Préparation du cours par le formateur, sur un dossier qui lui est confié.
 *
 * Chaque action repasse par `requireMyTrainerDossier` : l'identifiant vient du
 * client, cette garde est la seule chose qui sépare un formateur des dossiers
 * des autres. Les écritures qui suivent se font en service role, pour ce
 * dossier seulement.
 */

export type Resultat = { ok: true } | { ok: false; error: string };

const questionSchema = z.object({
  id: z.string().optional(),
  enonce: z.string().trim().max(500),
  choix: z.array(z.string().trim().max(300)).max(MAX_CHOIX),
  bonnes: z.array(z.number().int().min(0)),
  points: z.number().min(0).max(100),
});

const contenuSchema = z.object({
  texte: z.string().max(8000).optional(),
  cartes: z.array(z.object({ recto: z.string().max(300), verso: z.string().max(500) })).max(60).optional(),
  url: z.string().max(1000).optional(),
  description: z.string().max(2000).optional(),
});

const creationSchema = z.object({
  dossierId: z.string().uuid(),
  kind: z.enum(FORMES),
  contenu: contenuSchema.optional(),
  aiAssisted: z.boolean().optional(),
  title: z.string().trim().min(1).max(200),
  instructions: z.string().trim().max(5000).optional(),
  sessionId: z.union([z.literal(''), z.string().uuid()]).optional(),
  dueAt: z.union([z.literal(''), z.string()]).optional(),
  passScore: z.number().min(0).max(100).nullable().optional(),
  questions: z.array(questionSchema).max(MAX_QUESTIONS).optional(),
  publier: z.boolean(),
});

async function organisationDuDossier(dossierId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .schema('app')
    .from('dossiers')
    .select('organization_id')
    .eq('id', dossierId)
    .maybeSingle();
  return (data as { organization_id: string } | null)?.organization_id ?? null;
}

export async function creerTravailFormateur(input: {
  dossierId: string;
  kind: Forme;
  contenu?: ContenuExercice;
  aiAssisted?: boolean;
  title: string;
  instructions?: string;
  sessionId?: string;
  dueAt?: string;
  passScore?: number | null;
  questions?: Array<{ id?: string; enonce: string; choix: string[]; bonnes: number[]; points: number }>;
  publier: boolean;
}): Promise<Resultat> {
  const p = creationSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Saisie invalide.' };

  const acces = await requireMyTrainerDossier(p.data.dossierId);
  if (!acces.ok) return { ok: false, error: "Ce dossier ne vous est pas confié." };

  const organizationId = await organisationDuDossier(p.data.dossierId);
  if (!organizationId) return { ok: false, error: 'Dossier introuvable.' };

  const questions: QuestionQuiz[] = (p.data.questions ?? []).map((q) => ({
    id: q.id && q.id.length > 0 ? q.id : randomUUID(),
    enonce: q.enonce,
    choix: q.choix,
    bonnes: q.bonnes,
    points: q.points,
  }));

  const contenu: ContenuExercice = p.data.contenu ?? {};

  // Un contenu incomplet n'est refusé qu'à la publication : on enregistre un
  // brouillon autant de fois qu'il le faut, on ne diffuse que ce qui tient.
  if (p.data.publier) {
    if (p.data.kind === 'quiz' || p.data.kind === 'video') {
      const problemes = problemesDuQuiz(questions);
      if (problemes.length > 0) {
        const premier = problemes[0]!;
        return {
          ok: false,
          error: premier.question ? `Question ${premier.question} : ${premier.motif}` : premier.motif,
        };
      }
    }
    const trous = p.data.kind === 'texte_a_trou' ? parseTexteATrou(contenu.texte ?? '').reponses.length : 0;
    const soucis = problemesDuContenu(p.data.kind, contenu, trous);
    if (soucis.length > 0) return { ok: false, error: soucis[0]!.motif };
  }
  if (p.data.kind === 'quiz' && questions.length === 0) {
    return { ok: false, error: 'Ajoutez au moins une question.' };
  }

  const res = await creerTravail({
    organizationId,
    dossierId: p.data.dossierId,
    userId: acces.userId,
    kind: p.data.kind,
    contenu,
    aiAssisted: p.data.aiAssisted ?? false,
    title: p.data.title,
    instructions: p.data.instructions ?? null,
    questions,
    passScore: p.data.passScore ?? null,
    sessionId: p.data.sessionId || null,
    dueAt: p.data.dueAt ? new Date(p.data.dueAt).toISOString() : null,
    isPublished: p.data.publier,
  });
  if (!res.ok) return { ok: false, error: "Le travail n'a pas été enregistré." };

  revalidatePath(`/mes-dossiers/${p.data.dossierId}/cours`);
  return { ok: true };
}

const publicationSchema = z.object({
  dossierId: z.string().uuid(),
  travailId: z.string().uuid(),
  publier: z.boolean(),
});

export async function publierTravail(input: {
  dossierId: string;
  travailId: string;
  publier: boolean;
}): Promise<Resultat> {
  const p = publicationSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Demande invalide.' };

  const acces = await requireMyTrainerDossier(p.data.dossierId);
  if (!acces.ok) return { ok: false, error: "Ce dossier ne vous est pas confié." };

  // Publier un quiz vide de bonnes réponses le rendrait incorrigible.
  if (p.data.publier) {
    const { data } = await supabaseAdmin()
      .schema('app')
      .from('exercises' as never)
      .select('kind, questions')
      .eq('id', p.data.travailId)
      .eq('dossier_id', p.data.dossierId)
      .maybeSingle();
    const row = data as unknown as { kind: string | null; questions: unknown } | null;
    if (row?.kind === 'quiz') {
      const { lireQuestions } = await import('@/features/pedagogie/store');
      const problemes = problemesDuQuiz(lireQuestions(row.questions));
      if (problemes.length > 0) {
        const premier = problemes[0]!;
        return {
          ok: false,
          error: premier.question ? `Question ${premier.question} : ${premier.motif}` : premier.motif,
        };
      }
    }
  }

  const ok = await majTravail(p.data.dossierId, p.data.travailId, { is_published: p.data.publier });
  if (!ok) return { ok: false, error: "La publication n'a pas été enregistrée." };

  revalidatePath(`/mes-dossiers/${p.data.dossierId}/cours`);
  return { ok: true };
}

const suppressionSchema = z.object({ dossierId: z.string().uuid(), travailId: z.string().uuid() });

export async function supprimerTravailFormateur(input: {
  dossierId: string;
  travailId: string;
}): Promise<Resultat> {
  const p = suppressionSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Demande invalide.' };

  const acces = await requireMyTrainerDossier(p.data.dossierId);
  if (!acces.ok) return { ok: false, error: "Ce dossier ne vous est pas confié." };

  const ok = await supprimerTravail(p.data.dossierId, p.data.travailId);
  if (!ok) return { ok: false, error: "Le retrait n'a pas été enregistré." };

  revalidatePath(`/mes-dossiers/${p.data.dossierId}/cours`);
  return { ok: true };
}

const generationSchema = z.object({
  dossierId: z.string().uuid(),
  kind: z.enum(FORMES),
  sessionId: z.union([z.literal(''), z.string().uuid()]).optional(),
  consigne: z.string().trim().max(1000).optional(),
});

export type GenerationIAResult = { ok: true; brouillon: BrouillonIA } | { ok: false; error: string };

/**
 * Brouillon proposé par l'IA à partir de la formation elle-même : ses objectifs,
 * son programme, sa durée, sa modalité et le nombre de participants. Rien n'est
 * enregistré — le formateur relit et corrige, la direction valide ensuite.
 */
export async function genererAvecIA(input: {
  dossierId: string;
  kind: Forme;
  sessionId?: string;
  consigne?: string;
}): Promise<GenerationIAResult> {
  const p = generationSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Demande invalide.' };

  const acces = await requireMyTrainerDossier(p.data.dossierId);
  if (!acces.ok) return { ok: false, error: "Ce dossier ne vous est pas confié." };

  const contexte = await chargerContexteFormation(p.data.dossierId, {
    sessionId: p.data.sessionId || null,
    consigne: p.data.consigne ?? null,
  });
  if (!contexte) return { ok: false, error: 'Dossier introuvable.' };

  const res = await genererBrouillon(p.data.kind, contexte);
  if (!res.ok) {
    return {
      ok: false,
      error:
        res.reason === 'no_api_key'
          ? "L'assistance IA n'est pas configurée sur ce serveur."
          : "La proposition n'a pas abouti. Reformulez votre demande, ou rédigez à la main.",
    };
  }
  return { ok: true, brouillon: res.brouillon };
}
