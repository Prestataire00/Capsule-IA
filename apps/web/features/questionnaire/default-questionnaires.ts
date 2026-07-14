// Questionnaires Qualiopi par défaut — contenu repris à l'identique du référentiel
// Sosafe (positionnement, satisfaction chaud/froid, formateur, manager, financeur).
// Sert de base seedable ; l'organisme peut ensuite les personnaliser.
import type { Question, QuestionnaireSchema } from './schema';
import type { TemplateKind } from './template.schema';

export type DefaultQuestionnaire = {
  /** Code système unique (idempotence du seed). */
  code: string;
  kind: TemplateKind;
  title: string;
  thankYou: string;
  /** Délai d'envoi différé (jours) — évaluations à froid. 0 = immédiat. */
  delayDays: number;
  schema: QuestionnaireSchema;
};

const rating = (id: string, label: string, required = true): Question => ({
  id,
  type: 'rating',
  label,
  required,
  max: 5,
});
const text = (id: string, label: string, required = false): Question => ({ id, type: 'text', label, required });
const choice = (id: string, label: string, options: string[], required = true): Question => ({
  id,
  type: 'choice',
  label,
  required,
  options,
});

export const DEFAULT_QUESTIONNAIRES: DefaultQuestionnaire[] = [
  {
    code: 'sys_positionnement',
    kind: 'positionnement',
    title: 'Évaluation pré-formation (Positionnement)',
    thankYou: 'Merci, vos réponses nous permettront d’adapter la formation à vos besoins.',
    delayDays: 0,
    schema: {
      questions: [
        rating('q1', 'Comment évaluez-vous votre niveau de connaissances sur le sujet ?'),
        rating('q2', 'Êtes-vous à l’aise avec les pratiques liées à cette formation ?'),
        text('q3', 'Quelles sont vos attentes principales ?', true),
        choice('q4', 'Avez-vous déjà suivi une formation similaire ?', [
          'Non, jamais',
          'Oui, il y a plus de 2 ans',
          'Oui, récemment',
        ]),
        rating('q5', 'Évaluez votre capacité actuelle à mettre en pratique les compétences visées'),
      ],
    },
  },
  {
    code: 'sys_satisfaction_chaud',
    kind: 'satisfaction_chaud',
    title: 'Questionnaire de satisfaction à chaud',
    thankYou: 'Merci pour votre retour, il contribue à l’amélioration continue de nos formations.',
    delayDays: 0,
    schema: {
      questions: [
        rating('q1', 'La formation a-t-elle répondu à vos attentes ?'),
        rating('q2', 'Comment évaluez-vous la qualité pédagogique de la formation ?'),
        rating('q3', 'Comment évaluez-vous la qualité du/des formateur(s) ?'),
        rating('q4', 'Les supports pédagogiques étaient-ils adaptés ?'),
        rating('q5', 'L’organisation logistique était-elle satisfaisante ?'),
        rating('q6', 'Recommanderiez-vous cette formation à un(e) collègue ?'),
        text('q7', 'Qu’avez-vous le plus apprécié dans cette formation ?'),
        text('q8', 'Quels points pourraient être améliorés ?'),
      ],
    },
  },
  {
    code: 'sys_satisfaction_froid',
    kind: 'satisfaction_froid',
    title: 'Évaluation à froid (J+60)',
    thankYou: 'Merci, votre retour mesure l’impact réel de la formation sur votre pratique.',
    delayDays: 60,
    schema: {
      questions: [
        rating('q1', 'Avez-vous pu appliquer les connaissances acquises ?'),
        rating('q2', 'Quel impact la formation a-t-elle eu sur votre pratique professionnelle ?'),
        rating('q3', 'Vos compétences se sont-elles améliorées depuis la formation ?'),
        rating('q4', 'Recommanderiez-vous cette formation ?'),
        text('q5', 'Quels obstacles avez-vous rencontrés pour appliquer vos acquis ?'),
        rating('q6', 'Votre organisation vous a-t-elle soutenu dans l’application des acquis ?'),
      ],
    },
  },
  {
    code: 'sys_satisfaction_formateur',
    kind: 'satisfaction_formateur',
    title: 'Évaluation du formateur',
    thankYou: 'Merci pour votre évaluation.',
    delayDays: 0,
    schema: {
      questions: [
        rating('q1', 'Le formateur maîtrisait-il le sujet ?'),
        rating('q2', 'Le formateur était-il pédagogue et clair dans ses explications ?'),
        rating('q3', 'Le formateur a-t-il su animer et dynamiser le groupe ?'),
        rating('q4', 'Le formateur a-t-il été à l’écoute des participants ?'),
        rating('q5', 'Le rythme de la formation était-il adapté ?'),
        text('q6', 'Commentaires libres sur le formateur'),
      ],
    },
  },
  {
    code: 'sys_manager',
    kind: 'custom',
    title: 'Évaluation manager (N+1)',
    thankYou: 'Merci pour votre évaluation.',
    delayDays: 90,
    schema: {
      questions: [
        rating('q1', 'Avez-vous constaté une amélioration des compétences du collaborateur ?'),
        rating('q2', 'Le collaborateur applique-t-il les acquis de la formation ?'),
        rating('q3', 'La formation a-t-elle répondu aux besoins identifiés ?'),
        rating('q4', 'Quel impact sur la performance de l’équipe ?'),
        text('q5', 'Commentaires ou observations'),
      ],
    },
  },
  {
    code: 'sys_financeur',
    kind: 'opco',
    title: 'Évaluation financeur / commanditaire',
    thankYou: 'Merci pour votre retour.',
    delayDays: 0,
    schema: {
      questions: [
        rating('q1', 'La formation correspondait-elle au cahier des charges ?'),
        rating('q2', 'La qualité administrative (documents, réactivité) était-elle satisfaisante ?'),
        rating('q3', 'Êtes-vous satisfait du rapport qualité/prix ?'),
        rating('q4', 'Feriez-vous de nouveau appel à nos services ?'),
        text('q5', 'Commentaires ou suggestions'),
      ],
    },
  },
];
