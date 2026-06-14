// Module pur (pas de server-only) : construit le prompt ancré sur les extraits
// légaux officiels. Testable sans réseau ni clé.
import type { LegalKind } from '@/shared/lib/legifrance/mapping';

export type LegalSource = { ref: string; texte: string };
export type OrgInfo = {
  name: string;
  nda?: string | null;
  address?: string | null;
  representative?: string | null;
};

const KIND_LABEL: Record<LegalKind, string> = {
  reglement_interieur: 'règlement intérieur des stagiaires',
  cgv: 'conditions générales de vente (CGV)',
  livret_accueil: "livret d'accueil du stagiaire",
};

// Claude rédige UNIQUEMENT à partir des extraits fournis (anti-hallucination).
export function buildLegalPrompt(kind: LegalKind, org: OrgInfo, sources: LegalSource[]): string {
  const extraits = sources.map((s) => `### Article ${s.ref}\n${s.texte}`).join('\n\n');
  return [
    `Tu rédiges le ${KIND_LABEL[kind]} d'un organisme de formation français, conforme Qualiopi.`,
    `Organisme : ${org.name}${org.nda ? ` (déclaration d'activité ${org.nda})` : ''}.`,
    org.address ? `Adresse : ${org.address}.` : '',
    org.representative ? `Représentant : ${org.representative}.` : '',
    '',
    `Tu dois t'appuyer UNIQUEMENT sur les extraits légaux officiels ci-dessous.`,
    `N'invente AUCUN article ni référence. Cite les numéros d'articles tels que fournis.`,
    `Signale entre crochets [À COMPLÉTER PAR L'OF : …] tout élément manquant.`,
    `Rends le document en Markdown structuré (titres, articles numérotés).`,
    '',
    `## Extraits légaux officiels (Légifrance)`,
    extraits,
  ]
    .filter(Boolean)
    .join('\n');
}
