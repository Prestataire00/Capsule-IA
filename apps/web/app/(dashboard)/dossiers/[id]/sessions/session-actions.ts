'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { sendEmail } from '@/shared/lib/email/resend';
import { createMeetEvent } from '@/shared/lib/integrations/google-calendar-client';
import { loadGoogleCredsForUser } from '@/shared/lib/integrations/google-calendar-store';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { tryEnsureQuoteForDossier } from '@/features/billing/quotes/quote-service';
import { parisIso } from '@/features/import/paris-time';
import { genererSeances, MESSAGES_PLANIFICATION, type Creneau } from '@/features/sessions/planification';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const REMOTE_MODALITIES = new Set(['distanciel', 'hybride']);

type CreateInput = {
  dossierId: string;
  title: string;
  modality: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  location?: string;
  remoteUrl?: string;
  /** Tarif HT par stagiaire ; null = tarif catalogue de la formation. */
  priceCents?: number | null;
};

type CreateResult =
  | { ok: true; sessionId: string; meet: 'created' | 'skipped' | 'failed' | 'manual' }
  | { ok: false; error: string };

type DossierCtx = {
  reference: string;
  organizationId: string;
  formationTitle: string;
  learnerEmail: string | null;
  organizerEmail: string | null;
};

async function loadDossierCtx(sb: ReturnType<typeof admin>, dossierId: string): Promise<DossierCtx | null> {
  const { data } = await sb
    .schema('app')
    .from('dossiers')
    .select('reference, organization_id, learner:learners!dossiers_learner_id_fkey(email), formation:formations(title), organization:organizations(contact_email)',
    )
    .eq('id', dossierId)
    .maybeSingle();
  if (!data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any;
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  return {
    reference: d.reference,
    organizationId: d.organization_id,
    formationTitle: one(d.formation)?.title ?? 'Formation',
    learnerEmail: one(d.learner)?.email ?? null,
    organizerEmail: one(d.organization)?.contact_email ?? null,
  };
}

function meetEmailHtml(args: { meetUrl: string; title: string; startsAt: string; formationTitle: string }): string {
  const when = new Date(args.startsAt).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;padding:32px;">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;">
<h1 style="font-size:18px;margin:0 0 8px;">Votre séance en visio</h1>
<p style="color:#3f3f46;font-size:14px;line-height:1.6;"><strong>${args.title}</strong><br>${args.formationTitle}<br>${when}</p>
<a href="${args.meetUrl}" style="display:inline-block;margin-top:8px;background:#7c3aed;color:#fff;text-decoration:none;font-size:14px;padding:10px 18px;border-radius:8px;">Rejoindre la visio</a>
<p style="color:#a1a1aa;font-size:12px;margin-top:14px;">${args.meetUrl}</p>
<p style="color:#a1a1aa;font-size:11px;margin-top:16px;">Capsule IA</p></div></body></html>`;
}

/** Génère le lien Meet (via Make) pour une session distancielle/hybride, le stocke et l'envoie aux apprenants. */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabaseServer().auth.getUser();
  return data?.user?.id ?? null;
}

async function provisionMeet(
  sb: ReturnType<typeof admin>,
  userId: string | null,
  sessionId: string,
  title: string,
  startsAt: string,
  endsAt: string,
  ctx: DossierCtx,
): Promise<'created' | 'skipped' | 'failed'> {
  const attendeeEmails = ctx.learnerEmail ? [ctx.learnerEmail] : [];

  // Par utilisateur : on crée le Meet sur l'agenda Google du créateur de la session.
  if (!userId) return 'skipped';
  const creds = await loadGoogleCredsForUser(sb, userId);
  if (!creds) return 'skipped';

  const res = await createMeetEvent(creds, {
    title,
    startsAt,
    endsAt,
    attendeeEmails,
    description: `${ctx.formationTitle} · dossier ${ctx.reference}`,
  });
  if (!res.ok) return 'failed';

  await sb
    .schema('app')
    .from('sessions')
    .update({
      remote_url: res.value.meetUrl,
      zoom_metadata: { provider: 'google_meet', calendar_event_id: res.value.eventId },
    })
    .eq('id', sessionId);

  // Envoi du lien aux apprenants (en plus de l'invitation Google Agenda automatique).
  if (ctx.learnerEmail) {
    void sendEmail({
      to: ctx.learnerEmail,
      subject: `Lien visio — ${title}`,
      html: meetEmailHtml({ meetUrl: res.value.meetUrl, title, startsAt, formationTitle: ctx.formationTitle }),
      organizationId: ctx.organizationId,
      kind: 'session_meet_link',
    }).then((r) => {
      if (!r.ok && r.reason !== 'no_api_key') console.error('[session] meet email failed', r);
    });
  }
  return 'created';
}

export async function createSession(input: CreateInput): Promise<CreateResult> {
  if (!input.title.trim()) return { ok: false, error: 'Intitulé requis' };
  if (!input.startsAt || !input.endsAt) return { ok: false, error: 'Dates requises' };
  if (new Date(input.endsAt) <= new Date(input.startsAt)) return { ok: false, error: 'Fin avant début' };

  const sb = admin();
  const userId = await currentUserId();
  const ctx = await loadDossierCtx(sb, input.dossierId);
  if (!ctx) return { ok: false, error: 'Dossier introuvable' };

  const sessionId = randomUUID();
  const manualRemote = input.remoteUrl?.trim() || null;
  const { error: insErr } = await sb.schema('app').from('sessions').insert({
    id: sessionId,
    organization_id: ctx.organizationId,
    dossier_id: input.dossierId,
    title: input.title.trim(),
    modality: input.modality,
    status: 'planned',
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    location: input.location?.trim() || null,
    remote_url: manualRemote,
    price_cents: input.priceCents != null && input.priceCents >= 0 ? Math.round(input.priceCents) : null,
  } as never);
  if (insErr) return { ok: false, error: insErr.message };

  await sb
    .schema('app')
    .from('session_dossiers')
    .upsert(
      { session_id: sessionId, dossier_id: input.dossierId, organization_id: ctx.organizationId },
      { onConflict: 'session_id,dossier_id' },
    );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sb as any).rpc('materialize_session_participants', { p_session_id: sessionId });
  await tryEnsureQuoteForDossier(sb, input.dossierId);

  let meet: 'created' | 'skipped' | 'failed' | 'manual' = 'skipped';
  if (manualRemote) {
    meet = 'manual';
  } else if (REMOTE_MODALITIES.has(input.modality)) {
    meet = await provisionMeet(sb, userId, sessionId, input.title.trim(), input.startsAt, input.endsAt, ctx);
  }

  revalidatePath(`/dossiers/${input.dossierId}/sessions`);
  return { ok: true, sessionId, meet };
}

/** (Re)génère le lien Google Meet d'une session distancielle existante. */
export async function generateMeetForSession(sessionId: string, dossierId: string): Promise<CreateResult> {
  const sb = admin();
  const userId = await currentUserId();
  const { data: s } = await sb
    .schema('app')
    .from('sessions')
    .select('id, title, starts_at, ends_at')
    .eq('id', sessionId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sess = s as any;
  if (!sess) return { ok: false, error: 'Session introuvable' };
  const ctx = await loadDossierCtx(sb, dossierId);
  if (!ctx) return { ok: false, error: 'Dossier introuvable' };

  const meet = await provisionMeet(sb, userId, sessionId, sess.title ?? 'Séance', sess.starts_at, sess.ends_at, ctx);
  revalidatePath(`/dossiers/${dossierId}/sessions`);
  if (meet === 'skipped') return { ok: false, error: 'Votre Google Agenda n’est pas connecté (Paramètres → Intégrations)' };
  if (meet === 'failed') return { ok: false, error: 'Échec de la création du lien Google Meet' };
  return { ok: true, sessionId, meet };
}

/**
 * Création d'une série de séances sur une période : « du 6 au 10 octobre,
 * 9h–12h30 et 14h–17h30 ».
 *
 * La conversion en instants se fait ICI, au fuseau de Paris, et non dans le
 * navigateur : `new Date('2026-10-06T09:00')` côté client dépend du fuseau du
 * poste, ce qui décalerait les séances d'un administrateur en déplacement. Et
 * `parisIso` tient compte du changement d'heure, qu'une période d'automne
 * traverse régulièrement.
 *
 * Création séquentielle plutôt qu'en lot : chaque séance déclenche ses propres
 * effets (feuilles d'émargement par trigger, participants, devis). Un échec
 * s'arrête net et dit combien de séances ont déjà été créées — mieux vaut une
 * série incomplète annoncée qu'un doute.
 */
export async function creerSeancesEnSerie(input: {
  dossierId: string;
  title: string;
  modality: string;
  location?: string;
  priceCents?: number | null;
  dateDebut: string;
  dateFin: string;
  jours: number[];
  creneaux: Creneau[];
}): Promise<{ ok: true; creees: number } | { ok: false; error: string; creees?: number }> {
  if (!input.title.trim()) return { ok: false, error: 'Intitulé requis' };

  const plan = genererSeances({
    dateDebut: input.dateDebut,
    dateFin: input.dateFin,
    jours: input.jours,
    creneaux: input.creneaux,
  });
  if (!plan.ok) return { ok: false, error: MESSAGES_PLANIFICATION[plan.erreur] };

  const plusieursCreneaux = input.creneaux.length > 1;
  let creees = 0;
  for (const s of plan.seances) {
    const debut = parisIso(s.date, s.debut);
    const fin = parisIso(s.date, s.fin);
    if (!debut || !fin) return { ok: false, error: `Horaires illisibles au ${s.date}.`, creees };

    const res = await createSession({
      dossierId: input.dossierId,
      // Le libellé du créneau ne s'ajoute que s'il y en a deux : sinon il
      // alourdit chaque intitulé sans rien distinguer.
      title: plusieursCreneaux ? `${input.title.trim()} (${s.libelle})` : input.title.trim(),
      modality: input.modality,
      startsAt: debut,
      endsAt: fin,
      location: input.location,
      priceCents: input.priceCents ?? null,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: creees > 0 ? `${res.error} — ${creees} séance(s) déjà créée(s).` : res.error,
        creees,
      };
    }
    creees += 1;
  }

  revalidatePath(`/dossiers/${input.dossierId}/sessions`);
  return { ok: true, creees };
}
