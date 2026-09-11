/**
 * Tableau de bord d'une session, en quatre temps : configurer, gérer, ouvrir
 * l'espace apprenant, suivre. Chaque étape se lit sur ce que Capsule a
 * réellement produit (documents générés, e-mails partis, questionnaires
 * complétés…), jamais sur une case cochée à la main. Pur : les faits sont
 * chargés ailleurs.
 */
export type BoardFacts = {
  readonly formationId: string | null;
  readonly hasPlace: boolean;
  readonly trainerAssigned: boolean;
  readonly learners: number;
  readonly conventions: number;
  readonly convocations: number;
  readonly sheets: number;
  readonly sheetsFinalized: number;
  readonly access: number;
  readonly positionnement: number;
  readonly evaluation: number;
  readonly satisfaction: number;
  readonly attestations: number;
  readonly invoiced: number;
  readonly qualiopiReady: number;
};

export type StepState = 'fait' | 'en_cours' | 'a_faire';

export type BoardStep = {
  readonly key: string;
  readonly label: string;
  readonly done: number;
  readonly total: number;
  readonly state: StepState;
  /** Étape comptée (par apprenant, par feuille) plutôt que oui/non. */
  readonly compte: boolean;
  readonly href?: string;
};

export type BoardColumn = { readonly title: string; readonly steps: readonly BoardStep[] };

export function stepState(done: number, total: number): StepState {
  if (total > 0 && done >= total) return 'fait';
  return done > 0 ? 'en_cours' : 'a_faire';
}

const etape = (key: string, label: string, done: number, total: number, href?: string): BoardStep => ({
  key,
  label,
  done: Math.min(done, total),
  total,
  state: stepState(done, total),
  compte: true,
  ...(href ? { href } : {}),
});

const ouiNon = (key: string, label: string, ok: boolean, href?: string): BoardStep => ({
  ...etape(key, label, ok ? 1 : 0, 1, href),
  compte: false,
});

export function buildBoard(f: BoardFacts, base: string): BoardColumn[] {
  const n = f.learners;
  return [
    {
      title: 'Configuration',
      steps: [
        ouiNon('formation', 'Formation rattachée', f.formationId !== null, f.formationId ? `/formations/${f.formationId}` : undefined),
        ouiNon('lieu', 'Lieu ou lien de visio', f.hasPlace),
        ouiNon('formateur', 'Formateur affecté', f.trainerAssigned),
        ouiNon('apprenants', 'Apprenants inscrits', n > 0, `${base}/apprenants`),
      ],
    },
    {
      title: 'Gestion',
      steps: [
        etape('conventions', 'Conventions générées', f.conventions, n, `${base}/documents`),
        etape('convocations', 'Convocations envoyées', f.convocations, n, `${base}/documents`),
        etape('emargement', 'Émargements finalisés', f.sheetsFinalized, f.sheets, `${base}/emargements`),
      ],
    },
    {
      title: 'Espace apprenant',
      steps: [
        etape('acces', 'Accès envoyés', f.access, n, `${base}/acces`),
        etape('positionnement', 'Positionnement complété', f.positionnement, n, `${base}/questionnaires`),
        etape('evaluation', 'Évaluation des acquis complétée', f.evaluation, n, `${base}/questionnaires`),
      ],
    },
    {
      title: 'Suivi',
      steps: [
        etape('satisfaction', 'Satisfaction recueillie', f.satisfaction, n, `${base}/questionnaires`),
        etape('attestations', 'Attestations délivrées', f.attestations, n, `${base}/documents`),
        etape('facturation', 'Apprenants facturés', f.invoiced, n, `${base}/facturation`),
        etape('qualiopi', 'Dossiers conformes Qualiopi', f.qualiopiReady, n, `${base}/qualiopi`),
      ],
    },
  ];
}
