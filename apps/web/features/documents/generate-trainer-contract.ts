import 'server-only';
import { anthropic, LEGAL_MODEL } from '@/shared/lib/ai/client';

export type TrainerContractResult =
  | { ok: true; html: string; model: string }
  | { ok: false; reason: 'no_api_key' | 'generation_failed'; error?: unknown };

/**
 * Génère le CORPS HTML d'un contrat de sous-traitance de prestations de formation
 * entre l'organisme (donneur d'ordre) et le formateur (sous-traitant indépendant),
 * juridiquement conforme au droit français. Les valeurs manquantes essentielles
 * (tarif, dates, mission précise) sont laissées en « [à compléter] ».
 */
export async function generateTrainerContractHtml(
  variables: Record<string, string>,
): Promise<TrainerContractResult> {
  const client = anthropic();
  if (!client) return { ok: false, reason: 'no_api_key' };

  const context = Object.entries(variables)
    .filter(([, v]) => v && v.trim().length > 0 && !v.startsWith('<'))
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  const prompt = `Tu es le juriste-rédacteur d'un organisme de formation français (conforme Qualiopi).
Rédige le CORPS HTML d'un CONTRAT DE SOUS-TRAITANCE DE PRESTATIONS DE FORMATION, juridiquement conforme au droit français, conclu entre :
- le DONNEUR D'ORDRE : l'organisme de formation (voir données « organisme_… » ci-dessous) ;
- le SOUS-TRAITANT : le formateur, prestataire indépendant (voir données « formateur_… » ci-dessous).

CONTRAINTES DE SORTIE :
- Réponds UNIQUEMENT avec du HTML (pas de \`\`\`, pas de <html>/<head>/<body>).
- Balises autorisées : <h1>, <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <table>, <thead>, <tbody>, <tr>, <th>, <td>.
- Français juridique, précis et sobre. Contrat complet, prêt à signer.
- N'invente JAMAIS une donnée (raison sociale, SIRET, montant, date). Insère uniquement les données réelles fournies ci-dessous ; pour toute donnée essentielle manquante (tarif/honoraires, dates, description précise de la mission), insère « [à compléter] ».

STRUCTURE ET CLAUSES OBLIGATOIRES (numérote les articles) :
- Titre + Préambule désignant les deux parties (raison sociale, SIRET, siège, représentant de chacune).
- Art. 1 — Objet (prestations de formation confiées en sous-traitance).
- Art. 2 — Durée et période d'exécution.
- Art. 3 — Obligations du sous-traitant : exécution personnelle et conforme, respect du référentiel Qualiopi et des procédures de l'organisme, émargement et traçabilité, assiduité, respect du règlement intérieur, obligation d'information.
- Art. 4 — Indépendance des parties : exécution en pleine autonomie, ABSENCE DE LIEN DE SUBORDINATION ; le sous-traitant conserve la qualité de prestataire indépendant et déclare être en règle (immatriculation, déclaration d'activité le cas échéant, obligations sociales et fiscales).
- Art. 5 — Obligations du donneur d'ordre : communication des informations utiles, mise à disposition des moyens convenus, paiement.
- Art. 6 — Rémunération et modalités de paiement (tarif/honoraires : [à compléter] ; facturation ; délais de paiement conformes au Code de commerce ; pénalités de retard).
- Art. 7 — Assurance : le sous-traitant justifie d'une assurance responsabilité civile professionnelle en cours de validité.
- Art. 8 — Confidentialité.
- Art. 9 — Propriété intellectuelle des supports pédagogiques.
- Art. 10 — Protection des données personnelles (RGPD ; sous-traitance au sens de l'article 28 du RGPD lorsqu'applicable).
- Art. 11 — Non-sollicitation et non-débauchage (clientèle et personnel).
- Art. 12 — Responsabilité.
- Art. 13 — Résiliation (manquements, préavis).
- Art. 14 — Force majeure.
- Art. 15 — Droit applicable et règlement des litiges (droit français ; recherche d'une solution amiable préalable puis juridiction compétente).
- Bloc final : « Fait à [à compléter], le [à compléter] », en deux exemplaires, avec deux blocs de signature (« Pour l'organisme de formation » et « Le sous-traitant »).

DONNÉES (source de vérité — ne rien inventer au-delà) :
${context || '(aucune donnée fournie)'}

Ne mentionne jamais que tu es une IA.`;

  try {
    const stream = client.messages.stream({
      model: LEGAL_MODEL,
      max_tokens: 12000,
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
