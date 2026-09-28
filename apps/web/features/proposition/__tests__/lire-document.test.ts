import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { natureDuDocument } from '../lire-document';

const zip = (fichiers: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(fichiers).map(([k, v]) => [k, strToU8(v)])));
const texte = (n: ReturnType<typeof natureDuDocument>) => (n.type === 'texte' ? n.texte : `(${n.type})`);

describe('lire un programme, quel que soit son format', () => {
  it('PDF et images partent tels quels vers l’IA', () => {
    expect(natureDuDocument(strToU8('%PDF-1.7 ...'), 'programme.pdf')).toEqual({ type: 'pdf' });
    expect(natureDuDocument(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]), 'scan.png')).toEqual({ type: 'image', media: 'image/png' });
    expect(natureDuDocument(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'photo.jpg')).toEqual({ type: 'image', media: 'image/jpeg' });
  });

  it('Word : paragraphes, entêtes et entités', () => {
    const docx = zip({
      'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>Module 1 – Positionnement</w:t></w:r></w:p><w:p><w:r><w:t>Durée : 20 min &amp; QCM</w:t></w:r></w:p></w:body></w:document>',
      'word/header1.xml': '<w:hdr><w:p><w:r><w:t>Capsule IA</w:t></w:r></w:p></w:hdr>',
    });
    const t = texte(natureDuDocument(docx, 'programme.docx'));
    expect(t).toContain('Module 1 – Positionnement\nDurée : 20 min & QCM');
    expect(t).toContain('Capsule IA');
  });

  it('PowerPoint : les diapositives dans l’ordre, avec leurs notes', () => {
    const pptx = zip({
      'ppt/slides/slide2.xml': '<p:sld><a:p><a:r><a:t>Session 2</a:t></a:r></a:p></p:sld>',
      'ppt/slides/slide10.xml': '<p:sld><a:p><a:r><a:t>Clôture</a:t></a:r></a:p></p:sld>',
      'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>Session 1</a:t></a:r></a:p></p:sld>',
      'ppt/notesSlides/notesSlide1.xml': '<p:notes><a:p><a:r><a:t>3 heures</a:t></a:r></a:p></p:notes>',
    });
    const t = texte(natureDuDocument(pptx, 'programme.pptx'));
    expect(t.indexOf('Session 1')).toBeLessThan(t.indexOf('Session 2'));
    expect(t.indexOf('Session 2')).toBeLessThan(t.indexOf('Clôture'));
    expect(t).toContain('Notes : 3 heures');
  });

  it('Excel : textes partagés et nombres, cellule par cellule', () => {
    const xlsx = zip({
      'xl/workbook.xml': '<workbook/>',
      'xl/sharedStrings.xml': '<sst><si><t>Module</t></si><si><t>Durée</t></si><si><t>Prompter</t></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row><row r="2"><c t="s"><v>2</v></c><c><v>45</v></c></row></sheetData></worksheet>',
    });
    expect(texte(natureDuDocument(xlsx, 'programme.xlsx'))).toContain('Module\tDurée\nPrompter\t45');
  });

  it('OpenDocument', () => {
    const odt = zip({ 'content.xml': '<office:document-content><text:p>Objectifs</text:p><text:p>Choisir un outil</text:p></office:document-content>' });
    expect(texte(natureDuDocument(odt, 'programme.odt'))).toBe('Objectifs\nChoisir un outil');
  });

  it('RTF, HTML, texte brut', () => {
    expect(texte(natureDuDocument(strToU8('{\\rtf1\\ansi {\\*\\generator X;}Module 1\\par Dur\\\'e9e}'), 'p.rtf'))).toBe('Module 1\nDurée');
    expect(texte(natureDuDocument(strToU8('<html><body><h1>Programme</h1><p>Jour 1</p><script>x()</script></body></html>'), 'p.html'))).toBe('Programme\nJour 1');
    expect(texte(natureDuDocument(strToU8('Programme\nJour 1 : prompts'), 'notes.txt'))).toBe('Programme\nJour 1 : prompts');
  });

  it('vieux Word (.doc) : les passages lisibles en UTF-16', () => {
    const phrase = 'Formation Claude au quotidien : prise en main, projets, connecteurs et automatisation des tâches. ';
    const utf16 = new Uint8Array(Buffer.from(phrase.repeat(4), 'utf16le'));
    const binaire = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 1, 2, 3, ...utf16, 0, 0, 0xff, 0xfe]);
    expect(texte(natureDuDocument(binaire, 'programme.doc'))).toContain('Formation Claude au quotidien');
  });

  it('dit franchement ce qu’il ne sait pas lire', () => {
    const n = natureDuDocument(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]), 'photo.heic');
    expect(n.type).toBe('illisible');
    expect(n.type === 'illisible' && n.raison).toMatch(/JPEG ou PNG/);
  });
});
