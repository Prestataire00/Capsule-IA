import 'server-only';
// Catalogue PUBLIC complet d'un organisme : toutes les formations publiées,
// chacune rendue comme un programme complet (réutilise getPublicProgramme).

import { getPublicCatalogByOrg } from '@/features/catalog/public-catalog';
import { getPublicProgramme } from './load-public';
import type { Programme } from './types';

export type CatalogueItem = { formationId: string; title: string; programme: Programme };

export type CatalogueData = {
  orgName: string;
  logoUrl: string | null;
  items: CatalogueItem[];
};

export async function getPublicCatalogue(orgId: string): Promise<CatalogueData> {
  const id = (orgId ?? '').trim();
  if (!id) return { orgName: '', logoUrl: null, items: [] };

  const list = await getPublicCatalogByOrg(id);
  const items: CatalogueItem[] = [];
  let orgName = '';
  let logoUrl: string | null = null;

  for (const f of list) {
    const r = await getPublicProgramme(f.id);
    if (!r) continue;
    if (!orgName) orgName = r.orgName;
    if (!logoUrl) logoUrl = r.programme.header.logoUrl ?? null;
    items.push({ formationId: r.formationId, title: r.title, programme: r.programme });
  }

  return { orgName, logoUrl, items };
}
