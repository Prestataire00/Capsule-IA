/** E-mail « votre formateur vous envoie un questionnaire ». */

const echapper = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function questionnaireInvitationEmail(data: {
  firstName: string;
  trainerName: string;
  questionnaireTitle: string;
  formationTitle: string;
  url: string;
  anonymous: boolean;
}): { subject: string; html: string } {
  const subject = `${data.questionnaireTitle} — ${data.formationTitle}`;
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b;line-height:1.55;">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
<div style="background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:24px;">
<p style="font-size:14px;margin:0 0 12px;">Bonjour ${echapper(data.firstName)},</p>
<p style="font-size:14px;color:#52525b;margin:0 0 16px;">
${echapper(data.trainerName)}, votre formateur pour <strong style="color:#18181b;">${echapper(data.formationTitle)}</strong>,
vous invite à répondre au questionnaire « ${echapper(data.questionnaireTitle)} ».
</p>
${data.anonymous ? '<p style="font-size:13px;color:#52525b;margin:0 0 16px;">Vos réponses restent anonymes pour votre formateur.</p>' : ''}
<a href="${data.url}" style="display:inline-block;padding:10px 18px;background:#f97316;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:500;">Répondre au questionnaire</a>
<p style="font-size:12px;color:#71717a;margin:20px 0 0;">Le lien ouvre votre espace de formation ; il vous est personnel.</p>
</div>
<p style="font-size:11px;color:#a1a1aa;margin-top:24px;text-align:center;">Envoyé depuis Capsule IA.</p>
</div></body></html>`;
  return { subject, html };
}
