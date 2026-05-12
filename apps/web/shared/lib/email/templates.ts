import 'server-only';
import { env } from '@/env.mjs';

const LOGO_URL = env.PUBLIC_APP_URL
  ? `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/logo-icon.png`
  : 'https://i-a-infinity.com/favicon.png';

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
      <img src="${LOGO_URL}" alt="IA Infinity" width="89" height="40" style="width:89px; height:40px; display:block;">
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

// ────────────────────────────────────────────────────────────────
// Email 2 — Dossier d'entrée (envoyé à la confirmation du dossier)
// ────────────────────────────────────────────────────────────────

export type WelcomePacketData = {
  firstName: string;
  formationTitle: string;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string;
  totalHours: number;
  modality: string;
  trainerName: string | null;
  trainerEmail: string | null;
  espaceUrl: string | null; // URL signée vers /espace/[token]
  conventionUrl: string | null; // PDF convention de formation
};

const MODALITY_LABEL: Record<string, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
  afest: 'AFEST',
};

export function welcomePacketEmail(data: WelcomePacketData): { subject: string; html: string } {
  const subject = `Bienvenue dans « ${data.formationTitle} » — préparons votre entrée en formation`;
  const startFR = new Date(data.startDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const endFR = new Date(data.endDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const html = wrapper(`
    ${card(`
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px;">Bienvenue ${escapeHtml(data.firstName)} 🎓</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 20px;">
        Votre inscription à <strong style="color:#18181b;">${escapeHtml(data.formationTitle)}</strong> est confirmée. Vous trouverez ci-dessous l'essentiel pour démarrer sereinement.
      </p>
      <table style="width:100%; border-collapse:collapse; border-top:1px solid #f4f4f5;">
        ${dataRow('Dates', `${startFR} → ${endFR}`)}
        ${dataRow('Durée', `${data.totalHours} h`)}
        ${dataRow('Modalité', MODALITY_LABEL[data.modality] ?? data.modality)}
        ${data.trainerName ? dataRow('Formateur', escapeHtml(data.trainerName)) : ''}
      </table>
      ${data.espaceUrl ? `<div style="margin-top:24px;">${button(data.espaceUrl, 'Accéder à mon espace apprenant')}</div>` : ''}
    `)}

    ${data.conventionUrl ? `
      <p style="font-size:13px; color:#52525b; margin:24px 0 12px;">
        📎 Votre <a href="${data.conventionUrl}" style="color:#7c3aed; text-decoration:underline;">convention de formation</a> est jointe en pièce jointe et accessible depuis votre espace.
      </p>
    ` : ''}

    <p style="font-size:13px; color:#71717a; margin:24px 0 8px;">
      Une question avant le démarrage ? Répondez simplement à cet email${data.trainerEmail ? ` ou contactez directement votre formateur (<a href="mailto:${data.trainerEmail}" style="color:#7c3aed;">${escapeHtml(data.trainerEmail)}</a>)` : ''}.
    </p>
  `);

  return { subject, html };
}

// ────────────────────────────────────────────────────────────────
// Email 3 — Convocation J-7 (envoyée 7 jours avant une session)
// ────────────────────────────────────────────────────────────────

export type SessionConvocationData = {
  firstName: string;
  formationTitle: string;
  sessionDate: string; // ISO
  sessionStartTime: string; // "09:00"
  sessionEndTime: string; // "12:30"
  modality: string;
  location: string | null;
  remoteUrl: string | null;
  trainerName: string | null;
  espaceUrl: string | null;
};

export function sessionConvocationEmail(data: SessionConvocationData): { subject: string; html: string } {
  const dateFR = new Date(data.sessionDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const subject = `Convocation — ${data.formationTitle} le ${dateFR}`;
  const modalityLabel = MODALITY_LABEL[data.modality] ?? data.modality;

  const isDistant = data.modality === 'distanciel' || data.modality === 'hybride';

  const html = wrapper(`
    ${card(`
      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#7c3aed; font-weight:600; margin:0 0 8px;">Convocation — J-7</p>
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px; text-transform:capitalize;">${dateFR}</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 20px;">
        Bonjour ${escapeHtml(data.firstName)}, votre prochaine séance de <strong style="color:#18181b;">${escapeHtml(data.formationTitle)}</strong> approche.
      </p>
      <table style="width:100%; border-collapse:collapse; border-top:1px solid #f4f4f5;">
        ${dataRow('Horaire', `${data.sessionStartTime} – ${data.sessionEndTime}`)}
        ${dataRow('Modalité', modalityLabel)}
        ${data.location ? dataRow('Lieu', escapeHtml(data.location)) : ''}
        ${data.trainerName ? dataRow('Formateur', escapeHtml(data.trainerName)) : ''}
      </table>
      ${isDistant && data.remoteUrl ? `
        <div style="margin-top:20px; padding:14px; background:#faf5ff; border-radius:8px; border-left:3px solid #7c3aed;">
          <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#71717a; margin:0 0 6px; font-weight:500;">Lien de visio</p>
          <a href="${data.remoteUrl}" style="font-family:ui-monospace,monospace; font-size:12px; color:#7c3aed; word-break:break-all;">${data.remoteUrl}</a>
        </div>
      ` : ''}
      ${data.espaceUrl ? `<div style="margin-top:24px;">${button(data.espaceUrl, 'Voir le détail dans mon espace')}</div>` : ''}
    `)}

    <p style="font-size:12px; color:#a1a1aa; margin:20px 0 8px;">
      💡 En cas d'empêchement, merci de prévenir au plus vite${data.trainerName ? ' votre formateur' : ' votre OF'} pour replanifier.
    </p>
  `);

  return { subject, html };
}

// ────────────────────────────────────────────────────────────────
// Email 4 — Satisfaction (envoyée à la fin de la formation)
// ────────────────────────────────────────────────────────────────

export type SatisfactionSurveyData = {
  firstName: string;
  formationTitle: string;
  surveyUrl: string; // URL vers le questionnaire de satisfaction
  durationMinutes: number;
};

export function satisfactionSurveyEmail(data: SatisfactionSurveyData): { subject: string; html: string } {
  const subject = `Votre avis sur « ${data.formationTitle} » — ${data.durationMinutes} min`;

  const html = wrapper(`
    ${card(`
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px;">Comment s'est passée votre formation ${escapeHtml(data.firstName)} ? 💬</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 20px;">
        Vous avez terminé <strong style="color:#18181b;">${escapeHtml(data.formationTitle)}</strong>. Votre retour est précieux — il nous aide à améliorer en continu et il est <strong>obligatoire au titre de Qualiopi</strong>.
      </p>
      <p style="font-size:13px; color:#52525b; margin:0 0 20px;">
        ⏱ <strong>${data.durationMinutes} minutes</strong> chrono · 100% confidentiel · résultats anonymisés
      </p>
      <div>${button(data.surveyUrl, 'Donner mon avis')}</div>
    `)}
  `);

  return { subject, html };
}

// ────────────────────────────────────────────────────────────────
// Email 5 — Fin de formation (attestation + certificat)
// ────────────────────────────────────────────────────────────────

export type EndOfTrainingData = {
  firstName: string;
  formationTitle: string;
  endDate: string; // ISO
  totalHours: number;
  attendanceRate: number; // 0-100
  certificateUrl: string | null; // PDF certificat de réalisation
  espaceUrl: string | null;
};

export function endOfTrainingEmail(data: EndOfTrainingData): { subject: string; html: string } {
  const subject = `Félicitations ${data.firstName}, votre formation est terminée 🎉`;
  const endFR = new Date(data.endDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  const html = wrapper(`
    ${card(`
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px;">Félicitations ${escapeHtml(data.firstName)} 🎉</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 20px;">
        Vous avez terminé <strong style="color:#18181b;">${escapeHtml(data.formationTitle)}</strong> le <strong>${endFR}</strong>. Voici votre récapitulatif.
      </p>
      <table style="width:100%; border-collapse:collapse; border-top:1px solid #f4f4f5;">
        ${dataRow('Volume horaire', `${data.totalHours} h`)}
        ${dataRow("Taux d'assiduité", `${Math.round(data.attendanceRate)} %`)}
      </table>
      ${data.certificateUrl ? `
        <div style="margin-top:24px;">${button(data.certificateUrl, 'Télécharger mon attestation de réalisation')}</div>
        <p style="font-size:12px; color:#71717a; margin:8px 0 0;">
          Document légal conservé 10 ans dans votre espace personnel.
        </p>
      ` : `<p style="font-size:13px; color:#71717a; margin:20px 0 0;">Votre attestation de réalisation est en cours de préparation et vous parviendra sous 48 h.</p>`}
    `)}

    ${data.espaceUrl ? `
      <p style="font-size:13px; color:#52525b; margin:24px 0 12px;">
        📁 Retrouvez tous vos documents et supports dans votre <a href="${data.espaceUrl}" style="color:#7c3aed;">espace apprenant</a> (accès 5 ans).
      </p>
    ` : ''}
  `);

  return { subject, html };
}

