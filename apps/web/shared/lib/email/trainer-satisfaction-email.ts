import 'server-only';
import { env } from '@/env.mjs';

// Email isolé (F-FOR-10) — hors templates.ts partagé pour éviter les collisions.
const LOGO_URL = env.PUBLIC_APP_URL
  ? `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/logo-planet.png`
  : 'https://i-a-infinity.com/favicon.png';
const baseStyles =
  'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#18181b;line-height:1.55;';

export function trainerSatisfactionEmail(d: {
  firstName: string | null;
  formationTitle: string;
  surveyUrl: string;
}): { subject: string; html: string } {
  const hello = d.firstName ? `Bonjour ${d.firstName},` : 'Bonjour,';
  const subject = `Votre retour formateur — ${d.formationTitle}`;
  const html = `
<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#fafafa;${baseStyles}">
  <div style="max-width:580px;margin:0 auto;padding:32px 24px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
      <img src="${LOGO_URL}" alt="Capsule IA" width="75" height="40" style="width:75px;height:40px;display:block;">
      <span style="color:#d4d4d8;">·</span>
      <span style="font-size:13px;color:#71717a;">Retour formateur</span>
    </div>
    <div style="background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
      <p style="margin:0 0 12px;font-size:14px;">${hello}</p>
      <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;">
        La formation <strong>${d.formationTitle}</strong> est terminée. Votre retour de formateur
        nous aide à améliorer l'organisation et compte pour notre démarche qualité (Qualiopi).
        Cela prend 2 minutes.
      </p>
      <p style="margin:20px 0 0;">
        <a href="${d.surveyUrl}" style="display:inline-block;padding:10px 18px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:500;">
          Donner mon avis
        </a>
      </p>
    </div>
    <p style="font-size:11px;color:#a1a1aa;margin-top:32px;text-align:center;">
      Lien personnel signé · données traitées dans le respect du RGPD.
    </p>
  </div>
</body></html>`;
  return { subject, html };
}
