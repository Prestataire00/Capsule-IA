// Module pur (pas de server-only) : construit le prompt ancré sur les extraits
// légaux officiels. Testable sans réseau ni clé.
import type { LegalKind } from '@/shared/lib/legifrance/mapping';

export type LegalSource = { ref: string; texte: string };
export type OrgInfo = {
  name: string;
  legalName?: string | null;
  siret?: string | null;
  nda?: string | null;
  /** Agréments et habilitations (CNAPS…), affichés sur tous les documents. */
  certifications?: string | null;
  address?: string | null;
  representative?: string | null;
  representativeTitle?: string | null;
  email?: string | null;
  phone?: string | null;
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
    `## Identité de l'organisme (à reprendre telle quelle dans l'en-tête du document)`,
    `Organisme : ${org.legalName || org.name}.`,
    org.siret ? `SIRET : ${org.siret}.` : '',
    org.nda ? `N° de déclaration d'activité : ${org.nda}.` : '',
    org.certifications ? `Agréments : ${org.certifications}.` : '',
    org.address ? `Adresse : ${org.address}.` : '',
    org.representative
      ? `Représentant légal : ${org.representative}${org.representativeTitle ? `, ${org.representativeTitle}` : ''}.`
      : '',
    org.email || org.phone ? `Contact : ${[org.email, org.phone].filter(Boolean).join(' — ')}.` : '',
    '',
    `Renseigne l'identité ci-dessus dans l'en-tête et dans le corps du document (aux endroits qui citent l'organisme), en reprenant EXACTEMENT ces valeurs. Ne laisse un champ vide ou marqué [À COMPLÉTER PAR L'OF : …] que si l'information n'est PAS fournie ci-dessus.`,
    '',
    `Tu dois t'appuyer UNIQUEMENT sur les extraits légaux officiels ci-dessous.`,
    `N'invente AUCUN article ni référence. Cite les numéros d'articles tels que fournis.`,
    `Signale entre crochets [À COMPLÉTER PAR L'OF : …] tout élément manquant NON fourni ci-dessus.`,
    `Rends le document en Markdown structuré (titres, articles numérotés).`,
    '',
    `## Extraits légaux officiels (Légifrance)`,
    extraits,
  ]
    .filter(Boolean)
    .join('\n');
}
