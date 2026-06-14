// Module pur : articles officiels (Légifrance) à récupérer par type de document.
export type LegalKind = 'reglement_interieur' | 'cgv' | 'livret_accueil';

export type ArticleRef = { code: string; numero: string };

// Code du travail — règlement intérieur des stagiaires de la formation pro.
const RI_ARTICLES: ArticleRef[] = [
  { code: 'LEGITEXT000006072050', numero: 'L6352-3' },
  { code: 'LEGITEXT000006072050', numero: 'L6352-4' },
  { code: 'LEGITEXT000006072050', numero: 'L6352-5' },
  { code: 'LEGITEXT000006072050', numero: 'R6352-1' },
  { code: 'LEGITEXT000006072050', numero: 'R6352-2' },
  { code: 'LEGITEXT000006072050', numero: 'R6352-3' },
  { code: 'LEGITEXT000006072050', numero: 'R6352-4' },
  { code: 'LEGITEXT000006072050', numero: 'R6352-5' },
  { code: 'LEGITEXT000006072050', numero: 'R6352-6' },
  { code: 'LEGITEXT000006072050', numero: 'R6352-7' },
  { code: 'LEGITEXT000006072050', numero: 'R6352-8' },
];

export function articlesFor(kind: LegalKind): ArticleRef[] {
  switch (kind) {
    case 'reglement_interieur':
      return RI_ARTICLES;
    case 'cgv':
      return [{ code: 'LEGITEXT000006072050', numero: 'L6353-1' }];
    case 'livret_accueil':
      return [{ code: 'LEGITEXT000006072050', numero: 'L6353-8' }];
  }
}
