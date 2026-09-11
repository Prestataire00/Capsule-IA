'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAction } from 'next-safe-action/hooks';
import {
  X,
  Check,
  ArrowLeft,
  ArrowRight,
  Plus,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { InfoCallout } from '@/shared/ui/info-callout';
import { createDossierAction } from '../actions';
import { CreateDossierSchema, MODALITIES, type Modality } from '../schema';

const FUNDER_KIND_LABELS: Record<string, string> = {
  opco: 'OPCO',
  cpf: 'CPF',
  pole_emploi: 'France Travail',
  region: 'Région',
  autofinancement: 'Autofinancement',
  entreprise: 'Entreprise',
  autre: 'Autre',
};

// Une ligne de financement saisie dans le wizard (montant en euros, string contrôlé).
type FunderRow = { funderId: string; amountEuros: string; externalFileNumber: string };

const eurosFromCents = (cents: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

export type LearnerOption = { id: string; name: string; email: string; companyId: string | null };
export type FormationOption = {
  id: string;
  code: string;
  title: string;
  defaultHours: number;
  defaultPriceCents: number;
  defaultModality: string;
};
export type TrainerOption = { id: string; name: string; isInternal: boolean };
export type FunderOption = { id: string; name: string; kind: string };
export type ModuleOption = { moduleId: string; title: string; durationHours: number };

type ModuleRow = { moduleId: string; title: string; durationHours: number };

const MODALITY_LABELS: Record<Modality, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
};

export function NewDossierForm({
  learners,
  formations,
  trainers,
  funders,
  modulesByFormation,
}: {
  learners: LearnerOption[];
  formations: FormationOption[];
  trainers: TrainerOption[];
  funders: FunderOption[];
  modulesByFormation: Record<string, ModuleOption[]>;
}) {
  const router = useRouter();
  const { executeAsync } = useAction(createDossierAction);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // État du formulaire
  const [learnerId, setLearnerId] = useState<string>(learners[0]?.id ?? '');
  const [formationId, setFormationId] = useState<string>('');
  const [modality, setModality] = useState<Modality>('presentiel');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [trainerId, setTrainerId] = useState<string>(trainers[0]?.id ?? '');
  const [amountEuros, setAmountEuros] = useState<string>('');
  const [funderRows, setFunderRows] = useState<FunderRow[]>([]);

  const totalHours = useMemo(
    () => modules.reduce((acc, m) => acc + (Number(m.durationHours) || 0), 0),
    [modules],
  );

  const totalCents = amountEuros.trim() === '' ? null : Math.round(Number(amountEuros) * 100);
  const fundersTotalCents = useMemo(
    () => funderRows.reduce((acc, r) => acc + (Math.round(Number(r.amountEuros) * 100) || 0), 0),
    [funderRows],
  );
  const resteAChargeCents = totalCents == null ? null : totalCents - fundersTotalCents;
  const fundersOverTotal = totalCents != null && fundersTotalCents > totalCents;

  const availableFunders = (rowIdx: number) =>
    funders.filter(
      (f) => f.id === funderRows[rowIdx]?.funderId || !funderRows.some((r) => r.funderId === f.id),
    );

  function addFunderRow() {
    setFunderRows((prev) => [...prev, { funderId: '', amountEuros: '', externalFileNumber: '' }]);
  }
  function updateFunderRow(idx: number, patch: Partial<FunderRow>) {
    setFunderRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeFunderRow(idx: number) {
    setFunderRows((prev) => prev.filter((_, i) => i !== idx));
  }

  const selectedLearner = learners.find((l) => l.id === learnerId) ?? null;

  function applyFormation(id: string) {
    setFormationId(id);
    const f = formations.find((x) => x.id === id);
    if (!f) return;
    if (MODALITIES.includes(f.defaultModality as Modality)) {
      setModality(f.defaultModality as Modality);
    }
    if (!amountEuros && f.defaultPriceCents > 0) {
      setAmountEuros(String(Math.round(f.defaultPriceCents / 100)));
    }
    const fmods = modulesByFormation[id] ?? [];
    setModules(fmods.map((m) => ({ moduleId: m.moduleId, title: m.title, durationHours: m.durationHours })));
  }

  function updateModuleHours(idx: number, value: string) {
    setModules((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, durationHours: Number(value) || 0 } : m)),
    );
  }
  function removeModule(idx: number) {
    setModules((prev) => prev.filter((_, i) => i !== idx));
  }

  const step1Valid = Boolean(learnerId && formationId && startDate && endDate && endDate >= startDate);
  const step2Valid = true; // formateur et modules optionnels au stade brouillon

  async function handleSubmit() {
    setError(null);

    const candidate = {
      learnerId,
      formationId,
      companyId: selectedLearner?.companyId ?? null,
      modality,
      startDate,
      endDate,
      modules: modules.map((m) => ({
        moduleId: m.moduleId,
        title: m.title,
        durationHours: Number(m.durationHours) || 0,
      })),
      trainerId: trainerId || null,
      totalAmountCents: totalCents,
      funders: funderRows
        .filter((r) => r.funderId)
        .map((r) => ({
          funderId: r.funderId,
          amountCents: Math.round(Number(r.amountEuros) * 100) || 0,
          externalFileNumber: r.externalFileNumber.trim() || null,
        })),
    };

    const parsed = CreateDossierSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Formulaire invalide');
      return;
    }

    setSubmitting(true);
    const res = await executeAsync(parsed.data);
    setSubmitting(false);

    const out = res?.data;
    if (out?.ok) {
      router.push(`/dossiers/${out.dossierId}`);
      router.refresh();
      return;
    }
    if (out && out.error === 'forbidden_not_admin') {
      setError("Vous n'avez pas les droits pour créer un dossier.");
      return;
    }
    const details = out && 'details' in out ? out.details : undefined;
    setError(details ?? 'La création du dossier a échoué. Réessayez.');
  }

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-white dark:bg-zinc-950 flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between">
        <Link
          href="/dossiers"
          className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition"
        >
          <X className="w-3.5 h-3.5" />
          Quitter
        </Link>
      </header>

      <div className="flex-1 flex flex-col items-center justify-start pt-12 px-6 pb-12">
        <Stepper current={step} />

        <div className="w-full max-w-[480px] mt-12 space-y-6">
          {step === 1 && (
            <section className="space-y-6">
              <div className="text-center">
                <h1 className="text-[30px] leading-tight font-extrabold text-zinc-900 dark:text-zinc-100">
                  Pour qui et quelle formation ?
                </h1>
                <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
                  Sélectionnez l&apos;apprenant, la formation et la période.
                </p>
              </div>

              <div className="space-y-4">
                <Field label="Apprenant *">
                  {learners.length === 0 ? (
                    <EmptyHint href="/apprenants/nouveau" label="Créer un apprenant" />
                  ) : (
                    <select value={learnerId} onChange={(e) => setLearnerId(e.target.value)} className={selectCls}>
                      {learners.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} — {l.email}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>

                <Field label="Formation *">
                  {formations.length === 0 ? (
                    <EmptyHint href="/formations/nouvelle" label="Créer une formation" />
                  ) : (
                    <select value={formationId} onChange={(e) => applyFormation(e.target.value)} className={selectCls}>
                      <option value="">— Choisir une formation —</option>
                      {formations.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.code} — {f.title} · {f.defaultHours}h
                        </option>
                      ))}
                    </select>
                  )}
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date de début *">
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Date de fin *">
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
                  </Field>
                </div>

                <Field label="Modalité *">
                  <div className="grid grid-cols-4 gap-2">
                    {MODALITIES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setModality(m)}
                        className={
                          m === modality
                            ? 'border border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 font-bold rounded-lg px-2 h-9 text-[12px] text-center'
                            : 'border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-semibold rounded-lg px-2 h-9 text-[12px] text-center hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                        }
                      >
                        {MODALITY_LABELS[m]}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>

              <div className="flex items-center justify-end pt-4">
                <button type="button" disabled={!step1Valid} onClick={() => setStep(2)} className={nextBtnCls}>
                  Suivant
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-6">
              <div className="text-center">
                <h1 className="text-[30px] leading-tight font-extrabold text-zinc-900 dark:text-zinc-100">
                  Modules et formateur
                </h1>
                <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
                  Ajustez les modules de la formation pour ce dossier.
                </p>
              </div>

              <div>
                <p className="text-[11px] font-bold tracking-[0.06em] uppercase text-zinc-500 dark:text-zinc-400 mb-2">
                  Modules · <span className="tabular-nums">{totalHours} h</span>
                </p>
                {modules.length === 0 ? (
                  <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                    Aucun module rattaché à cette formation. Le dossier sera créé avec une durée minimale (modifiable ensuite).
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {modules.map((m, i) => (
                      <li
                        key={`${m.moduleId}-${i}`}
                        className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-lg px-3 py-2.5 flex items-center gap-3 group"
                      >
                        <span className="tabular-nums text-[12px] text-zinc-400 w-5">{i + 1}.</span>
                        <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100 flex-1 truncate">{m.title}</span>
                        <input
                          type="number"
                          min={0}
                          value={m.durationHours}
                          onChange={(e) => updateModuleHours(i, e.target.value)}
                          className="w-16 h-8 bg-white dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-2 text-[13px] text-right tabular-nums transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10"
                        />
                        <span className="text-[12px] text-zinc-400">h</span>
                        <button
                          type="button"
                          aria-label="Retirer"
                          onClick={() => removeModule(i)}
                          className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-600 transition"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="text-[11px] font-bold tracking-[0.06em] uppercase text-zinc-500 dark:text-zinc-400 mb-2">
                  Formateur référent
                </p>
                {trainers.length === 0 ? (
                  <EmptyHint href="/formateurs/nouveau" label="Créer un formateur" />
                ) : (
                  <select value={trainerId} onChange={(e) => setTrainerId(e.target.value)} className={selectCls}>
                    <option value="">— Aucun pour l&apos;instant —</option>
                    {trainers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.isInternal ? '(interne)' : '(externe)'}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center justify-between pt-4">
                <button type="button" onClick={() => setStep(1)} className={backBtnCls}>
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Précédent
                </button>
                <button type="button" disabled={!step2Valid} onClick={() => setStep(3)} className={nextBtnCls}>
                  Suivant
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-6">
              <div className="text-center">
                <h1 className="text-[30px] leading-tight font-extrabold text-zinc-900 dark:text-zinc-100">
                  Financement
                </h1>
                <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
                  Montant et financeur (optionnels au stade brouillon).
                </p>
              </div>

              <div className="space-y-4">
                <Field label="Montant total HT">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={amountEuros}
                      onChange={(e) => setAmountEuros(e.target.value)}
                      placeholder="0"
                      className={`flex-1 ${inputCls}`}
                    />
                    <span className="text-[13px] text-zinc-500 dark:text-zinc-400">€</span>
                  </div>
                </Field>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold tracking-[0.06em] uppercase text-zinc-500 dark:text-zinc-400">
                      Financements
                    </span>
                    {funders.length === 0 ? (
                      <EmptyHint href="/financeurs/nouveau" label="Créer un financeur" />
                    ) : (
                      <button
                        type="button"
                        onClick={addFunderRow}
                        className="text-[12px] font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 inline-flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Ajouter un financeur
                      </button>
                    )}
                  </div>

                  {funderRows.length === 0 ? (
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                      Aucun financeur — la totalité sera en reste à charge (entreprise / apprenant).
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {funderRows.map((row, idx) => (
                        <li
                          key={idx}
                          className="bg-white dark:bg-zinc-900 rounded-lg p-3 space-y-2 border border-zinc-200/70 dark:border-zinc-800"
                        >
                          <div className="flex items-center gap-2">
                            <select
                              value={row.funderId}
                              onChange={(e) => updateFunderRow(idx, { funderId: e.target.value })}
                              className={`flex-1 ${selectCls}`}
                            >
                              <option value="">— Choisir un financeur —</option>
                              {availableFunders(idx).map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.name}
                                  {FUNDER_KIND_LABELS[f.kind] ? ` · ${FUNDER_KIND_LABELS[f.kind]}` : ''}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              aria-label="Retirer ce financeur"
                              onClick={() => removeFunderRow(idx)}
                              className="text-zinc-400 hover:text-red-600 transition"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                value={row.amountEuros}
                                onChange={(e) => updateFunderRow(idx, { amountEuros: e.target.value })}
                                placeholder="Montant pris en charge"
                                className={`flex-1 ${inputCls}`}
                              />
                              <span className="text-[12px] text-zinc-500 dark:text-zinc-400">€</span>
                            </div>
                            <input
                              type="text"
                              value={row.externalFileNumber}
                              onChange={(e) => updateFunderRow(idx, { externalFileNumber: e.target.value })}
                              placeholder="N° prise en charge"
                              className={`${inputCls} placeholder:text-zinc-400`}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {totalCents != null && (funderRows.length > 0 || fundersTotalCents > 0) && (
                    <div
                      className={`mt-2 rounded-lg px-3 py-2 text-[12px] flex items-center justify-between ${
                        fundersOverTotal
                          ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border border-red-200/60 dark:border-red-900/40'
                          : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border border-zinc-200/70 dark:border-zinc-800'
                      }`}
                    >
                      <span>
                        Financé : <span className="tabular-nums font-bold">{eurosFromCents(fundersTotalCents)}</span> ·
                        Reste à charge :{' '}
                        <span className="tabular-nums font-bold">{eurosFromCents(Math.max(0, resteAChargeCents ?? 0))}</span>
                      </span>
                      {fundersOverTotal && <span className="font-bold">dépasse le total</span>}
                    </div>
                  )}
                </div>
              </div>

              <InfoCallout tone="info">
                <p className="font-bold">Que se passe-t-il à la création ?</p>
                <ul className="mt-1 space-y-0.5 text-[12px]">
                  <li>· Le dossier est créé en statut <code className="font-mono">draft</code></li>
                  <li>· Vous pourrez générer la convention, le programme et l&apos;attestation depuis l&apos;onglet Documents</li>
                  <li>· La checklist Qualiopi est disponible pour ce dossier</li>
                </ul>
              </InfoCallout>

              {error && (
                <div className="flex items-start gap-2 text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-900/40 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-4">
                <button type="button" onClick={() => setStep(2)} className={backBtnCls} disabled={submitting}>
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Précédent
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || fundersOverTotal}
                  className={nextBtnCls}
                >
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {submitting ? 'Création…' : 'Créer le dossier'}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

const selectCls =
  'w-full h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10';
const inputCls =
  'w-full h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] tabular-nums transition focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10';
const nextBtnCls =
  'bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 inline-flex items-center gap-2';
const backBtnCls =
  'text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition disabled:opacity-40';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold tracking-[0.06em] uppercase text-zinc-500 dark:text-zinc-400 block mb-2">
        {label}
      </span>
      {children}
    </label>
  );
}

function EmptyHint({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
    >
      <Plus className="w-3.5 h-3.5" />
      {label}
    </Link>
  );
}

function Stepper({ current }: { current: number }) {
  const steps = [
    { num: 1, label: 'Contexte' },
    { num: 2, label: 'Modules & formateur' },
    { num: 3, label: 'Finance & validation' },
  ];
  return (
    <div className="w-full max-w-[580px] flex items-center">
      {steps.map((s, i) => {
        const isActive = s.num === current;
        const isDone = current > s.num;
        return (
          <div key={s.num} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <div
                className={
                  isDone
                    ? 'w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center text-[13px] font-bold tabular-nums'
                    : isActive
                    ? 'w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-[13px] font-bold tabular-nums shadow-sm shadow-orange-600/30'
                    : 'w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-400 dark:text-zinc-500 flex items-center justify-center text-[13px] font-semibold tabular-nums'
                }
              >
                {isDone ? <Check className="w-4 h-4" /> : s.num}
              </div>
              <span
                className={
                  isActive
                    ? 'text-[12px] text-zinc-900 dark:text-zinc-100 font-bold'
                    : 'text-[12px] text-zinc-500 dark:text-zinc-400'
                }
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={
                  isDone
                    ? 'flex-1 h-px bg-emerald-300 dark:bg-emerald-800 mx-2 mb-6'
                    : 'flex-1 h-px bg-zinc-200 dark:bg-zinc-800 mx-2 mb-6'
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
