'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, Loader2, Plus, Trash2, Check, X } from 'lucide-react';
import { parseListeApprenants } from '@/features/dossier/parse-learners';
import { ajouterApprenants } from './actions';

/**
 * Inscription des stagiaires : une ligne par personne, quatre cases.
 *
 * Un collage multi-lignes reste accepté — la liste nominative arrive en
 * tableau ou en corps de mail, et la retaper seize fois n'a pas de sens : le
 * contenu se répartit alors dans les cases, où il reste corrigeable avant
 * d'être enregistré.
 */

type Ligne = { firstName: string; lastName: string; email: string; phone: string };

const VIDE: Ligne = { firstName: '', lastName: '', email: '', phone: '' };
const LIGNES_INITIALES = 3;
const MAX_LIGNES = 200;

const CASE_BASE =
  'w-full h-9 px-2.5 rounded-lg border bg-white dark:bg-zinc-950 text-[13px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-400/60';
const CASE = `${CASE_BASE} border-zinc-200 dark:border-zinc-700`;
const CASE_MANQUANTE = `${CASE_BASE} border-red-300 dark:border-red-800`;

const remplie = (l: Ligne): boolean =>
  Boolean(l.firstName.trim() || l.lastName.trim() || l.email.trim() || l.phone.trim());

export function AjoutApprenants({ dossierId }: { dossierId: string }) {
  const router = useRouter();
  const [lignes, setLignes] = useState<Ligne[]>(() => Array.from({ length: LIGNES_INITIALES }, () => ({ ...VIDE })));
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [montreManques, setMontreManques] = useState(false);
  const [pending, startTransition] = useTransition();

  const modifier = (index: number, champ: keyof Ligne, valeur: string) => {
    setLignes((actuelles) => actuelles.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)));
    setErreur(null);
    setSucces(null);
  };

  const supprimerLigne = (index: number) => {
    setLignes((actuelles) => (actuelles.length === 1 ? [{ ...VIDE }] : actuelles.filter((_, i) => i !== index)));
  };

  /**
   * Coller plusieurs lignes remplit le tableau à partir de la case visée,
   * plutôt que d'entasser la liste entière dans une seule case.
   */
  const collerDepuis = (index: number, evenement: React.ClipboardEvent<HTMLInputElement>) => {
    const texte = evenement.clipboardData.getData('text');
    if (!texte.includes('\n') && !texte.includes('\t')) return;
    evenement.preventDefault();

    const { apprenants } = parseListeApprenants(texte);
    if (apprenants.length === 0) return;

    setLignes((actuelles) => {
      const suite = [...actuelles];
      apprenants.forEach((a, decalage) => {
        const cible = index + decalage;
        const ligne: Ligne = {
          firstName: a.firstName,
          lastName: a.lastName,
          email: a.email ?? '',
          phone: a.phone ?? '',
        };
        if (cible < suite.length) suite[cible] = ligne;
        else suite.push(ligne);
      });
      return suite.slice(0, MAX_LIGNES);
    });
    setErreur(null);
    setSucces(null);
  };

  const aInscrire = lignes.filter(remplie);
  const sansNom = aInscrire.filter((l) => !l.lastName.trim()).length;

  const enregistrer = () => {
    setErreur(null);
    setSucces(null);
    if (aInscrire.length === 0) return setErreur('Renseignez au moins une personne.');
    if (sansNom > 0) {
      setMontreManques(true);
      return setErreur(
        sansNom === 1 ? 'Une ligne est sans nom de famille.' : `${sansNom} lignes sont sans nom de famille.`,
      );
    }

    startTransition(async () => {
      const res = await ajouterApprenants({
        dossierId,
        apprenants: aInscrire.map((l) => ({
          firstName: l.firstName.trim(),
          lastName: l.lastName.trim(),
          email: l.email.trim() || null,
          phone: l.phone.trim() || null,
        })),
      });
      if (!res.ok) return setErreur(res.error);

      const bouts = [
        res.ajoutes > 0 ? `${res.ajoutes} inscrit${res.ajoutes > 1 ? 's' : ''}` : null,
        res.reutilises > 0 ? `${res.reutilises} déjà connu${res.reutilises > 1 ? 's' : ''} de votre CRM` : null,
      ].filter(Boolean);
      setSucces(`${bouts.join(' · ')}.`);
      setLignes(Array.from({ length: LIGNES_INITIALES }, () => ({ ...VIDE })));
      setMontreManques(false);
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
            Ils sont inscrits à toutes les séances du dossier. Vous pouvez aussi coller une liste : elle se répartit
            dans les cases.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[620px] border-separate border-spacing-y-1.5">
          <thead>
            <tr className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 text-left">
              <th className="w-8 pb-0.5" aria-label="Ligne" />
              <th className="pb-0.5 font-bold">Prénom</th>
              <th className="pb-0.5 font-bold">
                Nom <span className="text-red-500">*</span>
              </th>
              <th className="pb-0.5 font-bold">E-mail</th>
              <th className="pb-0.5 font-bold">Téléphone</th>
              <th className="w-9 pb-0.5" aria-label="Retirer" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => {
              const manque = montreManques && remplie(l) && !l.lastName.trim();
              return (
                <tr key={i}>
                  <td className="text-[12px] text-zinc-400 tabular-nums pr-1">{i + 1}</td>
                  <td className="pr-1.5">
                    <input
                      value={l.firstName}
                      onChange={(e) => modifier(i, 'firstName', e.target.value)}
                      onPaste={(e) => collerDepuis(i, e)}
                      placeholder="Alice"
                      autoComplete="off"
                      className={CASE}
                    />
                  </td>
                  <td className="pr-1.5">
                    <input
                      value={l.lastName}
                      onChange={(e) => modifier(i, 'lastName', e.target.value)}
                      onPaste={(e) => collerDepuis(i, e)}
                      placeholder="DUPONT"
                      autoComplete="off"
                      aria-invalid={manque || undefined}
                      className={manque ? CASE_MANQUANTE : CASE}
                    />
                  </td>
                  <td className="pr-1.5">
                    <input
                      value={l.email}
                      onChange={(e) => modifier(i, 'email', e.target.value)}
                      onPaste={(e) => collerDepuis(i, e)}
                      type="email"
                      placeholder="alice.dupont@client.fr"
                      autoComplete="off"
                      className={CASE}
                    />
                  </td>
                  <td className="pr-1.5">
                    <input
                      value={l.phone}
                      onChange={(e) => modifier(i, 'phone', e.target.value)}
                      onPaste={(e) => collerDepuis(i, e)}
                      placeholder="06 11 22 33 44"
                      autoComplete="off"
                      className={`${CASE} tabular-nums`}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => supprimerLigne(i)}
                      aria-label={`Retirer la ligne ${i + 1}`}
                      title="Retirer la ligne"
                      className="w-8 h-8 rounded-md grid place-items-center text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setLignes((a) => (a.length >= MAX_LIGNES ? a : [...a, { ...VIDE }]))}
          className="h-9 px-3 rounded-lg text-[13px] font-medium inline-flex items-center gap-1.5 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white/70 dark:bg-zinc-900/60 hover:bg-white dark:hover:bg-zinc-800 transition"
        >
          <Plus className="w-3.5 h-3.5" /> Ajouter une ligne
        </button>
        <button
          type="button"
          onClick={enregistrer}
          disabled={pending || aInscrire.length === 0}
          className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-50"
        >
          {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
          {aInscrire.length > 1 ? `Inscrire ces ${aInscrire.length} stagiaires` : 'Inscrire'}
        </button>
        <span className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Le nom est obligatoire. Sans e-mail, ni convocation ni lien d&apos;émargement ne partiront.
        </span>
      </div>

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
