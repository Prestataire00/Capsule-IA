import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { sendEmail } from '@/shared/lib/email/resend';
import { convocationsRecapEmail } from '@/shared/lib/email/templates';
import { referentsDesDossiers } from '@/features/espace-entreprise/referents';
import { persistGeneratedDocument } from '@/features/documents/persist-document';
import { chargerSeance, construireConvocationDuGroupe, participantsConvoques, seancesDuGroupe } from './convocation-groupe';
import type { ParticipantConvoque } from './convocation-groupe-contenu';

/**
 * Convocation adressée à chaque entreprise cliente d'une séance : un e-mail
 * à son référent, avec en pièce jointe la convocation de ses salariés et leur
 * liste. Elle couvre tout le groupe de la séance, toutes ses dates (demande
 * d'Ismael, 15/10/2026) : une seule par groupe dans l'espace entreprise, et un
 * seul e-mail de l'automate, avant la première séance du groupe.
 *
 * Les participants sont ceux de la séance — que le choix d'un groupe met à
 * jour —, et non ceux des dossiers : la liste disait sinon « toute la
 * promotion » pour une séance qui n'attend que le Groupe A. Les particuliers en
 * sont exclus : ils reçoivent leur convocation individuelle.
 */
export type RecapResult = {
  readonly entreprises: number;
  readonly envoyes: number;
  /** Convocations déposées dans l'espace entreprise. */
  readonly deposees: number;
  readonly erreurs: string[];
};

/**
 * `uneFois` : envoi de l'automate, qui repasse chaque jour pour chaque séance
 * dans le délai — une clé par dossier, groupe et entreprise. Le bouton de
 * l'équipe, lui, renvoie quand on le lui demande.
 */
export async function sendConvocationsRecap(sessionId: string, opts: { uneFois?: boolean } = {}): Promise<RecapResult> {
  const sb = supabaseAdmin() as unknown as SupabaseClient;
  const erreurs: string[] = [];

  const seance = await chargerSeance(sb, sessionId);
  if (!seance) return { entreprises: 0, envoyes: 0, deposees: 0, erreurs: ['séance introuvable'] };
  const participants = await participantsConvoques(sb, seance);

  const parEntreprise = new Map<string, ParticipantConvoque[]>();
  for (const p of participants) {
    if (!p.companyId) continue;
    parEntreprise.set(p.companyId, [...(parEntreprise.get(p.companyId) ?? []), p]);
  }
  if (parEntreprise.size === 0) return { entreprises: 0, envoyes: 0, deposees: 0, erreurs };

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
  let deposees = 0;
  for (const [companyId, salaries] of parEntreprise) {
    const entreprise = entreprises.get(companyId);
    if (!entreprise) {
      erreurs.push('entreprise introuvable');
      continue;
    }
    const sesDossiers = dossiersDe.get(companyId) ?? [];
    const seances = await seancesDuGroupe(sb, seance, sesDossiers);
    const participants = new Map<string, readonly ParticipantConvoque[]>([[seance.id, salaries]]);
    for (const s of seances) {
      if (participants.has(s.id)) continue;
      participants.set(s.id, (await participantsConvoques(sb, s)).filter((p) => p.companyId === companyId));
    }
    const convoques = new Map<string, ParticipantConvoque>();
    for (const liste of participants.values()) for (const p of liste) convoques.set(p.id, p);
    const pdf = await construireConvocationDuGroupe(sb, seances, participants, entreprise.name);
    const cle = `convocation_groupe_dossier:${sesDossiers[0] ?? seance.id}:${seance.groupeId ?? 'sans-groupe'}:${companyId}`;

    // Déposée dans l'espace entreprise, que l'e-mail parte ou non : une
    // version par groupe et par entreprise, remplacée si une date change. Les
    // convocations séance par séance d'avant n'y sont plus montrées.
    const dossierId = sesDossiers[0];
    if (dossierId) {
      try {
        const doc = await persistGeneratedDocument(sb, {
          organizationId: seance.organizationId,
          dossierId,
          kind: 'convocation',
          title: pdf.titre,
          bytes: pdf.bytes,
          generationInput: { session_ids: seances.map((x) => x.id), company_id: companyId },
          sourceKey: cle,
          sourceUrl: `/api/sessions/${seance.id}/convocation-groupe.pdf?entreprise=${companyId}`,
          metadata: { session_ids: seances.map((x) => x.id), company_id: companyId, groupe: seance.groupe },
        });
        const { error } = await sb.schema('app').from('documents').update({ visible_entreprise: true } as never).eq('id', doc.documentId);
        if (error) erreurs.push(`${entreprise.name} : dépôt dans l’espace entreprise — ${error.message}`);
        else deposees += 1;
        const { error: masque } = await sb
          .schema('app')
          .from('documents')
          .update({ visible_entreprise: false } as never)
          .in('dossier_id', [...sesDossiers])
          .like('source_key', `convocation_groupe:%:${companyId}`);
        if (masque) erreurs.push(`${entreprise.name} : anciennes convocations — ${masque.message}`);
      } catch (e) {
        erreurs.push(`${entreprise.name} : dépôt dans l’espace entreprise — ${e instanceof Error ? e.message : 'échec'}`);
      }
    }

    // Le référent du dossier d'abord : c'est lui qui suit cette formation.
    const referent = sesDossiers.map((id) => referents.get(id)).find(Boolean);
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

    const tpl = convocationsRecapEmail({
      companyName: entreprise.name,
      contactName: prenom ?? null,
      formationTitle: seance.formation,
      seances: seances.map((x) => ({
        debut: x.debut,
        fin: x.fin,
        modality: x.modalite,
        location: x.lieu,
        remoteUrl: x.modalite === 'presentiel' ? null : x.visio,
      })),
      groupe: seance.groupe,
      learners: [...convoques.values()].map((p) => ({ fullName: `${p.prenom} ${p.nom}`.trim() || '—', email: p.email })),
    });


    const envoi = await sendEmail({
      to: destinataire,
      subject: tpl.subject,
      html: tpl.html,
      attachments: [{ filename: pdf.filename, content: Buffer.from(pdf.bytes).toString('base64') }],
      organizationId: seance.organizationId,
      dossierId,
      kind: 'convocation_recap_entreprise',
      metadata: { session_id: seance.id, company_id: companyId, participants: convoques.size, seances: seances.length },
      ...(opts.uneFois ? { idempotencyKey: cle } : {}),
    });
    if (envoi.ok) envoyes += 1;
    else if (envoi.reason !== 'duplicate') erreurs.push(`${entreprise.name} : ${envoi.reason}`);
  }

  return { entreprises: parEntreprise.size, envoyes, deposees, erreurs };
}
