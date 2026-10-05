'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { tableauGrille, type GrilleTarifaire } from '@/features/billing/grille-tarifaire';
import { grilleSchema } from '@/features/billing/grille-tarifaire.schema';
import { enregistrerGrille } from './actions';

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const enEuros = (cents: number) => cents / 100;

type Palier = { aPartirDe: string; tarifHoraire: string };

export function GrilleForm({ initiale }: { initiale: GrilleTarifaire }) {
  const router = useRouter();
  const [standard, setStandard] = useState(String(enEuros(initiale.tarifStandardCents)));
  const [plancher, setPlancher] = useState(String(enEuros(initiale.plancherHoraireCents)));
  const [cout, setCout] = useState(String(enEuros(initiale.coutFormateurHoraireCents)));
  const [paliers, setPaliers] = useState<Palier[]>(
    initiale.paliers.map((p) => ({ aPartirDe: String(p.aPartirDe), tarifHoraire: String(enEuros(p.tarifHoraireCents)) })),
  );
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [pending, start] = useTransition();

  const nombre = (v: string) => Number(v.replace(',', '.'));
  const saisie = {
    tarifStandard: nombre(standard),
    plancherHoraire: nombre(plancher),
    coutFormateurHoraire: nombre(cout),
    paliers: paliers.map((p) => ({ aPartirDe: Math.round(nombre(p.aPartirDe)), tarifHoraire: nombre(p.tarifHoraire) })),
  };
  const valide = grilleSchema.safeParse(saisie);
  const apercu = valide.success
    ? tableauGrille({
        tarifStandardCents: Math.round(saisie.tarifStandard * 100),
        plancherHoraireCents: Math.round(saisie.plancherHoraire * 100),
        coutFormateurHoraireCents: Math.round(saisie.coutFormateurHoraire * 100),
        paliers: saisie.paliers.map((p) => ({ aPartirDe: p.aPartirDe, tarifHoraireCents: Math.round(p.tarifHoraire * 100) })),
      })
    : null;
  const seuil = valide.success && saisie.tarifStandard > 0 ? Math.ceil(saisie.plancherHoraire / saisie.tarifStandard) : null;

  const enregistrer = () =>
    start(async () => {
      setMessage(null);
      if (!valide.success) return setMessage({ ok: false, texte: valide.error.issues[0]?.message ?? 'Grille invalide.' });
      const r = await enregistrerGrille(valide.data);
      setMessage(r.ok ? { ok: true, texte: 'Grille enregistrée.' } : { ok: false, texte: r.error });
      if (r.ok) router.refresh();
    });

  const champ =
    'w-28 h-9 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] tabular-nums text-right';

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 items-start">
      <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm space-y-4">
        <Ligne libelle="Tarif standard" aide="Par heure et par stagiaire, HT.">
          <input inputMode="decimal" value={standard} onChange={(e) => setStandard(e.target.value)} className={champ} /> €
        </Ligne>
        <Ligne
          libelle="Plancher par heure de séance"
          aide={seuil ? `Facturé quel que soit l’effectif — revient au tarif standard × ${seuil} stagiaires.` : 'Facturé quel que soit l’effectif.'}
        >
          <input inputMode="decimal" value={plancher} onChange={(e) => setPlancher(e.target.value)} className={champ} /> €
        </Ligne>
        <div className="space-y-2">
          <p className="text-[13px] text-zinc-900 dark:text-zinc-100">Tarifs dégressifs</p>
          {paliers.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-[13px] text-zinc-600 dark:text-zinc-300">
              À partir de
              <input
                inputMode="numeric"
                value={p.aPartirDe}
                onChange={(e) => setPaliers((ps) => ps.map((x, j) => (j === i ? { ...x, aPartirDe: e.target.value } : x)))}
                className="w-16 h-9 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[13px] tabular-nums text-right"
              />
              stagiaires :
              <input
                inputMode="decimal"
                value={p.tarifHoraire}
                onChange={(e) => setPaliers((ps) => ps.map((x, j) => (j === i ? { ...x, tarifHoraire: e.target.value } : x)))}
                className={champ}
              />
              €/h
              <button
                type="button"
                onClick={() => setPaliers((ps) => ps.filter((_, j) => j !== i))}
                className="w-8 h-8 grid place-items-center rounded-lg text-zinc-400 hover:text-red-600"
                aria-label="Retirer ce palier"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPaliers((ps) => [...ps, { aPartirDe: '', tarifHoraire: '' }])}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-orange-600 dark:text-orange-400 hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter un palier
          </button>
        </div>
        <Ligne libelle="Coût horaire du formateur" aide="Sert seulement à afficher la marge, jamais facturé.">
          <input inputMode="decimal" value={cout} onChange={(e) => setCout(e.target.value)} className={champ} /> €
        </Ligne>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={enregistrer}
            disabled={pending}
            className="h-9 px-4 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Enregistrer la grille
          </button>
          {message && (
            <span className={`text-[12px] ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {message.texte}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-zinc-50 dark:bg-zinc-950/40 text-[11px] uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Stagiaires</th>
              <th className="text-right px-4 py-2 font-medium">Tarif /h /stagiaire</th>
              <th className="text-right px-4 py-2 font-medium">CA horaire</th>
              <th className="text-right px-4 py-2 font-medium">Marge horaire</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {apercu ? (
              apercu.map((l) => (
                <tr key={l.stagiaires}>
                  <td className="px-4 py-2 tabular-nums text-zinc-900 dark:text-zinc-100">{l.stagiaires}</td>
                  <td className="px-4 py-2 tabular-nums text-right text-zinc-900 dark:text-zinc-100">{eur.format(l.horaireParStagiaireCents / 100)}</td>
                  <td className="px-4 py-2 tabular-nums text-right text-emerald-700 dark:text-emerald-400">{eur.format(l.horaireSessionCents / 100)}</td>
                  <td className="px-4 py-2 tabular-nums text-right text-zinc-600 dark:text-zinc-400">
                    {eur.format(l.margeHoraireCents / 100)}
                    {l.horaireSessionCents > 0 && (
                      <span className="text-zinc-400"> ({Math.round((l.margeHoraireCents / l.horaireSessionCents) * 100)} %)</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">Corrigez la saisie pour voir l’aperçu.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Ligne({ libelle, aide, children }: { libelle: string; aide: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-[13px] text-zinc-900 dark:text-zinc-100">{libelle}</p>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{aide}</p>
      </div>
      <div className="flex items-center gap-1.5 text-[13px] text-zinc-500 shrink-0">{children}</div>
    </div>
  );
}
