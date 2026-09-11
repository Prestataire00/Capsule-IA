import type { PDFFont, PDFPage } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import { orgIdentityLines, type OrgIdentity } from './legal/org-identity';

/** Adapte le bloc `organization` des générateurs en identité affichable. */
export function identityOf(org: {
  name: string;
  siret?: string | null;
  nda?: string | null;
  address?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  certifications?: string | null;
}): OrgIdentity {
  return {
    name: org.name,
    address: org.address ?? null,
    phone: org.contactPhone ?? null,
    email: org.contactEmail ?? null,
    siret: org.siret ?? null,
    nda: org.nda ?? null,
    certifications: org.certifications ?? null,
  };
}

/**
 * Bloc d'identité de l'organisme en tête de document (pdf-lib) : raison
 * sociale en gras, puis adresse, téléphone | e-mail, SIRET · déclaration
 * d'activité · agréments. Identique sur tous les documents.
 * Renvoie l'ordonnée sous le bloc.
 */
export function drawOrgIdentity(
  page: PDFPage,
  fonts: { font: PDFFont; fontBold: PDFFont },
  org: OrgIdentity,
  opts: { x: number; y: number; nameSize?: number; size?: number },
): number {
  const nameSize = opts.nameSize ?? 11;
  const size = opts.size ?? 8;
  const body = rgb(0.094, 0.094, 0.106);
  const muted = rgb(0.42, 0.42, 0.45);

  const [name, ...rest] = orgIdentityLines(org);
  let y = opts.y;
  if (name) {
    page.drawText(name.toUpperCase(), { x: opts.x, y, size: nameSize, font: fonts.fontBold, color: body });
    y -= nameSize + 2;
  }
  for (const line of rest) {
    page.drawText(line, { x: opts.x, y, size, font: fonts.font, color: muted });
    y -= size + 2.5;
  }
  return y;
}
