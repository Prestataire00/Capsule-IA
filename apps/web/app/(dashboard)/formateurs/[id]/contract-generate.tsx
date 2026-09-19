'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2, FileText, ArrowRight, ChevronDown } from 'lucide-react';
import { generateTrainerContract } from './contract-actions';

const ERRORS: Record<string, string> = {
  ai_unavailable: 'Génération IA indisponible (clé API non configurée).',
  generation_failed: 'La génération a échoué, réessayez.',
  trainer_not_found: 'Formateur introuvable.',
  document_create_failed: 'Enregistrement du contrat impossible.',
};

export function ContractGenerate({
  trainerId,
  existingDocumentId,
}: {
  trainerId: string;
  existingDocumentId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [d, setD] = useState({
    mission: '',
    startDate: '',
    endDate: '',
    schedule: '',
    feeAmount: '',
    feeBasis: '',
    vat: '',
    noticeDays: '',
    ipTerms: '',
    signaturePlace: '',
  });
  const set = (k: keyof typeof d) => (e: { target: { value: string } }) =>
    setD((p) => ({ ...p, [k]: e.target.value }));
  const renseignes = Object.values(d).filter((v) => v !== '').length;

  function generate() {
    setError(null);
    start(async () => {
      const res = await generateTrainerContract(trainerId, d);
      if (res.ok) {
        router.push(`/documents/${res.documentId}/apercu`);
      } else {
        setError(ERRORS[res.error] ?? 'Une erreur est survenue.');
      }
    });
  }

  return (
    <div className="space-y-3">
      {existingDocumentId && (
        <a
          href={`/documents/${existingDocumentId}/apercu`}
          className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200/60 dark:border-zinc-800 px-3 py-2.5 text-[13px] hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
        >
          <span className="inline-flex items-center gap-2 text-zinc-800 dark:text-zinc-200">
            <FileText className="w-4 h-4 text-orange-500" />
            Contrat généré — voir / envoyer en signature
          </span>
          <ArrowRight className="w-4 h-4 text-zinc-400" />
        </a>
      )}

      {/* Ce que le rédacteur ne peut pas deviner. Laissé vide, chaque champ
          ressort en « [à compléter] » dans le contrat — comme auparavant. */}
      <div className="rounded-lg border border-zinc-200/60 dark:border-zinc-800 overflow-hidden">
        <button
          type="button"
          onClick={() => setOuvert((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-[13px] text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
        >
          <span>
            Éléments du contrat
            {renseignes > 0 && (
              <span className="ml-2 text-[11px] font-semibold text-orange-600 dark:text-orange-400 tabular-nums">
                {renseignes} renseigné{renseignes > 1 ? 's' : ''}
              </span>
            )}
          </span>
          <ChevronDown className={`w-4 h-4 text-zinc-400 transition ${ouvert ? 'rotate-180' : ''}`} />
        </button>

        {ouvert && (
          <div className="px-3 pb-3 pt-1 space-y-3 border-t border-zinc-200/60 dark:border-zinc-800">
            <Champ label="Objet de la mission" aide="Intitulé, objectifs, public, contenu, modalités, lieu, volume horaire, effectif.">
              <textarea rows={3} value={d.mission} onChange={set('mission')} className={champ} />
            </Champ>

            <div className="grid grid-cols-2 gap-2">
              <Champ label="Début"><input type="date" value={d.startDate} onChange={set('startDate')} className={champ} /></Champ>
              <Champ label="Fin"><input type="date" value={d.endDate} onChange={set('endDate')} className={champ} /></Champ>
            </div>

            <Champ label="Calendrier des sessions" aide="Dates, horaires et lieux d'exécution.">
              <textarea rows={2} value={d.schedule} onChange={set('schedule')} className={champ} />
            </Champ>

            <div className="grid grid-cols-2 gap-2">
              <Champ label="Rémunération"><input value={d.feeAmount} onChange={set('feeAmount')} placeholder="600 €" className={champ} /></Champ>
              <Champ label="Base">
                <select value={d.feeBasis} onChange={set('feeBasis')} className={champ}>
                  <option value="">—</option>
                  <option value="horaire">Taux horaire</option>
                  <option value="journalier">Tarif journalier</option>
                  <option value="forfaitaire">Forfait global</option>
                </select>
              </Champ>
            </div>

            <Champ label="TVA" aide="Taux applicable, ou franchise en base.">
              <input value={d.vat} onChange={set('vat')} placeholder="TVA non applicable, art. 293 B du CGI" className={champ} />
            </Champ>

            <div className="grid grid-cols-2 gap-2">
              <Champ label="Préavis (jours)" aide="Résiliation hors faute.">
                <input type="number" min={0} max={365} value={d.noticeDays} onChange={set('noticeDays')} className={champ} />
              </Champ>
              <Champ label="Lieu de signature">
                <input value={d.signaturePlace} onChange={set('signaturePlace')} placeholder="Paris" className={champ} />
              </Champ>
            </div>

            <Champ label="Supports créés par le formateur" aide="Sort des droits sur ce qu'il produit pour la mission.">
              <select value={d.ipTerms} onChange={set('ipTerms')} className={champ}>
                <option value="">—</option>
                <option value="cession">Cession exclusive à l&apos;organisme</option>
                <option value="licence">Licence non exclusive à l&apos;organisme</option>
                <option value="usage">Le formateur reste propriétaire, usage concédé</option>
              </select>
            </Champ>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={pending}
        className="w-full inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[13px] font-semibold px-4 h-10 rounded-lg shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 transition"
      >
        {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {existingDocumentId ? 'Régénérer le contrat (IA)' : 'Générer le contrat (IA)'}
      </button>

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
        Contrat de sous-traitance rédigé à partir de l&apos;identité de l&apos;organisme, du formateur et des
        éléments ci-dessus, à relire avant envoi. Tout champ laissé vide ressort en « [à compléter] ».
      </p>
      {error && <p className="text-[12px] text-red-600">{error}</p>}
    </div>
  );
}

const champ =
  'w-full text-[13px] px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-300 dark:focus:border-orange-800 transition';

function Champ({ label, aide, children }: { label: string; aide?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">{label}</span>
      {children}
      {aide && <span className="block text-[11px] text-zinc-400 mt-0.5">{aide}</span>}
    </label>
  );
}
