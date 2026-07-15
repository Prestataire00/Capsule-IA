import 'server-only';
import { anthropic, LEGAL_MODEL } from '@/shared/lib/ai/client';

export type RecipientType = 'apprenant' | 'formateur' | 'entreprise';

export type GenerateEmailInput = {
  recipientType: RecipientType;
  recipientName: string;
  companyName?: string | null;
  // Détail contextuel issu de la fiche (poste apprenant, spécialités formateur…).
  detail?: string | null;
  subject: string;
  senderName: string;
  orgName: string;
  // Consignes libres facultatives (« ton chaleureux », « rappeler la date »…).
  instructions?: string | null;
};

export type GenerateEmailResult =
  | { ok: true; subject: string; body: string }
  | { ok: false; reason: 'no_api_key' | 'generation_failed' };

const ROLE_GUIDANCE: Record<RecipientType, string> = {
  apprenant:
    "un apprenant (stagiaire) suivant une formation. Ton professionnel, bienveillant et clair, en le vouvoyant.",
  formateur:
    "un formateur intervenant pour l'organisme. Ton professionnel entre partenaires, en le vouvoyant.",
  entreprise:
    "le contact d'une entreprise cliente. Ton professionnel et commercial courtois, en le vouvoyant.",
};

/**
 * Génère une proposition d'email (objet + corps) via Claude à partir d'un
 * destinataire, d'un objet et du contexte de sa fiche. Renvoie un corps en
 * texte simple (paragraphes séparés par des sauts de ligne) — l'appelant
 * l'enveloppe dans le gabarit HTML à l'envoi.
 */
export async function generateEmailDraft(input: GenerateEmailInput): Promise<GenerateEmailResult> {
  const client = anthropic();
  if (!client) return { ok: false, reason: 'no_api_key' };

  const contextLines = [
    `Destinataire : ${input.recipientName} — ${ROLE_GUIDANCE[input.recipientType]}`,
    input.companyName ? `Entreprise : ${input.companyName}` : null,
    input.detail ? `Informations de la fiche : ${input.detail}` : null,
    `Objet souhaité : ${input.subject}`,
    input.instructions?.trim() ? `Consignes particulières : ${input.instructions.trim()}` : null,
    `Expéditeur : ${input.senderName}, pour l'organisme de formation « ${input.orgName} ».`,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `Tu es assistant de rédaction pour un organisme de formation français.
Rédige un email complet, prêt à envoyer, à partir des éléments suivants :
${contextLines}

Règles STRICTES :
- Français, registre professionnel adapté au destinataire.
- Commence par une formule d'appel (« Bonjour ${input.recipientName}, » ou équivalent).
- Corps clair et concis (2 à 4 paragraphes), fidèle à l'objet demandé.
- Termine par une formule de politesse puis la signature : « ${input.senderName} » et « ${input.orgName} ».
- N'invente aucune date, montant ou lieu non fourni ; reste générique si l'info manque.
- Pas de balises HTML, uniquement du texte avec des sauts de ligne entre paragraphes.

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour :
{"subject": "objet reformulé et clair", "body": "corps complet de l'email avec sauts de ligne"}`;

  try {
    const stream = client.messages.stream({
      model: LEGAL_MODEL,
      max_tokens: 2000,
      thinking: { type: 'adaptive' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output_config: { effort: 'medium' } as any,
      messages: [{ role: 'user', content: prompt }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const msg = await stream.finalMessage();
    const text = msg.content
      .filter((b) => b.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b) => (b as any).text as string)
      .join('\n');

    const jsonMatch = /\{[\s\S]*\}/.exec(text);
    if (!jsonMatch) return { ok: false, reason: 'generation_failed' };
    const parsed = JSON.parse(jsonMatch[0]) as { subject?: unknown; body?: unknown };
    const subject = typeof parsed.subject === 'string' ? parsed.subject.trim() : '';
    const body = typeof parsed.body === 'string' ? parsed.body.trim() : '';
    if (!subject || !body) return { ok: false, reason: 'generation_failed' };

    return { ok: true, subject, body };
  } catch {
    return { ok: false, reason: 'generation_failed' };
  }
}
