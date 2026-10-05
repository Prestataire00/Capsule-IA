// ARCHETYPE: shared
// Le programme tel que le formateur le voit : tout le contenu pédagogique,
// rien de ce que l'organisme facture. Un programme personnalisé peut porter un
// badge « € », une ligne « Tarif » ou une section entière sur les prix — saisis
// à la main dans l'éditeur, donc impossibles à exclure à la source. Pur.

import type { Programme, ProgrammeSection } from './types';

const LIBELLE_ARGENT = /\b(tarifs?|prix|co[uû]ts?|montants?|financements?|frais|devis|honoraires?)\b/i;
const VALEUR_ARGENT = /€|\beuros?\b|\bHT\b|\bTTC\b/i;

function filtrerSection(section: ProgrammeSection): ProgrammeSection | null {
  if (LIBELLE_ARGENT.test(section.title)) return null;
  switch (section.type) {
    case 'keyvalue': {
      const rows = section.rows.filter((r) => !LIBELLE_ARGENT.test(r.label) && !VALEUR_ARGENT.test(r.value));
      return rows.length > 0 ? { ...section, rows } : null;
    }
    case 'bullets': {
      // Un objectif peut parler de « réduire les coûts » : seul un montant trahit un prix.
      const items = section.items.filter((i) => !VALEUR_ARGENT.test(i));
      return items.length > 0 ? { ...section, items } : null;
    }
    case 'richtext': {
      const html = section.html.replace(/<(p|li)\b[^>]*>[\s\S]*?<\/\1>/gi, (bloc) =>
        VALEUR_ARGENT.test(bloc.replace(/<[^>]+>/g, '')) ? '' : bloc,
      );
      return { ...section, html };
    }
    default:
      return section;
  }
}

export function programmeSansTarif(programme: Programme): Programme {
  return {
    ...programme,
    header: {
      ...programme.header,
      metaItems: programme.header.metaItems.filter((m) => m.icon !== 'euro' && !VALEUR_ARGENT.test(m.text)),
    },
    sections: programme.sections
      .map(filtrerSection)
      .filter((s): s is ProgrammeSection => s !== null),
  };
}
