'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Download, FileText, Loader2, MonitorPlay, PenLine, RefreshCw, Send, Sun, Sunset, Users, X } from 'lucide-react';
import type { ParticipantRow, SheetView } from '@/features/attendance/queries/load-session-emargement';
import { attendanceErrorLabel } from '@/features/attendance/schemas';
import { markAllPresent, sendSheetLinksAction } from '@/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/actions';
import { MarqueurPresence, SignatureTablette } from '@/app/(dashboard)/dossiers/[id]/emargements/[sessionId]/sheet-grid';

/**
 * Grille d'émargement façon RFC : un participant par ligne, une colonne par
 * demi-journée. En tête de colonne : horaires et actions groupées (QR projeté,
 * tous présents, envoi des liens, signature du formateur). Dans chaque case :
 * statut, heures d'entrée et de sortie, signature. Un clic sur une case ouvre
 * le marquage et la signature sur place.
 */

const LIBELLE: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soirée' };
const heure = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(iso)) : null;

type Tablette = { sheetId: string; participant: ParticipantRow; moment: 'entry' | 'exit' } | null;

function Case({ p, vignette }: { p: ParticipantRow | undefined; vignette: string | null }) {
  if (!p) return <span className="text-[12px] text-zinc-300 dark:text-zinc-600">—</span>;
  const entree = heure(p.entryAt);
  const sortie = heure(p.exitAt);
  const badge =
    p.state === 'complet' || (p.state === 'entree_seule' && p.kind === 'trainer')
      ? { t: p.status === 'late' ? 'En retard' : 'Présent', c: p.status === 'late' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' }
      : p.state === 'entree_seule'
        ? { t: 'Entrée signée', c: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300' }
        : p.state === 'absent'
          ? { t: 'Absent', c: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' }
          : p.state === 'excuse'
            ? { t: 'Excusé', c: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' }
            : { t: 'Non émargé', c: 'border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500' };
  return (
    <span className="flex flex-col items-center gap-1">
      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${badge.c}`}>
        {(p.state === 'complet' || p.state === 'entree_seule') && <Check className="w-3 h-3" aria-hidden />}
        {badge.t}
      </span>
      {(entree || p.attestedAt) && (
        <span className="text-[11px] text-zinc-500 tabular-nums">
          {entree ?? 'attesté'}
          {p.kind === 'learner' ? ` → ${sortie ?? '…'}` : ''}
        </span>
      )}
      {p.lateArrival && <span className="text-[10px] text-amber-700 dark:text-amber-400">arrivé à {p.lateArrival}</span>}
      {vignette && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={vignette} alt="Signature" className="h-9 w-24 object-contain bg-white rounded border border-zinc-200 dark:border-zinc-700" />
      )}
    </span>
  );
}

export function AttendanceMatrix({
  sheets,
  vignettes,
  pdfs,
  csvHref,
}: {
  sheets: SheetView[];
  vignettes: Record<string, string>;
  pdfs: Record<string, string>;
  csvHref: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [selection, setSelection] = useState<{ sheetId: string; cle: string } | null>(null);
  const [tablette, setTablette] = useState<Tablette>(null);

  // Lignes : participants attendus (apprenants puis formateur), communs aux demi-journées.
  const lignes = useMemo(() => {
    const vus = new Map<string, ParticipantRow>();
    for (const s of sheets) for (const p of s.participants) if (!vus.has(`${p.kind}:${p.id}`)) vus.set(`${p.kind}:${p.id}`, p);
    const tous = [...vus.entries()];
    return [...tous.filter(([, p]) => p.kind === 'learner'), ...tous.filter(([, p]) => p.kind === 'trainer')];
  }, [sheets]);
  const cellule = (sheet: SheetView, cle: string) => sheet.participants.find((p) => `${p.kind}:${p.id}` === cle);

  const executer = (fn: () => Promise<{ ok: true; [k: string]: unknown } | { ok: false; error: string }>, succes: (r: Record<string, unknown>) => string) =>
    start(async () => {
      setMessage(null);
      const r = await fn();
      if (r.ok) {
        setMessage({ ok: true, texte: succes(r as Record<string, unknown>) });
        router.refresh();
      } else setMessage({ ok: false, texte: attendanceErrorLabel(r.error) });
    });

  const choisie = selection ? sheets.find((s) => s.id === selection.sheetId) : undefined;
  const participantChoisi = choisie && selection ? cellule(choisie, selection.cle) : undefined;
  const bouton = 'w-full inline-flex items-center justify-center gap-1 text-[11px] font-medium px-2 py-1.5 rounded-md border transition disabled:opacity-40';

  return (
    <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm">
      <header className="px-5 py-4 flex items-start justify-between gap-4 flex-wrap border-b border-zinc-200/70 dark:border-zinc-800">
        <div>
          <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100">Émargement</h2>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Chaque participant signe à l’arrivée puis à la fin de chaque demi-journée. Cliquez une case pour marquer une présence ou faire signer sur place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {sheets.map((s) =>
            pdfs[s.id] ? (
              <a key={s.id} href={pdfs[s.id]} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                <Download className="w-3.5 h-3.5" /> Feuille {LIBELLE[s.halfDay]?.toLowerCase()} signée
              </a>
            ) : (
              <a key={s.id} href={`/api/attendance/${s.id}/paper`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                <FileText className="w-3.5 h-3.5" /> Feuille {LIBELLE[s.halfDay]?.toLowerCase()}
              </a>
            ),
          )}
          <a href={csvHref} className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
            <Download className="w-3.5 h-3.5" /> Exporter CSV
          </a>
          <button type="button" onClick={() => router.refresh()} className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800">
            <RefreshCw className="w-3.5 h-3.5" /> Rafraîchir
          </button>
        </div>
      </header>

      {message && (
        <p role="status" className={`mx-5 mt-4 text-[13px] ${message.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-300'}`}>
          {message.texte}
        </p>
      )}

      <div className="p-5 overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white dark:bg-zinc-900 text-left align-bottom px-3 pb-3 text-[12px] font-medium text-zinc-500 min-w-[180px]">Participant</th>
              {sheets.map((s) => {
                const formateur = s.participants.find((p) => p.kind === 'trainer' && p.expected);
                const Icone = s.halfDay === 'afternoon' ? Sunset : Sun;
                return (
                  <th key={s.id} className="align-top px-2 pb-3 min-w-[190px]">
                    <div className="rounded-lg border border-zinc-200/80 dark:border-zinc-800 p-2.5 space-y-2 text-center font-normal">
                      <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-1.5">
                        <Icone className="w-4 h-4 text-amber-500" aria-hidden /> {LIBELLE[s.halfDay] ?? s.halfDay}
                      </p>
                      <p className="text-[12px] text-zinc-500 tabular-nums">
                        {heure(s.windowStart)} – {heure(s.windowEnd)}
                      </p>
                      {s.finalized ? (
                        <p className="text-[12px] font-medium text-zinc-600 dark:text-zinc-300">Feuille clôturée</p>
                      ) : (
                        <div className="space-y-1.5">
                          <Link href={`/projection/${s.id}`} target="_blank" rel="noopener" className={`${bouton} border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800`}>
                            <MonitorPlay className="w-3.5 h-3.5" /> QR {LIBELLE[s.halfDay]?.toLowerCase()}
                          </Link>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => executer(() => markAllPresent({ sheetId: s.id }), (r) => `${String(r.marked)} participant(s) noté(s) présent(s).`)}
                            className={`${bouton} border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30`}
                          >
                            <Users className="w-3.5 h-3.5" /> Tous présents
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              executer(
                                () => sendSheetLinksAction({ sheetId: s.id }),
                                (r) => `${String(r.sent)} lien(s) envoyé(s)${Array.isArray(r.withoutEmail) && r.withoutEmail.length ? ` · sans e-mail : ${r.withoutEmail.join(', ')}` : ''}.`,
                              )
                            }
                            className={`${bouton} border-blue-200 text-blue-700 dark:border-blue-900 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30`}
                          >
                            <Send className="w-3.5 h-3.5" /> Envoyer à tous
                          </button>
                          {formateur &&
                            (formateur.entryAt ? (
                              <span className={`${bouton} border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400`}>
                                <Check className="w-3.5 h-3.5" /> Formateur signé
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setTablette({ sheetId: s.id, participant: formateur, moment: 'entry' })}
                                className={`${bouton} border-purple-200 text-purple-700 dark:border-purple-900 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30`}
                              >
                                <PenLine className="w-3.5 h-3.5" /> Signer formateur
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 ? (
              <tr>
                <td colSpan={sheets.length + 1} className="text-center text-[13px] text-zinc-500 py-8">
                  Aucun participant attendu : rattachez des apprenants à la séance.
                </td>
              </tr>
            ) : (
              lignes.map(([cle, p], i) => (
                <tr key={cle} className={i % 2 ? 'bg-zinc-50/60 dark:bg-zinc-900/40' : ''}>
                  <td className="sticky left-0 z-10 bg-inherit px-3 py-3 border-t border-zinc-200/70 dark:border-zinc-800">
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{p.fullName}</p>
                    <p className="text-[11px] text-zinc-500">{p.kind === 'trainer' ? 'Formateur' : p.email ?? ''}</p>
                  </td>
                  {sheets.map((s) => {
                    const c = cellule(s, cle);
                    const choisieIci = selection?.sheetId === s.id && selection.cle === cle;
                    return (
                      <td key={s.id} className="px-2 py-2 border-t border-zinc-200/70 dark:border-zinc-800 text-center align-middle">
                        <button
                          type="button"
                          disabled={s.finalized || !c}
                          onClick={() => setSelection(choisieIci ? null : { sheetId: s.id, cle })}
                          aria-pressed={choisieIci}
                          className={`w-full rounded-lg px-1 py-1.5 transition ${choisieIci ? 'ring-2 ring-orange-400' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'} disabled:cursor-default disabled:hover:bg-transparent`}
                        >
                          <Case p={c} vignette={vignettes[`${s.id}|${cle}|entry`] ?? null} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {choisie && participantChoisi && (
        <div className="mx-5 mb-5 rounded-xl border border-orange-200 dark:border-orange-900/50 bg-orange-50/40 dark:bg-orange-950/10 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">
              {participantChoisi.fullName} — {LIBELLE[choisie.halfDay] ?? choisie.halfDay}
            </p>
            <button type="button" onClick={() => setSelection(null)} aria-label="Fermer" className="p-1 text-zinc-400 hover:text-zinc-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {!participantChoisi.entryAt && (
              <button
                type="button"
                onClick={() => setTablette({ sheetId: choisie.id, participant: participantChoisi, moment: 'entry' })}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                <PenLine className="w-3.5 h-3.5" /> Faire signer l’entrée
              </button>
            )}
            {participantChoisi.entryAt && participantChoisi.kind === 'learner' && !participantChoisi.exitAt && (
              <button
                type="button"
                onClick={() => setTablette({ sheetId: choisie.id, participant: participantChoisi, moment: 'exit' })}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-md bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                <PenLine className="w-3.5 h-3.5" /> Faire signer la sortie
              </button>
            )}
          </div>
          <MarqueurPresence
            sheetId={choisie.id}
            participant={participantChoisi}
            onDone={() => {
              setSelection(null);
              router.refresh();
            }}
          />
        </div>
      )}

      <footer className="px-5 pb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        <span className="font-medium">Légende :</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400" /> Présent (entrée et sortie)</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-400" /> Entrée signée</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> En retard</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400" /> Absent</span>
        <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border border-dashed border-zinc-400" /> Non émargé</span>
        {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-label="Enregistrement" />}
      </footer>

      {tablette && (
        <SignatureTablette
          sheetId={tablette.sheetId}
          participant={tablette.participant}
          moment={tablette.moment}
          onClose={(signe) => {
            setTablette(null);
            if (signe) {
              setSelection(null);
              router.refresh();
            }
          }}
        />
      )}
    </section>
  );
}
