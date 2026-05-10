import 'server-only';

const baseStyles = `
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #18181b;
  line-height: 1.55;
`;
const wrapper = (inner: string) => `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0; padding:0; background:#fafafa; ${baseStyles}">
  <div style="max-width:580px; margin:0 auto; padding:32px 24px;">
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:24px;">
      <span style="display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:8px; background:#7c3aed; color:white; font-family:'JetBrains Mono', ui-monospace, monospace; font-size:13px; font-weight:600;">ia</span>
      <span style="font-size:14px; font-weight:600; color:#18181b;">infinity</span>
      <span style="color:#d4d4d8;">·</span>
      <span style="font-size:13px; color:#71717a;">Plateforme OF</span>
    </div>
    ${inner}
    <p style="font-size:11px; color:#a1a1aa; margin-top:32px; text-align:center;">
      Cet email vous est envoyé depuis i-a-infinity OF.<br>
      Données traitées dans le strict respect du RGPD.
    </p>
  </div>
</body>
</html>
`;

const card = (inner: string) => `
  <div style="background:white; border:1px solid #e4e4e7; border-radius:12px; padding:24px; box-shadow:0 1px 2px rgba(0,0,0,0.04);">
    ${inner}
  </div>
`;

const button = (href: string, label: string) => `
  <a href="${href}" style="display:inline-flex; align-items:center; justify-content:center; padding:10px 18px; background:#7c3aed; color:white; text-decoration:none; border-radius:8px; font-size:13px; font-weight:500; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
    ${label}
  </a>
`;

const dataRow = (label: string, value: string) => `
  <tr>
    <td style="padding:8px 0; font-size:12px; color:#71717a;">${label}</td>
    <td style="padding:8px 0; font-size:13px; font-weight:500; color:#18181b; text-align:right;">${value}</td>
  </tr>
`;

export type ProspectEmailData = {
  firstName: string;
  lastName: string;
  email: string;
  formationTitle: string | null;
  funderLabel: string;
  prospectId: string;
};

export function prospectConfirmationEmail(data: ProspectEmailData): { subject: string; html: string } {
  const subject = data.formationTitle
    ? `Votre pré-inscription à « ${data.formationTitle} » est bien reçue`
    : 'Votre pré-inscription est bien reçue';

  const html = wrapper(`
    ${card(`
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px; color:#18181b; letter-spacing:-0.01em;">
        Merci ${escapeHtml(data.firstName)} 👋
      </h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 20px;">
        Votre pré-inscription a bien été enregistrée. Notre équipe revient vers vous sous <strong style="color:#18181b;">48 h ouvrées</strong> pour vous confirmer la suite.
      </p>
      <table style="width:100%; border-collapse:collapse; border-top:1px solid #f4f4f5;">
        ${data.formationTitle ? dataRow('Formation', escapeHtml(data.formationTitle)) : ''}
        ${dataRow('Mode de financement', escapeHtml(data.funderLabel))}
        ${dataRow('Référence', `<span style="font-family:ui-monospace,monospace; font-size:11px;">${data.prospectId.slice(0, 8)}</span>`)}
      </table>
    `)}

    <p style="font-size:13px; color:#71717a; margin:24px 0 8px;">
      Une question ? Répondez simplement à cet email, nous vous lirons.
    </p>
  `);

  return { subject, html };
}

export type InternalNotificationData = ProspectEmailData & {
  situation: string;
  companyName: string | null;
  message: string | null;
  phone: string | null;
  rqth: boolean;
  documentsCount: number;
  dashboardUrl: string | null;
};

export function prospectInternalNotificationEmail(
  data: InternalNotificationData,
): { subject: string; html: string } {
  const subject = `🎯 Nouvelle pré-inscription · ${data.firstName} ${data.lastName}`;

  const html = wrapper(`
    ${card(`
      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#7c3aed; font-weight:600; margin:0 0 8px;">
        Nouvelle pré-inscription
      </p>
      <h1 style="font-size:20px; font-weight:600; margin:0 0 4px; color:#18181b;">
        ${escapeHtml(data.firstName)} ${escapeHtml(data.lastName)}
      </h1>
      <p style="font-size:13px; color:#71717a; margin:0 0 20px;">
        <a href="mailto:${data.email}" style="color:#7c3aed; text-decoration:none;">${escapeHtml(data.email)}</a>
        ${data.phone ? `· ${escapeHtml(data.phone)}` : ''}
      </p>
      <table style="width:100%; border-collapse:collapse; border-top:1px solid #f4f4f5;">
        ${dataRow('Formation', escapeHtml(data.formationTitle ?? '— non précisée —'))}
        ${dataRow('Financement', escapeHtml(data.funderLabel))}
        ${dataRow('Situation', escapeHtml(data.situation))}
        ${data.companyName ? dataRow('Entreprise', escapeHtml(data.companyName)) : ''}
        ${data.rqth ? dataRow('RQTH', 'oui — adaptations à prévoir') : ''}
        ${dataRow('Pièces jointes', `${data.documentsCount} document${data.documentsCount > 1 ? 's' : ''}`)}
      </table>
      ${
        data.message
          ? `<div style="margin-top:20px; padding:12px 14px; background:#fafafa; border-radius:8px; border-left:3px solid #7c3aed;">
              <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#71717a; margin:0 0 4px; font-weight:500;">Message</p>
              <p style="font-size:13px; color:#27272a; margin:0; white-space:pre-wrap;">${escapeHtml(data.message)}</p>
            </div>`
          : ''
      }
      ${
        data.dashboardUrl
          ? `<div style="margin-top:24px;">${button(data.dashboardUrl, 'Ouvrir dans le dashboard')}</div>`
          : ''
      }
    `)}
  `);

  return { subject, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
