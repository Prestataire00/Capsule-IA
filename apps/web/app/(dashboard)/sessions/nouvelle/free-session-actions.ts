'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentMember } from '@/shared/lib/auth/current-member';
import { can } from '@/shared/lib/auth/permissions';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { createMeetEvent } from '@/shared/lib/integrations/google-calendar-client';
import { loadGoogleCredsForUser } from '@/shared/lib/integrations/google-calendar-store';
import { eurosEnCentimes } from '@/features/trainer-space/billing-rules';

/**
 * Séance planifiée pour un client, sans formation ni dossier.
 *
 * Jusqu'ici une séance naissait forcément d'une formation du catalogue (ou d'un
 * dossier) : impossible de poser une intervention sur mesure, une réunion de
 * cadrage ou une prestation ponctuelle. Ici l'intitulé, le client et les
 * participants sont saisis directement ; les participants sont inscrits en
 * `manual_add`, ce que l'émargement sait déjà lire.
 *
 * L'écriture se fait en service role, donc après vérification explicite du rôle,
 * de l'organisation, et de l'appartenance de chaque personne rattachée.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = () => supabaseAdmin() as unknown as SupabaseClient<any, any, any>;

const REMOTE = new Set(['distanciel', 'hybride']);

const schema = z
  .object({
    title: z.string().trim().min(1, 'Intitulé requis').max(200, 'Intitulé : 200 caractères au plus'),
    modality: z.enum(['presentiel', 'distanciel', 'hybride']),
    startsAt: z.string().min(1, 'Début requis'),
    endsAt: z.string().min(1, 'Fin requise'),
    location: z.string().trim().max(200).optional().default(''),
    /** Entreprise cliente ; vide = particulier ou client non renseigné. */
    companyId: z.string().uuid().optional().or(z.literal('')),
    learnerIds: z.array(z.string().uuid()).max(200).default([]),
    trainerId: z.string().uuid().optional().or(z.literal('')),
    priceEuros: z
      .string()
      .trim()
      .refine((v) => v === '' || eurosEnCentimes(v) !== null, 'Tarif invalide (ex. 1200 ou 1 200,50)')
      .optional()
      .default(''),
    capacityMax: z
      .string()
      .trim()
      .refine((v) => v === '' || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 1000), 'Capacité : entre 1 et 1000')
      .optional()
      .default(''),
    notes: z.string().trim().max(2000).optional().default(''),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), {
    message: 'La fin doit suivre le début',
    path: ['endsAt'],
  });

export type FreeSessionInput = z.input<typeof schema>;

type Result = { ok: true; sessionId: string } | { ok: false; error: string };

/** Toutes ces lignes appartiennent-elles bien à l'organisation ? */
async function appartiennent(
  table: 'companies' | 'learners' | 'trainers',
  ids: readonly string[],
  organizationId: string,
): Promise<boolean> {
  if (ids.length === 0) return true;
  const { data } = await admin()
    .schema('app')
    .from(table)
    .select('id')
    .in('id', [...ids])
    .eq('organization_id', organizationId)
    .is('deleted_at', null);
  return ((data ?? []) as { id: string }[]).length === new Set(ids).size;
}

export async function createFreeSession(input: FreeSessionInput): Promise<Result> {
  const p = schema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };
  const v = p.data;

  const membre = await getCurrentMember();
  if (!membre) return { ok: false, error: 'Session expirée — reconnectez-vous.' };
  if (can(membre.role, 'dossiers') !== 'manage') {
    return { ok: false, error: 'Votre rôle ne permet pas de planifier une séance.' };
  }
  const org = membre.organizationId;

  if (v.companyId && !(await appartiennent('companies', [v.companyId], org))) {
    return { ok: false, error: 'Cette entreprise n’est pas dans votre portefeuille.' };
  }
  if (!(await appartiennent('learners', v.learnerIds, org))) {
    return { ok: false, error: 'Un participant n’appartient pas à votre organisme.' };
  }
  if (v.trainerId && !(await appartiennent('trainers', [v.trainerId], org))) {
    return { ok: false, error: 'Ce formateur n’appartient pas à votre organisme.' };
  }

  const sb = admin();
  const sessionId = randomUUID();
  const { error: insErr } = await sb
    .schema('app')
    .from('sessions')
    .insert({
      id: sessionId,
      organization_id: org,
      dossier_id: null,
      formation_id: null,
      company_id: v.companyId || null,
      title: v.title,
      modality: v.modality,
      status: 'planned',
      starts_at: v.startsAt,
      ends_at: v.endsAt,
      location: v.location || null,
      price_cents: v.priceEuros ? eurosEnCentimes(v.priceEuros) : null,
      capacity_max: v.capacityMax ? Number(v.capacityMax) : null,
      notes: v.notes || null,
    } as never);
  if (insErr) {
    console.error('[séance libre] création impossible', insErr.message);
    return { ok: false, error: 'La séance n’a pas pu être créée.' };
  }

  // Participants inscrits à la main : c'est la seule source pour une séance
  // sans dossier, et l'émargement les reconnaît (`source = 'manual_add'`).
  if (v.learnerIds.length > 0) {
    const { error } = await sb
      .schema('app')
      .from('session_participants')
      .upsert(
        v.learnerIds.map((id) => ({
          session_id: sessionId,
          organization_id: org,
          participant_kind: 'learner',
          learner_id: id,
          source: 'manual_add',
        })) as never,
        { onConflict: 'session_id,participant_kind,participant_id' },
      );
    if (error) console.error('[séance libre] participants non inscrits', error.message);
  }

  if (v.trainerId) {
    const { error } = await sb
      .schema('app')
      .from('session_trainers')
      .upsert(
        { session_id: sessionId, organization_id: org, trainer_id: v.trainerId, is_lead: true } as never,
        { onConflict: 'session_id,trainer_id' },
      );
    if (error) console.error('[séance libre] formateur non rattaché', error.message);
    const { error: partErr } = await sb
      .schema('app')
      .from('session_participants')
      .upsert(
        {
          session_id: sessionId,
          organization_id: org,
          participant_kind: 'trainer',
          trainer_id: v.trainerId,
          source: 'manual_add',
        } as never,
        { onConflict: 'session_id,participant_kind,participant_id' },
      );
    if (partErr) console.error('[séance libre] formateur non inscrit comme participant', partErr.message);
  }

  // Visio Google Meet, au mieux : seulement si l'agenda du membre est connecté.
  if (REMOTE.has(v.modality)) {
    const creds = await loadGoogleCredsForUser(sb as never, membre.userId);
    if (creds) {
      const { data: emailRows } = v.learnerIds.length
        ? await sb.schema('app').from('learners').select('email').in('id', v.learnerIds)
        : { data: [] };
      const emails = ((emailRows ?? []) as { email: string | null }[])
        .map((l) => l.email)
        .filter((e): e is string => Boolean(e));
      const res = await createMeetEvent(creds, {
        title: v.title,
        startsAt: v.startsAt,
        endsAt: v.endsAt,
        attendeeEmails: emails,
        description: 'Séance planifiée depuis Capsule IA',
      });
      if (res.ok) {
        await sb
          .schema('app')
          .from('sessions')
          .update({
            remote_url: res.value.meetUrl,
            zoom_metadata: { provider: 'google_meet', calendar_event_id: res.value.eventId },
          } as never)
          .eq('id', sessionId);
      }
    }
  }

  revalidatePath('/sessions');
  revalidatePath('/agenda');
  return { ok: true, sessionId };
}
