import 'server-only';
import { env } from '@/env.mjs';

/**
 * L'e-mail qui porte un questionnaire envoyé depuis un dossier.
 *
 * Un seul modèle pour l'entreprise cliente et le financeur : ce qui change
 * d'un destinataire à l'autre tient en deux phrases, et deux e-mails auraient
 * divergé — l'un aurait gardé le lien de désinscription, l'autre l'adresse de
 * l'organisme, et on ne l'aurait su qu'en les recevant.
 *
 * Le formateur garde le sien (F-FOR-10) : il part d'une automatisation, avec
 * son propre ton et sa propre mécanique.
 */

const LOGO_URL = env.PUBLIC_APP_URL
  ? `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/logo-capsule-full.png`
  : 'https://i-a-infinity.com/favicon.png';

const baseStyles =
  'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#18181b;line-height:1.55;';

const echapper = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type DestinataireQuestionnaire = 'entreprise' | 'financeur' | 'apprenant' | 'formateur';

export function questionnaireEmail(d: {
  destinataire: DestinataireQuestionnaire;
  prenom: string | null;
  titreQuestionnaire: string;
  formationTitle: string | null;
  organisme: string;
  url: string;
  /** Vrai pour une relance : l'objet et la première phrase changent. */
  relance?: boolean;
}): { subject: string; html: string } {
  const bonjour = d.prenom ? `Bonjour ${echapper(d.prenom)},` : 'Bonjour,';
  const formation = d.formationTitle ? ` « ${echapper(d.formationTitle)} »` : '';

  // La relance le dit. Un second e-mail identique au premier laisse croire à
  // un envoi en double, et se classe en indésirable aussi vite.
  const subject = d.relance
    ? `Rappel — ${echapper(d.titreQuestionnaire)} : votre réponse est attendue`
    : echapper(d.titreQuestionnaire);

  const intro = {
    entreprise: `Vous avez confié à ${echapper(d.organisme)} la formation${formation}. Votre retour nous aide à l’améliorer, et prépare les suivantes.`,
    financeur: `Dans le cadre du dossier de formation${formation} suivi par ${echapper(d.organisme)}, nous avons besoin de quelques informations de votre part.`,
    apprenant: `Dans le cadre de votre formation${formation} avec ${echapper(d.organisme)}, un questionnaire vous attend dans votre espace.`,
    formateur: `Pour la formation${formation} que vous animez pour ${echapper(d.organisme)}, nous avons besoin de votre retour.`,
  }[d.destinataire];

  // Le rappel dit à qui il s'adresse : seulement à ceux dont on n'a pas reçu
  // la réponse. Sans cela, celui qui a répondu la veille croit à une erreur ;
  // et celui qui n'a pas répondu ne sait pas qu'on l'attend, lui.
  const rappel = d.relance
    ? '<p style="margin:0 0 16px;font-size:14px;color:#3f3f46;">Sauf erreur de notre part, vous n’avez pas encore répondu à ce questionnaire : ce rappel n’est adressé qu’aux personnes dont nous n’avons pas reçu la réponse. Il est toujours ouvert. Si vous venez de répondre, merci — ne tenez pas compte de ce message.</p>'
    : '';

  const html = `
<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#fafafa;${baseStyles}">
  <div style="max-width:580px;margin:0 auto;padding:32px 24px;">
    <div style="margin-bottom:24px;">
      <img src="${LOGO_URL}" alt="${echapper(d.organisme)}" width="96" height="96" style="width:96px;height:96px;display:block;">
    </div>
    <div style="background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
      <p style="margin:0 0 12px;font-size:14px;">${bonjour}</p>
      ${rappel}
      <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;">${intro}</p>
      <p style="margin:0 0 20px;font-size:14px;color:#3f3f46;">Cela prend quelques minutes.</p>
      <p style="margin:0 0 8px;">
        <a href="${d.url}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">
          Répondre au questionnaire
        </a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">
        Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :<br>
        <span style="color:#71717a;word-break:break-all;">${d.url}</span>
      </p>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;text-align:center;">${echapper(d.organisme)}</p>
  </div>
</body></html>`;

  return { subject, html };
}
