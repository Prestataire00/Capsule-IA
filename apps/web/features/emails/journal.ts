// Le journal des e-mails partis, lisible d'un coup d'œil : ce qui est parti,
// par quel envoi, et ce qu'il en est advenu. Module pur, sans accès aux données.

import { ENVOIS_AUTOMATIQUES, PREFIXE_PROGRAMMATION } from './envois-automatiques';

export type LigneJournal = {
  readonly id: string;
  readonly kind: string | null;
  readonly recipient: string;
  readonly subject: string | null;
  readonly status: string | null;
  readonly sentAt: string;
  readonly deliveredAt: string | null;
  readonly openedAt: string | null;
  readonly clickedAt: string | null;
  readonly bouncedAt: string | null;
  readonly openCount: number | null;
  readonly dossierId: string | null;
  readonly providerId: string | null;
};

/** Les envois manuels ou internes, absents du catalogue des envois automatiques. */
const AUTRES: Record<string, string> = {
  convocation_modifiee: 'Convocation mise à jour',
  document_email: 'Document envoyé',
  document_signe: 'Document signé',
  signature_request: 'Demande de signature',
  devis: 'Devis',
  invoice_sent: 'Facture',
  invoice_reminder: 'Relance de facture',
  relance_questionnaire: 'Relance de questionnaire',
  questionnaire_entreprise: 'Questionnaire entreprise',
  questionnaire_financeur: 'Questionnaire financeur',
  questionnaire_invitation: 'Questionnaire du formateur',
  positionnement: 'Fiche de positionnement',
  discussion_mention: 'Mention dans une discussion',
  message_direct: 'Message direct',
  session_meet_link: 'Lien de visio',
  espace_entreprise: 'Accès à l’espace entreprise',
  password_reset: 'Mot de passe',
  confirmation_preinscription: 'Confirmation de pré-inscription',
  contenu_a_valider: 'Contenu de cours à valider',
  cours_stagiaires: 'Cours annoncé à l’entreprise',
  emargement_entreprise: 'Feuilles d’émargement à l’entreprise',
  feuille_emargement_signee: 'Feuille d’émargement signée',
  proposition: 'Proposition commerciale',
  proposition_acceptee: 'Proposition acceptée',
  proposition_generee: 'Proposition générée',
  trainer_contract: 'Contrat formateur',
  reclamation_entreprise: 'Réclamation',
  fiche_besoin_demande: 'Demande de fiche besoin',
  test: 'Test d’envoi',
};

const CATALOGUE = new Map(ENVOIS_AUTOMATIQUES.map((e) => [e.kind, e.nom]));

/** « Convocation J-7 », « Évaluations de fin »… ; à défaut, le code rendu lisible. */
export function libelleEnvoi(kind: string | null): string {
  if (!kind) return 'Autre';
  if (kind.startsWith(PREFIXE_PROGRAMMATION)) return 'Envoi programmé';
  const connu = CATALOGUE.get(kind) ?? AUTRES[kind];
  if (connu) return connu;
  const texte = kind.replace(/[_.]+/g, ' ').trim();
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

export type Etat = 'echec' | 'rejete' | 'clique' | 'lu' | 'delivre' | 'envoye' | 'en_cours';

export const ETATS: ReadonlyArray<{ cle: Etat; libelle: string; ton: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = [
  { cle: 'echec', libelle: 'Non parti', ton: 'danger' },
  { cle: 'rejete', libelle: 'Adresse rejetée', ton: 'danger' },
  { cle: 'clique', libelle: 'Lien ouvert', ton: 'success' },
  { cle: 'lu', libelle: 'Lu', ton: 'success' },
  { cle: 'delivre', libelle: 'Délivré', ton: 'info' },
  { cle: 'envoye', libelle: 'Envoyé', ton: 'neutral' },
  { cle: 'en_cours', libelle: 'En cours d’envoi', ton: 'neutral' },
];

/** Ce que l'on sait de l'e-mail, du plus parlant au moins parlant. Un rejet l'emporte sur tout. */
export function etatDe(l: Pick<LigneJournal, 'status' | 'bouncedAt' | 'clickedAt' | 'openedAt' | 'deliveredAt'>): Etat {
  if (l.status === 'failed') return 'echec';
  if (l.bouncedAt) return 'rejete';
  if (l.clickedAt) return 'clique';
  if (l.openedAt) return 'lu';
  if (l.deliveredAt) return 'delivre';
  if (l.status === 'pending') return 'en_cours';
  return 'envoye';
}

export const estParti = (e: Etat): boolean => e !== 'echec' && e !== 'en_cours';

const JOUR_PARIS = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' });

/** « 2026-10-07 » à l'heure de Paris. */
export const jourParis = (iso: string): string => JOUR_PARIS.format(new Date(iso));

export type Jour = { readonly jour: string; readonly partis: number; readonly echecs: number };

/** Une barre par jour de la période, jours vides compris : un creux se voit. */
export function serieParJour(lignes: readonly LigneJournal[], jours: number, maintenant: Date): Jour[] {
  const compte = new Map<string, { partis: number; echecs: number }>();
  for (const l of lignes) {
    const j = jourParis(l.sentAt);
    const c = compte.get(j) ?? { partis: 0, echecs: 0 };
    if (etatDe(l) === 'echec' || etatDe(l) === 'rejete') c.echecs += 1;
    else c.partis += 1;
    compte.set(j, c);
  }
  const out: Jour[] = [];
  for (let i = jours - 1; i >= 0; i -= 1) {
    const j = jourParis(new Date(maintenant.getTime() - i * 86_400_000).toISOString());
    if (out.some((x) => x.jour === j)) continue;
    const c = compte.get(j) ?? { partis: 0, echecs: 0 };
    out.push({ jour: j, ...c });
  }
  return out;
}

export type ParType = { readonly kind: string; readonly libelle: string; readonly total: number; readonly echecs: number };

/** Les envois les plus fréquents d'abord ; au-delà de `max`, regroupés sous « Autres ». */
export function repartitionParType(lignes: readonly LigneJournal[], max = 8): ParType[] {
  const compte = new Map<string, { total: number; echecs: number }>();
  for (const l of lignes) {
    const cle = l.kind?.startsWith(PREFIXE_PROGRAMMATION) ? PREFIXE_PROGRAMMATION : (l.kind ?? 'autre');
    const c = compte.get(cle) ?? { total: 0, echecs: 0 };
    c.total += 1;
    const e = etatDe(l);
    if (e === 'echec' || e === 'rejete') c.echecs += 1;
    compte.set(cle, c);
  }
  const tries = [...compte.entries()]
    .map(([kind, c]) => ({ kind, libelle: libelleEnvoi(kind === PREFIXE_PROGRAMMATION ? `${kind}x` : kind), ...c }))
    .sort((a, b) => b.total - a.total || a.libelle.localeCompare(b.libelle, 'fr'));
  if (tries.length <= max) return tries;
  const reste = tries.slice(max - 1);
  return [
    ...tries.slice(0, max - 1),
    { kind: '__autres', libelle: `Autres (${reste.length} types)`, total: reste.reduce((n, r) => n + r.total, 0), echecs: reste.reduce((n, r) => n + r.echecs, 0) },
  ];
}

export type Filtres = { readonly etat?: string; readonly type?: string; readonly q?: string };

const normaliser = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrer(lignes: readonly LigneJournal[], f: Filtres): LigneJournal[] {
  const q = f.q ? normaliser(f.q.trim()) : '';
  return lignes.filter((l) => {
    if (f.type && (f.type === PREFIXE_PROGRAMMATION ? !l.kind?.startsWith(PREFIXE_PROGRAMMATION) : l.kind !== f.type)) return false;
    if (f.etat === 'probleme') {
      const e = etatDe(l);
      if (e !== 'echec' && e !== 'rejete') return false;
    } else if (f.etat && etatDe(l) !== f.etat) return false;
    if (q && !normaliser(`${l.recipient} ${l.subject ?? ''} ${libelleEnvoi(l.kind)}`).includes(q)) return false;
    return true;
  });
}

export function chiffres(lignes: readonly LigneJournal[]): { partis: number; delivres: number; lus: number; problemes: number; tauxLecture: number | null } {
  let partis = 0;
  let delivres = 0;
  let lus = 0;
  let problemes = 0;
  for (const l of lignes) {
    const e = etatDe(l);
    if (e === 'echec' || e === 'rejete') problemes += 1;
    if (estParti(e) && e !== 'rejete') partis += 1;
    if (e === 'delivre' || e === 'lu' || e === 'clique') delivres += 1;
    if (e === 'lu' || e === 'clique') lus += 1;
  }
  return { partis, delivres, lus, problemes, tauxLecture: partis === 0 ? null : Math.round((lus / partis) * 100) };
}
