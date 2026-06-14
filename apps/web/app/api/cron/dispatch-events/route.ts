// ARCHETYPE: command (cron endpoint)
// Justification: dispatcher outbox infra.domain_events vers handlers métier.
// Cf. ADR 0002 (outbox pattern) et ADR 0005 (Server Actions actées V1).
//
// Protégé par CRON_SECRET — invoqué par cron externe (cron-job.org, Railway
// cron, GitHub Actions) toutes les 1 min en POST ou GET.
//
// Pattern :
//   1. claim_events_for_dispatch (RPC FOR UPDATE SKIP LOCKED)
//   2. Pour chaque event : lookup registry par event.type
//   3. Pour chaque handler : check idempotence (processed_events UNIQUE)
//   4. Exécuter handler → ok = INSERT processed_events
//   5. Si tous handlers OK : UPDATE dispatched_at
//   6. Sinon : attempts++ + next_retry_at = now + 2^attempts min
//   7. Après MAX_ATTEMPTS : INSERT event_dead_letter + dispatched_at (sortie de queue)

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { env } from '@/env.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const runtime = 'nodejs';

const MAX_ATTEMPTS = 8;
const BATCH_SIZE = 50;

type DomainEvent = {
  id: string;
  organization_id: string;
  aggregate_type: string;
  aggregate_id: string;
  type: string;
  version: number;
  payload: Record<string, unknown>;
  correlation_id: string | null;
  causation_id: string | null;
  actor_user_id: string | null;
  occurred_at: string;
  attempts: number;
  next_retry_at: string | null;
};

type HandlerOk = { ok: true };
type HandlerErr = { ok: false; error: string };
type HandlerResult = HandlerOk | HandlerErr;
// TODO Sprint A : régénérer database.ts pour exposer le schema infra
// (pnpm db:types s'attend à le voir dans --schema infra mais les tables
// infra.* ne sont pas exposées). En attendant : type any localisé.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
type Handler = (event: DomainEvent, sb: Sb) => Promise<HandlerResult>;

// ============================================================================
// REGISTRY — à étoffer au fil des sprints (Sprint B = handlers FR-018, etc.)
// ============================================================================
// Convention : Record<event_type, Record<handler_name, Handler>>
// Chaque handler doit être idempotent (processed_events UNIQUE le garantit)
// et retourner { ok: true } ou { ok: false, error: string }.
//
// Exemples futurs (Sprint B+) :
//   'dossier.scheduled': {
//     'assign-positioning-questionnaire': assignPositioningQuestionnaire,
//     'send-convocation-emails': sendConvocationEmails,
//     'create-zoom-meeting': createZoomMeeting,
//   },
//   'dossier.closed': {
//     'issue-final-invoice': issueFinalInvoice,
//     'generate-attestation-fin': generateAttestation,
//   },
// ============================================================================

// Financeurs : matérialise les tâches d'un dossier×financeur quand un financeur
// est rattaché (RPC app.materialize_funder_tasks via wrapper public).
async function materializeFunderPlaybook(event: DomainEvent, sb: Sb): Promise<HandlerResult> {
  const payload = event.payload as { dossier_id?: string; funder_id?: string };
  if (!payload.dossier_id || !payload.funder_id) {
    return { ok: false, error: 'payload manquant dossier_id/funder_id' };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any).rpc('materialize_funder_tasks', {
    p_dossier_id: payload.dossier_id,
    p_funder_id: payload.funder_id,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Qualiopi : recalcule la checklist de readiness d'un dossier.
async function recomputeQualiopiChecklist(event: DomainEvent, sb: Sb): Promise<HandlerResult> {
  const payload = event.payload as { dossier_id?: string };
  const dossierId = payload.dossier_id ?? (event.aggregate_type === 'dossier' ? event.aggregate_id : undefined);
  if (!dossierId) return { ok: false, error: 'dossier_id absent du payload' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any).rpc('recompute_qualiopi_checklist', { p_dossier_id: dossierId });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Sessions partagées : recalcule les présents effectifs d'une session.
async function recomputeSessionParticipants(event: DomainEvent, sb: Sb): Promise<HandlerResult> {
  const payload = event.payload as { session_id?: string };
  if (!payload.session_id) return { ok: false, error: 'session_id absent du payload' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any).rpc('materialize_session_participants', { p_session_id: payload.session_id });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Heures : recalcule le suivi des heures d'un dossier (signature, abandon, session).
async function recomputeDossierHours(event: DomainEvent, sb: Sb): Promise<HandlerResult> {
  const payload = event.payload as { dossier_id?: string };
  const dossierId = payload.dossier_id ?? (event.aggregate_type === 'dossier' ? event.aggregate_id : undefined);
  if (!dossierId) return { ok: false, error: 'dossier_id absent du payload' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (sb as any).rpc('recompute_dossier_hours', { p_dossier_id: dossierId });
  return error ? { ok: false, error: error.message } : { ok: true };
}

const HANDLERS: Record<string, Record<string, Handler>> = {
  'dossier.hours_dirty':     { 'recompute-dossier-hours': recomputeDossierHours },
  'dossier.funder_attached': { 'materialize-funder-playbook': materializeFunderPlaybook },
  'qualiopi.proof.attached': { 'recompute-qualiopi': recomputeQualiopiChecklist },
  'questionnaire.completed': { 'recompute-qualiopi': recomputeQualiopiChecklist },
  'attendance.finalized':    { 'recompute-qualiopi': recomputeQualiopiChecklist },
  'document.signed':         { 'recompute-qualiopi': recomputeQualiopiChecklist },
  'session.dossier_linked':  { 'recompute-session-participants': recomputeSessionParticipants },
  'session.rescheduled':     { 'recompute-session-participants': recomputeSessionParticipants },
};

function isAuthorized(req: Request): boolean {
  const headerAuth = req.headers.get('Authorization');
  if (headerAuth === `Bearer ${env.CRON_SECRET}`) return true;
  const url = new URL(req.url);
  return url.searchParams.get('secret') === env.CRON_SECRET;
}

async function isAlreadyProcessed(sb: Sb, eventId: string, handlerName: string): Promise<boolean> {
  const { data } = await sb
    .schema('infra')
    .from('processed_events')
    .select('event_id')
    .eq('event_id', eventId)
    .eq('handler_name', handlerName)
    .maybeSingle();
  return !!data;
}

async function markProcessed(sb: Sb, eventId: string, handlerName: string): Promise<void> {
  await sb
    .schema('infra')
    .from('processed_events')
    .insert({ event_id: eventId, handler_name: handlerName });
}

async function markDispatched(sb: Sb, eventId: string): Promise<void> {
  await sb
    .schema('infra')
    .from('domain_events')
    .update({ dispatched_at: new Date().toISOString() })
    .eq('id', eventId);
}

async function scheduleRetry(sb: Sb, event: DomainEvent, error: string): Promise<void> {
  const attempts = event.attempts + 1;
  const retryAt = new Date(Date.now() + Math.pow(2, attempts) * 60_000).toISOString();
  await sb
    .schema('infra')
    .from('domain_events')
    .update({ attempts, next_retry_at: retryAt, last_error: error })
    .eq('id', event.id);
}

async function moveToDeadLetter(
  sb: Sb,
  event: DomainEvent,
  handlerName: string,
  failedAttempts: number,
  error: string,
): Promise<void> {
  await sb.schema('infra').from('event_dead_letter').insert({
    event_id: event.id,
    handler_name: handlerName,
    failed_attempts: failedAttempts,
    error,
    payload_snapshot: event.payload as never,
  });
  // Sortie de la queue : dispatched_at NON NULL pour ne plus être re-claim
  await sb
    .schema('infra')
    .from('domain_events')
    .update({ dispatched_at: new Date().toISOString(), attempts: failedAttempts, last_error: error })
    .eq('id', event.id);
}

type DispatchResult = {
  claimed: number;
  dispatched: number;
  retried: number;
  dead_lettered: number;
  no_handler: number;
  errors: string[];
};

async function dispatch(): Promise<DispatchResult> {
  const sb = supabaseAdmin();
  const errors: string[] = [];

  // TODO Sprint A : régénérer database.ts pour capturer la signature exacte
  // de claim_events_for_dispatch(p_batch int DEFAULT 50). Cast en attendant.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events, error: claimErr } = await (sb as any).rpc(
    'claim_events_for_dispatch',
    { p_batch: BATCH_SIZE },
  );

  if (claimErr) {
    return {
      claimed: 0,
      dispatched: 0,
      retried: 0,
      dead_lettered: 0,
      no_handler: 0,
      errors: [`claim: ${claimErr.message}`],
    };
  }

  const claimedEvents = (events ?? []) as unknown as DomainEvent[];
  let dispatched = 0;
  let retried = 0;
  let deadLettered = 0;
  let noHandler = 0;

  for (const event of claimedEvents) {
    const handlers = HANDLERS[event.type] ?? {};
    const handlerNames = Object.keys(handlers);

    if (handlerNames.length === 0) {
      // Pas de handler enregistré : on marque dispatched pour purger la queue.
      // Conservé en BDD pour observabilité (SELECT * FROM domain_events).
      await markDispatched(sb, event.id);
      noHandler++;
      continue;
    }

    let allOk = true;
    let lastError = '';
    let lastFailedHandler = '';

    for (const handlerName of handlerNames) {
      if (await isAlreadyProcessed(sb, event.id, handlerName)) continue;

      try {
        const result = await handlers[handlerName]!(event, sb);
        if (result.ok) {
          await markProcessed(sb, event.id, handlerName);
        } else {
          allOk = false;
          lastError = result.error;
          lastFailedHandler = handlerName;
          errors.push(`${event.type}/${handlerName} (${event.id}): ${result.error}`);
        }
      } catch (e) {
        allOk = false;
        lastError = (e as Error).message;
        lastFailedHandler = handlerName;
        errors.push(`${event.type}/${handlerName} (${event.id}): ${lastError}`);
      }
    }

    if (allOk) {
      await markDispatched(sb, event.id);
      dispatched++;
    } else {
      const nextAttempts = event.attempts + 1;
      if (nextAttempts >= MAX_ATTEMPTS) {
        await moveToDeadLetter(sb, event, lastFailedHandler, nextAttempts, lastError);
        deadLettered++;
      } else {
        await scheduleRetry(sb, event, lastError);
        retried++;
      }
    }
  }

  return {
    claimed: claimedEvents.length,
    dispatched,
    retried,
    dead_lettered: deadLettered,
    no_handler: noHandler,
    errors,
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const startedAt = Date.now();
  const result = await dispatch();
  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    ...result,
  });
}

export async function GET(req: Request): Promise<NextResponse> {
  return POST(req);
}
