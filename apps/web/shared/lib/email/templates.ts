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

export type ContenuAValiderData = {
  nature: 'support' | 'cours';
  title: string;
  trainerName: string;
  formationTitle: string | null;
  seanceLabel: string | null;
  validationUrl: string;
};

export function contenuAValiderEmail(data: ContenuAValiderData): { subject: string; html: string } {
  const quoi = data.nature === 'cours' ? 'un contenu de cours' : 'un support';
  const subject = `À valider : ${data.title} (${data.trainerName})`;
  const lignes = [
    dataRow('Formateur', escapeHtml(data.trainerName)),
    data.formationTitle ? dataRow('Formation', escapeHtml(data.formationTitle)) : '',
    data.seanceLabel ? dataRow('Séance', escapeHtml(data.seanceLabel)) : '',
  ].join('');

  const html = wrapper(`
    ${card(`
      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#7c3aed; font-weight:600; margin:0 0 8px;">Validation pédagogique</p>
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px;">${escapeHtml(data.title)}</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 16px;">
        ${escapeHtml(data.trainerName)} a préparé ${quoi}. Les stagiaires n'y auront accès qu'une fois validé.
      </p>
      <table style="width:100%; border-collapse:collapse; margin:0 0 20px;">${lignes}</table>
      <div>${button(data.validationUrl, 'Relire et valider')}</div>
    `)}
  `);
  return { subject, html };
}

export type SeanceEmailData = {
  orgName: string;
  formationTitle: string;
  /** « vendredi 10 octobre 2026 · 09:00 – 12:30 », heure de Paris. */
  quand: string;
  modalite: 'presentiel' | 'distanciel' | 'hybride' | string;
  lieu: string | null;
  lienVisio: string | null;
};

const blocVisio = (lien: string) => `
      <div style="margin:0 0 20px; padding:14px 16px; background:#fff7ed; border:1px solid #fed7aa; border-radius:10px;">
        <p style="font-size:12px; color:#9a3412; margin:0 0 6px; font-weight:600;">Lien de la visio</p>
        <a href="${lien}" style="font-size:13px; color:#c2410c; word-break:break-all;">${escapeHtml(lien)}</a>
      </div>`;

const lignesSeance = (d: SeanceEmailData) =>
  [
    dataRow('Formation', escapeHtml(d.formationTitle)),
    dataRow('Quand', escapeHtml(d.quand)),
    d.lieu && d.modalite !== 'distanciel' ? dataRow('Lieu', escapeHtml(d.lieu)) : '',
  ].join('');

/** Lien visio d'une séance à distance, envoyé à l'entreprise pour ses salariés. */
export function lienVisioEntrepriseEmail(d: SeanceEmailData & { lienVisio: string }): { subject: string; html: string } {
  const subject = `Lien visio — ${d.formationTitle}, ${d.quand}`;
  const html = wrapper(`
    ${card(`
      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#7c3aed; font-weight:600; margin:0 0 8px;">Séance à distance</p>
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px;">${escapeHtml(d.formationTitle)}</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 16px;">
        Voici le lien de la visio. Merci de le transmettre à vos salariés inscrits : nous n'avons pas toujours leur adresse.
      </p>
      <table style="width:100%; border-collapse:collapse; margin:0 0 16px;">${lignesSeance(d)}</table>
      ${blocVisio(d.lienVisio)}
      <div>${button(d.lienVisio, 'Rejoindre la visio')}</div>
      <p style="font-size:12px; color:#71717a; margin:16px 0 0;">Un rappel vous sera envoyé 48 h puis 2 h avant le début. — ${escapeHtml(d.orgName)}</p>
    `)}
  `);
  return { subject, html };
}

/** Rappel 48 h ou 2 h avant une séance, à l'entreprise ou au formateur. */
export function rappelSeanceEmail(
  d: SeanceEmailData & { delai: '48h' | '2h'; pour: 'entreprise' | 'formateur'; lienEspace: string | null },
): { subject: string; html: string } {
  const echeance = d.delai === '2h' ? 'dans 2 heures' : 'dans 48 heures';
  const subject = `Rappel : ${d.formationTitle} commence ${echeance}`;
  const consigne =
    d.pour === 'formateur'
      ? 'Rejoignez la séance depuis votre espace formateur : le lien de la visio, la liste des stagiaires et l’émargement y sont réunis.'
      : d.lienVisio
        ? 'Pensez à transmettre le lien de la visio à vos salariés inscrits.'
        : 'Merci de rappeler l’horaire et le lieu à vos salariés inscrits.';
  const action =
    d.pour === 'formateur' && d.lienEspace
      ? button(d.lienEspace, 'Ouvrir la séance dans mon espace')
      : d.lienVisio
        ? button(d.lienVisio, 'Rejoindre la visio')
        : '';
  const html = wrapper(`
    ${card(`
      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#7c3aed; font-weight:600; margin:0 0 8px;">Rappel de séance</p>
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px;">${escapeHtml(d.formationTitle)} commence ${echeance}</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 16px;">${consigne}</p>
      <table style="width:100%; border-collapse:collapse; margin:0 0 16px;">${lignesSeance(d)}</table>
      ${d.lienVisio ? blocVisio(d.lienVisio) : ''}
      ${action ? `<div>${action}</div>` : ''}
      <p style="font-size:12px; color:#71717a; margin:16px 0 0;">${escapeHtml(d.orgName)}</p>
    `)}
  `);
  return { subject, html };
}

/** Quelqu'un vous mentionne dans la discussion d'équipe d'un dossier. */
export function mentionEquipeEmail(d: { auteur: string; dossier: string; message: string; lien: string }): {
  subject: string;
  html: string;
} {
  const subject = `${d.auteur} vous a mentionné — ${d.dossier}`;
  const html = wrapper(`
    ${card(`
      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#7c3aed; font-weight:600; margin:0 0 8px;">Discussion d'équipe</p>
      <h1 style="font-size:18px; font-weight:600; margin:0 0 12px;">${escapeHtml(d.auteur)} vous a mentionné</h1>
      <p style="font-size:13px; color:#71717a; margin:0 0 12px;">${escapeHtml(d.dossier)}</p>
      <blockquote style="margin:0 0 20px; padding:12px 14px; background:#fafafa; border-left:3px solid #f97316; font-size:14px; color:#3f3f46; white-space:pre-wrap;">${escapeHtml(d.message)}</blockquote>
      <div>${button(d.lien, 'Répondre')}</div>
    `)}
  `);
  return { subject, html };
}

/** Un message direct, hors dossier. Envoyé au premier message non lu seulement. */
export function messageDirectEmail(d: { auteur: string; message: string; lien: string }): { subject: string; html: string } {
  const subject = `${d.auteur} vous a écrit`;
  const html = wrapper(`
    ${card(`
      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#7c3aed; font-weight:600; margin:0 0 8px;">Message direct</p>
      <h1 style="font-size:18px; font-weight:600; margin:0 0 12px;">${escapeHtml(d.auteur)} vous a écrit</h1>
      <blockquote style="margin:0 0 20px; padding:12px 14px; background:#fafafa; border-left:3px solid #f97316; font-size:14px; color:#3f3f46; white-space:pre-wrap;">${escapeHtml(d.message)}</blockquote>
      <div>${button(d.lien, 'Répondre')}</div>
      <p style="font-size:12px; color:#71717a; margin:16px 0 0;">Vous ne recevrez pas d'autre e-mail pour cette conversation tant que vous ne l'aurez pas ouverte.</p>
    `)}
  `);
  return { subject, html };
}

/** Le lien de l'espace entreprise, envoyé au référent du client. */
export function espaceEntrepriseEmail(d: { prenom: string; organisme: string; lien: string }): { subject: string; html: string } {
  const subject = `Vos documents de formation — ${d.organisme}`;
  const html = wrapper(`
    ${card(`
      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#7c3aed; font-weight:600; margin:0 0 8px;">Espace entreprise</p>
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px;">Bonjour ${escapeHtml(d.prenom)}</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 20px;">
        ${escapeHtml(d.organisme)} met à votre disposition les documents des formations que vous suivez pour votre entreprise :
        conventions, programmes, attestations… Ils y sont ajoutés au fil de la formation.
      </p>
      <div>${button(d.lien, 'Ouvrir mon espace')}</div>
      <p style="font-size:12px; color:#71717a; margin:16px 0 0;">Ce lien vous est personnel : merci de ne pas le transférer.</p>
    `)}
  `);
  return { subject, html };
}

/** 24 h après la formation : au référent, les stagiaires qui n'ont pas donné leur avis. */
export function relanceSatisfactionReferentEmail(d: {
  prenom: string;
  formation: string;
  organisme: string;
  stagiaires: ReadonlyArray<{ nom: string; lien: string | null }>;
}): { subject: string; html: string } {
  const n = d.stagiaires.length;
  const subject = `${n} stagiaire${n > 1 ? 's n’ont' : ' n’a'} pas encore donné son avis — ${d.formation}`;
  const lignes = d.stagiaires
    .map(
      (s) =>
        `<li style="margin:0 0 8px;">${escapeHtml(s.nom)}${
          s.lien ? ` — <a href="${s.lien}" style="color:#c2410c;">son questionnaire</a>` : ''
        }</li>`,
    )
    .join('');
  const html = wrapper(`
    ${card(`
      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#7c3aed; font-weight:600; margin:0 0 8px;">Satisfaction</p>
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px;">Bonjour ${escapeHtml(d.prenom)}</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 16px;">
        La formation « ${escapeHtml(d.formation)} » est terminée. Pourriez-vous rappeler à ${n > 1 ? 'ces stagiaires' : 'ce stagiaire'}
        de remplir le questionnaire de satisfaction ? Deux minutes suffisent, et leur avis nous sert à améliorer nos formations.
      </p>
      <ul style="font-size:14px; color:#18181b; padding-left:18px; margin:0 0 16px;">${lignes}</ul>
      <p style="font-size:12px; color:#71717a; margin:0;">Chaque lien est personnel : transmettez-le au stagiaire concerné. — ${escapeHtml(d.organisme)}</p>
    `)}
  `);
  return { subject, html };
}

/**
 * Un seul e-mail à l'entreprise pour tous ses stagiaires : le lien personnel
 * de chacun, à lui transmettre (questionnaire, quiz…).
 */
export function liensStagiairesReferentEmail(d: {
  prenom: string;
  objet: string;
  intro: string;
  stagiaires: ReadonlyArray<{ nom: string; lien: string }>;
  organisme: string;
  libelleLien: string;
}): { subject: string; html: string } {
  const lignes = d.stagiaires
    .map((s) => `<li style="margin:0 0 8px;">${escapeHtml(s.nom)} — <a href="${s.lien}" style="color:#c2410c;">${escapeHtml(d.libelleLien)}</a></li>`)
    .join('');
  const html = wrapper(`
    ${card(`
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px;">Bonjour ${escapeHtml(d.prenom)}</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 16px;">${escapeHtml(d.intro)}</p>
      <ul style="font-size:14px; color:#18181b; padding-left:18px; margin:0 0 16px;">${lignes}</ul>
      <p style="font-size:12px; color:#71717a; margin:0;">Chaque lien est personnel : transmettez-le au stagiaire concerné. — ${escapeHtml(d.organisme)}</p>
    `)}
  `);
  return { subject: d.objet, html };
}

/** Les attestations de tous les stagiaires d'une entreprise, en un seul e-mail. */
export function attestationsReferentEmail(d: {
  prenom: string;
  moment: 'entree' | 'fin';
  stagiaires: ReadonlyArray<{ nom: string; formation: string | null }>;
  organisme: string;
  lienEspace: string | null;
}): { subject: string; html: string } {
  const n = d.stagiaires.length;
  const quoi = d.moment === 'entree' ? 'd’entrée en formation' : 'de fin de formation';
  const subject = `Attestation${n > 1 ? 's' : ''} ${quoi} — ${n} stagiaire${n > 1 ? 's' : ''}`;
  const lignes = d.stagiaires
    .map((s) => `<li style="margin:0 0 6px;">${escapeHtml(s.nom)}${s.formation ? ` — ${escapeHtml(s.formation)}` : ''}</li>`)
    .join('');
  const html = wrapper(`
    ${card(`
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px;">Bonjour ${escapeHtml(d.prenom)}</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 12px;">
        ${n > 1 ? 'Les attestations' : 'L’attestation'} ${quoi} de ${n > 1 ? 'vos stagiaires sont disponibles' : 'votre stagiaire est disponible'} :
      </p>
      <ul style="font-size:14px; color:#18181b; padding-left:18px; margin:0 0 16px;">${lignes}</ul>
      ${
        d.lienEspace
          ? `<div>${button(d.lienEspace, 'Ouvrir mon espace entreprise')}</div>
             <p style="font-size:12px; color:#71717a; margin:12px 0 0;">Vous les y retrouvez à tout moment, avec les autres documents de vos formations.</p>`
          : `<p style="font-size:13px; color:#52525b; margin:0;">Elles sont jointes à ce message.</p>`
      }
      <p style="font-size:12px; color:#71717a; margin:16px 0 0;">Merci de les transmettre à vos stagiaires. — ${escapeHtml(d.organisme)}</p>
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
  /** Convocation renvoyée parce que la date ou les horaires ont changé. */
  modification?: boolean;
};

export function sessionConvocationEmail(data: SessionConvocationData): { subject: string; html: string } {
  const dateFR = new Date(data.sessionDate).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const subject = data.modification
    ? `Horaires modifiés — ${data.formationTitle} le ${dateFR}`
    : `Convocation — ${data.formationTitle} le ${dateFR}`;
  const modalityLabel = MODALITY_LABEL[data.modality] ?? data.modality;

  const isDistant = data.modality === 'distanciel' || data.modality === 'hybride';

  const html = wrapper(`
    ${card(`
      <p style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#7c3aed; font-weight:600; margin:0 0 8px;">${data.modification ? 'Convocation mise à jour' : 'Convocation — J-7'}</p>
      <h1 style="font-size:20px; font-weight:600; margin:0 0 12px; text-transform:capitalize;">${dateFR}</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 20px;">
        ${
          data.modification
            ? `Bonjour ${escapeHtml(data.firstName)}, la date ou les horaires de votre séance de <strong style="color:#18181b;">${escapeHtml(data.formationTitle)}</strong> ont changé. Cette convocation remplace la précédente.`
            : `Bonjour ${escapeHtml(data.firstName)}, votre prochaine séance de <strong style="color:#18181b;">${escapeHtml(data.formationTitle)}</strong> approche.`
        }
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

const MODALITY_LABEL: Record<string, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
};

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
  /** Groupe convoqué, quand la séance n'en vise qu'un. */
  groupe?: string | null;
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
    timeZone: 'Europe/Paris',
  });
  const modalityLabel = MODALITY_LABEL[data.modality] ?? data.modality;
  const lieu = data.remoteUrl ? 'À distance' : (data.location ?? 'Lieu à préciser');

  const subject = `Convocation${data.groupe ? ` ${data.groupe}` : 's'} ${data.companyName} — ${data.formationTitle} le ${dateFR}`;

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
        ${data.contactName ? `Bonjour ${escapeHtml(data.contactName)}, ` : 'Bonjour, '}voici la convocation de vos
        ${data.learners.length > 1 ? `${data.learners.length} collaborateurs` : 'collaborateurs'} inscrits à
        <strong style="color:#18181b;">${escapeHtml(data.formationTitle)}</strong>${data.groupe ? ` (${escapeHtml(data.groupe)})` : ''}.
        Vous la trouverez jointe en PDF, avec la liste des participants, pour la leur transmettre.
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

/** Alerte à la direction : un dossier vient d'être créé (point Capsule IA du 05/10/2026). */
export function nouveauDossierEmail(d: {
  reference: string;
  client: string | null;
  formation: string | null;
  creePar: string | null;
  debut: string | null;
  lien: string;
}): { subject: string; html: string } {
  const subject = `Nouveau dossier ${d.reference}${d.client ? ` · ${d.client}` : ''}`;
  const html = wrapper(
    card(`
      <h1 style="font-size:20px; color:#18181b; margin:0 0 8px;">Nouveau dossier</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 16px;">${d.creePar ? `${escapeHtml(d.creePar)} vient de créer` : 'Un dossier vient d’être créé :'} le dossier <strong style="color:#18181b;">${escapeHtml(d.reference)}</strong>.</p>
      <table style="width:100%; border-collapse:collapse; margin:0 0 20px;">
        ${dataRow('Client', escapeHtml(d.client ?? '—'))}
        ${dataRow('Formation', escapeHtml(d.formation ?? '—'))}
        ${d.debut ? dataRow('Début', escapeHtml(d.debut)) : ''}
      </table>
      <div>${button(d.lien, 'Ouvrir le dossier')}</div>
    `),
  );
  return { subject, html };
}

/**
 * 30 minutes avant la fin de la dernière séance : le lien de satisfaction et
 * des quiz de fin de chaque stagiaire, en un seul e-mail à son entreprise.
 */
export function evaluationsFinReferentEmail(d: {
  prenom: string;
  formation: string;
  organisme: string;
  stagiaires: ReadonlyArray<{ nom: string; satisfaction: string | null; quiz: ReadonlyArray<{ titre: string; lien: string }> }>;
}): { subject: string; html: string } {
  const subject = `Fin de formation — les évaluations de vos stagiaires (${d.formation})`;
  const lignes = d.stagiaires
    .map(
      (s) => `<tr><td style="padding:10px 0; border-bottom:1px solid #f1f1f4; vertical-align:top;">
        <strong style="color:#18181b; font-size:14px;">${escapeHtml(s.nom)}</strong><br>
        ${s.satisfaction ? `<a href="${s.satisfaction}" style="color:#4c1d95; font-size:13px;">Questionnaire de satisfaction</a>` : ''}
        ${s.quiz.map((q) => `${s.satisfaction ? ' · ' : ''}<a href="${q.lien}" style="color:#4c1d95; font-size:13px;">${escapeHtml(q.titre)}</a>`).join('')}
      </td></tr>`,
    )
    .join('');
  const html = wrapper(
    card(`
      <h1 style="font-size:20px; color:#18181b; margin:0 0 8px;">La formation se termine</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 16px;">Bonjour${d.prenom ? ` ${escapeHtml(d.prenom)}` : ''}, la dernière séance de <strong style="color:#18181b;">${escapeHtml(d.formation)}</strong> s’achève dans une demi-heure. Merci de transmettre à chacun de vos stagiaires ses liens : quelques minutes sur leur téléphone, avant de partir.</p>
      <table style="width:100%; border-collapse:collapse; margin:0 0 12px;">${lignes}</table>
      <p style="font-size:12px; color:#71717a; margin:0;">Chaque lien est personnel. ${escapeHtml(d.organisme)}</p>
    `),
  );
  return { subject, html };
}

/** À l'apprenant, à la fin de la formation : son avis, et le quiz s'il y en a un. */
export function evaluationsFinStagiaireEmail(d: {
  prenom: string;
  formation: string;
  organisme: string;
  satisfaction: string | null;
  quiz: ReadonlyArray<{ titre: string; lien: string }>;
}): { subject: string; html: string } {
  const subject = `Votre avis sur la formation ${d.formation}`;
  const html = wrapper(
    card(`
      <h1 style="font-size:20px; color:#18181b; margin:0 0 8px;">Merci d’avoir suivi la formation</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 16px;">Bonjour${d.prenom ? ` ${escapeHtml(d.prenom)}` : ''}, la formation <strong style="color:#18181b;">${escapeHtml(d.formation)}</strong> est terminée. Votre avis nous aide à l’améliorer : quelques minutes suffisent.</p>
      ${d.satisfaction ? `<div style="margin:0 0 16px;">${button(d.satisfaction, 'Donner mon avis')}</div>` : ''}
      ${
        d.quiz.length
          ? `<p style="font-size:14px; color:#52525b; margin:0 0 8px;">Et pour vérifier vos acquis :</p>
             <ul style="margin:0 0 16px; padding-left:18px;">${d.quiz
               .map((q) => `<li style="margin:0 0 4px;"><a href="${q.lien}" style="color:#4c1d95; font-size:14px;">${escapeHtml(q.titre)}</a></li>`)
               .join('')}</ul>`
          : ''
      }
      <p style="font-size:12px; color:#71717a; margin:0;">Ce lien vous est personnel. Si vous avez déjà répondu en salle, vous pouvez ignorer cet e-mail. ${escapeHtml(d.organisme)}</p>
    `),
  );
  return { subject, html };
}

/** Au formateur, 30 minutes avant la fin : projeter le QR de satisfaction et lancer le quiz. */
export function evaluationsFinFormateurEmail(d: {
  prenom: string;
  formation: string;
  projection: string;
  quiz: ReadonlyArray<string>;
}): { subject: string; html: string } {
  const subject = `Dans 30 minutes : les évaluations de fin — ${d.formation}`;
  const html = wrapper(
    card(`
      <h1 style="font-size:20px; color:#18181b; margin:0 0 8px;">C’est le moment des évaluations</h1>
      <p style="font-size:14px; color:#52525b; margin:0 0 16px;">Bonjour${d.prenom ? ` ${escapeHtml(d.prenom)}` : ''}, la séance se termine dans une demi-heure. Projetez le QR code du questionnaire de satisfaction : chaque stagiaire répond sur son téléphone.${d.quiz.length ? ` Le quiz de fin (${d.quiz.map(escapeHtml).join(', ')}) est aussi à faire.` : ''}</p>
      <div>${button(d.projection, 'Projeter le QR de satisfaction')}</div>
      <p style="font-size:12px; color:#71717a; margin:16px 0 0;">Les liens personnels sont aussi partis aux entreprises, pour les stagiaires qui n’auraient pas le temps.</p>
    `),
  );
  return { subject, html };
}
