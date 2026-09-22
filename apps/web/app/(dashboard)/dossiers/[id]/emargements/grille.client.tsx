'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, ChevronLeft, ChevronRight, Loader2, PenLine, QrCode, Send, Users, X } from 'lucide-react';
import type { Colonne, LigneStagiaire } from '@/features/attendance/queries/load-dossier-grille';
import { markAttendance, markAllPresent, sendSheetLinksAction } from './[sessionId]/actions';

/**
 * Émargement du dossier en un seul tableau : les demi-journées en colonnes,
 * les stagiaires en lignes, une semaine à la fois.
 *
 * L'écran précédent n'affichait qu'une feuille — une page par demi-journée.
 * Sur six semaines et six stagiaires, suivre l'assiduité demandait soixante
 * allers-retours. Les gestes eux-mêmes ne changent pas : ce sont les mêmes
 * actions que la feuille détaillée, qui reste accessible d'un clic sur l'entête
 * de colonne pour les cas fins (retard, départ anticipé, justificatif).
 */

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const LIBELLE_DEMI: Record<string, string> = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  evening: 'Soir',
  full: 'Journée',
};

const heure = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );

function enTeteJour(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}

/** Lundi de la semaine d'une date, en clé AAAA-MM-JJ. */
function lundiDe(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  const decalage = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - decalage);
  return d.toISOString().slice(0, 10);
}

export function GrilleEmargement({
  dossierId,
  colonnes,
  lignes,
  vignettes,
  formateurs,
  peutAgir,
}: {
  dossierId: string;
  colonnes: Colonne[];
  lignes: LigneStagiaire[];
  vignettes: Record<string, string>;
  formateurs: { id: string; nom: string }[];
  peutAgir: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [cible, setCible] = useState<string | null>(null);

  const semaines = useMemo(() => {
    const parSemaine = new Map<string, Colonne[]>();
    for (const c of colonnes) {
      const cle = lundiDe(c.jour);
      parSemaine.set(cle, [...(parSemaine.get(cle) ?? []), c]);
    }
    return [...parSemaine.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [colonnes]);

  // On ouvre sur la semaine en cours quand la formation y est, sinon sur la
  // première : c'est celle qu'on vient émarger.
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const indexInitial = Math.max(
    0,
    semaines.findIndex(([lundi]) => lundi >= lundiDe(aujourdHui)),
  );
  const [index, setIndex] = useState(indexInitial);
  const semaine = semaines[Math.min(index, semaines.length - 1)];

  if (semaines.length === 0 || !semaine) {
    return (
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
        Aucune feuille d’émargement : elles sont créées à la planification des séances.
      </p>
    );
  }

  const [lundi, colonnesSemaine] = semaine;
  const jours = [...new Set(colonnesSemaine.map((c) => c.jour))];

  const agir = (id: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setErreur(null);
    setCible(id);
    demarrer(async () => {
      const r = await fn();
      if (!r.ok) setErreur(r.error ?? 'L’action a échoué.');
      else router.refresh();
      setCible(null);
    });
  };

  const bascule = (ligne: LigneStagiaire, c: Colonne) => {
    const actuel = ligne.cases[c.sheetId]?.statut;
    const suivant = actuel === 'present' ? 'absent' : 'present';
    agir(`${ligne.id}:${c.sheetId}`, () =>
      markAttendance({ sheetId: c.sheetId, learnerId: ligne.id, status: suivant, captureMode: 'grille' }),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] text-zinc-700 dark:text-zinc-300 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          <ChevronLeft className="w-4 h-4" /> Semaine précéd.
        </button>
        <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
          Semaine du {enTeteJour(lundi)}
          <span className="font-normal text-zinc-500 dark:text-zinc-400"> · {index + 1}/{semaines.length}</span>
        </p>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(semaines.length - 1, i + 1))}
          disabled={index >= semaines.length - 1}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[13px] text-zinc-700 dark:text-zinc-300 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          Semaine suiv. <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {erreur && <p className="text-[12px] text-red-600 dark:text-red-400">{erreur}</p>}

      <div className="overflow-x-auto border border-zinc-200/70 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white dark:bg-zinc-900 text-left px-4 py-2 border-b border-r border-zinc-200/70 dark:border-zinc-800 min-w-[220px]">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500">Stagiaire</span>
              </th>
              {jours.map((jour) => (
                <th
                  key={jour}
                  colSpan={colonnesSemaine.filter((c) => c.jour === jour).length}
                  className="text-center px-3 py-2 border-b border-r border-zinc-200/70 dark:border-zinc-800 text-[12px] font-bold text-zinc-800 dark:text-zinc-200 capitalize"
                >
                  {enTeteJour(jour)}
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky left-0 z-10 bg-white dark:bg-zinc-900 border-b border-r border-zinc-200/70 dark:border-zinc-800" />
              {colonnesSemaine.map((c) => (
                <th
                  key={c.sheetId}
                  className="px-2 py-2 border-b border-r border-zinc-200/70 dark:border-zinc-800 align-top min-w-[150px]"
                >
                  <Link
                    href={`/dossiers/${dossierId}/emargements/${c.sessionId}`}
                    className="block text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-orange-400"
                  >
                    {LIBELLE_DEMI[c.halfDay] ?? c.halfDay}
                  </Link>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {heure(c.debut)} – {heure(c.fin)}
                  </p>
                  {peutAgir && !c.finalisee && (
                    <div className="mt-1.5 space-y-1">
                      <button
                        type="button"
                        onClick={() => agir(`all:${c.sheetId}`, () => markAllPresent({ sheetId: c.sheetId }))}
                        disabled={enCours}
                        className="w-full inline-flex items-center justify-center gap-1 h-7 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-950/70 disabled:opacity-50"
                      >
                        {enCours && cible === `all:${c.sheetId}` ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Users className="w-3 h-3" />
                        )}
                        Tous présents
                      </button>
                      {formateurs.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            agir(`trainer:${c.sheetId}`, () =>
                              markAttendance({
                                sheetId: c.sheetId,
                                learnerId: formateurs[0]!.id,
                                signerKind: 'trainer',
                                status: 'present',
                                captureMode: 'grille',
                              }),
                            )
                          }
                          disabled={enCours}
                          title={`Marquer ${formateurs[0]!.nom} présent sur cette demi-journée`}
                          className="w-full inline-flex items-center justify-center gap-1 h-7 rounded-md bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-[11px] font-semibold hover:bg-purple-100 dark:hover:bg-purple-950/70 disabled:opacity-50"
                        >
                          {enCours && cible === `trainer:${c.sheetId}` ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <PenLine className="w-3 h-3" />
                          )}
                          Signer formateur
                        </button>
                      )}
                      <a
                        href={`/projection/${c.sheetId}`}
                        target="_blank"
                        rel="noopener"
                        title="Projeter le QR code en salle"
                        className="w-full inline-flex items-center justify-center gap-1 h-7 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[11px] font-semibold hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      >
                        <QrCode className="w-3 h-3" /> QR
                      </a>
                      <button
                        type="button"
                        onClick={() => agir(`send:${c.sheetId}`, () => sendSheetLinksAction({ sheetId: c.sheetId }))}
                        disabled={enCours}
                        className="w-full inline-flex items-center justify-center gap-1 h-7 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[11px] font-semibold hover:bg-blue-100 dark:hover:bg-blue-950/70 disabled:opacity-50"
                      >
                        {enCours && cible === `send:${c.sheetId}` ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Send className="w-3 h-3" />
                        )}
                        Envoyer à tous
                      </button>
                    </div>
                  )}
                  {c.finalisee && (
                    <p className="mt-1.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">Close</p>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/20">
                <td className="sticky left-0 z-10 bg-white dark:bg-zinc-900 px-4 py-3 border-b border-r border-zinc-200/70 dark:border-zinc-800">
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{l.nom}</p>
                  {l.email && <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{l.email}</p>}
                </td>
                {colonnesSemaine.map((c) => {
                  const cellule = l.cases[c.sheetId];
                  const present = cellule?.statut === 'present';
                  const signe = Boolean(cellule?.signeA);
                  return (
                    <td
                      key={c.sheetId}
                      className="px-2 py-2 border-b border-r border-zinc-200/70 dark:border-zinc-800 text-center align-top"
                    >
                      <button
                        type="button"
                        onClick={() => peutAgir && !c.finalisee && bascule(l, c)}
                        disabled={!peutAgir || c.finalisee || enCours}
                        title={present ? 'Basculer en absent' : 'Marquer présent'}
                        className={`inline-flex items-center justify-center gap-1 h-7 px-2 rounded-md text-[11px] font-semibold transition disabled:cursor-default ${
                          present
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                            : cellule?.statut
                              ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                              : 'border border-zinc-200 dark:border-zinc-700 text-zinc-400'
                        }`}
                      >
                        {enCours && cible === `${l.id}:${c.sheetId}` ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : present ? (
                          <Check className="w-3 h-3" />
                        ) : cellule?.statut ? (
                          <X className="w-3 h-3" />
                        ) : null}
                        {present ? 'Présent' : cellule?.statut ? 'Absent' : '—'}
                      </button>
                      {vignettes[`${l.id}|${c.sheetId}`] ? (
                        <>
                          {/* Image de signature servie par une URL signée de dix
                              minutes : le bucket est privé. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={vignettes[`${l.id}|${c.sheetId}`]}
                            alt={`Signature de ${l.nom}`}
                            className="mt-1 h-10 w-full object-contain rounded border border-emerald-200 dark:border-emerald-900/50 bg-white"
                          />
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400">✓ Signé</p>
                        </>
                      ) : (
                        signe && <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">✓ Signé</p>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {lignes.length === 0 && (
              <tr>
                <td colSpan={colonnesSemaine.length + 1} className="px-4 py-8 text-center text-[13px] text-zinc-500">
                  Aucun stagiaire rattaché à ce dossier.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
        Cliquez une case pour basculer présent / absent. « Envoyer à tous » adresse à chaque stagiaire son lien de
        signature. Pour un retard, un départ anticipé ou un justificatif, ouvrez la demi-journée depuis son entête.
      </p>
    </div>
  );
}
