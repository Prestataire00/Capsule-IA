'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Archive, CheckCircle2, FileText, Loader2, Send, Sparkles, Upload, Wand2 } from 'lucide-react';
import { supabaseBrowser } from '@/shared/lib/supabase/client';
import { deposerProgramme, envoyerDevisProposition, preparerDepotProgramme, reviserProposition } from './proposition-actions';

export type PropositionVue = {
  id: string;
  version: number;
  statut: 'active' | 'archivee' | 'acceptee';
  titre: string;
  consignes: string | null;
  alertes: string[];
  pointsAValider: string[];
  totalHtCents: number;
  creeLe: string;
  programmeNom: string | null;
  documentId: string | null;
  devis: { id: string; reference: string; statut: string } | null;
};

const STATUT_DEVIS: Record<string, string> = {
  draft: 'brouillon',
  sent: 'envoyé, en attente de signature',
  signed: 'signé',
  refused: 'refusé',
  expired: 'expiré',
  cancelled: 'annulé',
};

const eur = (c: number) => `${(c / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} € HT`;
const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const BOUTON_SECONDAIRE =
  'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50';

/**
 * La proposition commerciale d'une demande : dépôt du programme, version en
 * cours, révision par l'IA, envoi du devis, versions archivées.
 */
export function Propositions({
  prospectId,
  propositions,
  gerer,
  depotEnAttente = null,
  echecDepot = false,
}: {
  prospectId: string;
  propositions: PropositionVue[];
  gerer: boolean;
  /** Programme joint à la création de la demande, déjà envoyé au stockage. */
  depotEnAttente?: { path: string; nom: string } | null;
  /** Le programme joint à la création n'a pas pu être envoyé. */
  echecDepot?: boolean;
}) {
  const router = useRouter();
  const fichier = useRef<HTMLInputElement>(null);
  const [consignes, setConsignes] = useState('');
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, setEnCours] = useState<null | 'depot' | 'revision' | 'envoi'>(null);
  const [, demarrer] = useTransition();

  const active = propositions.find((p) => p.statut === 'active' || p.statut === 'acceptee') ?? null;
  const archives = propositions.filter((p) => p !== active);

  const lancer = (quoi: 'depot' | 'revision' | 'envoi', action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) => {
    setRetour(null);
    setEnCours(quoi);
    demarrer(async () => {
      const r = await action();
      setEnCours(null);
      setRetour(r.ok ? { ok: true, texte: r.message } : { ok: false, texte: r.error });
      if (r.ok) {
        setConsignes('');
        router.refresh();
      }
    });
  };

  // Le fichier part directement du navigateur vers le stockage : aucun format
  // ni aucune taille imposés, rien ne transite par le serveur de l'application.
  const deposer = (f: File | undefined) => {
    if (!f) return;
    lancer('depot', async () => {
      const prep = await preparerDepotProgramme({ prospectId, nom: f.name });
      if (!prep.ok) return prep;
      const { error } = await supabaseBrowser()
        .storage.from('prospect-documents')
        .uploadToSignedUrl(prep.path, prep.token, f, { contentType: f.type || 'application/octet-stream' });
      if (error) return { ok: false as const, error: `Le document n’a pas pu être envoyé : ${error.message}` };
      return deposerProgramme({ prospectId, nom: f.name, path: prep.path });
    });
    if (fichier.current) fichier.current.value = '';
  };

  // Programme joint au formulaire de création : on enchaîne sur sa
  // rédaction. L'adresse est nettoyée d'abord, pour qu'un rechargement de la
  // page ne relance pas une seconde proposition.
  const depotLance = useRef(false);
  useEffect(() => {
    if (depotLance.current) return;
    if (echecDepot) {
      depotLance.current = true;
      window.history.replaceState(null, '', `/prospects/${prospectId}`);
      setRetour({ ok: false, texte: 'La demande est enregistrée, mais le programme n’a pas pu être envoyé. Déposez-le à nouveau ci-dessous.' });
      return;
    }
    if (!depotEnAttente || !gerer) return;
    depotLance.current = true;
    window.history.replaceState(null, '', `/prospects/${prospectId}`);
    lancer('depot', () => deposerProgramme({ prospectId, nom: depotEnAttente.nom, path: depotEnAttente.path }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const occupe = enCours !== null;

  return (
    <div className="space-y-4">
      <input ref={fichier} type="file" className="hidden" onChange={(e) => deposer(e.target.files?.[0])} />

      {enCours && (
        <p role="status" className="text-[13px] text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-2 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/60 px-3 py-2">
          <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
          {enCours === 'envoi'
            ? 'Envoi du devis…'
            : enCours === 'depot'
              ? 'Envoi du document, puis rédaction de la proposition et de son devis par l’IA — quelques minutes selon la taille du document. Restez sur la page.'
              : 'L’IA rédige la nouvelle version et son devis — une à trois minutes. Restez sur la page.'}
        </p>
      )}
      {retour && (
        <p role={retour.ok ? 'status' : 'alert'} className={`text-[13px] ${retour.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {retour.texte}
        </p>
      )}

      {!active ? (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center space-y-3">
          <Sparkles className="w-6 h-6 mx-auto text-orange-500" aria-hidden />
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400 max-w-md mx-auto">
            Déposez le programme conçu pour ce client, dans le format que vous avez (PDF, Word, PowerPoint, Excel, image…). L’équipe est prévenue, et l’IA rédige la proposition V1 et son devis à partir du programme, de la
            demande et des notes de suivi.
          </p>
          {gerer && (
            <button type="button" disabled={occupe} onClick={() => fichier.current?.click()} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold disabled:opacity-50">
              <Upload className="w-4 h-4" /> Déposer le programme
            </button>
          )}
        </div>
      ) : (
        <div className={`rounded-xl border p-4 space-y-3 ${active.statut === 'acceptee' ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-zinc-200 dark:border-zinc-800'}`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                V{active.version} · {date(active.creeLe)}
                {active.programmeNom ? ` · d’après ${active.programmeNom}` : ''}
              </p>
              <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">{active.titre}</p>
              <p className="text-[13px] text-zinc-700 dark:text-zinc-300 tabular-nums">
                {eur(active.totalHtCents)}
                {active.devis && (
                  <span className="text-zinc-500">
                    {' '}· devis {active.devis.reference}, {STATUT_DEVIS[active.devis.statut] ?? active.devis.statut}
                  </span>
                )}
              </p>
            </div>
            {active.statut === 'acceptee' && (
              <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-medium bg-emerald-600 text-white">
                <CheckCircle2 className="w-3.5 h-3.5" /> Acceptée
              </span>
            )}
          </div>

          {active.consignes && (
            <p className="text-[12px] text-zinc-600 dark:text-zinc-400">
              <span className="font-medium">Demandé pour cette version :</span> {active.consignes}
            </p>
          )}
          {active.alertes.length > 0 && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[12px] text-amber-900 dark:text-amber-200">
              <p className="font-medium inline-flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Hors du cadre d’une action de formation — à corriger avant d’envoyer</p>
              <ul className="mt-1 ml-5 list-disc">{active.alertes.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}
          {active.pointsAValider.length > 0 && (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-[12px] text-zinc-700 dark:text-zinc-300">
              <p className="font-medium">À compléter ou vérifier</p>
              <ul className="mt-1 ml-5 list-disc">{active.pointsAValider.map((a) => <li key={a}>{a}</li>)}</ul>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {active.documentId && (
              <Link href={`/documents/${active.documentId}/apercu`} className={BOUTON_SECONDAIRE}>
                <FileText className="w-3.5 h-3.5" /> Voir la proposition
              </Link>
            )}
            {active.devis && (
              <Link href={`/devis/${active.devis.id}`} className={BOUTON_SECONDAIRE}>
                <FileText className="w-3.5 h-3.5" /> Voir / ajuster le devis
              </Link>
            )}
            {gerer && active.statut === 'active' && active.devis && (active.devis.statut === 'draft' || active.devis.statut === 'sent') && (
              <button
                type="button"
                disabled={occupe}
                onClick={() => {
                  if (confirm(`Envoyer le devis ${active.devis?.reference} au client pour signature ?\n\nSigné, la demande deviendra client : dossier, convention et programme seront créés automatiquement.`))
                    lancer('envoi', () => envoyerDevisProposition({ prospectId, propositionId: active.id }));
                }}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" /> {active.devis.statut === 'sent' ? 'Renvoyer le devis' : 'Envoyer le devis au client'}
              </button>
            )}
          </div>

          {gerer && active.statut === 'active' && (
            <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <label className="block text-[12px] font-medium text-zinc-700 dark:text-zinc-300">
                La proposition ne convient pas ? Dites à l’IA ce qu’il faut changer — elle rédige la V{active.version + 1}, la V{active.version} est archivée.
                <textarea
                  value={consignes}
                  onChange={(e) => setConsignes(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder="Ex. : passer à 10 participants, ajouter un module sur Excel, présenter le tarif au forfait…"
                  className="mt-1 w-full text-[13px] px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={occupe || consignes.trim().length < 5}
                  onClick={() => lancer('revision', () => reviserProposition({ prospectId, propositionId: active.id, consignes }))}
                  className={BOUTON_SECONDAIRE}
                >
                  <Wand2 className="w-3.5 h-3.5" /> Rédiger la V{active.version + 1}
                </button>
                <button type="button" disabled={occupe} onClick={() => fichier.current?.click()} className={BOUTON_SECONDAIRE}>
                  <Upload className="w-3.5 h-3.5" /> Nouveau programme
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {archives.length > 0 && (
        <details className="text-[13px]">
          <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400 inline-flex items-center gap-1.5">
            <Archive className="w-3.5 h-3.5" /> {archives.length} version{archives.length > 1 ? 's' : ''} archivée{archives.length > 1 ? 's' : ''}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {archives.map((p) => (
              <li key={p.id} className="flex items-baseline gap-2 flex-wrap text-zinc-700 dark:text-zinc-300">
                <span className="tabular-nums font-medium">V{p.version}</span>
                <span className="tabular-nums text-zinc-500">{date(p.creeLe)}</span>
                <span className="tabular-nums">{eur(p.totalHtCents)}</span>
                {p.consignes && <span className="text-zinc-500 truncate max-w-md">« {p.consignes} »</span>}
                {p.documentId && (
                  <Link href={`/documents/${p.documentId}/apercu`} className="text-orange-600 dark:text-orange-400 hover:underline">
                    voir
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
