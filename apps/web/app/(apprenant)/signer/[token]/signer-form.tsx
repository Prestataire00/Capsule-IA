'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, FileText, Loader2, MonitorCheck } from 'lucide-react';
import { InfoCallout } from '@/shared/ui/info-callout';
import { SignaturePad, type SignaturePadHandle } from '@/features/attendance/signature-pad';
import { attendanceErrorLabel } from '@/features/attendance/schemas';
import { signStep } from './actions';

export type SignerContext = {
  readonly signerFullName: string;
  readonly signerKind: 'learner' | 'trainer';
  readonly formationTitle: string;
  readonly reference: string | null;
  readonly halfDayLabel: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly modality: string;
  readonly organizationName: string;
};

type Moment = 'entry' | 'exit';
type Etat =
  | { nom: 'consentement' }
  | { nom: 'signature'; moment: Moment }
  | { nom: 'entree_faite'; heure: string; retard: string | null }
  | { nom: 'termine'; espaceUrl: string | null; depart: string | null };

const PARIS = 'Europe/Paris';
const heure = (iso: string) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: PARIS }).format(new Date(iso));
const jour = (iso: string) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: PARIS }).format(new Date(iso));

/**
 * Émargement en deux temps, repris de SoSafe : signature d'entrée, puis de
 * sortie avec le même lien. À distance, un bouton confirme la présence.
 */
export function SignerForm({
  token,
  context,
  initialStep,
  entrySignedAt,
}: {
  token: string;
  context: SignerContext;
  initialStep: Moment;
  entrySignedAt: string | null;
}) {
  const [etat, setEtat] = useState<Etat>(
    initialStep === 'exit' && entrySignedAt ? { nom: 'entree_faite', heure: heure(entrySignedAt), retard: null } : { nom: 'consentement' },
  );
  const [accepte, setAccepte] = useState(false);
  const [encre, setEncre] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const pad = useRef<SignaturePadHandle>(null);
  const visioPossible = context.modality === 'distanciel' || context.modality === 'hybride';
  const unSeulTemps = context.signerKind === 'trainer';

  // Après la sortie, l'apprenant rejoint son espace (5 secondes pour lire la confirmation).
  const espace = etat.nom === 'termine' ? etat.espaceUrl : null;
  useEffect(() => {
    if (!espace) return;
    const t = setTimeout(() => window.location.assign(espace), 5000);
    return () => clearTimeout(t);
  }, [espace]);

  const envoyer = async (moment: Moment, avecDessin: boolean) => {
    setErreur(null);
    const dataUrl = avecDessin ? pad.current?.toDataUrl() ?? null : null;
    if (avecDessin && !dataUrl) return;
    setEnvoi(true);
    const r = await signStep({ token, moment, dataUrl });
    setEnvoi(false);
    if (!r.ok) {
      setErreur(attendanceErrorLabel(r.error));
      return;
    }
    if (moment === 'entry' && !unSeulTemps) setEtat({ nom: 'entree_faite', heure: heure(r.signedAt), retard: r.lateArrival });
    else setEtat({ nom: 'termine', espaceUrl: r.espaceUrl, depart: r.earlyDeparture });
  };

  const entete = (
    <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg px-4 py-4 mb-5">
      <div className="flex items-center gap-3">
        <FileText className="w-5 h-5 text-zinc-500" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">{context.formationTitle}</p>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 capitalize">
            {jour(context.windowStart)} · {context.halfDayLabel} · {heure(context.windowStart)}–{heure(context.windowEnd)}
          </p>
        </div>
      </div>
      {!unSeulTemps && (
        <ol className="mt-3 grid grid-cols-2 gap-2 text-[12px]" aria-label="Étapes">
          {(['entry', 'exit'] as const).map((m, i) => {
            const fait = m === 'entry' ? etat.nom === 'entree_faite' || etat.nom === 'termine' : etat.nom === 'termine';
            const encours = (etat.nom === 'signature' && etat.moment === m) || (m === 'entry' && etat.nom === 'consentement');
            return (
              <li
                key={m}
                className={`rounded-md px-2.5 py-1.5 border ${
                  fait
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400'
                    : encours
                      ? 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300'
                      : 'border-zinc-200 text-zinc-500 dark:border-zinc-800'
                }`}
              >
                {fait && <Check className="inline w-3 h-3 mr-1" aria-hidden />}
                {i + 1}. {m === 'entry' ? 'Entrée' : 'Sortie'}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );

  if (etat.nom === 'termine') {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-[420px] text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Merci, c’est signé.</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
            {unSeulTemps ? 'Votre signature est enregistrée.' : 'Votre entrée et votre sortie sont enregistrées.'} Signatures horodatées par{' '}
            {context.organizationName}.
          </p>
          {etat.depart && <p className="text-[12px] text-amber-600 mt-2">Départ anticipé noté à {etat.depart}.</p>}
          {etat.espaceUrl && (
            <a
              href={etat.espaceUrl}
              className="mt-6 inline-flex bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-medium px-4 py-2.5 rounded-md"
            >
              Accéder à mon espace de formation
            </a>
          )}
          {etat.espaceUrl && <p className="text-[11px] text-zinc-400 mt-2">Ouverture automatique dans quelques secondes…</p>}
        </div>
      </div>
    );
  }

  if (etat.nom === 'entree_faite') {
    return (
      <div className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-[480px]">
          {entete}
          <InfoCallout tone="info" className="mb-5">
            Entrée enregistrée à <strong>{etat.heure}</strong>
            {etat.retard ? ` (arrivée notée à ${etat.retard})` : ''}. Revenez sur ce même lien à la fin de la demi-journée pour signer
            votre sortie.
          </InfoCallout>
          <button
            type="button"
            onClick={() => setEtat({ nom: 'signature', moment: 'exit' })}
            className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-medium px-4 py-3 rounded-md"
          >
            Signer ma sortie
          </button>
        </div>
      </div>
    );
  }

  if (etat.nom === 'signature') {
    const moment = etat.moment;
    return (
      <div className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-[480px]">
          {entete}
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {moment === 'entry' ? 'Signature d’entrée' : 'Signature de sortie'}
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1 mb-4">Signez avec votre doigt ou un stylet dans le cadre.</p>
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
            <SignaturePad ref={pad} onInk={setEncre} height={200} label={`Signature de ${context.signerFullName}`} />
          </div>
          <button type="button" onClick={() => pad.current?.clear()} disabled={envoi} className="text-[12px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 mt-2">
            Effacer
          </button>
          {erreur && (
            <p role="alert" className="mt-3 text-[13px] text-red-600 dark:text-red-400">
              {erreur}
            </p>
          )}
          <button
            type="button"
            disabled={!encre || envoi}
            onClick={() => void envoyer(moment, true)}
            className="mt-5 w-full bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-3 rounded-md inline-flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {envoi && <Loader2 className="w-4 h-4 animate-spin" />}
            {envoi ? 'Enregistrement…' : 'Valider ma signature'}
          </button>
          {visioPossible && (
            <button
              type="button"
              disabled={envoi}
              onClick={() => void envoyer(moment, false)}
              className="mt-3 w-full border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] px-4 py-2.5 rounded-md inline-flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <MonitorCheck className="w-4 h-4" />
              Je suis à distance : confirmer {moment === 'entry' ? 'mon arrivée' : 'mon départ'} sans signer
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-[480px]">
        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 mb-1 text-center">Bonjour {context.signerFullName}</p>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight text-center mb-5">Émargement</h1>
        {entete}
        <InfoCallout tone="info" className="mb-5">
          {unSeulTemps
            ? 'Vous signez la feuille de présence en tant que formateur.'
            : 'Vous signez à l’arrivée, puis à la fin de la demi-journée avec ce même lien.'}{' '}
          Chaque signature est horodatée et rattachée à votre appareil (preuve pour l’audit Qualiopi).
        </InfoCallout>
        <label className="flex items-start gap-2 mb-6 cursor-pointer">
          <input type="checkbox" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} className="mt-0.5" />
          <span className="text-[13px] text-zinc-700 dark:text-zinc-300">
            J’atteste être présent(e) à cette formation et j’accepte de signer électroniquement la feuille de présence.
          </span>
        </label>
        <button
          type="button"
          disabled={!accepte}
          onClick={() => setEtat({ nom: 'signature', moment: 'entry' })}
          className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-medium px-4 py-3 rounded-md disabled:opacity-40"
        >
          Signer mon entrée
        </button>
      </div>
    </div>
  );
}
