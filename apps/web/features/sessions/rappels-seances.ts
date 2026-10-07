import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { rappelSeanceEmail } from '@/shared/lib/email/templates';
import { sessionsAutomationOff } from '@/features/automation/session-automations';
import { loadReglesParOrganisme } from '@/features/emails/programmation-store';
import { organisationsQuiOntCoupe } from '@/features/emails/programmation-envois';
import { rappelDu, type Rappel } from './invites-visio';
import { jourDeRappel, rappelsAEnvoyer } from './rappel-du-jour';
import {
  emailsFormateursDeSeance,
  emailsReferentsDeSeance,
  envoyerDepuisLaBoiteDesCours,
  seancePourEmail,
} from './visio';

/**
 * Rappels 48 h et 2 h avant chaque séance, à l'entreprise (référent du
 * dossier) et au formateur, depuis l'adresse de l'organisme. Le passage est
 * fréquent (0203) ; le rappel 2 h part une fois par destinataire et par
 * horaire, grâce à sa clé : déplacer la séance le relance. Le rappel 48 h part
 * une fois par destinataire, par formation et par jour : une journée en deux
 * séances n'en envoie qu'un (07/10/2026).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

export const KIND_RAPPEL: Record<Rappel, string> = {
  '48h': 'rappel_seance_48h',
  '2h': 'rappel_seance_2h',
};

export async function envoyerRappelsSeances(
  sb: Sb,
  maintenant = new Date(),
): Promise<{ seances: number; sent: number; errors: string[] }> {
  const { data, error } = await sb
    .schema('app')
    .from('sessions')
    .select('id, organization_id, starts_at, formation_id, dossier_id')
    .eq('status', 'planned')
    .gt('starts_at', maintenant.toISOString())
    .lte('starts_at', new Date(maintenant.getTime() + 48 * 3600_000).toISOString());
  if (error) return { seances: 0, sent: 0, errors: [`lecture des séances : ${error.message}`] };

  const dues = ((data ?? []) as Array<{ id: string; organization_id: string; starts_at: string; formation_id: string | null; dossier_id: string | null }>)
    .map((s) => ({ ...s, rappel: rappelDu(s.starts_at, maintenant) }))
    .filter((s): s is typeof s & { rappel: Rappel } => s.rappel !== null);
  if (dues.length === 0) return { seances: 0, sent: 0, errors: [] };

  const [coupees48, coupees2, coupe48, coupe2] = await Promise.all([
    sessionsAutomationOff(sb, dues.filter((s) => s.rappel === '48h').map((s) => s.id), 'rappel_48h'),
    sessionsAutomationOff(sb, dues.filter((s) => s.rappel === '2h').map((s) => s.id), 'rappel_2h'),
    loadReglesParOrganisme(sb, 'rappel_seance_48h').then((r) => organisationsQuiOntCoupe('rappel_seance_48h', r)),
    loadReglesParOrganisme(sb, 'rappel_seance_2h').then((r) => organisationsQuiOntCoupe('rappel_seance_2h', r)),
  ]);
  const coupeParRappel: Record<Rappel, Set<string>> = { '48h': coupe48, '2h': coupe2 };
  const coupeesParRappel: Record<Rappel, Set<string>> = { '48h': coupees48, '2h': coupees2 };

  const appUrl = (env.PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  let seances = 0;
  let sent = 0;
  const errors: string[] = [];

  // Ce qui part : les destinataires de chaque séance due.
  type Due = (typeof dues)[number];
  const aPreparer: Array<{ seance: Due; donnees: NonNullable<Awaited<ReturnType<typeof seancePourEmail>>>; envois: Array<{ email: string; pour: 'entreprise' | 'formateur' }> }> = [];
  for (const s of dues) {
    if (coupeesParRappel[s.rappel].has(s.id) || coupeParRappel[s.rappel].has(s.organization_id)) continue;
    const seance = await seancePourEmail(sb, s.id);
    if (!seance) continue;
    seances += 1;
    const [entreprises, formateurs] = await Promise.all([emailsReferentsDeSeance(sb, s.id), emailsFormateursDeSeance(sb, s.id)]);
    aPreparer.push({
      seance: s,
      donnees: seance,
      envois: [
        ...entreprises.map((email) => ({ email, pour: 'entreprise' as const })),
        ...formateurs.map((email) => ({ email, pour: 'formateur' as const })),
      ],
    });
  }

  // Le 48 h : un par destinataire, formation et jour — y compris face aux
  // rappels partis lors des passages précédents.
  const du48 = aPreparer.filter((p) => p.seance.rappel === '48h');
  const deja48 = du48.length ? await dejaPrevenus48h(sb, maintenant) : new Set<string>();
  const retenus48 = new Set(
    rappelsAEnvoyer(du48.map((p) => ({ seance: p.seance, emails: p.envois.map((e) => e.email) })), deja48).map(
      (r) => `${r.seance.id}|${r.email.toLowerCase()}`,
    ),
  );

  for (const p of aPreparer) {
    const s = p.seance;
    for (const { email, pour } of p.envois) {
      if (s.rappel === '48h' && !retenus48.has(`${s.id}|${email.toLowerCase()}`)) continue;
      const { subject, html } = rappelSeanceEmail({
        ...p.donnees.donnees,
        delai: s.rappel,
        pour,
        lienEspace: appUrl ? `${appUrl}/seance/${s.id}` : null,
      });
      const r = await envoyerDepuisLaBoiteDesCours(sb, s.organization_id, {
        to: email,
        subject,
        html,
        kind: KIND_RAPPEL[s.rappel],
        idempotencyKey:
          s.rappel === '48h'
            ? `${KIND_RAPPEL['48h']}:${jourDeRappel(s)}:${email.toLowerCase()}`
            : `${KIND_RAPPEL['2h']}:${s.id}:${s.starts_at}:${email.toLowerCase()}`,
        metadata: { session_id: s.id, pour },
      });
      if (r.ok) sent += 1;
      else if (r.reason !== 'duplicate') errors.push(`${s.id} → ${pour} : ${r.reason}`);
    }
  }
  return { seances, sent, errors };
}

/** Les rappels 48 h déjà partis ces trois derniers jours, en clés `jour|groupe|email`. */
async function dejaPrevenus48h(sb: Sb, maintenant: Date): Promise<Set<string>> {
  const { data, error } = await sb
    .schema('app')
    .from('email_log')
    .select('recipient, metadata')
    .eq('kind', KIND_RAPPEL['48h'])
    .eq('status', 'sent')
    .gte('sent_at', new Date(maintenant.getTime() - 3 * 24 * 3600_000).toISOString());
  if (error) throw new Error(`[rappels] journal illisible : ${error.message}`);
  const lignes = (data ?? []) as Array<{ recipient: string; metadata: { session_id?: string } | null }>;
  const ids = [...new Set(lignes.map((l) => l.metadata?.session_id).filter((x): x is string => Boolean(x)))];
  if (ids.length === 0) return new Set();
  const { data: seances } = await sb.schema('app').from('sessions').select('id, starts_at, formation_id, dossier_id').in('id', ids);
  const parId = new Map(
    ((seances ?? []) as Array<{ id: string; starts_at: string; formation_id: string | null; dossier_id: string | null }>).map((x) => [x.id, x]),
  );
  const out = new Set<string>();
  for (const l of lignes) {
    const se = l.metadata?.session_id ? parId.get(l.metadata.session_id) : undefined;
    if (se) out.add(`${jourDeRappel(se)}|${l.recipient.trim().toLowerCase()}`);
  }
  return out;
}
