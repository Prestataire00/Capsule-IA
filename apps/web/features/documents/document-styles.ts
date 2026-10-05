// Style commun des documents générés (HTML), à la charte Capsule IA — celle des
// propositions : titre en bandeau violet profond, sections en capitales
// violettes soulignées, tableaux à en-tête violet et libellés lavande.
// Scopé à `.doc-sheet` — appliqué à l'aperçu ET à l'éditeur de modèles pour un
// rendu identique.

export const DOCUMENT_CSS = `
.doc-sheet { color: #1f2937; line-height: 1.65; font-size: 13.5px; }
.doc-sheet > :first-child { margin-top: 0; }

.doc-sheet h1 { font-size: 24px; font-weight: 700; color: #ffffff; background: #4c1d95; padding: 18px 22px; letter-spacing: -0.01em; margin: 0 0 14px; line-height: 1.2; }
.doc-sheet h2 {
  font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  color: #4c1d95; margin: 26px 0 12px; padding-bottom: 4px; border-bottom: 1px solid #4c1d95;
}
.doc-sheet h3 { font-size: 14.5px; font-weight: 600; color: #4c1d95; margin: 20px 0 8px; }

.doc-sheet p { margin: 9px 0; }
.doc-sheet ul, .doc-sheet ol { margin: 8px 0 8px 22px; }
.doc-sheet li { margin: 4px 0; }
.doc-sheet strong { color: #111827; font-weight: 600; }
.doc-sheet em { color: #6b7280; }
.doc-sheet a { color: #4c1d95; text-decoration: underline; }

/* Tableaux : en-tête tramé, lignes zébrées, coins arrondis */
.doc-sheet table {
  width: 100%; border-collapse: separate; border-spacing: 0; margin: 14px 0;
  font-size: 12.5px; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden;
}
.doc-sheet thead th, .doc-sheet th {
  background: #4c1d95; font-weight: 600; color: #ffffff; text-align: left;
  padding: 10px 13px; border-bottom: 1px solid #e5e7eb; vertical-align: top;
}
.doc-sheet td { padding: 10px 13px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
.doc-sheet tbody tr:last-child td { border-bottom: none; }
.doc-sheet tbody tr:nth-child(even) td { background: #f3effa; }
.doc-sheet tbody th { background: #f3effa; color: #4c1d95; }

.doc-sheet hr { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
.doc-sheet blockquote {
  border-left: 3px solid #4c1d95; background: #f3effa; padding: 11px 16px;
  margin: 14px 0; color: #4c1d95; border-radius: 0 8px 8px 0;
}

/* En-tête de marque (logo + identité) + pied de page légal */
.doc-sheet { border-top: 5px solid #4c1d95; }
.doc-brand-header, .doc-brand {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  border-bottom: 2px solid #4c1d95; padding-bottom: 14px; margin-bottom: 24px;
}
.doc-brand-header img, .doc-brand img, .doc-brand-logo img { max-height: 56px; max-width: 200px; object-fit: contain; }
.doc-brand-id, .doc-brand .doc-org-name { line-height: 1.4; }
.doc-brand-footer {
  margin-top: 36px; padding-top: 12px; border-top: 1px solid #f1f5f9;
  font-size: 10px; color: #9ca3af; line-height: 1.5;
}
.doc-sheet .signatures { margin-top: 36px; }
`;
