import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { nomDuDossier } from '@/features/dossier/referent';
import { membresParRole } from '@/features/trainer-space/validation-recipients';
import { envoyerDepuisLOrganisme } from '@/features/sessions/visio';
import { nouveauDossierEmail } from '@/shared/lib/email/templates';

/**
 * La direction est prévenue de chaque nouveau dossier, dans sa cloche et par
 * e-mail (point Capsule IA du 05/10/2026 : « Faouzi doit recevoir une alerte
 * dès qu'un nouveau dossier est créé par Laurie »). Celui qui crée le dossier
 * n'est pas prévenu de son propre geste.
 *
 * Appelée juste après la création, puis par le passage des 15 minutes en
 * filet de sécurité : la clé d'envoi (`dossier_cree:<dossier>:<personne>`)
 * garantit qu'une même personne n'est prévenue qu'une fois.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

const un = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const jour = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'long' }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`)) : null;

export async function alerterDirectionNouveauDossier(
  sb: Sb,
  dossierId: string,
  /** Qui a créé le dossier, quand on le sait : il n'est pas prévenu de son propre geste. */
  auteurId: string | null = null,
): Promise<{ prevenus: number }> {
  const { data } = await sb
    .schema('app')
    .from('dossiers')
    .select(
      'id, reference, organization_id, created_by, start_date, nom, learner:learners!dossiers_learner_id_fkey(first_name, last_name, email), company:companies(name), formation:formations(title)',
    )
    .eq('id', dossierId)
    .is('deleted_at', null)
    .maybeSingle();
  const d = data as unknown as {
    id: string;
    reference: string;
    organization_id: string;
    created_by: string | null;
    start_date: string | null;
    nom: string | null;
    learner: { first_name: string | null; last_name: string | null; email: string | null } | null;
    company: { name: string | null } | Array<{ name: string | null }> | null;
    formation: { title: string | null } | Array<{ title: string | null }> | null;
  } | null;
  if (!d) return { prevenus: 0 };
  const auteur = auteurId ?? d.created_by;

  const direction = (await membresParRole(sb as never, d.organization_id, ['owner', 'admin']))
    .map((m) => m.userId)
    .filter((id) => id !== auteur);
  if (direction.length === 0) return { prevenus: 0 };

  const ids = [...new Set([...direction, ...(auteur ? [auteur] : [])])];
  const { data: p } = await sb.schema('app').from('profiles').select('user_id, full_name, email').in('user_id', ids);
  const profils = new Map(((p ?? []) as Array<{ user_id: string; full_name: string | null; email: string | null }>).map((x) => [x.user_id, x]));
  const learner = un(d.learner);
  const { nom: client } = nomDuDossier({
    nom: d.nom,
    learner: learner ? { firstName: learner.first_name, lastName: learner.last_name, email: learner.email } : null,
    companyName: un(d.company)?.name ?? null,
  });
  const creePar = auteur ? (profils.get(auteur)?.full_name?.trim() || null) : null;
  const lien = `${(env.PUBLIC_APP_URL ?? '').replace(/\/$/, '')}/dossiers/${d.id}`;
  const tpl = nouveauDossierEmail({
    reference: d.reference,
    client,
    formation: un(d.formation)?.title ?? null,
    creePar,
    debut: jour(d.start_date),
    lien,
  });

  let prevenus = 0;
  for (const userId of [...new Set(direction)]) {
    const email = profils.get(userId)?.email?.trim();
    if (!email) continue;
    const r = await envoyerDepuisLOrganisme(sb, d.organization_id, {
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      dossierId: d.id,
      kind: 'dossier_cree',
      idempotencyKey: `dossier_cree:${d.id}:${userId}`,
      metadata: { dossier_id: d.id, destinataire: userId },
    });
    // Déjà prévenu par e-mail : rien de plus.
    if (!r.ok && r.reason === 'duplicate') continue;
    // La cloche une seule fois, même si l'e-mail est réessayé au passage suivant.
    const { data: deja } = await sb
      .schema('app')
      .from('notifications')
      .select('id')
      .eq('template_code', 'dossier.created')
      .eq('recipient_user_id', userId)
      .eq('related_aggregate_id', d.id)
      .limit(1)
      .maybeSingle();
    if (deja) continue;
    const { error } = await sb
      .schema('app')
      .from('notifications')
      .insert({
        organization_id: d.organization_id,
        channel: 'in_app',
        template_code: 'dossier.created',
        recipient_user_id: userId,
        subject: tpl.subject,
        payload: { dossier_id: d.id, reference: d.reference, client, cree_par: creePar },
        status: 'sent',
        sent_at: new Date().toISOString(),
        related_aggregate_type: 'dossier',
        related_aggregate_id: d.id,
      } as never);
    if (error) console.error('[nouveau dossier] cloche non posée', d.id, error.message);
    prevenus += 1;
  }
  return { prevenus };
}

/** Filet de sécurité : les dossiers créés ces deux derniers jours, quel que soit le chemin. */
export async function alerterDirectionDossiersRecents(sb: Sb, maintenant = new Date()): Promise<{ dossiers: number; prevenus: number; errors: string[] }> {
  const { data, error } = await sb
    .schema('app')
    .from('dossiers')
    .select('id')
    .gte('created_at', new Date(maintenant.getTime() - 48 * 3600_000).toISOString())
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) return { dossiers: 0, prevenus: 0, errors: [`lecture des dossiers : ${error.message}`] };
  let prevenus = 0;
  const errors: string[] = [];
  for (const { id } of (data ?? []) as Array<{ id: string }>) {
    try {
      prevenus += (await alerterDirectionNouveauDossier(sb, id)).prevenus;
    } catch (e) {
      errors.push(`${id} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { dossiers: (data ?? []).length, prevenus, errors };
}
