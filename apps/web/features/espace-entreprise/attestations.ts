import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { sendEmail, type EmailAttachment } from '@/shared/lib/email/resend';
import { attestationsReferentEmail } from '@/shared/lib/email/templates';
import { expediteurDeLOrganisme } from '@/shared/lib/email/expediteur-organisme';
import { generateEntrepriseUrl } from '@/shared/lib/entreprise-token';
import { archiverDocument } from '@/features/documents/archiver-automatiquement';
import { referentsDesDossiers } from './referents';

/**
 * Les attestations passent par l'entreprise : déposées dans son espace
 * (visibles d'office), et un seul e-mail au référent pour tous ses
 * stagiaires. Sans référent désigné, le contact de l'entreprise n'a pas
 * d'espace : les PDF lui sont joints.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

export type AttestationAAnnoncer = {
  readonly dossierId: string;
  readonly organizationId: string;
  readonly stagiaire: string;
  readonly formation: string | null;
  readonly documentId: string;
};

/** Archive l'attestation du dossier et la rend visible dans l'espace entreprise. */
export async function deposerAttestation(
  sb: Sb,
  args: { type: 'attestation_entree' | 'attestation_fin'; dossierId: string; sessionId: string },
): Promise<string | null> {
  const r = await archiverDocument(sb, args);
  if (!r.ok) return null;
  const { error } = await sb.schema('app').from('documents').update({ visible_entreprise: true } as never).eq('id', r.documentId);
  if (error) console.error('[attestations] non rendue visible', r.documentId, error.message);
  return r.documentId;
}

/** Déjà annoncée à l'entreprise pour ce dossier ? (l'e-mail groupé porte la liste des dossiers) */
export async function dejaAnnoncee(sb: Sb, kind: string, dossierId: string): Promise<boolean> {
  const { data } = await sb
    .schema('app')
    .from('email_log')
    .select('id')
    .eq('kind', kind)
    .contains('metadata', { dossier_ids: [dossierId] })
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export async function annoncerAttestations(
  sb: Sb,
  moment: 'entree' | 'fin',
  kind: string,
  attestations: readonly AttestationAAnnoncer[],
): Promise<{ sent: number; errors: string[] }> {
  if (attestations.length === 0) return { sent: 0, errors: [] };
  const referents = await referentsDesDossiers(sb, attestations.map((a) => a.dossierId));
  const groupes = new Map<string, { prenom: string; contactId: string | null; organizationId: string; liste: AttestationAAnnoncer[] }>();
  const errors: string[] = [];
  for (const a of attestations) {
    const ref = referents.get(a.dossierId);
    if (!ref) {
      errors.push(`${kind} ${a.dossierId}: ni référent ni contact d'entreprise`);
      continue;
    }
    const cle = `${a.organizationId}:${ref.email}`;
    const g = groupes.get(cle) ?? { prenom: ref.prenom, contactId: ref.contactId, organizationId: a.organizationId, liste: [] };
    g.liste.push(a);
    groupes.set(cle, g);
  }

  let sent = 0;
  for (const [cle, g] of groupes) {
    const email = cle.slice(cle.indexOf(':') + 1);
    const lienEspace =
      g.contactId && env.PUBLIC_APP_URL
        ? (await generateEntrepriseUrl({ contactId: g.contactId, organizationId: g.organizationId }, env.PUBLIC_APP_URL)).url
        : null;
    const pieces: EmailAttachment[] = lienEspace ? [] : await piecesJointes(sb, g.liste);
    const expediteur = await expediteurDeLOrganisme(sb, g.organizationId);
    const tpl = attestationsReferentEmail({
      prenom: g.prenom,
      moment,
      stagiaires: g.liste.map((a) => ({ nom: a.stagiaire, formation: a.formation })),
      organisme: expediteur.nom,
      lienEspace,
    });
    const dossierIds = [...new Set(g.liste.map((a) => a.dossierId))].sort();
    const r = await sendEmail({
      to: email,
      from: expediteur.from,
      ...(expediteur.email ? { replyTo: expediteur.email } : {}),
      subject: tpl.subject,
      html: tpl.html,
      ...(pieces.length ? { attachments: pieces } : {}),
      organizationId: g.organizationId,
      kind,
      metadata: { dossier_ids: dossierIds },
      idempotencyKey: `${kind}:groupe:${createHash('sha256').update(`${email}|${dossierIds.join(',')}`).digest('hex').slice(0, 32)}`,
    });
    if (r.ok) sent += 1;
    else if (r.reason !== 'duplicate' && r.reason !== 'no_api_key') errors.push(`${kind} ${email}: send_failed`);
  }
  return { sent, errors };
}

async function piecesJointes(sb: Sb, liste: readonly AttestationAAnnoncer[]): Promise<EmailAttachment[]> {
  const { data } = await sb.schema('app').from('documents').select('id, title, storage_path').in('id', liste.map((a) => a.documentId));
  const out: EmailAttachment[] = [];
  for (const d of (data ?? []) as Array<{ id: string; title: string; storage_path: string | null }>) {
    if (!d.storage_path) continue;
    const { data: f } = await sb.storage.from('documents').download(d.storage_path);
    if (!f) continue;
    out.push({ filename: `${d.title.replace(/[^\w.-]+/g, '-').slice(0, 80)}.pdf`, content: Buffer.from(await f.arrayBuffer()).toString('base64') });
  }
  return out;
}
