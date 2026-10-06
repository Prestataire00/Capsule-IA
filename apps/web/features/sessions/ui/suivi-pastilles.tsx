import { Check, Clock, Minus, PenLine } from 'lucide-react';
import { QUESTIONNAIRE_LABELS, type EtatQuestionnaire, type QuestionnaireSuivi } from '../suivi-stagiaire';
import type { SuiviStagiaire } from '../suivi-stagiaires';

const TON: Record<EtatQuestionnaire, string> = {
  rempli: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  envoye: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  aucun: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
};

const AIDE: Record<EtatQuestionnaire, string> = { rempli: 'rempli', envoye: 'envoyé, sans réponse', aucun: 'pas encore envoyé' };

/** Le suivi d'un stagiaire en pastilles : vert fait, ambre en attente, gris rien. */
export function SuiviPastilles({ suivi, avecAcquis }: { suivi: SuiviStagiaire; avecAcquis: boolean }) {
  const { attendues, signees } = suivi.emargement;
  const tonEmargement =
    attendues === 0 ? TON.aucun : signees === attendues ? TON.rempli : signees === 0 ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' : TON.envoye;
  const kinds: QuestionnaireSuivi[] = ['positionnement', ...(avecAcquis ? (['evaluation_acquis'] as const) : []), 'satisfaction_chaud', 'satisfaction_froid'];

  return (
    <span className="flex flex-wrap items-center gap-1.5 mt-1.5">
      <span
        className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-medium tabular-nums ${tonEmargement}`}
        title={attendues === 0 ? 'Aucune demi-journée encore ouverte' : `${signees} demi-journée(s) émargée(s) sur ${attendues}`}
      >
        <PenLine className="w-3 h-3" />
        {attendues === 0 ? 'Émargement à venir' : `Émargé ${signees}/${attendues}`}
      </span>
      {kinds.map((k) => {
        const etat = suivi.questionnaires[k];
        const Icone = etat === 'rempli' ? Check : etat === 'envoye' ? Clock : Minus;
        return (
          <span
            key={k}
            className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-medium ${TON[etat]}`}
            title={`${QUESTIONNAIRE_LABELS[k]} : ${AIDE[etat]}`}
          >
            <Icone className="w-3 h-3" />
            {QUESTIONNAIRE_LABELS[k]}
            {k === 'positionnement' && suivi.positionnement && (
              <span className="tabular-nums font-semibold" title="Score du test de positionnement">
                {' · '}
                {suivi.positionnement.libelle}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
