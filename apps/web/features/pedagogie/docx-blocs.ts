import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

/**
 * Un document Word annotable, construit à partir de la transcription d'un
 * PDF. Les marques de page sont gardées : en annotant, on dit « page 3 »
 * comme le formateur la voit dans son PDF.
 */

export const TYPES_BLOC = ['page', 'titre1', 'titre2', 'titre3', 'paragraphe', 'puce', 'numero', 'tableau'] as const;
export type TypeBloc = (typeof TYPES_BLOC)[number];

export type Bloc = {
  readonly type: TypeBloc;
  readonly texte: string;
  /** Lignes du tableau, première ligne = en-tête. Vide hors tableau. */
  readonly lignes: ReadonlyArray<ReadonlyArray<string>>;
};

const TITRES = {
  titre1: HeadingLevel.HEADING_1,
  titre2: HeadingLevel.HEADING_2,
  titre3: HeadingLevel.HEADING_3,
} as const;

const BORDURE = { style: BorderStyle.SINGLE, size: 4, color: 'D4D4D8' } as const;

function tableau(lignes: ReadonlyArray<ReadonlyArray<string>>): Table | null {
  const colonnes = Math.max(0, ...lignes.map((l) => l.length));
  if (colonnes === 0) return null;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: lignes.map(
      (ligne, i) =>
        new TableRow({
          tableHeader: i === 0,
          children: Array.from({ length: colonnes }, (_, j) =>
            new TableCell({
              borders: { top: BORDURE, bottom: BORDURE, left: BORDURE, right: BORDURE },
              children: [new Paragraph({ children: [new TextRun({ text: ligne[j] ?? '', bold: i === 0 })] })],
            }),
          ),
        }),
    ),
  });
}

export function construireDocx(input: { titre: string; source: string; blocs: readonly Bloc[] }): Document {
  const enfants: Array<Paragraph | Table> = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(input.titre)] }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Version Word de « ${input.source} », pour relecture. Annotez avec les commentaires et le suivi des modifications de Word.`,
          italics: true,
          color: '71717A',
          size: 18,
        }),
      ],
    }),
  ];

  let premierePage = true;
  for (const b of input.blocs) {
    const texte = b.texte.trim();
    switch (b.type) {
      case 'page':
        if (!premierePage) enfants.push(new Paragraph({ children: [new PageBreak()] }));
        premierePage = false;
        enfants.push(
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: texte || 'Page', color: 'A1A1AA', size: 16 })],
          }),
        );
        break;
      case 'titre1':
      case 'titre2':
      case 'titre3':
        if (texte) enfants.push(new Paragraph({ heading: TITRES[b.type], children: [new TextRun(texte)] }));
        break;
      case 'puce':
        if (texte) enfants.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(texte)] }));
        break;
      case 'numero':
        if (texte) enfants.push(new Paragraph({ numbering: { reference: 'liste', level: 0 }, children: [new TextRun(texte)] }));
        break;
      case 'tableau': {
        const t = tableau(b.lignes);
        if (t) enfants.push(t, new Paragraph({ children: [] }));
        break;
      }
      default:
        if (texte) enfants.push(new Paragraph({ children: [new TextRun(texte)] }));
    }
  }

  return new Document({
    creator: 'Capsule IA',
    title: input.titre,
    numbering: {
      config: [
        {
          reference: 'liste',
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START }],
        },
      ],
    },
    sections: [{ children: enfants }],
  });
}

export const docxEnBuffer = (doc: Document): Promise<Buffer> => Packer.toBuffer(doc);
