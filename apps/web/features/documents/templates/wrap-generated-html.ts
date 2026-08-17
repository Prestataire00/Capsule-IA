// Habille un corps HTML de document (issu de l'IA ou d'un modèle) avec :
//  - un en-tête de marque : logo de l'organisme + identité (nom, SIRET, NDA, adresse)
//  - un pied de page légal : n° de déclaration d'activité + mentions.
// Garantit que le LOGO et l'identité de l'organisme figurent sur TOUS les documents.
// Pur : aucun import next/supabase/react.

import { NDA_DISCLAIMER, ACCESSIBILITY_MENTION, rgpdMention } from '@/features/documents/legal/requirements';

const MARKER = 'data-of-header';

// Empêche le double-habillage (regénération, réédition).
export function isWrapped(html: string): boolean {
  return html.includes(MARKER);
}

export function wrapGeneratedHtml(bodyHtml: string, variables: Record<string, string>): string {
  if (isWrapped(bodyHtml)) return bodyHtml;

  const logo = variables['organisme_logo']?.trim() ?? ''; // balise <img …> déjà prête, ou ''
  const name = variables['organisme_nom']?.trim() ?? '';
  const siret = variables['organisme_siret']?.trim() ?? '';
  const nda = variables['organisme_nda']?.trim() ?? '';
  const address = variables['organisme_adresse']?.trim() ?? '';

  const metaParts = [
    siret ? `SIRET ${siret}` : '',
    nda ? `Déclaration d'activité n° ${nda}` : '',
    address,
  ].filter(Boolean);

  const header = `<header ${MARKER} class="doc-brand-header" style="display:flex;align-items:center;gap:16px;border-bottom:2px solid #ececef;padding-bottom:14px;margin-bottom:22px;">
    ${logo ? `<div class="doc-brand-logo" style="flex:0 0 auto;">${logo}</div>` : ''}
    <div class="doc-brand-id" style="flex:1 1 auto;line-height:1.4;">
      ${name ? `<div style="font-weight:700;font-size:15px;color:#18181b;">${name}</div>` : ''}
      ${metaParts.length ? `<div style="font-size:11px;color:#71717a;">${metaParts.join('&nbsp;·&nbsp;')}</div>` : ''}
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
