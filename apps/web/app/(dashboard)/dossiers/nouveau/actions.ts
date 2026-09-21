'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { generateDossierReference } from '@/features/crm/prospect-conversion/dossier-reference';
import { sendNeedsAnalysisForDossier } from '@/features/questionnaire/needs-analysis';
import { DOMAINE_PROVISOIRE } from '@/features/dossier/referent';
import { statutALaCreation } from '@/features/dossier/saisie-retroactive';
import { CreateDossierSchema, type CustomFormationValue } from './schema';

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

// Réplique de resolveAdminOrgId (cf. prospects/actions.ts, formateurs/nouveau/actions.ts) :
// membership par défaut de l'utilisateur, restreinte aux rôles administrateurs.
async function resolveAdminOrgId(userId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data: member } = await (admin as never as {
    schema: (s: string) => {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            is: (k: string, v: null) => {
              order: (
                k: string,
                o: { ascending: boolean },
              ) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{
                    data: { organization_id: string; role: string } | null;
                  }>;
                };
              };
            };
          };
        };
      };
    };
  })
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!member?.organization_id) return null;
  if (!ADMIN_ROLES.includes(member.role as AdminRole)) return null;
  return member.organization_id;
}

const slug = (titre: string, suffixe: string): string =>
  `${
    titre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60) || 'formation'
  }-${suffixe.toLowerCase()}`;

/**
 * Formation montée pour ce client : hors catalogue public, avec la durée et le
 * tarif indiqués. Une commande porte souvent sur un programme qui n'existe pas
 * encore — exiger qu'il soit d'abord créé au catalogue forçait à sortir de
 * l'assistant et à tout ressaisir.
 */
async function creerFormationSurMesure(
  organizationId: string,
  f: CustomFormationValue,
  modality: string,
): Promise<string | null> {
  const suffixe = randomUUID().slice(0, 8).toUpperCase();
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .from('formations')
    .insert({
      organization_id: organizationId,
      code: `SM-${suffixe}`,
      title: f.title,
      slug: slug(f.title, suffixe),
      summary: 'Formation montée pour un besoin spécifique (hors catalogue).',
      default_modality: modality,
      default_duration_hours: f.durationHours,
      default_price_cents: f.priceCents,
      is_published: false,
    } as never)
    .select('id')
    .single();
  if (error || !data) {
    console.error('[dossier] formation sur mesure non créée', error?.message);
    return null;
  }
  return (data as { id: string }).id;
}

/**
 * `dossiers.learner_id` est obligatoire, mais une commande d'entreprise
 * s'ouvre avant que les noms soient connus. On pose alors un titulaire
 * provisoire sur une adresse en `.invalid` (RFC 2606) : aucun envoi ne partira
 * vers un destinataire inventé, et les écrans l'affichent comme « à désigner ».
 */
async function titulaireProvisoire(organizationId: string, companyId: string | null): Promise<string | null> {
  const admin = supabaseAdmin();
  const email = `stagiaires-a-designer.${(companyId ?? organizationId).slice(0, 8)}${DOMAINE_PROVISOIRE}`;

  const { data: existant } = await admin
    .schema('app')
    .from('learners')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('email', email)
    .is('deleted_at', null)
    .maybeSingle();
  if (existant) return (existant as { id: string }).id;

  const { data, error } = await admin
    .schema('app')
    .from('learners')
    .insert({
      organization_id: organizationId,
      company_id: companyId,
      first_name: 'Stagiaires',
      last_name: 'à désigner',
      email,
    } as never)
    .select('id')
    .single();
  if (error || !data) {
    console.error('[dossier] titulaire provisoire non créé', error?.message);
    return null;
  }
  return (data as { id: string }).id;
}

export const createDossierAction = authActionClient
  .schema(CreateDossierSchema)
  .action(async ({ parsedInput, ctx }) => {
    const sb = ctx.supabase;
    const orgId = await resolveAdminOrgId(ctx.userId as unknown as string);
    if (!orgId) return { ok: false as const, error: 'forbidden_not_admin' };

    // Formation : celle du catalogue, ou celle montée pour ce client.
    const formationId =
      parsedInput.formationId ??
      (parsedInput.customFormation
        ? await creerFormationSurMesure(orgId, parsedInput.customFormation, parsedInput.modality)
        : null);
    if (!formationId) return { ok: false as const, error: 'formation_missing' };

    // Titulaire : celui qu'on a nommé, le premier stagiaire de la liste, ou un
    // provisoire quand l'entreprise n'a pas encore donné de noms.
    const learnerId =
      parsedInput.learnerId ??
      parsedInput.learnerIds[0] ??
      (await titulaireProvisoire(orgId, parsedInput.companyId));
    if (!learnerId) return { ok: false as const, error: 'learner_missing' };

    const dossierId = randomUUID();
    const year = Number(new Date().getFullYear());
    const reference = generateDossierReference(dossierId, year);

    // total_hours NOT NULL : somme des modules, minimum 1 pour un brouillon.
    const totalHours =
      parsedInput.modules.reduce((acc, m) => acc + m.durationHours, 0) || 1;

    const modules = parsedInput.modules.map((m, i) => ({
      id: randomUUID(),
      module_id: m.moduleId,
      position: i,
      title_snapshot: m.title,
      duration_hours: m.durationHours,
    }));

    const trainers = parsedInput.trainerId
      ? [{ trainer_id: parsedInput.trainerId, is_lead: true }]
      : [];

    const funders = parsedInput.funders.map((f) => ({
      id: randomUUID(),
      funder_id: f.funderId,
      amount_cents: f.amountCents,
      external_file_number: f.externalFileNumber,
      status: 'pending',
    }));

    // Une formation déjà terminée au moment de la saisie ne va pas « se
    // dérouler » : elle entre directement en archive. Aucune automatisation ne
    // s'y déclenchera, et les documents restent produisibles.
    const statut = statutALaCreation({
      statutDemande: 'draft',
      finFormation: parsedInput.endDate,
      aujourdhui: new Date(),
    });

    const metadata: Record<string, unknown> = {};
    if (statut === 'archived') metadata.saisie_retroactive = true;

    const { error } = await sb.rpc('save_dossier' as never, {
      p_dossier: {
        id: dossierId,
        organization_id: orgId,
        reference,
        learner_id: learnerId,
        company_id: parsedInput.companyId,
        formation_id: formationId,
        status: statut,
        modality: parsedInput.modality,
        start_date: parsedInput.startDate,
        end_date: parsedInput.endDate,
        total_hours: totalHours,
        total_amount_cents: parsedInput.totalAmountCents,
        currency: 'EUR',
        metadata,
        modules,
        trainers,
        funders,
      },
      p_events: [],
    } as never);

    if (error) {
      return {
        ok: false as const,
        error: 'dossier_create_failed',
        details: (error as { message?: string }).message,
      };
    }

    // Le groupe du dossier (0175) : les stagiaires nommés à la création, et le
    // titulaire quand il désigne quelqu'un.
    const duGroupe = [...new Set([...parsedInput.learnerIds, ...(parsedInput.learnerId ? [parsedInput.learnerId] : [])])];
    if (duGroupe.length > 0) {
      const { error: lienErr } = await supabaseAdmin()
        .schema('app')
        .from('dossier_learners' as never)
        .upsert(
          duGroupe.map((lid) => ({ dossier_id: dossierId, learner_id: lid, organization_id: orgId })) as never,
          { onConflict: 'dossier_id,learner_id' },
        );
      if (lienErr) console.error('[dossier] stagiaires non rattachés', lienErr.message);
    }

    // La RPC save_dossier n'upsert pas external_file_number : on le pose après coup
    // sur les lignes qu'on vient d'insérer (ids générés ci-dessus).
    const withFileNumber = funders.filter((f) => f.external_file_number);
    if (withFileNumber.length > 0) {
      await Promise.all(
        withFileNumber.map((f) =>
          sb
            .schema('app')
            .from('dossier_funders')
            .update({ external_file_number: f.external_file_number })
            .eq('id', f.id),
        ),
      );
    }

    // Fiche besoin (analyse des besoins) envoyée automatiquement à l'apprenant
    // dès son rattachement à un dossier. Non bloquant + idempotent ; le cron
    // transactional-emails sert de filet si l'envoi échoue ici.
    //
    // Sauf sur un dossier archivé d'emblée : demander ses attentes à quelqu'un
    // qui a terminé sa formation il y a trois mois. Le cron applique la même
    // règle, mais cet envoi-ci ne passe pas par lui.
    if (statut !== 'archived') {
      try {
        await sendNeedsAnalysisForDossier({ dossierId });
      } catch (e) {
        console.error('[createDossierAction] envoi fiche besoin échoué', e);
      }
    }

    revalidatePath('/dossiers');
    return { ok: true as const, dossierId, reference };
  });
