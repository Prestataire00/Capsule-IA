'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { guardAction } from '@/shared/lib/auth/guard-action';
import {
  actionSchema,
  actionStatusSchema,
  axisSchema,
  formToObject,
  incidentSchema,
  moveAxisSchema,
  resolveIncidentSchema,
  veilleSchema,
} from '@/features/amelioration/schemas';

/**
 * Amélioration continue : écritures en service role, donc gardées
 * explicitement, et bornées à l'organisation du membre — y compris pour les
 * éléments liés (réclamation, incident, axe), sans quoi un identifiant
 * suffirait à agir sur un autre organisme.
 */

const PAGE = '/amelioration-continue';
type Onglet = 'axes' | 'incidents' | 'actions' | 'veille';

function retour(onglet: Onglet, erreur?: string): never {
  revalidatePath(PAGE);
  redirect(`${PAGE}?onglet=${onglet}${erreur ? `&error=${encodeURIComponent(erreur)}` : ''}`);
}

async function garde(onglet: Onglet) {
  const g = await guardAction('qualiopi');
  if (!g.ok) retour(onglet, g.error);
  return g.member;
}

const ongletDe = (fd: FormData, defaut: Onglet): Onglet => {
  const v = fd.get('retour');
  return v === 'axes' || v === 'incidents' || v === 'actions' || v === 'veille' ? v : defaut;
};

const table = (nom: string) => supabaseAdmin().schema('app').from(nom as never);

/** L'élément lié appartient-il à l'organisation ? */
async function appartient(nom: 'complaints' | 'quality_incidents' | 'improvement_axes', id: string, orgId: string): Promise<boolean> {
  const { data } = await table(nom).select('id').eq('id' as never, id as never).eq('organization_id' as never, orgId as never).maybeSingle();
  return data !== null;
}

// ── Incidents ────────────────────────────────────────────────────────────────
export async function createIncident(fd: FormData): Promise<void> {
  const membre = await garde('incidents');
  const p = incidentSchema.safeParse(formToObject(fd));
  if (!p.success) retour('incidents', p.error.issues[0]?.message ?? 'saisie_invalide');
  const v = p.data;
  const { error } = await table('quality_incidents').insert({
    organization_id: membre.organizationId,
    kind: v.kind,
    title: v.title,
    description: v.description ?? null,
    severity: v.severity,
    ...(v.occurredOn ? { occurred_on: v.occurredOn } : {}),
    created_by: membre.userId,
  } as never);
  retour('incidents', error?.message);
}

export async function resolveIncident(fd: FormData): Promise<void> {
  const membre = await garde('incidents');
  const orgId = membre.organizationId;
  const p = resolveIncidentSchema.safeParse(formToObject(fd));
  if (!p.success) retour('incidents', p.error.issues[0]?.message ?? 'saisie_invalide');
  const now = new Date().toISOString();
  const { error } = await table('quality_incidents')
    .update({ status: 'traite', resolution: p.data.resolution, resolved_at: now, updated_at: now } as never)
    .eq('id' as never, p.data.id as never).eq('organization_id', orgId);
  retour('incidents', error?.message);
}

// ── Axes d'amélioration ──────────────────────────────────────────────────────
export async function createAxis(fd: FormData): Promise<void> {
  const membre = await garde('axes');
  const p = axisSchema.safeParse(formToObject(fd));
  if (!p.success) retour('axes', p.error.issues[0]?.message ?? 'saisie_invalide');
  const { error } = await table('improvement_axes').insert({
    organization_id: membre.organizationId,
    title: p.data.title,
    description: p.data.description ?? null,
    indicator_number: p.data.indicatorNumber ?? null,
    created_by: membre.userId,
  } as never);
  retour('axes', error?.message);
}

export async function moveAxis(fd: FormData): Promise<void> {
  const membre = await garde('axes');
  const orgId = membre.organizationId;
  const p = moveAxisSchema.safeParse(formToObject(fd));
  if (!p.success) retour('axes', p.error.issues[0]?.message ?? 'saisie_invalide');
  const now = new Date().toISOString();
  const { error } = await table('improvement_axes')
    .update({ status: p.data.status, optimised_at: p.data.status === 'optimise' ? now : null, updated_at: now } as never)
    .eq('id' as never, p.data.id as never).eq('organization_id', orgId);
  retour('axes', error?.message);
}

// ── Actions correctives ──────────────────────────────────────────────────────
export async function createImprovementAction(fd: FormData): Promise<void> {
  const onglet = ongletDe(fd, 'actions');
  const membre = await garde(onglet);
  const orgId = membre.organizationId;
  const p = actionSchema.safeParse(formToObject(fd));
  if (!p.success) retour(onglet, p.error.issues[0]?.message ?? 'saisie_invalide');
  const v = p.data;

  if (v.complaintId && !(await appartient('complaints', v.complaintId, orgId))) retour(onglet, 'forbidden');
  if (v.incidentId && !(await appartient('quality_incidents', v.incidentId, orgId))) retour(onglet, 'forbidden');
  if (v.axisId && !(await appartient('improvement_axes', v.axisId, orgId))) retour(onglet, 'forbidden');

  const { error } = await table('improvement_actions').insert({
    organization_id: orgId,
    origin: v.origin,
    complaint_id: v.complaintId ?? null,
    incident_id: v.incidentId ?? null,
    axis_id: v.axisId ?? null,
    title: v.title,
    description: v.description ?? null,
    owner: v.owner ?? null,
    priority: v.priority,
    due_date: v.dueDate ?? null,
    created_by: membre.userId,
  } as never);
  retour(onglet, error?.message);
}

export async function updateImprovementStatus(fd: FormData): Promise<void> {
  const onglet = ongletDe(fd, 'actions');
  const membre = await garde(onglet);
  const orgId = membre.organizationId;
  const p = actionStatusSchema.safeParse(formToObject(fd));
  if (!p.success) retour(onglet, p.error.issues[0]?.message ?? 'saisie_invalide');
  const now = new Date().toISOString();
  const { error } = await table('improvement_actions')
    .update({ status: p.data.status, updated_at: now, done_at: p.data.status === 'done' ? now : null } as never)
    .eq('id' as never, p.data.id as never).eq('organization_id', orgId);
  retour(onglet, error?.message);
}

// ── Veille ───────────────────────────────────────────────────────────────────
export async function createVeilleEntry(fd: FormData): Promise<void> {
  const membre = await garde('veille');
  const brut = formToObject(fd);
  const p = veilleSchema.safeParse({ ...brut, sourceUrl: brut.source_url });
  if (!p.success) retour('veille', p.error.issues[0]?.message ?? 'saisie_invalide');
  const { error } = await table('veille_entries').insert({
    organization_id: membre.organizationId,
    category: p.data.category,
    title: p.data.title,
    summary: p.data.summary ?? null,
    source_url: p.data.sourceUrl ?? null,
    impact: p.data.impact ?? null,
    created_by: membre.userId,
  } as never);
  retour('veille', error?.message);
}
