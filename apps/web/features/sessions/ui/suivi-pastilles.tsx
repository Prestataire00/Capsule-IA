'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { ArrowUpRight, Check, Clock, Copy, Loader2, Minus, PenLine, Send } from 'lucide-react';
import { envoyerQuestionnaireApprenant } from '@/app/(dashboard)/dossiers/[id]/questionnaires/actions';
import { QUESTIONNAIRE_LABELS, type EtatQuestionnaire, type QuestionnaireSuivi } from '../suivi-stagiaire';
import type { SuiviStagiaire } from '../suivi-stagiaires';

const TON: Record<EtatQuestionnaire, string> = {
  rempli: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  envoye: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  aucun: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
};

const AIDE: Record<EtatQuestionnaire, string> = { rempli: 'rempli', envoye: 'envoyé, sans réponse', aucun: 'pas encore envoyé' };

const ERREUR: Record<string, string> = {
  pas_du_dossier: 'Cette personne n’est pas stagiaire du dossier.',
  modele_introuvable: 'Ce questionnaire ne s’adresse pas aux apprenants.',
  deja_repondu: 'Déjà répondu.',
  adresse_publique_absente: 'Lien impossible : adresse publique absente.',
  creation_impossible: 'L’envoi a échoué. Réessayez.',
  dossier_not_found: 'Dossier introuvable.',
};

const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Le suivi d'un stagiaire en pastilles : vert fait, ambre en attente, gris
 * rien. Un clic déplie le questionnaire : voir la réponse, ou l'envoyer /
 * le renvoyer d'ici (demande d'Ismael, 2026-10-08).
 */
export function SuiviPastilles({
  suivi,
  avecAcquis,
  learnerId,
  nom,
  modeles,
  gerer,
}: {
  suivi: SuiviStagiaire;
  avecAcquis: boolean;
  learnerId: string;
  nom: string;
  modeles: Record<QuestionnaireSuivi, string | null>;
  gerer: boolean;
}) {
  const router = useRouter();
  const { executeAsync } = useAction(envoyerQuestionnaireApprenant);
  const [ouvert, setOuvert] = useState<QuestionnaireSuivi | null>(null);
  const [pending, start] = useTransition();
  const [retour, setRetour] = useState<{ ok: boolean; texte: string; lien?: string } | null>(null);
  const [copie, setCopie] = useState(false);
  const { attendues, signees } = suivi.emargement;
  const tonEmargement =
    attendues === 0 ? TON.aucun : signees === attendues ? TON.rempli : signees === 0 ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' : TON.envoye;
  const kinds: QuestionnaireSuivi[] = ['positionnement', ...(avecAcquis ? (['evaluation_acquis'] as const) : []), 'satisfaction_chaud', 'satisfaction_froid'];

  const envoyer = (k: QuestionnaireSuivi, templateId: string) =>
    start(async () => {
      setRetour(null);
      setCopie(false);
      if (!suivi.dossierId) return;
      const res = await executeAsync({ dossierId: suivi.dossierId, learnerId, templateId });
      const r = res?.data;
      if (r?.ok) {
        setRetour({
          ok: true,
          texte: r.envoye ? `${QUESTIONNAIRE_LABELS[k]} envoyé à ${r.email}.` : r.email ? 'L’e-mail n’est pas parti : transmettez le lien.' : `${nom} n’a pas d’adresse : transmettez ce lien.`,
          lien: r.lien,
        });
        router.refresh();
      } else {
        const code = r && !r.ok ? r.error : undefined;
        setRetour({ ok: false, texte: (code ? ERREUR[code] : null) ?? 'L’envoi a échoué.' });
      }
    });

  const detail = ouvert ? suivi.details[ouvert] : null;
  const etatOuvert = ouvert ? suivi.questionnaires[ouvert] : null;
  const modele = ouvert ? (detail?.templateId ?? modeles[ouvert]) : null;

  return (
    <span className="block mt-1.5">
      <span className="flex flex-wrap items-center gap-1.5">
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
            <button
              type="button"
              key={k}
              onClick={() => {
                setOuvert(ouvert === k ? null : k);
                setRetour(null);
              }}
              aria-expanded={ouvert === k}
              className={`inline-flex items-center gap-1 h-5 px-1.5 rounded text-[11px] font-medium transition hover:ring-1 hover:ring-current ${TON[etat]} ${ouvert === k ? 'ring-1 ring-current' : ''}`}
              title={`${QUESTIONNAIRE_LABELS[k]} : ${AIDE[etat]} — cliquer pour voir ou envoyer`}
            >
              <Icone className="w-3 h-3" />
              {QUESTIONNAIRE_LABELS[k]}
              {k === 'positionnement' && suivi.positionnement && (
                <span className="tabular-nums font-semibold" title="Score du test de positionnement">
                  {' · '}
                  {suivi.positionnement.libelle}
                </span>
              )}
            </button>
          );
        })}
      </span>

      {ouvert && (
        <span className="mt-2 block rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/60 px-3 py-2.5 space-y-2">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-medium text-zinc-900 dark:text-zinc-100">{QUESTIONNAIRE_LABELS[ouvert]}</span>
            <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
              {etatOuvert === 'rempli'
                ? `Répondu${detail?.reponduLe ? ` le ${jour.format(new Date(detail.reponduLe))}` : ''}`
                : etatOuvert === 'envoye'
                  ? 'Envoyé, pas encore de réponse'
                  : 'Pas encore envoyé'}
            </span>
            <span className="ml-auto flex items-center gap-2">
              {detail?.reponseId && (
                <Link
                  href={`/questionnaires/reponse/${detail.reponseId}`}
                  className="h-7 px-2.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[12px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1"
                >
                  Voir la réponse <ArrowUpRight className="w-3 h-3" aria-hidden />
                </Link>
              )}
              {gerer && etatOuvert !== 'rempli' && suivi.dossierId && modele && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => envoyer(ouvert, modele)}
                  className="h-7 px-2.5 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[12px] font-medium inline-flex items-center gap-1 disabled:opacity-50"
                >
                  {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  {etatOuvert === 'envoye' ? 'Renvoyer' : 'Envoyer'}
                </button>
              )}
            </span>
          </span>
          {etatOuvert !== 'rempli' && (!suivi.dossierId || !modele) && (
            <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
              {!suivi.dossierId ? 'Inscrit sans dossier : passez par le QR projeté de la séance.' : 'Aucun questionnaire de ce type à envoyer.'}
            </span>
          )}
          {retour && (
            <span className="block space-y-1.5">
              <span className={`block text-[12px] ${retour.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{retour.texte}</span>
              {retour.lien && (
                <span className="flex items-center gap-2">
                  <input
                    readOnly
                    value={retour.lien}
                    aria-label="Lien du questionnaire"
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-7 flex-1 min-w-0 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 text-[11px] text-zinc-500"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(retour.lien ?? '');
                      setCopie(true);
                    }}
                    className="h-7 px-2 rounded-md border border-zinc-200 dark:border-zinc-700 text-[11px] inline-flex items-center gap-1"
                  >
                    {copie ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copie ? 'Copié' : 'Copier'}
                  </button>
                </span>
              )}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
