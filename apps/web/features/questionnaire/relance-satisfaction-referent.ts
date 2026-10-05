import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { relanceSatisfactionReferentEmail } from '@/shared/lib/email/templates';
import { loadSession } from '@/features/sessions/load-session';
import { referentDuDossier } from '@/features/sessions/invites-visio';
import { envoyerDepuisLOrganisme } from '@/features/sessions/visio';
import { sessionsAutomationOff } from '@/features/automation/session-automations';
import { loadReglesParOrganisme } from '@/features/emails/programmation-store';
import { organisationsQuiOntCoupe } from '@/features/emails/programmation-envois';
import { assignationSatisfaction, lienSatisfaction } from './satisfaction';

/**
 * 24 h après la dernière séance d'un dossier, le référent du client reçoit
 * la liste de ses stagiaires qui n'ont pas répondu au questionnaire de
 * satisfaction, avec le lien de chacun à leur transmettre. Rien s'ils ont
 * tous répondu. Une fois par dossier : la dernière séance seulement, pour ne
 * pas relancer après chaque journée d'une formation en plusieurs fois.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

const un = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function relancerReferentsSatisfaction(
  sb: Sb,
  maintenant = new Date(),
): Promise<{ dossiers: number; sent: number; errors: string[] }> {
  // Fenêtre large (24 à 72 h) : un passage manqué se rattrape ; la clé d'envoi
  // garantit qu'on n'écrit qu'une fois par dossier.
  const { data, error } = await sb
    .schema('app')
    .from('sessions')
    .select('id, organization_id, ends_at')
    .neq('status', 'cancelled')
    .lte('ends_at', new Date(maintenant.getTime() - 24 * 3600_000).toISOString())
    .gt('ends_at', new Date(maintenant.getTime() - 72 * 3600_000).toISOString());
  if (error) return { dossiers: 0, sent: 0, errors: [`lecture des séances : ${error.message}`] };
  const seances = (data ?? []) as Array<{ id: string; organization_id: string; ends_at: string }>;
  if (seances.length === 0) return { dossiers: 0, sent: 0, errors: [] };

  const [coupees, coupes] = await Promise.all([
    sessionsAutomationOff(sb, seances.map((s) => s.id), 'satisfaction'),
    loadReglesParOrganisme(sb, 'relance_satisfaction_referent').then((r) =>
      organisationsQuiOntCoupe('relance_satisfaction_referent', r),
    ),
  ]);

  let dossiersTraites = 0;
  let sent = 0;
  const errors: string[] = [];

  for (const s of seances) {
    if (coupees.has(s.id) || coupes.has(s.organization_id)) continue;
    const loaded = await loadSession(sb, s.id);
    if (!loaded || loaded.learners.length === 0) continue;

    for (const dossierId of loaded.dossierIds) {
      // Seulement après la dernière séance du dossier.
      const { data: plusTard } = await sb
        .schema('app')
        .from('session_dossiers')
        .select('session:sessions!inner(id, ends_at, status)')
        .eq('dossier_id', dossierId)
        .gt('session.ends_at', s.ends_at)
        .neq('session.status', 'cancelled')
        .limit(1);
      const { data: plusTardDirect } = await sb
        .schema('app')
        .from('sessions')
        .select('id')
        .eq('dossier_id', dossierId)
        .gt('ends_at', s.ends_at)
        .neq('status', 'cancelled')
        .limit(1);
      if ((plusTard ?? []).length > 0 || (plusTardDirect ?? []).length > 0) continue;

      const { data: d } = await sb
        .schema('app')
        .from('dossiers')
        .select('contact:contacts(email, first_name), company:companies(contact_email, contact_name)')
        .eq('id', dossierId)
        .maybeSingle();
      const dossier = d as unknown as {
        contact: { email: string | null; first_name: string | null } | Array<{ email: string | null; first_name: string | null }> | null;
        company: { contact_email: string | null; contact_name: string | null } | Array<{ contact_email: string | null; contact_name: string | null }> | null;
      } | null;
      const contact = un(dossier?.contact);
      const entreprise = un(dossier?.company);
      const email = referentDuDossier({ referentEmail: contact?.email, companyEmail: entreprise?.contact_email });
      if (!email) continue;
      dossiersTraites += 1;

      const sansReponse: Array<{ nom: string; lien: string | null }> = [];
      for (const l of loaded.learners.filter((x) => x.dossierId === dossierId)) {
        const args = { organizationId: s.organization_id, dossierId, learnerId: l.id };
        const { complete } = await assignationSatisfaction(sb, args);
        if (complete) continue;
        sansReponse.push({ nom: `${l.first_name} ${l.last_name}`.trim(), lien: await lienSatisfaction(sb, args) });
      }
      if (sansReponse.length === 0) continue;

      const { data: o } = await sb.schema('app').from('organizations').select('name').eq('id', s.organization_id).maybeSingle();
      const { subject, html } = relanceSatisfactionReferentEmail({
        prenom: contact?.first_name ?? entreprise?.contact_name ?? '',
        formation: loaded.formation?.title ?? loaded.session.title ?? 'votre formation',
        organisme: (o as { name: string | null } | null)?.name ?? 'Votre organisme de formation',
        stagiaires: sansReponse,
      });
      const r = await envoyerDepuisLOrganisme(sb, s.organization_id, {
        to: email,
        subject,
        html,
        kind: 'relance_satisfaction_referent',
        dossierId,
        idempotencyKey: `relance_satisfaction_referent:${dossierId}`,
        metadata: { session_id: s.id, sans_reponse: sansReponse.length },
      });
      if (r.ok) sent += 1;
      else if (r.reason !== 'duplicate' && r.reason !== 'no_api_key') errors.push(`${dossierId} : ${r.reason}`);
    }
  }
  return { dossiers: dossiersTraites, sent, errors };
}
