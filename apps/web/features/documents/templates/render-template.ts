// Moteur de rendu de modèle : remplace {slug} par sa valeur. Pur.
// Les valeurs sont déjà du HTML sûr (échappées en amont par resolveDossierVariables
// pour les champs texte ; les champs « liste » produisent du HTML maîtrisé).

export type RenderResult = {
  html: string;
  missing: string[]; // slugs présents dans le modèle mais absents des variables
};

const TOKEN_RE = /\{([a-z0-9_]+)\}/gi;
// Bloc conditionnel généré par l'éditeur : <div data-condition="slug">…inline…</div>.
// Le contenu est inline uniquement (pas de div imbriqué) → le premier </div> ferme le bloc.
const CONDITION_RE = /<div[^>]*\bdata-condition="([a-z0-9_]*)"[^>]*>([\s\S]*?)<\/div>/gi;

// Une variable est « renseignée » si sa valeur n'est ni vide, ni un tiret, ni une
// liste vide (listHtml renvoie '—' quand il n'y a rien).
function isFilled(value: string | undefined): boolean {
  if (value == null) return false;
  const v = value.trim();
  return v !== '' && v !== '—';
}

export function renderTemplate(
  templateHtml: string,
  variables: Record<string, string>,
): RenderResult {
  const missing = new Set<string>();

  // 1. Blocs conditionnels : on garde le contenu si la variable est renseignée.
  const withConditionals = templateHtml.replace(
    CONDITION_RE,
    (_full, slug: string, inner: string) => (isFilled(variables[(slug || '').toLowerCase()]) ? inner : ''),
  );

  // 2. Remplacement des tokens {slug}.
  const html = withConditionals.replace(TOKEN_RE, (match, slug: string) => {
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
