'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { requireMyTrainerDossier } from '@/features/trainer-space/my-dossiers';
import { requireMyTrainerSession } from '@/features/trainer-space/guard';
import { problemesDuQuiz, MAX_CHOIX, MAX_QUESTIONS, type QuestionQuiz } from '@/features/pedagogie/quiz';
import { FORMES, problemesDuContenu, type ContenuExercice, type Forme } from '@/features/pedagogie/kinds';
import { parseTexteATrou } from '@/features/pedagogie/cloze';
import { genererBrouillon, type BrouillonIA } from '@/features/pedagogie/generate-with-ai';
import { chargerContexteFormation } from '@/features/pedagogie/contexte';
import { creerTravail, majTravail, supprimerTravail } from '@/features/pedagogie/store';

/**
 * Préparation du cours par le formateur.
 *
 * Un cours tient à une SÉANCE (cas courant : « le quiz du 28 ») ou à un DOSSIER
 * (travail individuel). Chaque action repasse par la garde correspondante :
 * l'identifiant vient du client, et c'est elle seule qui sépare un formateur
 * des séances et des dossiers des autres. Les écritures qui suivent se font en
 * service role, pour cet ancrage seulement.
 */

export type Resultat = { ok: true } | { ok: false; error: string };

/** Ancrage d'un cours : la séance qu'il prépare, ou le dossier qu'il suit. */
export type Ancrage = { readonly type: 'seance' | 'dossier'; readonly id: string };

const ancrageSchema = z.object({ type: z.enum(['seance', 'dossier']), id: z.string().uuid() });

type Acces =
  | { ok: true; userId: string; organizationId: string; sessionId: string | null; dossierId: string | null }
  | { ok: false; error: string };

/**
 * Une séance de groupe sert plusieurs dossiers : aucun ne peut être désigné
 * comme « le » dossier du cours. On n'en retient donc aucun — la séance suffit
 * à dire à qui le cours s'adresse (0174).
 */
async function garder(ancrage: Ancrage): Promise<Acces> {
  if (ancrage.type === 'seance') {
    const acces = await requireMyTrainerSession(ancrage.id);
    if (!acces.ok) return { ok: false, error: "Cette séance n'est pas la vôtre." };
    return {
      ok: true,
      userId: acces.userId,
      organizationId: acces.session.organization_id,
      sessionId: ancrage.id,
      dossierId: null,
    };
  }

  const acces = await requireMyTrainerDossier(ancrage.id);
  if (!acces.ok) return { ok: false, error: "Ce dossier ne vous est pas confié." };
  const organizationId = await organisationDuDossier(ancrage.id);
  if (!organizationId) return { ok: false, error: 'Dossier introuvable.' };
  return { ok: true, userId: acces.userId, organizationId, sessionId: null, dossierId: ancrage.id };
}

const cheminDuRetour = (a: Ancrage): string =>
  a.type === 'seance' ? `/seance/${a.id}/cours` : `/mes-dossiers/${a.id}/cours`;

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
  ancrage: ancrageSchema,
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
  ancrage: Ancrage;
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

  const acces = await garder(p.data.ancrage);
  if (!acces.ok) return acces;

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
    organizationId: acces.organizationId,
    dossierId: acces.dossierId,
    sessionIdAncrage: acces.sessionId,
    userId: acces.userId,
    kind: p.data.kind,
    contenu,
    aiAssisted: p.data.aiAssisted ?? false,
    title: p.data.title,
    instructions: p.data.instructions ?? null,
    questions,
    passScore: p.data.passScore ?? null,
    sessionId: acces.sessionId ?? p.data.sessionId ?? null,
    dueAt: p.data.dueAt ? new Date(p.data.dueAt).toISOString() : null,
    isPublished: p.data.publier,
  });
  if (!res.ok) return { ok: false, error: "Le travail n'a pas été enregistré." };

  revalidatePath(cheminDuRetour(p.data.ancrage));
  return { ok: true };
}

const publicationSchema = z.object({
  ancrage: ancrageSchema,
  travailId: z.string().uuid(),
  publier: z.boolean(),
});

export async function publierTravail(input: {
  ancrage: Ancrage;
  travailId: string;
  publier: boolean;
}): Promise<Resultat> {
  const p = publicationSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Demande invalide.' };

  const acces = await garder(p.data.ancrage);
  if (!acces.ok) return acces;

  // Publier un quiz vide de bonnes réponses le rendrait incorrigible.
  if (p.data.publier) {
    const { data } = await supabaseAdmin()
      .schema('app')
      .from('exercises' as never)
      .select('kind, questions')
      .eq('id', p.data.travailId)
      .eq(acces.sessionId ? 'session_id' : 'dossier_id', acces.sessionId ?? acces.dossierId ?? '')
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

  const ok = await majTravail(p.data.ancrage, p.data.travailId, { is_published: p.data.publier });
  if (!ok) return { ok: false, error: "La publication n'a pas été enregistrée." };

  revalidatePath(cheminDuRetour(p.data.ancrage));
  return { ok: true };
}

const suppressionSchema = z.object({ ancrage: ancrageSchema, travailId: z.string().uuid() });

export async function supprimerTravailFormateur(input: {
  ancrage: Ancrage;
  travailId: string;
}): Promise<Resultat> {
  const p = suppressionSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Demande invalide.' };

  const acces = await garder(p.data.ancrage);
  if (!acces.ok) return acces;

  const ok = await supprimerTravail(p.data.ancrage, p.data.travailId);
  if (!ok) return { ok: false, error: "Le retrait n'a pas été enregistré." };

  revalidatePath(cheminDuRetour(p.data.ancrage));
  return { ok: true };
}

const generationSchema = z.object({
  ancrage: ancrageSchema,
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
  ancrage: Ancrage;
  kind: Forme;
  sessionId?: string;
  consigne?: string;
}): Promise<GenerationIAResult> {
  const p = generationSchema.safeParse(input);
  if (!p.success) return { ok: false, error: 'Demande invalide.' };

  const acces = await garder(p.data.ancrage);
  if (!acces.ok) return acces;

  const contexte = await chargerContexteFormation(p.data.ancrage, {
    sessionId: acces.sessionId ?? p.data.sessionId ?? null,
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
