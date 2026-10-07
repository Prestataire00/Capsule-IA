import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { generateEntrepriseUrl } from '@/shared/lib/entreprise-token';
import { bienvenueEspaceEntrepriseEmail } from '@/shared/lib/email/templates';
import { loadOrgBranding } from '@/features/documents/load-org-branding';
import { envoyerDepuisLOrganisme } from '@/features/sessions/visio';
import { equipeJoignable } from './messages-store';
import { construireNoticeEspace } from './notice-espace-pdf';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

/**
 * Le devis est signé : chaque référent client des dossiers qu'il couvre reçoit
 * le lien de son espace entreprise, l'invitation à y échanger avec l'équipe,
 * et la notice en PDF. Une fois par devis et par référent. Un particulier n'a
 * pas d'espace entreprise : rien ne part.
 */
export async function envoyerBienvenueEspace(sb: Sb, args: { organizationId: string; quoteId: string; dossierIds: readonly string[] }): Promise<number> {
  const base = env.PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  if (!base || args.dossierIds.length === 0) return 0;
  const { data: d } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, contact_id, company_id, formation:formations(title)')
    .in('id', [...args.dossierIds])
    .eq('organization_id', args.organizationId);
  const dossiers = ((d ?? []) as unknown as Array<{ id: string; contact_id: string | null; company_id: string | null; formation: { title: string | null } | Array<{ title: string | null }> | null }>).filter(
    (x) => x.company_id && x.contact_id,
  );
  const contacts = [...new Set(dossiers.map((x) => x.contact_id as string))];
  if (contacts.length === 0) return 0;

  const [{ data: c }, { data: o }, equipe, branding] = await Promise.all([
    sb.schema('app').from('contacts').select('id, first_name, email, deleted_at').in('id', contacts),
    sb.schema('app').from('organizations').select('name').eq('id', args.organizationId).maybeSingle(),
    equipeJoignable(args.organizationId),
    loadOrgBranding(sb as never, args.organizationId),
  ]);
  const organisme = (o as { name: string | null } | null)?.name ?? 'Votre organisme de formation';
  const notice = await construireNoticeEspace({ organisme, equipe: equipe.map((m) => ({ nom: m.nom, fonction: m.fonction })), logoPng: branding.logoPng });
  const piece = { filename: `Mode d'emploi - espace entreprise ${organisme}.pdf`.replace(/[^\w .'-]+/g, '-'), content: Buffer.from(notice).toString('base64') };

  let envoyes = 0;
  for (const contact of (c ?? []) as Array<{ id: string; first_name: string | null; email: string | null; deleted_at: string | null }>) {
    const email = contact.email?.trim();
    if (!email || contact.deleted_at) continue;
    const dossier = dossiers.find((x) => x.contact_id === contact.id);
    const formation = dossier ? ((Array.isArray(dossier.formation) ? dossier.formation[0] : dossier.formation)?.title ?? null) : null;
    const { url } = await generateEntrepriseUrl({ contactId: contact.id, organizationId: args.organizationId }, base);
    const { subject, html } = bienvenueEspaceEntrepriseEmail({ prenom: contact.first_name ?? '', organisme, lien: url, formation });
    const r = await envoyerDepuisLOrganisme(sb, args.organizationId, {
      to: email,
      subject,
      html,
      kind: 'espace_entreprise_bienvenue',
      ...(dossier ? { dossierId: dossier.id } : {}),
      attachments: [piece],
      idempotencyKey: `espace_entreprise_bienvenue:${args.quoteId}:${contact.id}`,
      metadata: { quote_id: args.quoteId },
    });
    if (r.ok) envoyes += 1;
    else if (r.reason !== 'duplicate' && r.reason !== 'no_api_key') console.error('[espace entreprise] bienvenue non envoyée', contact.id, r.reason);
  }
  return envoyes;
}
