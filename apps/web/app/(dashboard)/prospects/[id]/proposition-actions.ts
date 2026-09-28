'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { guardAction } from '@/shared/lib/auth/guard-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { notifyOrgStaffOfProgramme } from '@/shared/lib/notifications/notify-staff';
import { sendQuoteForSignature } from '@/features/billing/quotes/quote-service';
import { BUCKET_PROGRAMMES, creerVersion } from '@/features/proposition/service';
import { reviserSchema, envoyerSchema, depotSchema, deposeSchema } from '@/features/proposition/proposition.schema';
import type { ContenuProposition } from '@/features/proposition/contenu';

/**
 * Programme déposé → proposition V1 ; consigne → V2, V3… ; envoi du devis.
 * Réservé aux rôles qui gèrent le CRM, pour une demande de l'organisme du
 * membre ; l'écriture se fait en service role.
 */

export type PropositionResult = { ok: true; message: string } | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = () => supabaseAdmin() as unknown as SupabaseClient<any, any, any>;

async function garde(prospectId: string) {
  const g = await guardAction('crm');
  if (!g.ok) return { ok: false as const, error: g.error === 'forbidden' ? 'Votre rôle ne permet pas de préparer une proposition.' : 'Session expirée — reconnectez-vous.' };
  if (!z.string().uuid().safeParse(prospectId).success) return { ok: false as const, error: 'Demande introuvable.' };
  const { data } = await admin()
    .schema('app')
    .from('prospects')
    .select('id, organization_id, first_name, last_name, company_name')
    .eq('id', prospectId)
    .eq('organization_id', g.member.organizationId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) return { ok: false as const, error: 'Demande introuvable.' };
  return { ok: true as const, member: g.member, prospect: data as { id: string; organization_id: string; first_name: string | null; last_name: string | null; company_name: string | null } };
}

const message = (version: number, alertes: string[]) =>
  alertes.length
    ? `Proposition V${version} prête — à relire : ${alertes.length} point${alertes.length > 1 ? 's' : ''} hors cadre signalé${alertes.length > 1 ? 's' : ''}.`
    : `Proposition V${version} et son devis sont prêts à relire.`;

/**
 * Prépare le dépôt : une URL d'envoi signée, pour que le navigateur envoie le
 * fichier directement au stockage. Il ne transite pas par le serveur de
 * l'application, dont les requêtes sont limitées à 5 Mo : aucun format ni
 * aucune taille n'est imposé ici.
 */
export async function preparerDepotProgramme(brut: z.input<typeof depotSchema>): Promise<
  { ok: true; path: string; token: string } | { ok: false; error: string }
> {
  const p = depotSchema.safeParse(brut);
  if (!p.success) return { ok: false, error: 'Fichier invalide.' };
  const g = await garde(p.data.prospectId);
  if (!g.ok) return g;
  const propre = p.data.nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-120) || 'programme';
  const path = `${p.data.prospectId}/programme/${Date.now()}-${propre}`;
  const { data, error } = await admin().storage.from(BUCKET_PROGRAMMES).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: `Le dépôt n’a pas pu être préparé : ${error?.message ?? 'erreur inconnue'}` };
  return { ok: true, path: data.path, token: data.token };
}

/** Le fichier est déposé : prévient l'équipe et rédige la proposition V1. */
export async function deposerProgramme(brut: z.input<typeof deposeSchema>): Promise<PropositionResult> {
  const p = deposeSchema.safeParse(brut);
  if (!p.success) return { ok: false, error: 'Dépôt invalide.' };
  const prospectId = p.data.prospectId;
  const g = await garde(prospectId);
  if (!g.ok) return g;
  // Le chemin vient du navigateur : il doit être celui préparé pour CETTE demande.
  if (!p.data.path.startsWith(`${prospectId}/programme/`) || p.data.path.includes('..')) return { ok: false, error: 'Dépôt invalide.' };
  const path = p.data.path;

  const { data: profil } = await admin().schema('app').from('profiles').select('full_name').eq('user_id', g.member.userId).maybeSingle();
  const deposePar = (profil as { full_name?: string } | null)?.full_name ?? null;
  const client = g.prospect.company_name || [g.prospect.first_name, g.prospect.last_name].filter(Boolean).join(' ') || 'Demande';

  await admin().schema('app').from('prospect_events').insert({
    organization_id: g.prospect.organization_id,
    prospect_id: prospectId,
    kind: 'programme_depose',
    actor_user_id: g.member.userId,
    payload: { nom: p.data.nom, path },
  } as never);
  // Prévenue avant la rédaction : Laurie sait qu'une proposition arrive.
  await notifyOrgStaffOfProgramme({
    organizationId: g.prospect.organization_id,
    prospectId,
    client,
    deposePar,
    exclureUserId: g.member.userId,
  });

  const r = await creerVersion(admin(), { prospectId, userId: g.member.userId, programmePath: path, programmeNom: p.data.nom });
  revalidatePath(`/prospects/${prospectId}`);
  return r.ok ? { ok: true, message: message(r.version, r.alertes) } : { ok: false, error: `Programme enregistré, mais ${r.erreur.charAt(0).toLowerCase()}${r.erreur.slice(1)}` };
}

/** Demande une nouvelle version à l'IA, avec ce qu'il faut changer. L'ancienne est archivée. */
export async function reviserProposition(brut: z.input<typeof reviserSchema>): Promise<PropositionResult> {
  const p = reviserSchema.safeParse(brut);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? 'Saisie invalide.' };
  const g = await garde(p.data.prospectId);
  if (!g.ok) return g;
  const { data } = await admin()
    .schema('app')
    .from('propositions')
    .select('contenu, programme_path, programme_nom')
    .eq('id', p.data.propositionId)
    .eq('prospect_id', p.data.prospectId)
    .eq('statut', 'active')
    .maybeSingle();
  const active = data as { contenu: ContenuProposition; programme_path: string; programme_nom: string | null } | null;
  if (!active) return { ok: false, error: 'Seule la proposition en cours peut être révisée.' };

  const r = await creerVersion(admin(), {
    prospectId: p.data.prospectId,
    userId: g.member.userId,
    programmePath: active.programme_path,
    programmeNom: active.programme_nom,
    revision: { precedente: active.contenu, consignes: p.data.consignes },
  });
  revalidatePath(`/prospects/${p.data.prospectId}`);
  return r.ok ? { ok: true, message: message(r.version, r.alertes) } : { ok: false, error: r.erreur };
}

/** Envoie le devis de la proposition en cours pour signature électronique. */
export async function envoyerDevisProposition(brut: z.input<typeof envoyerSchema>): Promise<PropositionResult> {
  const p = envoyerSchema.safeParse(brut);
  if (!p.success) return { ok: false, error: 'Saisie invalide.' };
  const g = await garde(p.data.prospectId);
  if (!g.ok) return g;
  const { data } = await admin()
    .schema('app')
    .from('propositions')
    .select('quote_id, version')
    .eq('id', p.data.propositionId)
    .eq('prospect_id', p.data.prospectId)
    .eq('statut', 'active')
    .maybeSingle();
  const prop = data as { quote_id: string | null; version: number } | null;
  if (!prop?.quote_id) return { ok: false, error: 'Cette proposition n’a pas de devis à envoyer.' };

  const r = await sendQuoteForSignature(admin(), prop.quote_id, g.prospect.organization_id);
  revalidatePath(`/prospects/${p.data.prospectId}`);
  if (!r.ok) return { ok: false, error: `Le devis n’est pas parti (${r.error}).` };
  return { ok: true, message: `Devis de la V${prop.version} envoyé pour signature à ${r.email ?? 'le client'}. Signé, la demande deviendra client et la convention sera générée.` };
}
