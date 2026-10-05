import { COULEUR_TONS, surligner } from '../annotations';
import type { Annotation } from '../annotations-store';

/** Un texte dont les passages annotés sont surlignés dans leur couleur. */
export function TexteAnnote({ texte, annotations }: { texte: string; annotations: readonly Annotation[] }) {
  const extraits = annotations
    .filter((a) => a.extrait && !a.resolvedAt)
    .map((a) => ({ extrait: a.extrait!, couleur: a.couleur }));
  return (
    <>
      {surligner(texte, extraits).map((s, i) =>
        s.couleur ? (
          <mark key={i} className={`rounded px-0.5 text-inherit ${COULEUR_TONS[s.couleur].surligne}`}>
            {s.texte}
          </mark>
        ) : (
          <span key={i}>{s.texte}</span>
        ),
      )}
    </>
  );
}
