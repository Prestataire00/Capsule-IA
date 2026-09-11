'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, GraduationCap, Link2, Loader2, LogOut, MonitorCheck, PenLine, SlidersHorizontal, User as UserIcon, X } from 'lucide-react';
import { SignaturePad, type SignaturePadHandle } from '@/features/attendance/signature-pad';
import { STATE_LABELS, STATUS_LABELS, type AttendanceStatus, type ParticipantState } from '@/features/attendance/completeness';
import { MARK_STATUSES, attendanceErrorLabel } from '@/features/attendance/schemas';
import type { ParticipantRow, SheetView } from '@/features/attendance/queries/load-session-emargement';
import { JustificationUpload } from '@/features/attendance/justification-upload';
import { attestExit, generateParticipantSignatureLink, markAttendance, signOnDevice } from './actions';
import { JustificationsRow } from './justifications-row';

const TON: Record<ParticipantState, string> = {
  complet: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  entree_seule: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  a_signer: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  absent: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  excuse: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
};

const heure = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(iso)) : null;

const champ =
  'text-[12px] px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-violet-500/30';
// Cible tactile d'au moins 32 px : la grille sert aussi au formateur sur téléphone.
const bouton =
  'inline-flex items-center gap-1 text-[12px] font-medium px-2.5 py-1.5 min-h-8 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition disabled:opacity-40';

type Tablette = { participant: ParticipantRow; moment: 'entry' | 'exit' } | null;

/**
 * Grille d'une demi-journée : entrée, sortie et état de chaque participant ;
 * lien personnel, signature sur l'appareil (mode tablette), marquage par
 * l'équipe (présent, retard, absent, excusé, départ anticipé), sortie attestée.
 */
export function SheetGrid({ sheet, modality }: { sheet: SheetView; modality: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [sortie, setSortie] = useState<string | null>(null);
  const [liens, setLiens] = useState<Record<string, string>>({});
  const [copie, setCopie] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tablette, setTablette] = useState<Tablette>(null);
  const [pending, start] = useTransition();
  const verrou = sheet.finalized;
  const aDistance = modality === 'distanciel' || modality === 'hybride';
  const finFenetre = heure(sheet.windowEnd) ?? '17:00';

  const presentVisio = (p: ParticipantRow) => {
    setErreur(null);
    start(async () => {
      const r = await markAttendance({ sheetId: sheet.id, learnerId: p.id, status: 'present', captureMode: 'visio' });
      if (r.ok) router.refresh();
      else setErreur(attendanceErrorLabel(r.error));
    });
  };

  const lien = (p: ParticipantRow) => {
    setErreur(null);
    start(async () => {
      const r = await generateParticipantSignatureLink({ sheetId: sheet.id, participantId: p.id, participantKind: p.kind });
      if (r.ok) setLiens((l) => ({ ...l, [`${p.kind}:${p.id}`]: r.url }));
      else setErreur(attendanceErrorLabel(r.error));
    });
  };

  if (sheet.participants.length === 0) {
    return (
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 px-1">
        Aucun participant attendu : rattachez des apprenants à la séance et un formateur au dossier.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {erreur && (
        <p role="alert" className="text-[12px] text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 rounded-md px-3 py-2">
          {erreur}
        </p>
      )}
      <ul className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl divide-y divide-zinc-200/60 dark:divide-zinc-800 overflow-hidden">
        <li className="hidden sm:grid grid-cols-[1fr_80px_80px_120px_auto] gap-2 px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          <span>Participant</span>
          <span>Entrée</span>
          <span>Sortie</span>
          <span>État</span>
          <span className="sr-only">Actions</span>
        </li>
        {sheet.participants.map((p) => {
          const k = `${p.kind}:${p.id}`;
          const Icone = p.kind === 'learner' ? GraduationCap : UserIcon;
          const entree = heure(p.entryAt) ?? (p.attestedAt ? 'attestée' : null);
          const sortieTxt = p.exitAt ? `${heure(p.exitAt)}${p.exitAttested ? ' (attestée)' : ''}` : null;
          const aSigner = p.state === 'a_signer' || p.state === 'absent' || p.state === 'excuse';
          const momentTablette: 'entry' | 'exit' | null = p.entryAt ? (p.kind === 'learner' && !p.exitAt ? 'exit' : null) : 'entry';
          return (
            <li key={k} className="px-3 py-2.5">
              <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_80px_80px_120px_auto] gap-2 items-center text-[13px]">
                <div className="flex items-center gap-2 min-w-0">
                  <Icone className={`w-4 h-4 flex-shrink-0 ${p.kind === 'learner' ? 'text-rose-500' : 'text-blue-500'}`} aria-hidden />
                  <span className="truncate text-zinc-900 dark:text-zinc-100">{p.fullName}</span>
                  {!p.expected && <span className="text-[10px] text-zinc-400">(non attendu)</span>}
                </div>
                <span className="hidden sm:block tabular-nums text-[12px] text-zinc-600 dark:text-zinc-300">
                  {entree ?? '—'}
                  {p.lateArrival && <span className="block text-[10px] text-amber-600">retard {p.lateArrival}</span>}
                </span>
                <span className="hidden sm:block tabular-nums text-[12px] text-zinc-600 dark:text-zinc-300">
                  {sortieTxt ?? (p.kind === 'trainer' ? '' : '—')}
                  {p.earlyDeparture && <span className="block text-[10px] text-amber-600">départ {p.earlyDeparture}</span>}
                </span>
                <span className={`hidden sm:inline-flex w-fit text-[11px] px-2 py-0.5 rounded-full ${TON[p.state]}`}>{STATE_LABELS[p.state]}</span>
                {!verrou && (
                  <div className="flex flex-wrap items-center gap-1 justify-end">
                    {momentTablette && (
                      <button type="button" className={bouton} onClick={() => setTablette({ participant: p, moment: momentTablette })}>
                        <PenLine className="w-3.5 h-3.5" />
                        {momentTablette === 'entry' ? 'Signer l’entrée' : 'Signer la sortie'}
                      </button>
                    )}
                    {p.kind === 'learner' && p.state === 'entree_seule' && (
                      <button type="button" className={bouton} onClick={() => setSortie(sortie === k ? null : k)} aria-expanded={sortie === k}>
                        <LogOut className="w-3.5 h-3.5" />
                        Attester la sortie
                      </button>
                    )}
                    {aDistance && p.kind === 'learner' && p.state === 'a_signer' && (
                      <button type="button" className={bouton} disabled={pending} onClick={() => presentVisio(p)} title="Présence constatée en visio">
                        <MonitorCheck className="w-3.5 h-3.5" />
                        Présent en visio
                      </button>
                    )}
                    {(aSigner || p.state === 'entree_seule') && (
                      <button type="button" className={bouton} disabled={pending} onClick={() => lien(p)} aria-label={`Lien personnel de ${p.fullName}`}>
                        <Link2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      className={bouton}
                      onClick={() => setOuvert(ouvert === k ? null : k)}
                      aria-expanded={ouvert === k}
                      aria-label={`Marquer la présence de ${p.fullName}`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {/* Sur téléphone : état, entrée et sortie sous le nom. */}
              <div className="sm:hidden mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                <span className={`inline-flex px-2 py-0.5 rounded-full ${TON[p.state]}`}>{STATE_LABELS[p.state]}</span>
                <span className="tabular-nums">
                  Entrée {entree ?? '—'}
                  {p.kind === 'learner' ? ` · Sortie ${sortieTxt ?? '—'}` : ''}
                </span>
              </div>
              {p.absenceReason && <p className="text-[11px] text-zinc-500 mt-1">Motif : {p.absenceReason}</p>}
              {p.justifications.length > 0 && <JustificationsRow items={p.justifications} />}

              {liens[k] && (
                <div className="mt-2 flex gap-2">
                  <input readOnly value={liens[k]} onFocus={(e) => e.currentTarget.select()} className={`${champ} flex-1 font-mono`} aria-label="Lien de signature" />
                  <button
                    type="button"
                    className={bouton}
                    onClick={async () => {
                      await navigator.clipboard.writeText(liens[k]!);
                      setCopie(k);
                      setTimeout(() => setCopie(null), 2000);
                    }}
                  >
                    {copie === k ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copie === k ? 'Copié' : 'Copier'}
                  </button>
                </div>
              )}

              {sortie === k && !verrou && (
                <AttesteurSortie
                  sheetId={sheet.id}
                  participant={p}
                  defaut={finFenetre}
                  onDone={() => {
                    setSortie(null);
                    router.refresh();
                  }}
                />
              )}

              {ouvert === k && !verrou && (
                <MarqueurPresence
                  sheetId={sheet.id}
                  participant={p}
                  onDone={() => {
                    setOuvert(null);
                    router.refresh();
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>

      {tablette && (
        <SignatureTablette
          sheetId={sheet.id}
          participant={tablette.participant}
          moment={tablette.moment}
          onClose={(signe) => {
            setTablette(null);
            if (signe) router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AttesteurSortie({ sheetId, participant, defaut, onDone }: { sheetId: string; participant: ParticipantRow; defaut: string; onDone: () => void }) {
  const [valeur, setValeur] = useState(defaut);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-zinc-500 space-y-1">
          <span className="block">Heure de sortie</span>
          <input type="time" value={valeur} onChange={(e) => setValeur(e.target.value)} className={champ} />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErreur(null);
              const r = await attestExit({ sheetId, learnerId: participant.id, exitTime: valeur.slice(0, 5) });
              if (r.ok) onDone();
              else setErreur(attendanceErrorLabel(r.error));
            })
          }
          className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-medium px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Attester la sortie
        </button>
      </div>
      <p className="text-[11px] text-zinc-500">
        Vous attestez que {participant.fullName} est resté(e) jusqu’à cette heure. La sortie sera notée « attestée par l’équipe ».
      </p>
      {erreur && <p role="alert" className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
    </div>
  );
}

function MarqueurPresence({ sheetId, participant, onDone }: { sheetId: string; participant: ParticipantRow; onDone: () => void }) {
  const formateur = participant.kind === 'trainer';
  const statuts: readonly AttendanceStatus[] = formateur ? ['present', 'absent'] : MARK_STATUSES;
  const [statut, setStatut] = useState<AttendanceStatus>(participant.status ?? 'present');
  const [arrivee, setArrivee] = useState(participant.lateArrival ?? '');
  const [depart, setDepart] = useState(participant.earlyDeparture ?? '');
  const [motif, setMotif] = useState(participant.absenceReason ?? '');
  const [source, setSource] = useState<'grille' | 'papier'>('grille');
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const absent = statut === 'absent' || statut === 'absent_justified';

  return (
    <div className="mt-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200/60 dark:border-zinc-800 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[11px] text-zinc-500 space-y-1">
          <span className="block">Statut</span>
          <select value={statut} onChange={(e) => setStatut(e.target.value as AttendanceStatus)} className={champ}>
            {statuts.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        {!absent && !formateur && (
          <>
            <label className="text-[11px] text-zinc-500 space-y-1">
              <span className="block">Arrivée (retard)</span>
              <input type="time" value={arrivee} onChange={(e) => setArrivee(e.target.value)} className={champ} />
            </label>
            <label className="text-[11px] text-zinc-500 space-y-1">
              <span className="block">Départ anticipé</span>
              <input type="time" value={depart} onChange={(e) => setDepart(e.target.value)} className={champ} />
            </label>
          </>
        )}
        <label className="text-[11px] text-zinc-500 space-y-1">
          <span className="block">D’après</span>
          <select value={source} onChange={(e) => setSource(e.target.value as 'grille' | 'papier')} className={champ}>
            <option value="grille">Constat de l’équipe</option>
            <option value="papier">Feuille papier signée</option>
          </select>
        </label>
      </div>
      {absent && (
        <label className="block text-[11px] text-zinc-500 space-y-1">
          <span className="block">Motif{statut === 'absent_justified' ? ' (obligatoire)' : ''}</span>
          <input value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={1000} className={`${champ} w-full`} placeholder="Ex. : arrêt maladie, justificatif reçu le…" />
        </label>
      )}
      <p className="text-[11px] text-zinc-500">
        {participant.entryAt
          ? 'La signature de la personne est conservée ; vous corrigez son statut.'
          : 'Sans signature, la présence est enregistrée comme attestée par vous.'}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setErreur(null);
              const r = await markAttendance({
                sheetId,
                learnerId: participant.id,
                signerKind: participant.kind,
                status: statut,
                lateArrival: absent || formateur ? null : arrivee.slice(0, 5) || null,
                earlyDeparture: absent || formateur ? null : depart.slice(0, 5) || null,
                reason: absent ? motif.trim() || null : null,
                captureMode: source,
              });
              if (r.ok) onDone();
              else setErreur(attendanceErrorLabel(r.error));
            })
          }
          className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[12px] font-medium px-3 py-1.5 rounded-md inline-flex items-center gap-1.5 disabled:opacity-40"
        >
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Enregistrer
        </button>
        {erreur && <span role="alert" className="text-[12px] text-red-600 dark:text-red-400">{erreur}</span>}
      </div>
      {absent && !formateur && (
        <JustificationUpload
          endpoint="/api/attendance/justifications"
          fields={{ sheetId, learnerId: participant.id }}
          hint="Déposé par vous, il est accepté d’office et l’absence est notée « excusée »."
        />
      )}
    </div>
  );
}

function SignatureTablette({
  sheetId,
  participant,
  moment,
  onClose,
}: {
  sheetId: string;
  participant: ParticipantRow;
  moment: 'entry' | 'exit';
  onClose: (signe: boolean) => void;
}) {
  const pad = useRef<SignaturePadHandle>(null);
  const [encre, setEncre] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="fixed inset-0 z-50 bg-zinc-900/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="tablette-titre">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-lg p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">{moment === 'entry' ? 'Signature d’entrée' : 'Signature de sortie'}</p>
            <h2 id="tablette-titre" className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100">
              {participant.fullName}
            </h2>
          </div>
          <button type="button" onClick={() => onClose(false)} aria-label="Fermer" className="p-1 text-zinc-400 hover:text-zinc-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg overflow-hidden">
          <SignaturePad ref={pad} onInk={setEncre} height={220} label={`Signature de ${participant.fullName}`} />
        </div>
        <p className="text-[11px] text-zinc-500">
          La signature est horodatée et rattachée à cet appareil. Passez l’appareil à la personne pour qu’elle signe elle-même.
        </p>
        {erreur && <p role="alert" className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => pad.current?.clear()} className="text-[12px] text-zinc-500 hover:text-zinc-800">
            Effacer
          </button>
          <button
            type="button"
            disabled={!encre || pending}
            onClick={() =>
              start(async () => {
                setErreur(null);
                const dataUrl = pad.current?.toDataUrl();
                if (!dataUrl) return;
                const r = await signOnDevice({ sheetId, signerId: participant.id, signerKind: participant.kind, moment, dataUrl });
                if (r.ok) onClose(true);
                else setErreur(attendanceErrorLabel(r.error));
              })
            }
            className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-md inline-flex items-center gap-2 disabled:opacity-40"
          >
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Valider la signature
          </button>
        </div>
      </div>
    </div>
  );
}
