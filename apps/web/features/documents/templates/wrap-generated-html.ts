// Habille un corps HTML de document (issu de l'IA ou d'un modèle) avec :
//  - un en-tête de marque : logo de l'organisme + identité (nom, SIRET, NDA, adresse)
//  - un pied de page légal : n° de déclaration d'activité + mentions.
// Garantit que le LOGO et l'identité de l'organisme figurent sur TOUS les documents.
// Pur : aucun import next/supabase/react.

import { NDA_DISCLAIMER, ACCESSIBILITY_MENTION, rgpdMention } from '@/features/documents/legal/requirements';
import { orgIdentityLines } from '@/features/documents/legal/org-identity';

const MARKER = 'data-of-header';

// Empêche le double-habillage (regénération, réédition).
export function isWrapped(html: string): boolean {
  return html.includes(MARKER);
}

export function wrapGeneratedHtml(bodyHtml: string, variables: Record<string, string>): string {
  if (isWrapped(bodyHtml)) return bodyHtml;

  const logo = variables['organisme_logo']?.trim() ?? ''; // balise <img …> déjà prête, ou ''
  const name = variables['organisme_nom']?.trim() ?? '';
  const nda = variables['organisme_nda']?.trim() ?? '';

  // Même bloc d'identité que les PDF : adresse, téléphone | e-mail, puis
  // SIRET - déclaration d'activité - agréments.
  const [, ...metaParts] = orgIdentityLines({
    name,
    address: variables['organisme_adresse'] ?? null,
    phone: variables['organisme_telephone'] ?? null,
    email: variables['organisme_email'] ?? null,
    siret: variables['organisme_siret'] ?? null,
    nda: nda || null,
    certifications: variables['organisme_agrements'] ?? null,
  });

  const header = `<header ${MARKER} class="doc-brand-header" style="display:flex;align-items:center;gap:16px;border-bottom:2px solid #ececef;padding-bottom:14px;margin-bottom:22px;">
    ${logo ? `<div class="doc-brand-logo" style="flex:0 0 auto;">${logo}</div>` : ''}
    <div class="doc-brand-id" style="flex:1 1 auto;line-height:1.4;">
      ${name ? `<div style="font-weight:700;font-size:15px;color:#18181b;">${name}</div>` : ''}
      ${metaParts.map((l) => `<div style="font-size:11px;color:#71717a;">${l}</div>`).join('')}
    </div>
  </header>`;

  const contact = variables['organisme_email']?.trim() ?? '';
  const footer = `<footer class="doc-brand-footer" style="margin-top:32px;border-top:1px solid #ececef;padding-top:10px;font-size:10px;color:#a1a1aa;line-height:1.5;">
    ${nda ? `<div>${NDA_DISCLAIMER}</div>` : ''}
    <div>${ACCESSIBILITY_MENTION}</div>
    <div style="margin-top:4px;">${rgpdMention(contact)}</div>
  </footer>`;

  return `${header}\n${bodyHtml}\n${footer}`;
}
