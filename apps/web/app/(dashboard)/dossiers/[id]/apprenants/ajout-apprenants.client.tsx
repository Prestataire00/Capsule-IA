'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Loader2, ClipboardList, AlertTriangle, Check, X } from 'lucide-react';
import { parseListeApprenants } from '@/features/dossier/parse-learners';
import { ajouterApprenants } from './actions';

/**
 * Inscription des stagiaires : un par un, ou la liste entière collée.
 *
 * Une liste nominative arrive en tableau ou en corps de mail — la retaper
 * seize fois n'a pas de sens. Ce qui est compris est montré avant d'écrire :
 * on corrige un nom mal coupé plutôt que de créer seize fiches à nettoyer.
 */

const CHAMP =
  'w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400';

const EXEMPLE = `DUPONT Alice ; alice.dupont@france-metiers.fr ; 06 11 22 33 44
Bob MARTIN <bob.martin@france-metiers.fr>
Claire Petit`;

export function AjoutApprenants({ dossierId }: { dossierId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'un' | 'liste'>('liste');
  const [colle, setColle] = useState('');
  const [unique, setUnique] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const lecture = useMemo(() => parseListeApprenants(colle), [colle]);

  const enregistrer = (apprenants: Array<{ firstName: string; lastName: string; email: string | null; phone: string | null }>) => {
    setErreur(null);
    setSucces(null);
    startTransition(async () => {
      const res = await ajouterApprenants({ dossierId, apprenants });
      if (!res.ok) return setErreur(res.error);
      const bouts = [
        res.ajoutes > 0 ? `${res.ajoutes} inscrit${res.ajoutes > 1 ? 's' : ''}` : null,
        res.reutilises > 0 ? `${res.reutilises} déjà connu${res.reutilises > 1 ? 's' : ''} de votre CRM` : null,
      ].filter(Boolean);
      setSucces(`${bouts.join(' · ')}.`);
      setColle('');
      setUnique({ firstName: '', lastName: '', email: '', phone: '' });
      router.refresh();
    });
  };

  return (
    <section className="rounded-xl border border-rose-100 dark:border-rose-900/40 bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/25 dark:to-zinc-900 p-4 shadow-sm space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-lg grid place-items-center bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 shrink-0">
          <UserPlus className="w-4 h-4" />
        </span>
        <div>
          <h2 className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100">Inscrire des stagiaires</h2>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            Ils sont inscrits à toutes les séances du dossier.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 text-[13px]">
        {(['liste', 'un'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setErreur(null);
            }}
            className={`px-3 py-1.5 rounded-lg transition ${
              mode === m
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-medium'
                : 'text-zinc-600 dark:text-zinc-300 hover:bg-white/70 dark:hover:bg-zinc-800'
            }`}
          >
            {m === 'liste' ? 'Coller une liste' : 'Un par un'}
          </button>
        ))}
      </div>

      {mode === 'liste' ? (
        <div className="space-y-2.5">
          <textarea
            value={colle}
            onChange={(e) => setColle(e.target.value)}
            rows={6}
            placeholder={EXEMPLE}
            className="w-full resize-y rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-[13px] leading-relaxed text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 font-mono"
          />
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5" />
            Une personne par ligne. Nom, prénom, e-mail et téléphone dans n&apos;importe quel ordre.
          </p>

          {lecture.apprenants.length > 0 && (
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white/70 dark:bg-zinc-900/60 overflow-hidden">
              <p className="px-3 py-2 text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 border-b border-zinc-100 dark:border-zinc-800">
                <span className="tabular-nums">{lecture.apprenants.length}</span> personne
                {lecture.apprenants.length > 1 ? 's' : ''} comprise{lecture.apprenants.length > 1 ? 's' : ''}
              </p>
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80 max-h-60 overflow-y-auto">
                {lecture.apprenants.map((a, i) => (
                  <li key={`${a.lastName}-${i}`} className="px-3 py-2 flex items-center justify-between gap-3">
                    <span className="text-[13px] text-zinc-900 dark:text-zinc-100 truncate">
                      {a.firstName} <span className="font-semibold">{a.lastName}</span>
                    </span>
                    <span className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate">
                      {a.email ?? <span className="text-amber-600 dark:text-amber-400">sans e-mail</span>}
                      {a.phone ? ` · ${a.phone}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lecture.rejets.length > 0 && (
            <ul className="space-y-1">
              {lecture.rejets.map((r, i) => (
                <li key={i} className="text-[12px] text-amber-700 dark:text-amber-400 inline-flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    « {r.ligne.slice(0, 60)} » — {r.motif}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => enregistrer(lecture.apprenants)}
            disabled={pending || lecture.apprenants.length === 0}
            className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            Inscrire {lecture.apprenants.length > 0 ? `ces ${lecture.apprenants.length}` : 'les'} stagiaires
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <input
              value={unique.firstName}
              onChange={(e) => setUnique({ ...unique, firstName: e.target.value })}
              placeholder="Prénom"
              className={CHAMP}
            />
            <input
              value={unique.lastName}
              onChange={(e) => setUnique({ ...unique, lastName: e.target.value })}
              placeholder="Nom"
              className={CHAMP}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <input
              value={unique.email}
              onChange={(e) => setUnique({ ...unique, email: e.target.value })}
              type="email"
              placeholder="E-mail"
              className={CHAMP}
            />
            <input
              value={unique.phone}
              onChange={(e) => setUnique({ ...unique, phone: e.target.value })}
              placeholder="Téléphone"
              className={`${CHAMP} tabular-nums`}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (!unique.lastName.trim()) return setErreur('Le nom est nécessaire.');
              enregistrer([
                {
                  firstName: unique.firstName.trim(),
                  lastName: unique.lastName.trim(),
                  email: unique.email.trim() || null,
                  phone: unique.phone.trim() || null,
                },
              ]);
            }}
            disabled={pending}
            className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-60"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
            Inscrire
          </button>
        </div>
      )}

      {succes && (
        <p className="text-[12px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> {succes}
        </p>
      )}
      {erreur && (
        <p className="text-[12px] text-red-600 dark:text-red-400 inline-flex items-center gap-1.5">
          <X className="w-3.5 h-3.5" /> {erreur}
        </p>
      )}
    </section>
  );
}
