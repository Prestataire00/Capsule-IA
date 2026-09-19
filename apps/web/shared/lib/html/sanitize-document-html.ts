// ARCHETYPE: shared
// Nettoyage du HTML de document, côté serveur uniquement.
//
// Deux chemins produisent du HTML que personne n'a écrit à la main :
//   · l'import de conventions — le prompt demande au modèle d'émettre du HTML
//     à partir d'un PDF fourni par un tiers (features/import) ;
//   · la génération de documents par IA (features/documents/templates).
//
// Ce HTML est ensuite rendu en `dangerouslySetInnerHTML` sur des pages
// publiques : le catalogue, et la page de signature ouverte au stagiaire par
// simple lien. Le contenu d'un PDF client est donc une entrée non fiable qui
// atteignait le navigateur d'un tiers — et la CSP tolère `'unsafe-inline'`,
// donc elle n'arrête rien. On nettoie à l'écriture ET à l'affichage : les
// documents déjà en base n'ont pas été nettoyés à leur création.
import sanitizeHtml from 'sanitize-html';

const COULEUR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i];

/** Ce qu'un document de formation a besoin de contenir, et rien d'autre. */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'span', 'div', 'section', 'article',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'hr', 'a', 'small', 'sup', 'sub',
    'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  ],
  // Ni `script`, ni `style`, ni `iframe`, ni `img` : un document généré n'a
  // aucune raison de charger une ressource distante, qui pisterait le lecteur.
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    '*': ['class', 'style', 'colspan', 'rowspan'],
  },
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify)$/],
      'font-weight': [/^(normal|bold|[1-9]00)$/],
      'font-style': [/^(normal|italic)$/],
      'font-size': [/^\d{1,2}(px|pt)$/],
      color: COULEUR,
      'background-color': COULEUR,
      width: [/^\d{1,4}(px|%)$/],
      margin: [/^[\d\spx]{1,20}$/],
      padding: [/^[\d\spx]{1,20}$/],
    },
  },
  // Pas de `data:` : une image SVG en data-URI transporte du script.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
};

/** HTML d'origine non fiable → HTML sûr à rendre. */
export function nettoyerHtmlDocument(html: string | null | undefined): string {
  if (!html) return '';
  return sanitizeHtml(html, OPTIONS);
}

/** Même nettoyage, en préservant `null` — pour les colonnes nullables. */
export function nettoyerHtmlOuNull(html: string | null | undefined): string | null {
  if (html == null || html === '') return null;
  return sanitizeHtml(html, OPTIONS);
}
