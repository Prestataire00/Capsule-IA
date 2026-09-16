/**
 * Quiz auto-corrigé (0171). Module pur : la même correction doit valoir au
 * moment du rendu, à la relecture par le formateur et dans l'espace apprenant.
 *
 * Une question est juste ou fausse, sans demi-point : cocher deux bonnes
 * réponses sur trois ne vaut pas les deux tiers des points. C'est plus sévère,
 * mais c'est surtout explicable à un stagiaire qui conteste sa note — et un
 * barème partiel inventé ici serait indéfendable devant un audit.
 */

export type QuestionQuiz = {
  readonly id: string;
  readonly enonce: string;
  readonly choix: readonly string[];
  /** Index des bonnes réponses dans `choix`. Plusieurs = question à cocher. */
  readonly bonnes: readonly number[];
  readonly points: number;
};

/** Réponses d'un stagiaire : index cochés, par identifiant de question. */
export type ReponsesQuiz = Readonly<Record<string, readonly number[]>>;

export type CorrectionQuestion = {
  readonly questionId: string;
  readonly juste: boolean;
  readonly points: number;
  readonly pointsObtenus: number;
  readonly repondu: boolean;
};

export type Correction = {
  readonly note: number;
  readonly bareme: number;
  /** Pourcentage arrondi à l'entier, 0 si le barème est nul. */
  readonly pourcentage: number;
  readonly reussi: boolean | null;
  readonly parQuestion: readonly CorrectionQuestion[];
};

export const POINTS_PAR_DEFAUT = 1;
export const MAX_QUESTIONS = 50;
export const MAX_CHOIX = 10;

/**
 * Dédoublonner AVANT de comparer : une case cochée deux fois (double-clic,
 * envoi rejoué) désigne la même réponse, pas une réponse de plus.
 */
const memeEnsemble = (a: readonly number[], b: readonly number[]): boolean => {
  const gauche = [...new Set(a)].sort((x, y) => x - y);
  const droite = [...new Set(b)].sort((x, y) => x - y);
  return gauche.length === droite.length && gauche.every((v, i) => v === droite[i]);
};

export function baremeTotal(questions: readonly QuestionQuiz[]): number {
  return questions.reduce((total, q) => total + Math.max(0, q.points), 0);
}

/**
 * @param seuilReussite pourcentage à atteindre. `null` : aucun seuil, et
 * `reussi` vaut alors `null` plutôt que `false` — ne pas avoir de seuil n'est
 * pas un échec.
 */
export function corrigerQuiz(
  questions: readonly QuestionQuiz[],
  reponses: ReponsesQuiz,
  seuilReussite: number | null = null,
): Correction {
  const parQuestion = questions.map<CorrectionQuestion>((q) => {
    const cochees = reponses[q.id] ?? [];
    const points = Math.max(0, q.points);
    // Une question sans bonne réponse déclarée ne peut être « juste » : elle
    // vaut zéro pour tout le monde, plutôt que zéro pour les seuls répondants.
    const juste = q.bonnes.length > 0 && memeEnsemble(cochees, q.bonnes);
    return {
      questionId: q.id,
      juste,
      points,
      pointsObtenus: juste ? points : 0,
      repondu: cochees.length > 0,
    };
  });

  const bareme = parQuestion.reduce((t, c) => t + c.points, 0);
  const note = parQuestion.reduce((t, c) => t + c.pointsObtenus, 0);
  const pourcentage = bareme > 0 ? Math.round((note / bareme) * 100) : 0;

  return {
    note,
    bareme,
    pourcentage,
    reussi: seuilReussite === null ? null : pourcentage >= seuilReussite,
    parQuestion,
  };
}

export type ProblemeQuiz = { readonly question: number | null; readonly motif: string };

/**
 * Ce qui empêche de publier un quiz. Le formateur le lit avant l'apprenant :
 * une question sans bonne réponse ne se découvre pas à la correction.
 */
export function problemesDuQuiz(questions: readonly QuestionQuiz[]): ProblemeQuiz[] {
  const problemes: ProblemeQuiz[] = [];

  if (questions.length === 0) {
    problemes.push({ question: null, motif: 'Un quiz a besoin d’au moins une question.' });
  }
  if (questions.length > MAX_QUESTIONS) {
    problemes.push({ question: null, motif: `${MAX_QUESTIONS} questions au maximum.` });
  }

  questions.forEach((q, i) => {
    const numero = i + 1;
    if (q.enonce.trim().length === 0) {
      problemes.push({ question: numero, motif: 'L’énoncé est vide.' });
    }
    const remplis = q.choix.filter((c) => c.trim().length > 0);
    if (remplis.length < 2) {
      problemes.push({ question: numero, motif: 'Il faut au moins deux réponses proposées.' });
    }
    if (q.choix.length > MAX_CHOIX) {
      problemes.push({ question: numero, motif: `${MAX_CHOIX} réponses au maximum.` });
    }
    if (q.bonnes.length === 0) {
      problemes.push({ question: numero, motif: 'Aucune bonne réponse n’est cochée.' });
    }
    if (q.bonnes.some((b) => b < 0 || b >= q.choix.length || q.choix[b]?.trim().length === 0)) {
      problemes.push({ question: numero, motif: 'Une bonne réponse désigne une proposition vide.' });
    }
    if (!Number.isFinite(q.points) || q.points <= 0) {
      problemes.push({ question: numero, motif: 'Le nombre de points doit être supérieur à zéro.' });
    }
  });

  return problemes;
}

/** Ce que l'apprenant reçoit : jamais les bonnes réponses avant d'avoir répondu. */
export type QuestionPourApprenant = Omit<QuestionQuiz, 'bonnes'>;

export function sansLesReponses(questions: readonly QuestionQuiz[]): QuestionPourApprenant[] {
  return questions.map(({ id, enonce, choix, points }) => ({ id, enonce, choix, points }));
}
