import 'server-only';
import { env } from '@/env.mjs';

// Template email isolé (F-EMA-08) — volontairement hors du templates.ts partagé
// pour éviter les collisions entre instances parallèles.

const LOGO_URL = env.PUBLIC_APP_URL
  ? `${env.PUBLIC_APP_URL.replace(/\/$/, '')}/logo-capsule-full.png`
  : 'https://i-a-infinity.com/favicon.png';

const baseStyles =
  'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#18181b;line-height:1.55;';

export const halfDayLabel = (h: string): string =>
  ({ morning: 'matin', afternoon: 'après-midi', full: 'journée', evening: 'soirée' } as Record<string, string>)[h] ?? h;

export type AttendanceSignatureMissingData = {
  recipientName: string | null;
  formationTitle: string;
  dossierReference: string;
  sessionDateLabel: string; // ex. "lundi 2 mars 2026"
  halfDay: string; // morning | afternoon | full | evening
  dashboardUrl: string | null;
};

export function attendanceSignatureMissingEmail(d: AttendanceSignatureMissingData): {
  subject: string;
  html: string;
} {
  const hd = halfDayLabel(d.halfDay);
  const subject = `⚠️ Émargement manquant — ${d.formationTitle} (${hd})`;
  const hello = d.recipientName ? `Bonjour ${d.recipientName},` : 'Bonjour,';
  const cta = d.dashboardUrl
    ? `<p style="margin:20px 0 0;"><a href="${d.dashboardUrl}" style="display:inline-block;padding:10px 18px;background:#7c3aed;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:500;">Compléter l'émargement</a></p>`
    : '';

  const html = `
<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#fafafa;${baseStyles}">
  <div style="max-width:580px;margin:0 auto;padding:32px 24px;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;">
      <img src="${LOGO_URL}" alt="Capsule IA" width="96" height="96" style="width:96px;height:96px;display:block;">
      <span style="color:#d4d4d8;">·</span>
      <span style="font-size:13px;color:#71717a;">Émargement</span>
    </div>
    <div style="background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:24px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">
      <p style="margin:0 0 12px;font-size:14px;">${hello}</p>
      <p style="margin:0 0 16px;font-size:14px;color:#3f3f46;">
        Une demi-journée de formation est <strong>terminée sans émargement complet</strong>.
        Pour la conformité financeur (OPCO/FAF-CA/AGEFIPH), chaque créneau doit être signé.
      </p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;font-size:12px;color:#71717a;">Formation</td><td style="padding:8px 0;font-size:13px;font-weight:500;text-align:right;">${d.formationTitle}</td></tr>
        <tr><td style="padding:8px 0;font-size:12px;color:#71717a;">Dossier</td><td style="padding:8px 0;font-size:13px;font-weight:500;text-align:right;">${d.dossierReference}</td></tr>
        <tr><td style="padding:8px 0;font-size:12px;color:#71717a;">Créneau</td><td style="padding:8px 0;font-size:13px;font-weight:500;text-align:right;">${d.sessionDateLabel} — ${hd}</td></tr>
      </table>
      ${cta}
    </div>
    <p style="font-size:11px;color:#a1a1aa;margin-top:32px;text-align:center;">
      Cet email vous est envoyé depuis Capsule IA.<br>Données traitées dans le strict respect du RGPD.
    </p>
  </div>
</body></html>`;

  return { subject, html };
}
