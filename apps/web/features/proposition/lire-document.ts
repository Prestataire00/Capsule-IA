// ARCHETYPE: shared
// Lire un programme, quel que soit son format. Module pur.
//
// Isma dépose ce qu'il a sous la main : PDF, Word, PowerPoint, Excel, une
// photo, un export texte. Claude lit nativement le PDF et les images ; le
// reste, on en extrait le texte ici. Les formats Office et OpenDocument sont
// des archives zip de XML : le texte est dans les balises, sans bibliothèque
// de plus.

import { unzipSync, strFromU8 } from 'fflate';

export type Nature =
  | { type: 'pdf' }
  | { type: 'image'; media: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }
  | { type: 'texte'; texte: string }
  | { type: 'illisible'; raison: string };

const ext = (nom: string) => (nom.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '');

const commencePar = (b: Uint8Array, ...octets: number[]) => octets.every((o, i) => b[i] === o);

/** Décode les entités XML courantes. */
const entites = (t: string) =>
  t
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

/** Le texte d'un XML : fins de paragraphe, de ligne et de cellule deviennent des sauts. */
function texteXml(xml: string): string {
  return entites(
    xml
      .replace(/<(w:tab|text:tab)\b[^>]*\/>/g, '\t')
      .replace(/<\/(w:p|a:p|text:p|text:h|row|table:table-row)>/g, '\n')
      .replace(/<(w:br|a:br|text:line-break)\b[^>]*\/>/g, '\n')
      .replace(/<\/(c|table:table-cell)>/g, '\t')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const numero = (chemin: string) => Number(chemin.match(/(\d+)\.xml$/)?.[1] ?? 0);

function texteArchive(octets: Uint8Array): string | null {
  let fichiers: Record<string, Uint8Array>;
  try {
    fichiers = unzipSync(octets);
  } catch {
    return null;
  }
  const lire = (c: string) => (fichiers[c] ? strFromU8(fichiers[c]!) : '');
  const noms = Object.keys(fichiers);

  if (fichiers['word/document.xml']) {
    const parties = ['word/document.xml', ...noms.filter((n) => /^word\/(header|footer|footnotes)\d*\.xml$/.test(n))];
    return parties.map((p) => texteXml(lire(p))).filter(Boolean).join('\n\n');
  }
  const diapos = noms.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => numero(a) - numero(b));
  if (diapos.length) {
    const notes = (n: number) => texteXml(lire(`ppt/notesSlides/notesSlide${n}.xml`));
    return diapos
      .map((d) => {
        const n = numero(d);
        const note = notes(n);
        return `— Diapositive ${n} —\n${texteXml(lire(d))}${note ? `\nNotes : ${note}` : ''}`;
      })
      .join('\n\n');
  }
  if (fichiers['xl/workbook.xml']) {
    // Les textes des cellules sont mutualisés dans sharedStrings ; les nombres
    // restent dans les feuilles. On rend les deux, feuille par feuille.
    const partages = [...lire('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texteXml(m[1] ?? ''));
    const feuilles = noms.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => numero(a) - numero(b));
    return feuilles
      .map((f) => {
        const lignes = [...lire(f).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((r) =>
          [...(r[1] ?? '').matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)]
            .map((c) => {
              const v = (c[2] ?? '').match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? texteXml(c[2] ?? '');
              return /t="s"/.test(c[1] ?? '') ? (partages[Number(v)] ?? '') : entites(v);
            })
            .join('\t'),
        );
        return `— Feuille ${numero(f)} —\n${lignes.join('\n')}`;
      })
      .join('\n\n');
  }
  if (fichiers['content.xml']) return texteXml(lire('content.xml'));
  return null;
}

/** RTF : on retire les groupes de contrôle et les mots de commande. */
function texteRtf(rtf: string): string {
  return rtf
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\{\\\*[^{}]*\}/g, '')
    .replace(/\\(par|line)\b ?/g, '\n')
    .replace(/\\tab\b ?/g, '\t')
    .replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode((Number(n) + 65536) % 65536))
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const texteHtml = (html: string) =>
  entites(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * Vieux formats binaires (.doc, .xls, .ppt) : pas de structure lisible sans
 * un analyseur dédié, mais le texte y est stocké en clair, souvent en UTF-16.
 * On récupère les passages lisibles — imparfait, mais le contenu y est.
 */
function passagesLisibles(b: Uint8Array): string {
  const passages: string[] = [];
  let courant = '';
  const pousser = () => {
    if (courant.trim().length >= 4) passages.push(courant.trim());
    courant = '';
  };
  for (let i = 0; i + 1 < b.length; i += 2) {
    const code = b[i]! | (b[i + 1]! << 8);
    if ((code >= 0x20 && code < 0x7f) || (code >= 0xa0 && code < 0x2000) || code === 0x2019 || code === 0x2013 || code === 0x20ac) courant += String.fromCharCode(code);
    else if (code === 0x0d || code === 0x0a) {
      pousser();
      passages.push('');
    } else pousser();
  }
  pousser();
  return passages.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function utf8(b: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(b).replace(/^﻿/, '');
}

/** Proportion de caractères de contrôle : au-delà, ce n'est pas du texte. */
const pareilTexte = (t: string) => t.length > 0 && (t.match(/[\u0000-\u0008\u000e-\u001f�]/g)?.length ?? 0) / t.length < 0.02;

export function natureDuDocument(octets: Uint8Array, nom: string): Nature {
  const e = ext(nom);
  if (commencePar(octets, 0x25, 0x50, 0x44, 0x46)) return { type: 'pdf' };
  if (commencePar(octets, 0xff, 0xd8, 0xff)) return { type: 'image', media: 'image/jpeg' };
  if (commencePar(octets, 0x89, 0x50, 0x4e, 0x47)) return { type: 'image', media: 'image/png' };
  if (commencePar(octets, 0x47, 0x49, 0x46, 0x38)) return { type: 'image', media: 'image/gif' };
  if (commencePar(octets, 0x52, 0x49, 0x46, 0x46) && octets[8] === 0x57 && octets[9] === 0x45) return { type: 'image', media: 'image/webp' };
  if (['heic', 'heif', 'tif', 'tiff', 'bmp'].includes(e)) {
    return { type: 'illisible', raison: `Les images .${e} ne sont pas lues par l’IA : enregistrez-la en JPEG ou PNG, ou en PDF.` };
  }

  // Office récent, OpenDocument, ou toute autre archive zip.
  if (commencePar(octets, 0x50, 0x4b, 0x03, 0x04)) {
    const t = texteArchive(octets);
    if (t && t.trim()) return { type: 'texte', texte: t };
    return { type: 'illisible', raison: 'Ce fichier est une archive dont aucun texte n’a pu être lu.' };
  }

  const brut = utf8(octets);
  if (e === 'rtf' || brut.startsWith('{\\rtf')) return { type: 'texte', texte: texteRtf(brut) };
  if (['html', 'htm', 'svg', 'xml'].includes(e) || /^\s*<(!doctype html|html|svg|\?xml)/i.test(brut)) {
    const t = e === 'xml' || /^\s*<\?xml/.test(brut) ? texteXml(brut) : texteHtml(brut);
    if (t) return { type: 'texte', texte: t };
  }
  if (pareilTexte(brut)) return { type: 'texte', texte: brut.trim() };

  // Conteneur binaire Office 97-2003 (.doc, .xls, .ppt) ou format inconnu.
  const lisible = passagesLisibles(octets);
  if (lisible.replace(/\s/g, '').length >= 200) return { type: 'texte', texte: lisible };
  return { type: 'illisible', raison: 'Aucun texte n’a pu être lu dans ce fichier. Enregistrez-le en PDF et déposez-le à nouveau.' };
}
