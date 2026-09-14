'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  FileUp,
  FolderOpen,
  GraduationCap,
  ListChecks,
  Loader2,
  Sparkles,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { ACCENTS } from '@/shared/ui/kpi-card';
import type { ConventionImport, ImportSummary } from './types';

const champ =
  'w-full text-[13px] px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30';
const etiquette = 'text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400';

const ERREURS: Record<string, string> = {
  unauthenticated: 'Session expirée — reconnectez-vous.',
  forbidden: 'Votre rôle ne permet pas d’importer une convention.',
  no_file: 'Choisissez au moins un PDF.',
  too_many_files: 'Six documents au maximum.',
  not_pdf: 'Seuls les PDF sont acceptés.',
  file_too_large: 'Un fichier dépasse 5 Mo.',
  total_too_large: 'L’ensemble des fichiers dépasse 20 Mo.',
  no_api_key: 'La lecture par IA n’est pas configurée sur ce serveur (clé Anthropic absente).',
  extraction_failed: 'La lecture des documents a échoué. Réessayez, ou vérifiez que le PDF n’est pas une image scannée illisible.',
  apply_failed: 'La création dans le CRM a échoué.',
  bad_payload: 'Les données relues sont invalides.',
};

const euros = (cents: number | null): string => (cents == null ? '' : (cents / 100).toString());
const centimes = (v: string): number | null => {
  const n = Number(v.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

/** Lire une convention, relire ce qui a été compris, puis créer dans le CRM. */
export function ImportConventionClient() {
  const router = useRouter();
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [etape, setEtape] = useState<'depot' | 'relecture' | 'fait'>('depot');
  const [payload, setPayload] = useState<ConventionImport | null>(null);
  const [resume, setResume] = useState<ImportSummary | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const lire = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      const body = new FormData();
      for (const f of fichiers) body.append('files', f);
      const res = await fetch('/api/import/convention', { method: 'POST', body });
      const json = (await res.json()) as { ok?: boolean; data?: ConventionImport; error?: string };
      if (!res.ok || !json.ok || !json.data) {
        setErreur(ERREURS[json.error ?? ''] ?? 'La lecture a échoué.');
        return;
      }
      setPayload(json.data);
      setEtape('relecture');
    } catch {
      setErreur('La lecture a échoué (réseau).');
    } finally {
      setEnCours(false);
    }
  };

  const creer = async () => {
    if (!payload) return;
    setErreur(null);
    setEnCours(true);
    try {
      const body = new FormData();
      body.append('payload', JSON.stringify(payload));
      for (const f of fichiers) body.append('files', f);
      const res = await fetch('/api/import/convention/apply', { method: 'POST', body });
      const json = (await res.json()) as { ok?: boolean; summary?: ImportSummary; error?: string };
      if (!res.ok || !json.ok || !json.summary) {
        setErreur(ERREURS[json.error ?? ''] ?? 'La création a échoué.');
        return;
      }
      setResume(json.summary);
      setEtape('fait');
      router.refresh();
    } catch {
      setErreur('La création a échoué (réseau).');
    } finally {
      setEnCours(false);
    }
  };

  if (etape === 'fait' && resume) {
    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-900/60 rounded-xl shadow-sm p-5">
          <p className="text-[15px] font-bold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Import terminé
          </p>
          <ul className="mt-3 space-y-1.5 text-[13px] text-zinc-700 dark:text-zinc-300">
            <li>
              Client : {resume.companyCreated ? 'créé' : resume.companyId ? 'déjà présent, réutilisé' : 'non identifié'}
              {resume.contactCreated ? ' · contact du signataire ajouté' : ''}
            </li>
            <li className="tabular-nums">
              {resume.formations.length} formation{resume.formations.length > 1 ? 's' : ''} sur mesure ·{' '}
              {resume.sessions} séance{resume.sessions > 1 ? 's' : ''} planifiée{resume.sessions > 1 ? 's' : ''}
              {resume.learners > 0 ? ` · ${resume.learners} apprenant(s)` : ''}
              {resume.funders > 0 ? ` · ${resume.funders} financeur(s)` : ''}
              {resume.trainers > 0 ? ` · ${resume.trainers} formateur(s) rattaché(s)` : ''}
            </li>
            <li>{resume.taskCreated ? 'Une tâche a été créée pour récupérer la liste nominative.' : 'Aucune tâche nécessaire.'}</li>
            <li className="tabular-nums">{resume.documents} document(s) source archivé(s).</li>
          </ul>
          {resume.warnings.length > 0 && (
            <ul className="mt-3 space-y-1 text-[12px] text-amber-700 dark:text-amber-300">
              {resume.warnings.map((w) => (
                <li key={w} className="inline-flex items-start gap-1.5">
                  <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {w}
                </li>
              ))}
            </ul>
          )}
          {resume.dossierId && (
            <p className="mt-3 text-[13px] text-zinc-700 dark:text-zinc-300">
              Tout est rassemblé dans le dossier{' '}
              <Link href={`/dossiers/${resume.dossierId}`} className="font-semibold text-orange-600 dark:text-orange-400 hover:underline">
                {resume.dossierReference ?? 'du client'}
              </Link>{' '}
              : la formation, les séances, la convention et les programmes importés.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-4">
            {resume.dossierId && (
              <Link
                href={`/dossiers/${resume.dossierId}`}
                className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-9 rounded-lg inline-flex items-center gap-1.5 shadow-sm shadow-orange-600/30"
              >
                <FolderOpen className="w-3.5 h-3.5" /> Ouvrir le dossier
              </Link>
            )}
            {resume.formations.map((f) => (
              <Link
                key={f.id}
                href={`/formations/${f.id}`}
                className="text-[13px] font-semibold px-3 h-9 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
              >
                <GraduationCap className="w-3.5 h-3.5" /> {f.title}
              </Link>
            ))}
            <Link href="/sessions" className="text-[13px] font-semibold px-3 h-9 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
              <CalendarClock className="w-3.5 h-3.5" /> Les séances
            </Link>
            {resume.companyId && (
              <Link href={`/entreprises/${resume.companyId}`} className="text-[13px] font-semibold px-3 h-9 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                <Building2 className="w-3.5 h-3.5" /> Le client
              </Link>
            )}
            {resume.taskCreated && (
              <Link href="/taches" className="text-[13px] font-semibold px-3 h-9 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/80 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                <ListChecks className="w-3.5 h-3.5" /> La tâche
              </Link>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setFichiers([]);
            setPayload(null);
            setResume(null);
            setEtape('depot');
          }}
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          Importer une autre convention
        </button>
      </div>
    );
  }

  if (etape === 'relecture' && payload) {
    const maj = (patch: Partial<ConventionImport>) => setPayload({ ...payload, ...patch });

    return (
      <div className="space-y-4">
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
          Voici ce qui a été lu. Corrigez ce qui doit l’être, puis créez : rien n’est écrit avant votre validation.
        </p>

        <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-3">
          <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
            <Building2 className="w-4 h-4 text-zinc-400" /> Client
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className={etiquette}>Raison sociale</span>
              <input value={payload.client.name} onChange={(e) => maj({ client: { ...payload.client, name: e.target.value } })} className={champ} />
            </label>
            <label className="block space-y-1">
              <span className={etiquette}>SIRET</span>
              <input value={payload.client.siret} onChange={(e) => maj({ client: { ...payload.client, siret: e.target.value } })} className={`${champ} tabular-nums`} />
            </label>
            <label className="block space-y-1 sm:col-span-2">
              <span className={etiquette}>Adresse</span>
              <input value={payload.client.address} onChange={(e) => maj({ client: { ...payload.client, address: e.target.value } })} className={champ} />
            </label>
            <label className="block space-y-1">
              <span className={etiquette}>Signataire</span>
              <input
                value={`${payload.client.representativeFirstName} ${payload.client.representativeLastName}`.trim()}
                onChange={(e) => {
                  const [prenom = '', ...reste] = e.target.value.trim().split(' ');
                  maj({ client: { ...payload.client, representativeFirstName: prenom, representativeLastName: reste.join(' ') } });
                }}
                className={champ}
              />
            </label>
            <label className="block space-y-1">
              <span className={etiquette}>E-mail de contact</span>
              <input value={payload.client.contactEmail} onChange={(e) => maj({ client: { ...payload.client, contactEmail: e.target.value } })} className={champ} />
            </label>
          </div>
        </section>

        {payload.formations.map((f, i) => (
          <section key={i} className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-3">
            <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-zinc-400" /> Formation {payload.formations.length > 1 ? i + 1 : ''}
            </p>
            <div className="grid sm:grid-cols-[1fr_120px_140px] gap-3">
              <label className="block space-y-1">
                <span className={etiquette}>Intitulé</span>
                <input
                  value={f.title}
                  onChange={(e) => {
                    const copie = [...payload.formations];
                    copie[i] = { ...f, title: e.target.value };
                    maj({ formations: copie });
                  }}
                  className={champ}
                />
              </label>
              <label className="block space-y-1">
                <span className={etiquette}>Heures</span>
                <input
                  value={f.durationHours}
                  onChange={(e) => {
                    const copie = [...payload.formations];
                    copie[i] = { ...f, durationHours: e.target.value };
                    maj({ formations: copie });
                  }}
                  className={`${champ} tabular-nums`}
                />
              </label>
              <label className="block space-y-1">
                <span className={etiquette}>Modalité</span>
                <select
                  value={f.modality}
                  onChange={(e) => {
                    const copie = [...payload.formations];
                    copie[i] = { ...f, modality: e.target.value as typeof f.modality };
                    maj({ formations: copie });
                  }}
                  className={champ}
                >
                  <option value="presentiel">Présentiel</option>
                  <option value="distanciel">Distanciel</option>
                  <option value="hybride">Hybride</option>
                </select>
              </label>
            </div>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
              {f.modules.length} module(s) · {f.objectives.length} objectif(s) · {f.prerequisites.length} prérequis — repris
              dans le programme de la formation, modifiables ensuite sur sa fiche.
            </p>
          </section>
        ))}

        <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-3">
          <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-zinc-400" /> Séances
            <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums ${ACCENTS.blue.soft}`}>
              {payload.sessions.length}
            </span>
          </p>
          {payload.sessions.length === 0 ? (
            <p className="text-[13px] text-zinc-500">Aucune date exploitable trouvée : vous planifierez les séances à la main.</p>
          ) : (
            <ul className="space-y-2">
              {payload.sessions.map((s, i) => (
                <li key={i} className="grid sm:grid-cols-[1fr_130px_90px_90px] gap-2 items-center">
                  <input
                    value={s.label}
                    onChange={(e) => {
                      const copie = [...payload.sessions];
                      copie[i] = { ...s, label: e.target.value };
                      maj({ sessions: copie });
                    }}
                    className={champ}
                  />
                  <input
                    type="date"
                    value={s.date}
                    onChange={(e) => {
                      const copie = [...payload.sessions];
                      copie[i] = { ...s, date: e.target.value };
                      maj({ sessions: copie });
                    }}
                    className={`${champ} tabular-nums`}
                  />
                  <input
                    type="time"
                    value={s.startTime}
                    onChange={(e) => {
                      const copie = [...payload.sessions];
                      copie[i] = { ...s, startTime: e.target.value };
                      maj({ sessions: copie });
                    }}
                    className={`${champ} tabular-nums`}
                  />
                  <input
                    type="time"
                    value={s.endTime}
                    onChange={(e) => {
                      const copie = [...payload.sessions];
                      copie[i] = { ...s, endTime: e.target.value };
                      maj({ sessions: copie });
                    }}
                    className={`${champ} tabular-nums`}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-3">
          <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100">Tarif et participants</p>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="block space-y-1">
              <span className={etiquette}>Total HT (€)</span>
              <input
                value={euros(payload.pricing.totalHtCents)}
                onChange={(e) => maj({ pricing: { ...payload.pricing, totalHtCents: centimes(e.target.value) } })}
                className={`${champ} tabular-nums`}
              />
            </label>
            <label className="block space-y-1">
              <span className={etiquette}>TVA (%)</span>
              <input
                value={payload.pricing.vatRate == null ? '' : String(payload.pricing.vatRate)}
                onChange={(e) => maj({ pricing: { ...payload.pricing, vatRate: Number(e.target.value) || null } })}
                className={`${champ} tabular-nums`}
              />
            </label>
            <label className="block space-y-1">
              <span className={etiquette}>Stagiaires</span>
              <input
                value={payload.participants.count == null ? '' : String(payload.participants.count)}
                onChange={(e) =>
                  maj({ participants: { ...payload.participants, count: Number(e.target.value) || null } })
                }
                className={`${champ} tabular-nums`}
              />
            </label>
          </div>
          {payload.pricing.paymentTerms && (
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">Règlement : {payload.pricing.paymentTerms}</p>
          )}
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            {payload.participants.named.length > 0
              ? `${payload.participants.named.length} stagiaire(s) nommé(s) : ils seront créés et inscrits aux séances.`
              : 'Aucun stagiaire nommé dans les documents : une tâche sera créée pour récupérer la liste nominative.'}
          </p>
        </section>

        <section className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-2">
          <p className="text-[14px] font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-zinc-400" aria-hidden /> L’affaire
          </p>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
            {[
              ['Objet', payload.dossier.objective],
              ['Type d’action (BPF)', payload.dossier.actionType.replace(/_/g, ' ')],
              ['Stagiaires', payload.dossier.traineeCategory.replace(/_/g, ' ')],
              ['Lieu', payload.dossier.place],
              ['Sanction', payload.dossier.sanction],
              ['Règlement', payload.dossier.paymentMethod],
              [
                'Signée le',
                payload.dossier.signedOn
                  ? `${payload.dossier.signedOn}${payload.dossier.signedPlace ? ` à ${payload.dossier.signedPlace}` : ''}`
                  : '',
              ],
              [
                'Rétractation',
                payload.dossier.retractationDays != null ? `${payload.dossier.retractationDays} jours` : '',
              ],
              ['Financeurs', payload.dossier.funders.map((f) => `${f.name} (${f.kind})`).join(', ')],
              ['Formateurs', payload.dossier.trainerNames.join(', ')],
            ]
              .filter(([, v]) => typeof v === 'string' && v.trim() !== '')
              .map(([label, valeur]) => (
                <div key={label as string} className="min-w-0">
                  <dt className={etiquette}>{label}</dt>
                  <dd className="text-zinc-800 dark:text-zinc-200 whitespace-pre-line">{valeur}</dd>
                </div>
              ))}
          </dl>
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            Ces éléments alimentent le dossier : cadre BPF, notes, règlement, financeurs et rattachement du formateur.
            Un formateur non reconnu dans vos fiches n’est jamais créé — il vous est signalé.
          </p>
        </section>

        {payload.notes && (
          <p className="text-[12px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg px-3 py-2">
            <strong>Relevé par la lecture :</strong> {payload.notes}
          </p>
        )}

        {erreur && <p role="alert" className="text-[13px] font-semibold text-rose-600 dark:text-rose-400">{erreur}</p>}

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={creer}
            disabled={enCours}
            className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 inline-flex items-center gap-2 disabled:opacity-40"
          >
            {enCours ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Créer dans le CRM
          </button>
          <button type="button" onClick={() => setEtape('depot')} className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-2">
            Reprendre les fichiers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4">
        <label className="block space-y-2">
          <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
            Convention signée, et programmes annexés si vous les avez
          </span>
          <input
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={(e) => setFichiers([...(e.target.files ?? [])])}
            className="block w-full text-[13px] text-zinc-600 dark:text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 dark:file:bg-zinc-800 file:px-3 file:py-2 file:text-[13px] file:font-semibold file:text-zinc-700 dark:file:text-zinc-200"
          />
          <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
            PDF uniquement, 5 Mo par fichier, 6 fichiers au plus. Les documents scannés fonctionnent s’ils sont lisibles.
          </span>
        </label>

        {fichiers.length > 0 && (
          <ul className="text-[13px] text-zinc-700 dark:text-zinc-300 space-y-1">
            {fichiers.map((f) => (
              <li key={f.name} className="inline-flex items-center gap-2">
                <FileUp className="w-3.5 h-3.5 text-zinc-400" /> {f.name}
                <span className="text-[12px] text-zinc-500 tabular-nums">{(f.size / 1024 / 1024).toFixed(1)} Mo</span>
              </li>
            ))}
          </ul>
        )}

        {erreur && <p role="alert" className="text-[13px] font-semibold text-rose-600 dark:text-rose-400">{erreur}</p>}

        <button
          type="button"
          onClick={lire}
          disabled={enCours || fichiers.length === 0}
          className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold px-4 h-10 rounded-lg transition shadow-sm shadow-orange-600/30 inline-flex items-center gap-2 disabled:opacity-40"
        >
          {enCours ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {enCours ? 'Lecture en cours…' : 'Lire les documents'}
        </button>
        {enCours && (
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" /> Comptez trente secondes à deux minutes selon le nombre de pages.
          </p>
        )}
      </div>
    </div>
  );
}
