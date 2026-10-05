import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { rappelSeanceEmail } from '@/shared/lib/email/templates';
import { sessionsAutomationOff } from '@/features/automation/session-automations';
import { loadReglesParOrganisme } from '@/features/emails/programmation-store';
import { organisationsQuiOntCoupe } from '@/features/emails/programmation-envois';
import { rappelDu, type Rappel } from './invites-visio';
import {
  emailsFormateursDeSeance,
  emailsReferentsDeSeance,
  envoyerDepuisLOrganisme,
  seancePourEmail,
} from './visio';

/**
 * Rappels 48 h et 2 h avant chaque séance, à l'entreprise (référent du
 * dossier) et au formateur, depuis l'adresse de l'organisme. Le passage est
 * fréquent (0203) ; chaque rappel n'en part pas moins qu'une fois par
 * destinataire et par horaire, grâce à sa clé : déplacer la séance le relance.
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
    .select('id, organization_id, starts_at')
    .eq('status', 'planned')
    .gt('starts_at', maintenant.toISOString())
    .lte('starts_at', new Date(maintenant.getTime() + 48 * 3600_000).toISOString());
  if (error) return { seances: 0, sent: 0, errors: [`lecture des séances : ${error.message}`] };

  const dues = ((data ?? []) as Array<{ id: string; organization_id: string; starts_at: string }>)
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

  for (const s of dues) {
    if (coupeesParRappel[s.rappel].has(s.id) || coupeParRappel[s.rappel].has(s.organization_id)) continue;
    const seance = await seancePourEmail(sb, s.id);
    if (!seance) continue;
    seances += 1;

    const [entreprises, formateurs] = await Promise.all([
      emailsReferentsDeSeance(sb, s.id),
      emailsFormateursDeSeance(sb, s.id),
    ]);
    const envois = [
      ...entreprises.map((email) => ({ email, pour: 'entreprise' as const })),
      ...formateurs.map((email) => ({ email, pour: 'formateur' as const })),
    ];

    for (const { email, pour } of envois) {
      const { subject, html } = rappelSeanceEmail({
        ...seance.donnees,
        delai: s.rappel,
        pour,
        lienEspace: appUrl ? `${appUrl}/seance/${s.id}` : null,
      });
      const r = await envoyerDepuisLOrganisme(sb, s.organization_id, {
        to: email,
        subject,
        html,
        kind: KIND_RAPPEL[s.rappel],
        idempotencyKey: `${KIND_RAPPEL[s.rappel]}:${s.id}:${s.starts_at}:${email.toLowerCase()}`,
        metadata: { session_id: s.id, pour },
      });
      if (r.ok) sent += 1;
      else if (r.reason !== 'duplicate') errors.push(`${s.id} → ${pour} : ${r.reason}`);
    }
  }
  return { seances, sent, errors };
}
