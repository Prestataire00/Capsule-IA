import 'server-only';
// ARCHETYPE: shared
// Le programme d'une formation tel que son formateur le consulte pour préparer
// son cours : le contenu pédagogique complet, que la formation soit publiée au
// catalogue ou faite sur mesure, et jamais ce que l'organisme facture.
// L'appelant a déjà vérifié que la séance est celle du formateur : la lecture
// se fait en service role, pour cette formation seulement.

import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { exigerLecture } from '@/shared/lib/supabase/echec-lecture';
import { loadOrgLogoDataUri } from '@/features/documents/load-org-branding';
import { deriveProgramme } from './from-formation';
import { mapFormation, mapOrg, type CatalogMeta, type FullRow, type OrgJson } from './load-public';
import { programmeSansTarif } from './sans-tarif';
import type { Programme } from './types';

export async function loadProgrammePourFormateur(formationId: string): Promise<Programme | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .schema('app')
    .from('formations')
    .select(
      'id, organization_id, code, title, summary, description, objectives, prerequisites, target_audience, evaluation_method, pedagogical_method, default_modality, default_duration_hours, metadata',
    )
    .eq('id', formationId)
    .is('deleted_at', null)
    .maybeSingle();
  exigerLecture('programme de la formation', error);
  if (!data) return null;
  const row = data as unknown as Omit<FullRow, 'organization' | 'default_trainer'>;

  const { data: org, error: erreurOrg } = await admin
    .schema('app')
    .from('organizations')
    .select('name, legal_name, siret, naf_code, declaration_activite, address, contact_email, contact_phone, logo_path')
    .eq('id', row.organization_id)
    .maybeSingle();
  exigerLecture('organisme de la formation', erreurOrg);

  const catalog: CatalogMeta = row.metadata?.catalog ?? {};
  const stored = catalog.programme;
  const programme =
    stored && stored.schemaVersion === 1
      ? stored
      : deriveProgramme(
          mapFormation({ ...row, organization: null, default_trainer: null }, catalog),
          mapOrg(org as unknown as OrgJson | null),
        );

  if (!programme.header.logoUrl && (org as { logo_path: string | null } | null)?.logo_path) {
    const logo = await loadOrgLogoDataUri(admin, row.organization_id);
    if (logo) programme.header = { ...programme.header, logoUrl: logo };
  }

  return programmeSansTarif(programme);
}
