import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { convocationsRecapEmail } from '@/shared/lib/email/templates';

/**
 * Récapitulatif des convocations adressé aux entreprises clientes d'une séance.
 *
 * Les convocations J-7 partent une par une à chaque apprenant. L'entreprise qui
 * a commandé la formation, elle, ne recevait rien : elle ne savait ni qui était
 * convoqué, ni quand, et ne pouvait rien transmettre à ses salariés.
 *
 * Cette fonction regroupe les apprenants d'une séance **par entreprise** et
 * envoie un seul e-mail au responsable de chacune. Les particuliers en sont
 * exclus : ils reçoivent leur convocation individuelle, et n'ont pas de
 * responsable à informer.
 */
export type RecapResult = {
  readonly entreprises: number;
  readonly envoyes: number;
  readonly erreurs: string[];
};

type DossierRow = {
  id: string;
  company_id: string | null;
  learner: { first_name: string; last_name: string; email: string | null } | null;
  formation: { title: string } | null;
  company: { name: string; contact_name: string | null; contact_email: string | null } | null;
};

const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const heure = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—';

export async function sendConvocationsRecap(sessionId: string): Promise<RecapResult> {
  const sb = supabaseAdmin();
  const erreurs: string[] = [];

  const { data: sessionData, error: errS } = await sb
    .schema('app')
    .from('sessions')
    .select('id, organization_id, starts_at, ends_at, modality, location, remote_url, dossier_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (errS || !sessionData) {
    return { entreprises: 0, envoyes: 0, erreurs: [errS?.message ?? 'séance introuvable'] };
  }
  const session = sessionData as unknown as {
    id: string;
    organization_id: string;
    starts_at: string | null;
    ends_at: string | null;
    modality: string | null;
    location: string | null;
    remote_url: string | null;
    dossier_id: string | null;
  };

  // Une séance individuelle porte `dossier_id` ; une séance de groupe passe par
  // la table de liaison. Les deux cas doivent être couverts.
  const { data: liens } = await sb
    .schema('app')
    .from('session_dossiers')
    .select('dossier_id')
    .eq('session_id', sessionId);
  const dossierIds = [
    ...new Set(
      [session.dossier_id, ...((liens ?? []) as { dossier_id: string }[]).map((l) => l.dossier_id)].filter(
        (v): v is string => Boolean(v),
      ),
    ),
  ];
  if (dossierIds.length === 0) return { entreprises: 0, envoyes: 0, erreurs: [] };

  const { data: dossiersData, error: errD } = await sb
    .schema('app')
    .from('dossiers')
    .select(
      'id, company_id, learner:learners(first_name, last_name, email), formation:formations(title), company:companies(name, contact_name, contact_email)',
    )
    .eq('organization_id', session.organization_id)
    .is('deleted_at', null)
    .in('id', dossierIds);
  if (errD) return { entreprises: 0, envoyes: 0, erreurs: [errD.message] };

  const dossiers = (dossiersData ?? []) as unknown as DossierRow[];

  const parEntreprise = new Map<string, DossierRow[]>();
  for (const d of dossiers) {
    if (!d.company_id) continue; // particulier : convocation individuelle uniquement
    parEntreprise.set(d.company_id, [...(parEntreprise.get(d.company_id) ?? []), d]);
  }

  let envoyes = 0;

  for (const [companyId, lignes] of parEntreprise) {
    const entreprise = un(lignes[0]?.company ?? null);
    // Responsable de l'entreprise ; à défaut, le destinataire de son dernier devis.
    let destinataire = entreprise?.contact_email?.trim();
    if (!destinataire) {
      const { data: devis } = await (sb as unknown as SupabaseClient)
        .schema('app')
        .from('quotes')
        .select('recipient_email')
        .eq('company_id', companyId)
        .not('recipient_email', 'is', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      destinataire = (devis as { recipient_email: string | null } | null)?.recipient_email?.trim();
    }
    if (!entreprise || !destinataire) {
      erreurs.push(`${entreprise?.name ?? 'entreprise'} : aucune adresse de contact`);
      continue;
    }

    const tpl = convocationsRecapEmail({
      companyName: entreprise.name,
      contactName: entreprise.contact_name,
      formationTitle: un(lignes[0]?.formation ?? null)?.title ?? 'Formation',
      sessionDate: session.starts_at ?? new Date().toISOString(),
      sessionStartTime: heure(session.starts_at),
      sessionEndTime: heure(session.ends_at),
      modality: session.modality ?? 'presentiel',
      location: session.location,
      remoteUrl: session.remote_url,
      learners: lignes.map((l) => {
        const a = un(l.learner);
        return {
          fullName: a ? `${a.first_name} ${a.last_name}`.trim() : '—',
          email: a?.email ?? null,
        };
      }),
    });

    const envoi = await sendEmail({
      to: destinataire,
      subject: tpl.subject,
      html: tpl.html,
      organizationId: session.organization_id,
      kind: 'convocation_recap_entreprise',
      metadata: { session_id: session.id, company_id: companyId },
    });
    if (envoi.ok) envoyes += 1;
    else erreurs.push(`${entreprise.name} : ${envoi.reason}`);
  }

  return { entreprises: parEntreprise.size, envoyes, erreurs };
}
