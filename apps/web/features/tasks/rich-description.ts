// ARCHETYPE: shared
// Détail riche d'une tâche (0160) : le HTML de l'éditeur est nettoyé côté serveur
// avant d'être enregistré, et nettoyé de nouveau à la relecture — une tâche écrite
// par un autre chemin que l'action ne doit jamais pouvoir injecter de script.
import sanitizeHtml from 'sanitize-html';

const COULEUR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i, /^inherit$/];

/** Ce que l'éditeur sait produire, et rien d'autre. */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'mark', 'span', 'h2', 'h3',
    'ul', 'ol', 'li', 'blockquote', 'hr', 'a',
    'table', 'colgroup', 'col', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    mark: ['style', 'data-color'],
    span: ['style'],
    p: ['style'],
    h2: ['style'],
    h3: ['style'],
    th: ['colspan', 'rowspan', 'colwidth', 'style'],
    td: ['colspan', 'rowspan', 'colwidth', 'style'],
    col: ['style'],
  },
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify)$/],
      'font-family': [/^[\w\s,'"-]{1,80}$/],
      'font-size': [/^\d{1,2}px$/],
      color: COULEUR,
      'background-color': COULEUR,
      width: [/^\d{1,4}px$/],
      'min-width': [/^\d{1,4}px$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
};

/** Vrai si le détail ne contient ni texte ni tableau (« <p></p> » d'un éditeur vide). */
export function detailVide(html: string): boolean {
  if (/<table/i.test(html)) return false;
  const texte = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
  return texte.replace(/&nbsp;/g, ' ').trim() === '';
}

/** HTML de l'éditeur → HTML sûr, ou chaîne vide si rien n'a été écrit. */
export function nettoyerDetail(html: string): string {
  const propre = sanitizeHtml(html, OPTIONS).trim();
  return detailVide(propre) ? '' : propre;
}

const echapper = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Détail enregistré → HTML affichable. Les tâches créées avant l'éditeur riche
 * contiennent du texte brut : on l'échappe, en gardant ses retours à la ligne.
 */
export function versHtmlSur(detail: string): string {
  if (/^\s*</.test(detail)) return sanitizeHtml(detail, OPTIONS);
  return echapper(detail)
    .split('\n')
    .map((ligne) => `<p>${ligne || '<br>'}</p>`)
    .join('');
}
