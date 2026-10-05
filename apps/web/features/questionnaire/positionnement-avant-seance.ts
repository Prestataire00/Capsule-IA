import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/shared/lib/email/resend';
import { needsAnalysisEmail } from '@/shared/lib/email/templates';
import { loadSession } from '@/features/sessions/load-session';
import { loadReglesParOrganisme } from '@/features/emails/programmation-store';
import { organisationsQuiOntCoupe } from '@/features/emails/programmation-envois';
import { ficheDePositionnement } from './needs-analysis';

/**
 * La fiche de positionnement repart 24 h avant la séance à chaque stagiaire
 * dont on a l'adresse et qui ne l'a pas remplie. Ceux qu'on ne peut pas
 * joindre la remplissent en émargeant. Une fois par fiche, quelle que soit
 * la séance : la clé d'envoi porte sur la fiche, pas sur la date.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

const adresseUtile = (e: string | null | undefined): e is string =>
  Boolean(e && e.includes('@') && !e.trim().toLowerCase().endsWith('.invalid'));

export async function envoyerFichesAvantSeance(
  sb: Sb,
  maintenant = new Date(),
): Promise<{ seances: number; sent: number; errors: string[] }> {
  const { data, error } = await sb
    .schema('app')
    .from('sessions')
    .select('id, organization_id')
    .eq('status', 'planned')
    .gt('starts_at', maintenant.toISOString())
    .lte('starts_at', new Date(maintenant.getTime() + 24 * 3600_000).toISOString());
  if (error) return { seances: 0, sent: 0, errors: [`lecture des séances : ${error.message}`] };
  const seances = (data ?? []) as Array<{ id: string; organization_id: string }>;
  if (seances.length === 0) return { seances: 0, sent: 0, errors: [] };

  const coupes = organisationsQuiOntCoupe('fiche_besoin', await loadReglesParOrganisme(sb, 'fiche_besoin'));
  let sent = 0;
  const errors: string[] = [];

  for (const s of seances) {
    if (coupes.has(s.organization_id)) continue;
    const loaded = await loadSession(sb, s.id);
    if (!loaded) continue;
    for (const l of loaded.learners) {
      if (!adresseUtile(l.email) || !l.dossierId) continue;
      const fiche = await ficheDePositionnement(sb, { organizationId: s.organization_id, dossierId: l.dossierId, learnerId: l.id });
      if (fiche.statut !== 'a_remplir') continue;
      const { subject, html } = needsAnalysisEmail({
        firstName: l.first_name,
        formationTitle: loaded.formation?.title ?? null,
        formUrl: fiche.url,
        durationMinutes: 10,
      });
      const r = await sendEmail({
        to: l.email,
        subject,
        html,
        kind: 'fiche_besoin',
        organizationId: s.organization_id,
        dossierId: l.dossierId,
        idempotencyKey: `fiche_besoin_veille:${fiche.assignmentId}`,
        metadata: { session_id: s.id, learner_id: l.id },
      });
      if (r.ok) sent += 1;
      else if (r.reason !== 'duplicate' && r.reason !== 'no_api_key') errors.push(`${s.id} → ${l.id} : ${r.reason}`);
    }
  }
  return { seances: seances.length, sent, errors };
}
