import 'server-only';
import { anthropic, LEGAL_MODEL } from '@/shared/lib/ai/client';
import { legalPromptBlock } from '@/features/documents/legal/requirements';
import { TEMPLATE_VARIABLES } from '@/features/documents/templates/variables';
import { renderTemplate } from '@/features/documents/templates/render-template';

export type AiDocResult =
  | { ok: true; html: string; model: string }
  | { ok: false; reason: 'no_api_key' | 'generation_failed'; error?: unknown };

// Génère le corps HTML d'un document à partir d'un TYPE de document, d'une
// instruction et des données du dossier (déjà résolues et formatées en français).
// Le bloc de conformité légale correspondant au type est injecté dans le prompt.
export async function generateDocumentHtml(
  kind: string,
  instruction: string,
  variables: Record<string, string>,
): Promise<AiDocResult> {
  const client = anthropic();
  if (!client) return { ok: false, reason: 'no_api_key' };

  const context = Object.entries(variables)
    .filter(([, v]) => v && v.trim().length > 0 && !v.startsWith('<'))
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const prompt = `Tu es le juriste-rédacteur d'un organisme de formation français (conforme Qualiopi).
Rédige le CORPS HTML d'un document ADMINISTRATIF et JURIDIQUEMENT CONFORME selon le type et la demande ci-dessous.

CONTRAINTES DE SORTIE :
- Réponds UNIQUEMENT avec du HTML (pas de \`\`\`, pas de <html>/<head>/<body>).
- Utilise uniquement <h1>, <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <table>, <thead>, <tbody>, <tr>, <th>, <td>.
- Français juridique et institutionnel, précis et sobre.
- Insère UNIQUEMENT les données réelles fournies ci-dessous. N'invente jamais un montant, une date, un SIRET, un numéro ou une raison sociale. Pour toute donnée manquante mais nécessaire, insère un champ explicite « [à compléter] ».
- Toutes les mentions obligatoires listées ci-dessous DOIVENT figurer dans le document.
- SIGNATURE & CACHET : dans tout bloc de validation/signature de l'organisme (« Fait à … le … », « Nom et signature du formateur », « Cachet de l'organisme »), insère le token {organisme_signature} pour la signature et {organisme_cachet} pour le cachet. Ils seront automatiquement remplacés par les images enregistrées dans les réglages de l'organisme. Ne laisse JAMAIS une cellule « cachet » ou « signature » vide : mets-y le token correspondant.

${legalPromptBlock(kind)}

DONNÉES DU DOSSIER (source de vérité — ne rien inventer au-delà) :
${context || '(aucune donnée fournie)'}

DEMANDE COMPLÉMENTAIRE DE L'UTILISATEUR :
${instruction || '(aucune — produire le document standard du type indiqué)'}`;

  try {
    const stream = client.messages.stream({
      model: LEGAL_MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output_config: { effort: 'high' } as any,
      messages: [{ role: 'user', content: prompt }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const msg = await stream.finalMessage();
    let html = msg.content
      .filter((b) => b.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b) => (b as any).text as string)
      .join('\n')
      .trim();
    // Nettoyage défensif d'éventuels fences markdown.
    html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    if (!html) return { ok: false, reason: 'generation_failed' };
    // Résout les tokens image émis par l'IA (cachet/signature de l'organisme) en
    // leurs <img> depuis les réglages. Les clés sont pré-remplies à '' pour qu'un
    // token reste propre (vide) plutôt que littéral si l'asset est absent.
    const rendered = renderTemplate(html, {
      organisme_cachet: '',
      organisme_signature: '',
      ...variables,
    }).html;
    return { ok: true, html: rendered, model: LEGAL_MODEL };
  } catch (error) {
    return { ok: false, reason: 'generation_failed', error };
  }
}

// Génère un MODÈLE réutilisable (et non un document figé) pour un type donné :
// le HTML contient des VARIABLES {slug} (pas de valeurs réelles), que l'utilisateur
// verra en pastilles dans l'éditeur et pourra compléter. Adaptable à chaque cible.
export async function generateTemplateHtml(kind: string, instruction: string): Promise<AiDocResult> {
  const client = anthropic();
  if (!client) return { ok: false, reason: 'no_api_key' };

  const catalog = TEMPLATE_VARIABLES.filter((v) => v.group !== 'Conditions')
    .map((v) => `{${v.slug}} = ${v.label} (${v.group})`)
    .join('\n');

  const prompt = `Tu es le juriste-rédacteur d'un organisme de formation français (conforme Qualiopi).
Génère un MODÈLE de document RÉUTILISABLE (pas un exemplaire rempli) pour le type indiqué.

PRINCIPE CLÉ — VARIABLES :
- Partout où l'information dépend du dossier, de l'apprenant, de l'entreprise, de la formation
  ou de l'organisme, insère la VARIABLE correspondante entre accolades, ex. {apprenant_nom_complet},
  {formation_titre}, {dossier_date_debut}, {organisme_nom}.
- N'INVENTE JAMAIS de valeurs réelles (pas de faux nom, montant, date, SIRET) : utilise les variables.
- Si une donnée nécessaire n'a pas de variable dans la liste, laisse un champ « [à compléter] ».

VARIABLES DISPONIBLES (utilise EXACTEMENT ces slugs) :
${catalog}

- Pour la signature et le cachet de l'organisme (blocs de validation, « Cachet de l'organisme », « Nom et signature »), utilise les variables image {organisme_signature} et {organisme_cachet} — ne laisse jamais ces cellules vides.

CONTRAINTES DE SORTIE :
- Réponds UNIQUEMENT avec du HTML (pas de \`\`\`, pas de <html>/<head>/<body>).
- Balises autorisées : <h1>, <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <table>, <thead>, <tbody>, <tr>, <th>, <td>.
- Français juridique et institutionnel. Toutes les mentions obligatoires ci-dessous doivent figurer.

${legalPromptBlock(kind)}

DEMANDE COMPLÉMENTAIRE DE L'UTILISATEUR :
${instruction || '(aucune — produire le modèle standard du type indiqué)'}`;

  try {
    const stream = client.messages.stream({
      model: LEGAL_MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      output_config: { effort: 'high' } as any,
      messages: [{ role: 'user', content: prompt }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const msg = await stream.finalMessage();
    let html = msg.content
      .filter((b) => b.type === 'text')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((b) => (b as any).text as string)
      .join('\n')
      .trim();
    html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    if (!html) return { ok: false, reason: 'generation_failed' };
    return { ok: true, html, model: LEGAL_MODEL };
  } catch (error) {
    return { ok: false, reason: 'generation_failed', error };
  }
}
