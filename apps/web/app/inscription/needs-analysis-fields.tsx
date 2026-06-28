'use client';

// Champs de la fiche besoin (analyse des besoins), réutilisés dans le parcours
// individuel et pour chaque salarié du parcours entreprise.

export type NeedsValue = {
  currentLevel: number;
  objectives: string;
  expectations: string;
  constraints: string;
  accommodations: string;
  // Réponse à la question spécifique selon la typologie (salarié, demandeur…).
  typologyContext: string;
};

export const emptyNeeds = (): NeedsValue => ({
  currentLevel: 1,
  objectives: '',
  expectations: '',
  constraints: '',
  accommodations: '',
  typologyContext: '',
});

// Question spécifique à poser selon la situation de la personne qui s'inscrit.
const TYPOLOGY_QUESTION: Record<string, { label: string; placeholder: string }> = {
  salarie: {
    label: 'Poste actuel et accord de votre employeur',
    placeholder: 'Votre poste, et si votre employeur a validé / finance la formation…',
  },
  demandeur: {
    label: 'Votre projet professionnel / accompagnement France Travail',
    placeholder: 'Objectif de retour à l’emploi, conseiller France Travail, projet de reconversion…',
  },
  independant: {
    label: 'Votre activité et vos objectifs de développement',
    placeholder: 'Secteur d’activité, ce que la formation doit vous apporter pour votre activité…',
  },
  particulier: {
    label: 'Votre projet personnel et vos motivations',
    placeholder: 'Ce qui vous motive, le projet personnel derrière cette formation…',
  },
};

const LEVELS = [
  { v: 1, l: 'Débutant' },
  { v: 2, l: 'Bases' },
  { v: 3, l: 'Intermédiaire' },
  { v: 4, l: 'Avancé' },
  { v: 5, l: 'Expert' },
] as const;

const inputCls =
  'w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-violet-300 dark:focus:border-violet-700';

export function NeedsAnalysisFields({
  value,
  onChange,
  compact = false,
  typology,
}: {
  value: NeedsValue;
  onChange: (v: NeedsValue) => void;
  compact?: boolean;
  typology?: string;
}) {
  const update = <K extends keyof NeedsValue>(k: K, v: NeedsValue[K]) =>
    onChange({ ...value, [k]: v });
  const typoQuestion = typology ? TYPOLOGY_QUESTION[typology] : undefined;

  return (
    <div className={compact ? 'space-y-3' : 'space-y-5'}>
      <div>
        <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 block mb-2">
          Niveau actuel sur le sujet de la formation
        </span>
        <div className="grid grid-cols-5 gap-1.5">
          {LEVELS.map((opt) => (
            <label
              key={opt.v}
              className={
                value.currentLevel === opt.v
                  ? 'border border-violet-600 bg-violet-600 text-white rounded-md px-2 py-2 text-[11px] text-center cursor-pointer'
                  : 'border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-md px-2 py-2 text-[11px] text-center cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900'
              }
            >
              <input
                type="radio"
                checked={value.currentLevel === opt.v}
                onChange={() => update('currentLevel', opt.v)}
                className="sr-only"
              />
              {opt.l}
            </label>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 block mb-1.5">
          Objectifs pour cette formation <span className="text-rose-500">*</span>
        </span>
        <textarea
          value={value.objectives}
          onChange={(e) => update('objectives', e.target.value)}
          rows={compact ? 2 : 3}
          placeholder="Ce que vous souhaitez savoir faire à l'issue de la formation…"
          className={inputCls}
        />
      </label>

      <label className="block">
        <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 block mb-1.5">
          Attentes particulières
        </span>
        <textarea
          value={value.expectations}
          onChange={(e) => update('expectations', e.target.value)}
          rows={2}
          placeholder="Thèmes prioritaires, applications concrètes attendues…"
          className={inputCls}
        />
      </label>

      <label className="block">
        <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 block mb-1.5">
          Contraintes éventuelles
        </span>
        <textarea
          value={value.constraints}
          onChange={(e) => update('constraints', e.target.value)}
          rows={2}
          placeholder="Disponibilités, organisation…"
          className={inputCls}
        />
      </label>

      <label className="block">
        <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 block mb-1.5">
          Besoin d&apos;aménagement (situation de handicap)
        </span>
        <textarea
          value={value.accommodations}
          onChange={(e) => update('accommodations', e.target.value)}
          rows={2}
          placeholder="Tout besoin d'adaptation — nous restons à votre écoute."
          className={inputCls}
        />
      </label>

      {typoQuestion && (
        <label className="block">
          <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 block mb-1.5">
            {typoQuestion.label}
          </span>
          <textarea
            value={value.typologyContext}
            onChange={(e) => update('typologyContext', e.target.value)}
            rows={2}
            placeholder={typoQuestion.placeholder}
            className={inputCls}
          />
        </label>
      )}
    </div>
  );
}
