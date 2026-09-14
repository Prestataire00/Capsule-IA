/**
 * Les champs « riches » du catalogue (méthodes pédagogiques, modalités
 * d'évaluation, public visé, description) sont saisis dans un éditeur et
 * stockés en HTML. Les générateurs PDF, eux, ne savent tracer que du texte :
 * passer le HTML tel quel imprimait `<p><strong>Méthodes…</strong></p>` en
 * toutes lettres sur les conventions (constaté le 2026-09-14).
 *
 * On réduit donc le fragment à une suite de blocs — paragraphes et puces —
 * que le PDF sait mettre en page, en conservant la structure au lieu de la
 * gommer : un `<li>` reste une puce, un `<p>` reste un paragraphe.
 */

export type RichBlock = { readonly kind: 'p' | 'li'; readonly text: string };

// Marqueurs internes : des caractères de contrôle, absents de tout texte saisi.
const SEP = String.fromCharCode(1);
const LI = `${SEP}LI${SEP}`;
const END = `${SEP}END${SEP}`;

/** Entités HTML courantes de l'éditeur riche. */
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&(?:quot|#34);/gi, '"')
    .replace(/&(?:#39|apos|rsquo|#8217);/gi, '’')
    .replace(/&(?:laquo|#171);/gi, '«')
    .replace(/&(?:raquo|#187);/gi, '»')
    .replace(/&(?:hellip|#8230);/gi, '…')
    .replace(/&(?:ndash|#8211);/gi, '–')
    .replace(/&(?:mdash|#8212);/gi, '—')
    .replace(/&(?:eacute|#233);/gi, 'é')
    .replace(/&(?:egrave|#232);/gi, 'è')
    .replace(/&(?:agrave|#224);/gi, 'à')
    .replace(/&(?:ccedil|#231);/gi, 'ç')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

/**
 * Découpe un fragment HTML (ou du texte brut) en blocs mis en page.
 * Renvoie un tableau vide si le champ est vide ou ne contient que du balisage.
 */
export function richTextBlocks(input: string | null | undefined): RichBlock[] {
  if (!input) return [];

  let s = String(input)
    .replace(/<\s*(script|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, LI)
    .replace(/<\s*\/\s*li\s*>/gi, END)
    .replace(/<\s*\/?\s*(p|div|h[1-6]|ul|ol|tr|blockquote|section|table)[^>]*>/gi, END)
    .replace(/<[^>]*>/g, '');
  s = decodeEntities(s);

  const blocks: RichBlock[] = [];
  for (const chunk of s.split(END)) {
    const puce = chunk.startsWith(LI);
    const corps = puce ? chunk.slice(LI.length) : chunk;
    for (const ligne of corps.split('\n')) {
      const texte = ligne.split(SEP).join('').replace(/\s+/g, ' ').trim();
      if (!texte) continue;
      // L'éditeur laisse parfois la puce dans le texte ; on ne la double pas.
      const nettoye = texte.replace(/^[•\-–—]\s+/, '');
      blocks.push({ kind: puce ? 'li' : 'p', text: nettoye || texte });
    }
  }
  return blocks;
}

/** Même réduction, rendue en une seule chaîne (e-mails, aperçus, exports texte). */
export function richTextToPlain(input: string | null | undefined): string {
  return richTextBlocks(input)
    .map((b) => (b.kind === 'li' ? `• ${b.text}` : b.text))
    .join('\n');
}
