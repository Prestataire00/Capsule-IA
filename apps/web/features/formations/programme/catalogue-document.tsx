// ARCHETYPE: shared
// Catalogue de formations imprimable : page de garde + une formation par page
// (réutilise ProgrammeDocument), logo de l'organisme en en-tête de chaque page
// imprimée. Composant présentational pur → rendu serveur, imprimable tel quel.

import { ProgrammeDocument } from './programme-document';
import type { CatalogueItem } from './load-catalogue';

export function CatalogueDocument({
  orgName,
  logoUrl,
  items,
  year,
}: {
  orgName: string;
  logoUrl: string | null;
  items: CatalogueItem[];
  year: number;
}) {
  return (
    <div className="cat-doc">
      <style dangerouslySetInnerHTML={{ __html: CATALOGUE_CSS }} />

      {/* En-tête « courant » répété en haut de CHAQUE page imprimée */}
      {logoUrl && (
        <div className="cat-running" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="" />
        </div>
      )}

      {/* Page de garde */}
      <section className="cat-cover">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="cat-cover-logo" src={logoUrl} alt={orgName} />
        )}
        {orgName && <p className="cat-cover-kicker">{orgName}</p>}
        <h1 className="cat-cover-title">Catalogue de formations</h1>
        <p className="cat-cover-year">{year}</p>

        {items.length > 0 && (
          <div className="cat-toc">
            <p className="cat-toc-title">Nos formations</p>
            <ol>
              {items.map((it) => (
                <li key={it.formationId}>{it.title}</li>
              ))}
            </ol>
          </div>
        )}
      </section>

      {/* Une formation par page */}
      {items.map((it) => (
        <div className="cat-formation" key={it.formationId}>
          <ProgrammeDocument programme={it.programme} />
        </div>
      ))}
    </div>
  );
}

const CATALOGUE_CSS = `
.cat-doc { color: #0f172a; background: #fff; }

/* Page de garde */
.cat-cover {
  min-height: 88vh;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  text-align: center; padding: 56px 48px;
  page-break-after: always;
}
.cat-cover-logo { max-height: 130px; max-width: 300px; object-fit: contain; margin-bottom: 36px; }
.cat-cover-kicker { text-transform: uppercase; letter-spacing: 2.5px; color: #64748b; font-size: 13px; font-weight: 600; }
.cat-cover-title { font-size: 42px; font-weight: 800; letter-spacing: -0.5px; color: #0f172a; margin: 14px 0 6px; }
.cat-cover-year { color: #64748b; font-size: 15px; }
.cat-toc { margin-top: 52px; text-align: left; min-width: 320px; max-width: 520px; width: 100%; }
.cat-toc-title { text-transform: uppercase; letter-spacing: 1.5px; font-size: 11px; font-weight: 700; color: #94a3b8; margin: 0 0 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
.cat-toc ol { margin: 0; padding: 0; list-style: none; counter-reset: toc; }
.cat-toc li { counter-increment: toc; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #1e293b; }
.cat-toc li::before { content: counter(toc, decimal-leading-zero) '  ·  '; color: #94a3b8; font-variant-numeric: tabular-nums; font-weight: 600; }

/* Chaque formation démarre sur une nouvelle page */
.cat-formation { page-break-before: always; }

/* En-tête courant : masqué à l'écran, visible en haut de chaque page à l'impression */
.cat-running { display: none; }

@media print {
  .cat-cover { min-height: 244mm; }
  .cat-running { display: block; position: fixed; top: 6mm; right: 12mm; z-index: 50; }
  .cat-running img { height: 11mm; max-width: 46mm; object-fit: contain; }
  @page { margin: 20mm 10mm 12mm; }
}
`;
