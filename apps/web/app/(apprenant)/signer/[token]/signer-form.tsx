'use client';

import { useRef, useState } from 'react';
import { Check, FileText, Loader2, MonitorCheck, Type } from 'lucide-react';
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
 * Émargement en deux temps : signature d'entrée, puis de sortie avec le même
 * lien. À distance, un bouton confirme la présence. Pour qui ne peut pas
 * signer au doigt, la signature peut être le nom écrit dans la zone.
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
  const [confirmeDepart, setConfirmeDepart] = useState(false);
  const pad = useRef<SignaturePadHandle>(null);
  const aDistance = context.modality === 'distanciel';
  const unSeulTemps = context.signerKind === 'trainer';
  const finPrevue = heure(context.windowEnd);

  const envoyer = async (moment: Moment, avecTrace: boolean) => {
    setErreur(null);
    // Sortie plus de 15 minutes avant la fin : on fait confirmer le départ anticipé.
    if (moment === 'exit' && !confirmeDepart && Date.now() < new Date(context.windowEnd).getTime() - 15 * 60_000) {
      setConfirmeDepart(true);
      return;
    }
    const dataUrl = avecTrace ? (pad.current?.toDataUrl() ?? null) : null;
    if (avecTrace && !dataUrl) return;
    setEnvoi(true);
    const r = await signStep({ token, moment, dataUrl });
    setEnvoi(false);
    setConfirmeDepart(false);
    if (!r.ok) {
      setErreur(attendanceErrorLabel(r.error));
      return;
    }
    if (moment === 'entry' && !unSeulTemps) setEtat({ nom: 'entree_faite', heure: heure(r.signedAt), retard: r.lateArrival });
    else setEtat({ nom: 'termine', espaceUrl: r.espaceUrl, depart: r.earlyDeparture });
  };

  const entete = (
    <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl px-4 py-4 mb-5">
      <div className="flex items-center gap-3">
        <FileText className="w-5 h-5 text-zinc-400" aria-hidden />
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">{context.formationTitle}</p>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 capitalize tabular-nums">
            {jour(context.windowStart)} · {context.halfDayLabel} · {heure(context.windowStart)}–{finPrevue}
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
                aria-current={encours ? 'step' : undefined}
                className={`rounded-lg px-2.5 py-1.5 border font-semibold ${
                  fait
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400'
                    : encours
                      ? 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-300'
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
          <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto mb-4" />
          <h1 className="text-[24px] leading-tight font-extrabold text-zinc-900 dark:text-zinc-100">Merci, c’est signé.</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
            {unSeulTemps ? 'Votre signature est enregistrée.' : 'Votre entrée et votre sortie sont enregistrées.'} Signatures horodatées par{' '}
            {context.organizationName}.
          </p>
          {etat.depart && <p className="text-[12px] text-amber-600 mt-2">Départ anticipé noté à {etat.depart}.</p>}
          {etat.espaceUrl && (
            <a href={etat.espaceUrl} className="mt-6 inline-flex items-center h-10 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-semibold px-4 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition">
              Accéder à mon espace de formation
            </a>
          )}
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
            {etat.retard ? ` (arrivée notée à ${etat.retard})` : ''}. Revenez sur ce même lien à la fin de la demi-journée ({finPrevue}) pour
            signer votre sortie.
          </InfoCallout>
          <button
            type="button"
            onClick={() => setEtat({ nom: 'signature', moment: 'exit' })}
            className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 rounded-lg shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 transition"
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
          <h1 className="text-[20px] leading-tight font-extrabold text-zinc-900 dark:text-zinc-100">
            {moment === 'entry' ? 'Signature d’entrée' : 'Signature de sortie'}
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1 mb-4">Signez avec votre doigt ou un stylet dans le cadre.</p>
          <div className="border border-zinc-200/80 dark:border-zinc-800 rounded-xl overflow-hidden">
            <SignaturePad ref={pad} onInk={setEncre} height={200} label={`Signature de ${context.signerFullName}`} />
          </div>
          <div className="flex items-center justify-between mt-2">
            <button type="button" onClick={() => pad.current?.clear()} disabled={envoi} className="text-[12px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              Effacer
            </button>
            <button
              type="button"
              onClick={() => pad.current?.writeName(context.signerFullName)}
              disabled={envoi}
              className="text-[12px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1"
            >
              <Type className="w-3.5 h-3.5" aria-hidden />
              Je ne peux pas signer au doigt : signer avec mon nom
            </button>
          </div>
          {confirmeDepart && (
            <div role="alertdialog" aria-labelledby="depart-titre" className="mt-4 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
              <p id="depart-titre" className="text-[13px] text-amber-900 dark:text-amber-200">
                La demi-journée se termine à {finPrevue}. En signant maintenant, votre départ sera noté comme anticipé. Confirmez-vous ?
              </p>
              <button type="button" onClick={() => setConfirmeDepart(false)} className="mt-2 text-[12px] text-amber-800 dark:text-amber-300 underline">
                Non, je signerai plus tard
              </button>
            </div>
          )}
          {erreur && (
            <p role="alert" className="mt-3 text-[13px] text-red-600 dark:text-red-400">
              {erreur}
            </p>
          )}
          <button
            type="button"
            disabled={!encre || envoi}
            onClick={() => void envoyer(moment, true)}
            className="mt-5 w-full h-11 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 rounded-lg shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 transition inline-flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {envoi && <Loader2 className="w-4 h-4 animate-spin" />}
            {envoi ? 'Enregistrement…' : confirmeDepart ? 'Oui, je pars maintenant' : 'Valider ma signature'}
          </button>
          {aDistance && (
            <button
              type="button"
              disabled={envoi}
              onClick={() => void envoyer(moment, false)}
              className="mt-3 w-full h-10 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[13px] font-semibold px-4 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition inline-flex items-center justify-center gap-2 disabled:opacity-40"
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
        <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-orange-600 dark:text-orange-400 mb-2 text-center">Bonjour {context.signerFullName}</p>
        <h1 className="text-[24px] leading-tight font-extrabold text-zinc-900 dark:text-zinc-100 text-center mb-5">Émargement</h1>
        {entete}
        <InfoCallout tone="info" className="mb-5">
          {unSeulTemps
            ? 'Vous signez la feuille de présence en tant que formateur.'
            : 'Vous signez à l’arrivée, puis à la fin de la demi-journée avec ce même lien.'}{' '}
          Pour servir de preuve, {context.organizationName} conserve l’heure de chaque signature, l’adresse IP et le navigateur utilisés, pendant
          la durée d’archivage des formations (5 ans).
        </InfoCallout>
        <label className="flex items-start gap-2 mb-6 cursor-pointer">
          <input type="checkbox" checked={accepte} onChange={(e) => setAccepte(e.target.checked)} className="mt-0.5 w-4 h-4 accent-orange-500" />
          <span className="text-[13px] text-zinc-700 dark:text-zinc-300">
            {unSeulTemps
              ? 'J’atteste avoir assuré cette demi-journée de formation et j’accepte de signer électroniquement la feuille de présence.'
              : 'J’atteste être présent(e) à cette formation et j’accepte de signer électroniquement la feuille de présence.'}
          </span>
        </label>
        <button
          type="button"
          disabled={!accepte}
          onClick={() => setEtat({ nom: 'signature', moment: 'entry' })}
          className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 rounded-lg shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 transition disabled:opacity-40"
        >
          {unSeulTemps ? 'Signer la feuille' : 'Signer mon entrée'}
        </button>
      </div>
    </div>
  );
}
