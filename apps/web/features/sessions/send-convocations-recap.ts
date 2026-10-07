import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { convocationsRecapEmail } from '@/shared/lib/email/templates';
import { referentsDesDossiers } from '@/features/espace-entreprise/referents';
import { chargerSeance, construireConvocationGroupe, participantsConvoques } from './convocation-groupe';
import type { ParticipantConvoque } from './convocation-groupe-contenu';

/**
 * Convocation adressée à chaque entreprise cliente d'une séance : un e-mail
 * à son référent, avec en pièce jointe la convocation de ses salariés et leur
 * liste.
 *
 * Les participants sont ceux de la séance — que le choix d'un groupe met à
 * jour —, et non ceux des dossiers : la liste disait sinon « toute la
 * promotion » pour une séance qui n'attend que le Groupe A. Les particuliers en
 * sont exclus : ils reçoivent leur convocation individuelle.
 */
export type RecapResult = {
  readonly entreprises: number;
  readonly envoyes: number;
  readonly erreurs: string[];
};

const heure = (iso: string): string =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

export async function sendConvocationsRecap(sessionId: string): Promise<RecapResult> {
  const sb = supabaseAdmin() as unknown as SupabaseClient;
  const erreurs: string[] = [];

  const seance = await chargerSeance(sb, sessionId);
  if (!seance) return { entreprises: 0, envoyes: 0, erreurs: ['séance introuvable'] };
  const participants = await participantsConvoques(sb, seance);

  const parEntreprise = new Map<string, ParticipantConvoque[]>();
  for (const p of participants) {
    if (!p.companyId) continue;
    parEntreprise.set(p.companyId, [...(parEntreprise.get(p.companyId) ?? []), p]);
  }
  if (parEntreprise.size === 0) return { entreprises: 0, envoyes: 0, erreurs };

  const [{ data: entreprisesRows }, { data: dossiersRows }, referents] = await Promise.all([
    sb.schema('app').from('companies').select('id, name, contact_name, contact_email').in('id', [...parEntreprise.keys()]),
    seance.dossierIds.length
      ? sb.schema('app').from('dossiers').select('id, company_id').in('id', [...seance.dossierIds])
      : Promise.resolve({ data: [] }),
    referentsDesDossiers(sb, seance.dossierIds),
  ]);
  const entreprises = new Map(
    ((entreprisesRows ?? []) as Array<{ id: string; name: string; contact_name: string | null; contact_email: string | null }>).map((c) => [c.id, c]),
  );
  const dossiersDe = new Map<string, string[]>();
  for (const d of (dossiersRows ?? []) as Array<{ id: string; company_id: string | null }>) {
    if (d.company_id) dossiersDe.set(d.company_id, [...(dossiersDe.get(d.company_id) ?? []), d.id]);
  }

  let envoyes = 0;
  for (const [companyId, salaries] of parEntreprise) {
    const entreprise = entreprises.get(companyId);
    if (!entreprise) {
      erreurs.push('entreprise introuvable');
      continue;
    }
    // Le référent du dossier d'abord : c'est lui qui suit cette formation.
    const referent = (dossiersDe.get(companyId) ?? []).map((id) => referents.get(id)).find(Boolean);
    let destinataire = referent?.email ?? entreprise.contact_email?.trim() ?? null;
    let prenom = referent?.prenom || entreprise.contact_name;
    if (!destinataire) {
      const { data: devis } = await sb
        .schema('app')
        .from('quotes')
        .select('recipient_email')
        .eq('company_id', companyId)
        .not('recipient_email', 'is', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      destinataire = (devis as { recipient_email: string | null } | null)?.recipient_email?.trim() ?? null;
      prenom = entreprise.contact_name;
    }
    if (!destinataire) {
      erreurs.push(`${entreprise.name} : aucune adresse de contact`);
      continue;
    }

    const pdf = await construireConvocationGroupe(sb, seance, salaries, entreprise.name);
    const tpl = convocationsRecapEmail({
      companyName: entreprise.name,
      contactName: prenom ?? null,
      formationTitle: seance.formation,
      sessionDate: seance.debut,
      sessionStartTime: heure(seance.debut),
      sessionEndTime: heure(seance.fin),
      modality: seance.modalite,
      location: seance.lieu,
      remoteUrl: seance.modalite === 'presentiel' ? null : seance.visio,
      groupe: seance.groupe,
      learners: salaries.map((s) => ({ fullName: `${s.prenom} ${s.nom}`.trim() || '—', email: s.email })),
    });

    const envoi = await sendEmail({
      to: destinataire,
      subject: tpl.subject,
      html: tpl.html,
      attachments: [{ filename: pdf.filename, content: Buffer.from(pdf.bytes).toString('base64') }],
      organizationId: seance.organizationId,
      dossierId: dossiersDe.get(companyId)?.[0],
      kind: 'convocation_recap_entreprise',
      metadata: { session_id: seance.id, company_id: companyId, participants: salaries.length },
    });
    if (envoi.ok) envoyes += 1;
    else erreurs.push(`${entreprise.name} : ${envoi.reason}`);
  }

  return { entreprises: parEntreprise.size, envoyes, erreurs };
}
