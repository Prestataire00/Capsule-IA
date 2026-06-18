// Moteur de rendu de modèle : remplace {slug} par sa valeur. Pur.
// Les valeurs sont déjà du HTML sûr (échappées en amont par resolveDossierVariables
// pour les champs texte ; les champs « liste » produisent du HTML maîtrisé).

export type RenderResult = {
  html: string;
  missing: string[]; // slugs présents dans le modèle mais absents des variables
};

const TOKEN_RE = /\{([a-z0-9_]+)\}/gi;

export function renderTemplate(
  templateHtml: string,
  variables: Record<string, string>,
): RenderResult {
  const missing = new Set<string>();
  const html = templateHtml.replace(TOKEN_RE, (match, slug: string) => {
    const key = slug.toLowerCase();
    if (key in variables) return variables[key] ?? '';
    missing.add(key);
    return match; // on laisse le token visible si non résolu
  });
  return { html, missing: [...missing] };
}

// Échappe les valeurs texte avant injection (les valeurs « liste » sont construites
// à part avec du HTML maîtrisé et ne passent pas par cette fonction).
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
