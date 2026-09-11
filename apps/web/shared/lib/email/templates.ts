import 'server-only';
import { env } from '@/env.mjs';
import { renderFunderEmail, type FunderEmailTemplate } from './funder-render';

const LOGO_URL = env.PUBLIC_APP_URL
  ? `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/logo-capsule-full.png`
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
      <img src="${LOGO_URL}" alt="Capsule IA" width="96" height="96" style="width:96px;height:96px;display:block;">
      <span style="color:#d4d4d8;">·</span>
      <span style="font-size:13px; color:#71717a;">Plateforme OF</span>
    </div>
    ${inner}
    <p style="font-size:11px; color:#a1a1aa; margin-top:32px; text-align:center;">
      Cet email vous est envoyé depuis Capsule IA.<br>
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

// ────────────────────────────────────────────────────────────────
// Email — Réinitialisation de mot de passe
// ────────────────────────────────────────────────────────────────

export function passwordResetEmail(data: { resetUrl: string }): { subject: string; html: string } {
  const subject = 'Réinitialisation de votre mot de passe';
  const html = wrapper(`
    ${card(`
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px;">Réinitialiser votre mot de passe</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 20px;">
        Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous —
        ce lien est valable une heure et à usage unique.
      </p>
      <div>${button(data.resetUrl, 'Choisir un nouveau mot de passe')}</div>
      <p style="font-size:12px; color:#71717a; margin:20px 0 0;">
        Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email : votre mot de passe reste inchangé.
      </p>
    `)}
  `);
  return { subject, html };
}

export type TrainerWelcomeData = {
  firstName: string;
  orgName: string;
  actionUrl: string;
  /** true = le compte existe déjà, le lien est une simple connexion. */
  existingAccount: boolean;
};

/** Invitation d'un formateur à finaliser son espace (création de fiche formateur). */
export function trainerWelcomeEmail(data: TrainerWelcomeData): { subject: string; html: string } {
  const subject = data.existingAccount
    ? `Votre espace formateur chez ${data.orgName}`
    : `Finalisez votre espace formateur — ${data.orgName}`;

  const intro = data.existingAccount
    ? `<strong>${escapeHtml(data.orgName)}</strong> vous a ajouté comme formateur. Votre compte existe déjà : connectez-vous pour retrouver vos sessions.`
    : `<strong>${escapeHtml(data.orgName)}</strong> vous a ajouté comme formateur et vous invite à finaliser votre espace. Le lien ci-dessous crée votre accès et vous laisse choisir votre mot de passe.`;

  const html = wrapper(`
    ${card(`
      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#7c3aed; font-weight:600; margin:0 0 8px;">Espace formateur</p>
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px;">Bonjour ${escapeHtml(data.firstName)}</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 20px;">${intro}</p>
      <div>${button(data.actionUrl, data.existingAccount ? 'Accéder à mon espace' : 'Finaliser mon espace')}</div>
      <p style="font-size:13px; color:#52525b; margin:20px 0 0;">
        Vous y retrouverez vos sessions à venir, vos émargements à signer, vos documents et vos justificatifs de compétence.
      </p>
      <p style="font-size:12px; color:#71717a; margin:16px 0 0;">
        Ce lien est personnel et à usage unique. S'il a expiré, demandez à ${escapeHtml(data.orgName)} de vous le renvoyer.
      </p>
    `)}
  `);
  return { subject, html };
}

export type ProspectEmailData = {
  firstName: string;
  lastName: string;
  email: string;
  formationTitle: string | null;
  funderLabel: string;
  prospectId: string;
  /** Récapitulatif complet des informations saisies (affiché dans l'email). */
  recap?: Array<{ label: string; value: string }>;
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

    ${
      data.recap && data.recap.length
        ? `<div style="margin-top:16px;">${card(`
      <h2 style="font-size:15px; font-weight:600; margin:0 0 4px; color:#18181b;">Récapitulatif de votre inscription</h2>
      <p style="font-size:12px; color:#71717a; margin:0 0 14px;">Voici les informations que vous nous avez transmises. En cas d'erreur, répondez à cet email.</p>
      <table style="width:100%; border-collapse:collapse;">
        ${data.recap
          .map(
            (r) => `
        <tr><td style="padding:9px 0; border-top:1px solid #f4f4f5; vertical-align:top;">
          <div style="font-size:11px; color:#a1a1aa; text-transform:uppercase; letter-spacing:0.03em;">${escapeHtml(r.label)}</div>
          <div style="font-size:13px; color:#18181b; margin-top:2px; white-space:pre-line;">${escapeHtml(r.value)}</div>
        </td></tr>`,
          )
          .join('')}
      </table>
    `)}</div>`
        : ''
    }

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
// Email — Fiche besoin (analyse des besoins / positionnement)
// ────────────────────────────────────────────────────────────────

export type NeedsAnalysisEmailData = {
  firstName: string;
  formationTitle: string | null;
  formUrl: string; // lien vers le questionnaire de positionnement
  durationMinutes: number;
};

export function needsAnalysisEmail(data: NeedsAnalysisEmailData): { subject: string; html: string } {
  const subject = data.formationTitle
    ? `Préparons votre formation « ${data.formationTitle} » — fiche besoin`
    : 'Préparons votre formation — fiche besoin';

  const html = wrapper(`
    ${card(`
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px;">Bienvenue ${escapeHtml(data.firstName)} 👋</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 16px;">
        Avant de démarrer${data.formationTitle ? ` <strong style="color:#18181b;">${escapeHtml(data.formationTitle)}</strong>` : ' votre formation'}, merci de remplir votre <strong style="color:#18181b;">fiche besoin</strong>. Elle nous permet d'analyser vos attentes et d'adapter le parcours — c'est aussi une exigence <strong>Qualiopi</strong>.
      </p>
      <p style="font-size:13px; color:#52525b; margin:0 0 20px;">
        ⏱ <strong>${data.durationMinutes} minutes</strong> environ · vos réponses restent confidentielles.
      </p>
      <div>${button(data.formUrl, 'Remplir ma fiche besoin')}</div>
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
  attestationUrl: string | null; // PDF attestation de fin de formation (apprenant)
  certificateUrl: string | null; // PDF certificat de réalisation (administratif)
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
      ${data.attestationUrl ? `
        <div style="margin-top:24px;">${button(data.attestationUrl, 'Télécharger mon attestation de fin')}</div>
      ` : ''}
      ${data.certificateUrl ? `
        <div style="margin-top:12px;">${button(data.certificateUrl, 'Télécharger le certificat de réalisation')}</div>
      ` : ''}
      ${data.attestationUrl || data.certificateUrl ? `
        <p style="font-size:12px; color:#71717a; margin:8px 0 0;">
          Documents légaux conservés dans votre espace personnel.
        </p>
      ` : `<p style="font-size:13px; color:#71717a; margin:20px 0 0;">Vos documents de fin de formation sont en cours de préparation et vous parviendront sous 48 h.</p>`}
    `)}

    ${data.espaceUrl ? `
      <p style="font-size:13px; color:#52525b; margin:24px 0 12px;">
        📁 Retrouvez tous vos documents et supports dans votre <a href="${data.espaceUrl}" style="color:#7c3aed;">espace apprenant</a> (accès 5 ans).
      </p>
    ` : ''}
  `);

  return { subject, html };
}

// ────────────────────────────────────────────────────────────────
// Email — Attestation de démarrage (entrée en formation, aux présents)
// ────────────────────────────────────────────────────────────────

export type StartOfTrainingData = {
  firstName: string;
  formationTitle: string;
  startDate: string; // ISO
  attestationUrl: string | null; // PDF attestation d'entrée
  espaceUrl: string | null;
};

export function startOfTrainingEmail(data: StartOfTrainingData): { subject: string; html: string } {
  const subject = `Votre entrée en formation « ${data.formationTitle} » est confirmée`;
  const startFR = new Date(data.startDate).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const html = wrapper(`
    ${card(`
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px;">Bienvenue ${escapeHtml(data.firstName)} 👋</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 20px;">
        Votre entrée en formation <strong style="color:#18181b;">${escapeHtml(data.formationTitle)}</strong> (démarrée le <strong>${startFR}</strong>) est confirmée. Vous trouverez ci-dessous votre <strong>attestation d'entrée en formation</strong>.
      </p>
      ${data.attestationUrl ? `<div>${button(data.attestationUrl, "Télécharger mon attestation d'entrée")}</div>` : ''}
    `)}
    ${data.espaceUrl ? `
      <p style="font-size:13px; color:#52525b; margin:24px 0 12px;">
        📁 Retrouvez vos documents dans votre <a href="${data.espaceUrl}" style="color:#7c3aed;">espace apprenant</a>.
      </p>
    ` : ''}
  `);

  return { subject, html };
}

// Email financeur : rend le contenu (sujet + corps) depuis le template d'une
// étape de playbook, puis l'enveloppe dans la mise en page commune. La logique
// de rendu vit dans funder-render.ts (module pur, testé) ; ici on n'ajoute que
// l'habillage serveur (logo, footer).
export function funderEmail(
  tpl: FunderEmailTemplate,
  vars: Record<string, string>,
): { subject: string; html: string } {
  const { subject, bodyHtml } = renderFunderEmail(tpl, vars);
  const html = wrapper(
    card(`<p style="font-size:14px; color:#18181b; margin:0;">${bodyHtml}</p>`),
  );
  return { subject, html };
}



export type ConvocationsRecapData = {
  companyName: string;
  contactName: string | null;
  formationTitle: string;
  sessionDate: string; // ISO
  sessionStartTime: string;
  sessionEndTime: string;
  modality: string;
  location: string | null;
  remoteUrl: string | null;
  learners: ReadonlyArray<{ fullName: string; email: string | null }>;
};

/**
 * Récapitulatif adressé au responsable d'une entreprise cliente : la convocation
 * de TOUS ses salariés inscrits à une séance, en un seul envoi, qu'il peut
 * transmettre ou imprimer.
 *
 * Les convocations individuelles partent en parallèle aux apprenants : celle-ci
 * ne les remplace pas, elle donne à l'entreprise la vue d'ensemble qui lui
 * manquait.
 */
export function convocationsRecapEmail(data: ConvocationsRecapData): { subject: string; html: string } {
  const dateFR = new Date(data.sessionDate).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const modalityLabel = MODALITY_LABEL[data.modality] ?? data.modality;
  const lieu = data.remoteUrl ? 'À distance' : (data.location ?? 'Lieu à préciser');

  const subject = `Convocations ${data.companyName} — ${data.formationTitle} le ${dateFR}`;

  const lignes = data.learners
    .map(
      (l) => `
      <tr>
        <td style="padding:9px 0; border-top:1px solid #f4f4f5; font-size:14px; color:#18181b;">${escapeHtml(l.fullName)}</td>
        <td style="padding:9px 0; border-top:1px solid #f4f4f5; font-size:13px; color:#71717a; text-align:right;">${escapeHtml(l.email ?? '—')}</td>
      </tr>`,
    )
    .join('');

  const html = wrapper(`
    ${card(`
      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#7c3aed; font-weight:600; margin:0 0 8px;">Convocations — ${escapeHtml(data.companyName)}</p>
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px; text-transform:capitalize;">${dateFR}</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 20px;">
        ${data.contactName ? `Bonjour ${escapeHtml(data.contactName)}, ` : 'Bonjour, '}voici les convocations de vos
        ${data.learners.length > 1 ? `${data.learners.length} collaborateurs` : 'collaborateurs'} inscrits à
        <strong style="color:#18181b;">${escapeHtml(data.formationTitle)}</strong>. Chacun a également reçu la sienne.
      </p>

      <table style="width:100%; border-collapse:collapse; margin:0 0 20px;">
        <tr>
          <td style="padding:0 0 6px; font-size:13px; color:#71717a;">Horaires</td>
          <td style="padding:0 0 6px; font-size:13px; color:#18181b; text-align:right;">${escapeHtml(data.sessionStartTime)} – ${escapeHtml(data.sessionEndTime)}</td>
        </tr>
        <tr>
          <td style="padding:0 0 6px; font-size:13px; color:#71717a;">Modalité</td>
          <td style="padding:0 0 6px; font-size:13px; color:#18181b; text-align:right;">${escapeHtml(modalityLabel)}</td>
        </tr>
        <tr>
          <td style="padding:0; font-size:13px; color:#71717a;">Lieu</td>
          <td style="padding:0; font-size:13px; color:#18181b; text-align:right;">${escapeHtml(lieu)}</td>
        </tr>
      </table>

      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#a1a1aa; font-weight:600; margin:0 0 4px;">Participants convoqués</p>
      <table style="width:100%; border-collapse:collapse;">${lignes}</table>
    `)}
  `);

  return { subject, html };
}


// ────────────────────────────────────────────────────────────────
// Émargement — lien personnel d'une demi-journée (entrée puis sortie)
// ────────────────────────────────────────────────────────────────

export type EmargementLinkData = {
  firstName: string;
  formationTitle: string;
  dateLabel: string;
  halfDayLabel: string;
  start: string;
  end: string;
  url: string;
};

export function emargementLinkEmail(data: EmargementLinkData): { subject: string; html: string } {
  const subject = `Émargement — ${data.formationTitle}, ${data.halfDayLabel.toLowerCase()} du ${data.dateLabel}`;
  const html = wrapper(`
    ${card(`
      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#7c3aed; font-weight:600; margin:0 0 8px;">Feuille de présence</p>
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px;">${escapeHtml(data.halfDayLabel)} du ${escapeHtml(data.dateLabel)}</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 20px;">
        Bonjour ${escapeHtml(data.firstName)}, signez votre présence à <strong style="color:#18181b;">${escapeHtml(data.formationTitle)}</strong> :
        à votre arrivée, puis à la fin de la demi-journée, avec ce même lien.
      </p>
      <table style="width:100%; border-collapse:collapse; border-top:1px solid #f4f4f5;">
        ${dataRow('Horaire', `${escapeHtml(data.start)} – ${escapeHtml(data.end)}`)}
      </table>
      <div style="margin-top:24px;">${button(data.url, 'Émarger')}</div>
      <p style="font-size:12px; color:#a1a1aa; margin:16px 0 0;">Lien personnel : ne le transférez pas.</p>
    `)}
  `);
  return { subject, html };
}
