// ARCHETYPE: workflow
'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { submitProspect } from './actions';
import type { ProspectFields } from './schema';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Building2,
  Briefcase,
  Globe,
  Wallet,
  User,
  GraduationCap,
  FileText,
  Mail,
  Phone,
  MapPin,
  Accessibility,
  Upload,
  X,
  ShieldCheck,
  Video,
  BookOpen,
  AlertCircle,
} from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { DateOfBirthInput } from '@/shared/ui/date-of-birth-input';
import { ThemeToggle } from '@/shared/ui/theme-toggle';
import { formations } from '@/shared/mock/data';

type Funder =
  | 'opco'
  | 'cpf'
  | 'pole_emploi'
  | 'region'
  | 'entreprise'
  | 'autofinancement';

const STEPS = [
  { key: 'identity', label: 'Vous', icon: User },
  { key: 'formation', label: 'Formation', icon: GraduationCap },
  { key: 'funding', label: 'Financement', icon: Wallet },
  { key: 'documents', label: 'Documents', icon: FileText },
] as const;

const FUNDERS: {
  value: Funder;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { value: 'opco', label: 'OPCO', hint: 'Mon employeur passe par un OPCO', icon: Building2 },
  { value: 'cpf', label: 'CPF', hint: 'Mon compte personnel de formation', icon: CreditCard },
  { value: 'pole_emploi', label: 'France Travail', hint: "Je suis demandeur d'emploi", icon: Briefcase },
  { value: 'region', label: 'Région', hint: 'Financement régional', icon: Globe },
  { value: 'entreprise', label: 'Plan entreprise', hint: 'Plan de développement employeur', icon: Building2 },
  { value: 'autofinancement', label: 'Autofinancement', hint: 'Je finance moi-même', icon: Wallet },
];

type DocSpec = { key: string; label: string; hint: string; required: boolean };

const REQUIRED_DOCS: Record<Funder, DocSpec[]> = {
  opco: [
    { key: 'payslip', label: 'Bulletin de paie récent', hint: "Justifie votre statut salarié et permet à l'OPCO de calculer la prise en charge.", required: true },
    { key: 'collective_agreement', label: 'Convention collective applicable', hint: 'Code IDCC ou copie complète.', required: true },
    { key: 'employer_agreement', label: 'Accord employeur signé', hint: 'Document attestant que votre employeur valide votre départ.', required: true },
    { key: 'id', label: "Pièce d'identité", hint: 'CNI ou passeport en cours de validité.', required: false },
  ],
  cpf: [
    { key: 'id', label: "Pièce d'identité", hint: 'CNI ou passeport en cours de validité.', required: true },
    { key: 'residence', label: 'Justificatif de domicile', hint: 'Moins de 3 mois (facture EDF, quittance de loyer…).', required: true },
  ],
  pole_emploi: [
    { key: 'pe_attestation', label: 'Attestation France Travail', hint: 'À télécharger depuis votre espace personnel.', required: true },
    { key: 'id', label: "Pièce d'identité", hint: 'CNI ou passeport.', required: true },
    { key: 'rib', label: 'RIB', hint: 'Pour les éventuels frais annexes.', required: false },
  ],
  region: [
    { key: 'residence', label: 'Justificatif de domicile dans la région', hint: 'Moins de 3 mois.', required: true },
    { key: 'id', label: "Pièce d'identité", hint: 'CNI ou passeport.', required: true },
    { key: 'tax_notice', label: "Avis d'imposition", hint: 'Pour les critères de ressources si applicable.', required: false },
  ],
  entreprise: [
    { key: 'purchase_order', label: 'Bon de commande employeur', hint: 'Ou accord-cadre signé.', required: true },
    { key: 'employer_agreement', label: 'Accord employeur signé', hint: 'Validation hiérarchique du départ.', required: true },
  ],
  autofinancement: [
    { key: 'id', label: "Pièce d'identité", hint: 'CNI ou passeport.', required: true },
    { key: 'rib', label: 'RIB', hint: 'Pour les modalités de paiement.', required: false },
  ],
};

const modalityLabel: Record<string, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  hybride: 'Hybride',
  afest: 'AFEST',
};

export default function InscriptionPage() {
  const searchParams = useSearchParams();
  const preselectedFormation = searchParams.get('formation') ?? '';

  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [identity, setIdentity] = useState({
    civility: 'mme' as 'm' | 'mme',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    birthDate: '',
    rqth: false,
  });

  const [formation, setFormation] = useState({
    formationId: preselectedFormation,
    preferredModality: 'presentiel',
    preferredStart: '',
    message: '',
  });

  const [funding, setFunding] = useState<{
    status: 'salarie' | 'demandeur' | 'independant' | 'particulier';
    companyName: string;
    funder: Funder | null;
  }>({
    status: 'salarie',
    companyName: '',
    funder: null,
  });

  const [files, setFiles] = useState<Record<string, File | null>>({});

  const docs: DocSpec[] = useMemo(
    () => (funding.funder ? REQUIRED_DOCS[funding.funder] : []),
    [funding.funder],
  );

  const requiredFilled = docs.filter((d) => d.required).every((d) => files[d.key]);

  const canContinue =
    step === 0
      ? !!(identity.firstName && identity.lastName && identity.email)
      : step === 1
      ? !!formation.formationId
      : step === 2
      ? !!funding.funder
      : true;

  const selectedFormation = formations.find((f) => f.id === formation.formationId);
  const selectedFunder = FUNDERS.find((f) => f.value === funding.funder);

  const handleSubmit = () => {
    if (!funding.funder) return;
    setSubmitError(null);

    const payload: ProspectFields = {
      civility: identity.civility,
      firstName: identity.firstName,
      lastName: identity.lastName,
      email: identity.email,
      phone: identity.phone,
      birthDate: identity.birthDate,
      rqth: identity.rqth,
      formationId: formation.formationId,
      preferredModality: formation.preferredModality as ProspectFields['preferredModality'],
      preferredStartDate: formation.preferredStart,
      message: formation.message,
      situation: funding.status,
      companyName: funding.companyName,
      funderKind: funding.funder,
    };

    const fd = new FormData();
    fd.set('payload', JSON.stringify(payload));
    for (const [key, file] of Object.entries(files)) {
      if (file) fd.set(`file_${key}`, file, file.name);
    }

    startTransition(async () => {
      const result = await submitProspect(fd);
      if (result.ok) {
        setSubmitted(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setSubmitError(
          result.error === 'file_too_large'
            ? 'Un fichier dépasse 10 Mo. Merci de le compresser.'
            : result.error === 'invalid_file_type'
            ? 'Format de fichier non accepté (PDF, JPG, PNG uniquement).'
            : result.error === 'invalid_input'
            ? 'Certains champs sont invalides. Merci de vérifier votre saisie.'
            : "Impossible d'envoyer la demande pour le moment. Réessayez dans quelques instants.",
        );
      }
    });
  };

  if (submitted) {
    return (
      <SuccessView
        identity={identity}
        formation={selectedFormation}
        funder={selectedFunder}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-violet-50/40 to-zinc-50 dark:from-zinc-950 dark:via-violet-950/20 dark:to-zinc-950">
      <header className="px-6 py-5 border-b border-zinc-200/60 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-violet-600 text-white flex items-center justify-center font-mono text-[13px] font-medium shadow-sm">
              ia
            </span>
            <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">infinity</p>
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Pré-inscription</p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">
            Pré-inscription à une formation
          </h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
            Quelques minutes suffisent. Nous revenons vers vous sous 48 h ouvrées.
          </p>
        </div>

        <ol className="flex items-center justify-center gap-0.5 mb-8 flex-wrap">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <li key={s.key} className="flex items-center">
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition text-[12px] font-medium ${
                    isActive
                      ? 'bg-violet-600 text-white shadow-sm'
                      : isDone
                      ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
                      : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {isDone ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  <span>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-700 mx-0.5" />
                )}
              </li>
            );
          })}
        </ol>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm">
          {step === 0 && <IdentityStep value={identity} onChange={setIdentity} />}
          {step === 1 && <FormationStep value={formation} onChange={setFormation} />}
          {step === 2 && <FundingStep value={funding} onChange={setFunding} />}
          {step === 3 && (
            <DocumentsStep
              docs={docs}
              files={files}
              onFile={(k, f) => setFiles((prev) => ({ ...prev, [k]: f }))}
              funder={selectedFunder?.label ?? ''}
            />
          )}

          <div className="px-6 py-4 border-t border-zinc-200/60 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40 flex items-center justify-between gap-3 rounded-b-xl">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Précédent
              </button>
            ) : (
              <Link
                href="/"
                className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
              >
                Annuler
              </Link>
            )}

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => canContinue && setStep(step + 1)}
                disabled={!canContinue}
                className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
              >
                Continuer
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!requiredFilled || pending}
                className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
              >
                <Check className="w-3.5 h-3.5" />
                {pending ? 'Envoi en cours…' : 'Envoyer ma pré-inscription'}
              </button>
            )}
          </div>
        </div>

        {submitError && (
          <div className="mt-4 flex items-start gap-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg px-4 py-3 text-[13px]">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>{submitError}</p>
          </div>
        )}

        <p className="text-center text-[12px] text-zinc-500 dark:text-zinc-400 mt-6 inline-flex items-center justify-center gap-1.5 w-full">
          <ShieldCheck className="w-3 h-3" />
          Vos données et documents sont traités dans le strict respect du RGPD.
        </p>
      </main>
    </div>
  );
}

// ─── Step 1 : Identité ───────────────────────────────────────────────────

function IdentityStep({
  value,
  onChange,
}: {
  value: { civility: 'm' | 'mme'; firstName: string; lastName: string; email: string; phone: string; birthDate: string; rqth: boolean };
  onChange: (v: typeof value) => void;
}) {
  const update = <K extends keyof typeof value>(k: K, v: (typeof value)[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <section className="p-6 space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100">Vos coordonnées</h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Ces informations nous permettent de vous recontacter et de constituer votre dossier.
        </p>
      </div>

      <FormField label="Civilité">
        <div className="grid grid-cols-2 gap-2">
          <label className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-50 dark:has-[:checked]:bg-violet-950/40 has-[:checked]:border-violet-300 dark:has-[:checked]:border-violet-800 transition text-center">
            <input
              type="radio"
              name="civility"
              checked={value.civility === 'mme'}
              onChange={() => update('civility', 'mme')}
              className="sr-only"
            />
            <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Madame</p>
          </label>
          <label className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-50 dark:has-[:checked]:bg-violet-950/40 has-[:checked]:border-violet-300 dark:has-[:checked]:border-violet-800 transition text-center">
            <input
              type="radio"
              name="civility"
              checked={value.civility === 'm'}
              onChange={() => update('civility', 'm')}
              className="sr-only"
            />
            <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">Monsieur</p>
          </label>
        </div>
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Prénom" required>
          <input
            type="text"
            value={value.firstName}
            onChange={(e) => update('firstName', e.target.value)}
            required
            placeholder="Alice"
            className={inputClass}
          />
        </FormField>
        <FormField label="Nom" required>
          <input
            type="text"
            value={value.lastName}
            onChange={(e) => update('lastName', e.target.value)}
            required
            placeholder="Martin"
            className={inputClass}
          />
        </FormField>
      </div>

      <FormField label="Email" required>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
          <input
            type="email"
            value={value.email}
            onChange={(e) => update('email', e.target.value)}
            required
            placeholder="alice.martin@email.com"
            className={`${inputClass} pl-9`}
          />
        </div>
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Téléphone">
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
            <input
              type="tel"
              value={value.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="06 12 34 56 78"
              className={`${inputClass} pl-9`}
            />
          </div>
        </FormField>
        <FormField label="Date de naissance">
          <input
            type="date"
            value={value.birthDate}
            onChange={(e) => update('birthDate', e.target.value)}
            className={inputClass}
          />
        </FormField>
      </div>

      <label className="flex items-start gap-3 cursor-pointer p-3 -mx-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950 transition">
        <input
          type="checkbox"
          checked={value.rqth}
          onChange={(e) => update('rqth', e.target.checked)}
          className="mt-0.5 accent-violet-600"
        />
        <div>
          <span className="text-[13px] text-zinc-900 dark:text-zinc-100 font-medium inline-flex items-center gap-1.5">
            <Accessibility className="w-3.5 h-3.5 text-blue-500" />
            J'ai une reconnaissance de la qualité de travailleur handicapé (RQTH)
          </span>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-0.5">
            Nous prendrons contact pour adapter les conditions pédagogiques si nécessaire.
          </span>
        </div>
      </label>
    </section>
  );
}

// ─── Step 2 : Formation ──────────────────────────────────────────────────

function FormationStep({
  value,
  onChange,
}: {
  value: { formationId: string; preferredModality: string; preferredStart: string; message: string };
  onChange: (v: typeof value) => void;
}) {
  const update = <K extends keyof typeof value>(k: K, v: (typeof value)[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <section className="p-6 space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100">Quelle formation vous intéresse ?</h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Sélectionnez la formation visée et vos préférences de format.
        </p>
      </div>

      <FormField label="Formation" required>
        <div className="space-y-2">
          {formations.map((f) => {
            const checked = value.formationId === f.id;
            return (
              <label
                key={f.id}
                className={`block border rounded-lg px-4 py-3 cursor-pointer transition ${
                  checked
                    ? 'border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30'
                    : 'border-zinc-200/60 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950'
                }`}
              >
                <input
                  type="radio"
                  name="formationId"
                  value={f.id}
                  checked={checked}
                  onChange={() => update('formationId', f.id)}
                  className="sr-only"
                />
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">{f.code}</p>
                    <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {f.title}
                    </p>
                    <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5 inline-flex items-center gap-2">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {f.defaultHours} h
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-700">·</span>
                      <span>{modalityLabel[f.modality] ?? f.modality}</span>
                    </p>
                  </div>
                  {checked && <Check className="w-4 h-4 text-violet-600 flex-shrink-0 mt-1" />}
                </div>
              </label>
            );
          })}
        </div>
      </FormField>

      <FormField label="Modalité préférée">
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: 'presentiel', l: 'Présentiel', i: MapPin },
            { v: 'distanciel', l: 'Distanciel', i: Video },
            { v: 'hybride', l: 'Hybride', i: GraduationCap },
          ].map(({ v, l, i: Icon }) => (
            <label
              key={v}
              className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-50 dark:has-[:checked]:bg-violet-950/40 has-[:checked]:border-violet-300 dark:has-[:checked]:border-violet-800 transition text-center"
            >
              <input
                type="radio"
                name="preferredModality"
                value={v}
                checked={value.preferredModality === v}
                onChange={() => update('preferredModality', v)}
                className="sr-only"
              />
              <Icon className="w-4 h-4 mx-auto mb-1 text-zinc-500" />
              <p className="text-[12px] font-medium text-zinc-900 dark:text-zinc-100">{l}</p>
            </label>
          ))}
        </div>
      </FormField>

      <FormField label="Date de démarrage souhaitée">
        <input
          type="date"
          value={value.preferredStart}
          onChange={(e) => update('preferredStart', e.target.value)}
          className={inputClass}
        />
      </FormField>

      <FormField label="Message (optionnel)" hint="Précisez vos objectifs, contraintes, contexte…">
        <textarea
          value={value.message}
          onChange={(e) => update('message', e.target.value)}
          rows={3}
          placeholder="J'aimerais monter en compétences sur…"
          className={inputClass}
        />
      </FormField>
    </section>
  );
}

// ─── Step 3 : Financement ────────────────────────────────────────────────

function FundingStep({
  value,
  onChange,
}: {
  value: {
    status: 'salarie' | 'demandeur' | 'independant' | 'particulier';
    companyName: string;
    funder: Funder | null;
  };
  onChange: (v: typeof value) => void;
}) {
  return (
    <section className="p-6 space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100">Comment finançons-nous cette formation ?</h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Votre situation détermine les pièces que nous vous demanderons à l'étape suivante.
        </p>
      </div>

      <FormField label="Votre situation actuelle" required>
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: 'salarie', l: 'Salarié(e)' },
            { v: 'demandeur', l: "Demandeur d'emploi" },
            { v: 'independant', l: 'Indépendant(e)' },
            { v: 'particulier', l: 'Particulier' },
          ].map((opt) => (
            <label
              key={opt.v}
              className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-50 dark:has-[:checked]:bg-violet-950/40 has-[:checked]:border-violet-300 dark:has-[:checked]:border-violet-800 transition"
            >
              <input
                type="radio"
                name="status"
                checked={value.status === opt.v}
                onChange={() => onChange({ ...value, status: opt.v as typeof value.status })}
                className="sr-only"
              />
              <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{opt.l}</p>
            </label>
          ))}
        </div>
      </FormField>

      {value.status === 'salarie' && (
        <FormField label="Nom de votre employeur">
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={value.companyName}
              onChange={(e) => onChange({ ...value, companyName: e.target.value })}
              placeholder="Acme Conseil"
              className={`${inputClass} pl-9`}
            />
          </div>
        </FormField>
      )}

      <FormField label="Mode de financement envisagé" required>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {FUNDERS.map((f) => {
            const Icon = f.icon;
            const checked = value.funder === f.value;
            return (
              <label
                key={f.value}
                className={`flex items-start gap-3 border rounded-lg px-3 py-3 cursor-pointer transition ${
                  checked
                    ? 'border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30'
                    : 'border-zinc-200/60 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-950'
                }`}
              >
                <input
                  type="radio"
                  name="funder"
                  checked={checked}
                  onChange={() => onChange({ ...value, funder: f.value })}
                  className="sr-only"
                />
                <span className="w-8 h-8 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-violet-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{f.label}</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{f.hint}</p>
                </div>
                {checked && <Check className="w-4 h-4 text-violet-600 flex-shrink-0 mt-1" />}
              </label>
            );
          })}
        </div>
      </FormField>
    </section>
  );
}

// ─── Step 4 : Documents ──────────────────────────────────────────────────

function DocumentsStep({
  docs,
  files,
  onFile,
  funder,
}: {
  docs: DocSpec[];
  files: Record<string, File | null>;
  onFile: (k: string, f: File | null) => void;
  funder: string;
}) {
  return (
    <section className="p-6 space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100">Pièces justificatives</h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          La liste ci-dessous est adaptée à votre mode de financement
          {funder && <strong className="font-semibold text-zinc-900 dark:text-zinc-100"> ({funder})</strong>}.
        </p>
      </div>

      <div className="flex items-start gap-2 bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/40 rounded-lg px-3 py-2.5 text-[12px] text-violet-900 dark:text-violet-200">
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <p>
          Formats acceptés : PDF, JPG, PNG. Taille max 10 Mo par document. Vous pourrez en ajouter d'autres plus tard depuis votre espace.
        </p>
      </div>

      <div className="space-y-3">
        {docs.map((doc) => (
          <DocUploader
            key={doc.key}
            doc={doc}
            file={files[doc.key] ?? null}
            onFile={(f) => onFile(doc.key, f)}
          />
        ))}
      </div>
    </section>
  );
}

function DocUploader({
  doc,
  file,
  onFile,
}: {
  doc: DocSpec;
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const id = `file-${doc.key}`;

  return (
    <div className="rounded-lg">
      <div className="flex items-baseline justify-between mb-1.5">
        <label htmlFor={id} className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
          {doc.label}
          {doc.required && <span className="text-rose-500 ml-0.5">*</span>}
        </label>
        {!doc.required && (
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">optionnel</span>
        )}
      </div>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-2">{doc.hint}</p>

      {file ? (
        <div className="flex items-center justify-between gap-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-md bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {file.name}
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {(file.size / 1024).toFixed(0)} Ko
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onFile(null)}
            className="text-zinc-400 hover:text-rose-600 transition p-1"
            aria-label="Retirer le fichier"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
          className={`block border-2 border-dashed rounded-lg px-4 py-5 cursor-pointer text-center transition ${
            dragging
              ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/40'
              : 'border-zinc-200 dark:border-zinc-800 hover:border-violet-300 dark:hover:border-violet-700 hover:bg-zinc-50/60 dark:hover:bg-zinc-950/40'
          }`}
        >
          <Upload className="w-4 h-4 mx-auto mb-1.5 text-zinc-400" />
          <p className="text-[12px] text-zinc-600 dark:text-zinc-400">
            <span className="text-violet-600 font-medium">Cliquez pour téléverser</span> ou glissez-déposez
          </p>
        </label>
      )}

      <input
        id={id}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

// ─── Success view ────────────────────────────────────────────────────────

function SuccessView({
  identity,
  formation,
  funder,
}: {
  identity: { firstName: string; lastName: string; email: string };
  formation: { code: string; title: string } | undefined;
  funder: { label: string } | undefined;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-violet-50/40 to-zinc-50 dark:from-zinc-950 dark:via-violet-950/20 dark:to-zinc-950">
      <div className="absolute top-5 right-6">
        <ThemeToggle />
      </div>
      <main className="max-w-xl mx-auto px-6 py-20 text-center">
        <span className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/60 dark:to-emerald-950/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mx-auto mb-6 shadow-sm">
          <CheckCircle2 className="w-8 h-8" />
        </span>
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mb-3">
          Pré-inscription envoyée
        </h1>
        <p className="text-[14px] text-zinc-600 dark:text-zinc-400 mb-8">
          Merci <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{identity.firstName}</strong>,
          votre demande a bien été reçue. Vous recevrez un email de confirmation à{' '}
          <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{identity.email}</strong> sous quelques minutes.
        </p>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-200/60 dark:divide-zinc-800 text-left mb-8">
          {formation && (
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-[12px] text-zinc-500 dark:text-zinc-400">Formation</span>
              <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{formation.title}</span>
            </div>
          )}
          {funder && (
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-[12px] text-zinc-500 dark:text-zinc-400">Financement</span>
              <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{funder.label}</span>
            </div>
          )}
          <div className="px-5 py-3 flex items-center justify-between gap-3">
            <span className="text-[12px] text-zinc-500 dark:text-zinc-400">Délai de réponse</span>
            <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-violet-500" /> Sous 48 h ouvrées
            </span>
          </div>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[13px] text-violet-600 hover:text-violet-700 font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Revenir à l'accueil
        </Link>
      </main>
    </div>
  );
}
