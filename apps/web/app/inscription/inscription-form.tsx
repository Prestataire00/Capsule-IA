// ARCHETYPE: workflow
'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { submitProspect, submitCompanyEnrollment } from './actions';
import type { ProspectFields, CompanyEnrollmentFields } from './schema';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
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
  Search,
  Building2,
  Users,
  Plus,
  Trash2,
} from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { DateOfBirthInput } from '@/shared/ui/date-of-birth-input';
import { ThemeToggle } from '@/shared/ui/theme-toggle';
import { Logo } from '@/shared/ui/logo';
import {
  FUNDER_OPTIONS,
  type FunderValue,
  requiredDocsForFunders,
  type DocRequirement,
} from '@/features/prospect/funding';
import type { PublicFormation } from '@/features/catalog/public-catalog';

const STEPS = [
  { key: 'identity', label: 'Vous', icon: User },
  { key: 'formation', label: 'Formation', icon: GraduationCap },
  { key: 'funding', label: 'Financement', icon: User },
  { key: 'documents', label: 'Documents', icon: FileText },
] as const;

type Funding = {
  status: 'salarie' | 'demandeur' | 'independant' | 'particulier';
  companyName: string;
  companySiret: string;
  companyAddressLine1: string;
  companyAddressCity: string;
  companyAddressPostalCode: string;
  referentName: string;
  referentEmail: string;
  referentPhone: string;
  funderKinds: FunderValue[];
};

type Mode = 'individuel' | 'entreprise';

export function InscriptionForm({ formations }: { formations: PublicFormation[] }) {
  const searchParams = useSearchParams();
  const preselectedFormation = searchParams.get('formation') ?? '';

  const [mode, setMode] = useState<Mode>('individuel');
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

  const [funding, setFunding] = useState<Funding>({
    status: 'salarie',
    companyName: '',
    companySiret: '',
    companyAddressLine1: '',
    companyAddressCity: '',
    companyAddressPostalCode: '',
    referentName: '',
    referentEmail: '',
    referentPhone: '',
    funderKinds: [],
  });

  const [files, setFiles] = useState<Record<string, File | null>>({});

  const docs: DocRequirement[] = useMemo(
    () => requiredDocsForFunders(funding.funderKinds),
    [funding.funderKinds],
  );

  const requiredFilled = docs.filter((d) => d.required).every((d) => files[d.key]);

  const missingFields = (() => {
    if (step === 0) {
      const missing: string[] = [];
      if (!identity.firstName?.trim()) missing.push('Prénom');
      if (!identity.lastName?.trim()) missing.push('Nom');
      if (!identity.email?.trim()) missing.push('Email');
      return missing;
    }
    if (step === 1) return formation.formationId ? [] : ['Formation'];
    if (step === 2) return funding.funderKinds.length > 0 ? [] : ['Mode de financement'];
    return [];
  })();
  const canContinue = missingFields.length === 0;

  const tryContinue = () => {
    if (canContinue) {
      setStep(step + 1);
      setSubmitError(null);
    } else {
      setSubmitError(`Pour continuer, renseignez : ${missingFields.join(', ')}.`);
    }
  };

  const selectedFormation = formations.find((f) => f.id === formation.formationId);
  const selectedFunders = FUNDER_OPTIONS.filter((f) => funding.funderKinds.includes(f.value));

  const isIndividual =
    funding.status === 'independant' || funding.status === 'particulier';

  const handleSubmit = () => {
    if (funding.funderKinds.length === 0) return;
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
      companyName: isIndividual ? '' : funding.companyName,
      companySiret: isIndividual ? '' : funding.companySiret,
      companyAddress: isIndividual
        ? undefined
        : {
            line1: funding.companyAddressLine1,
            city: funding.companyAddressCity,
            postalCode: funding.companyAddressPostalCode,
          },
      referentName: isIndividual ? '' : funding.referentName,
      referentEmail: isIndividual ? '' : funding.referentEmail,
      referentPhone: isIndividual ? '' : funding.referentPhone,
      funderKinds: funding.funderKinds,
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

  if (mode === 'entreprise') {
    return <CompanyFlow formations={formations} onSwitchMode={setMode} />;
  }

  if (submitted) {
    return (
      <SuccessView
        identity={identity}
        formation={selectedFormation}
        funders={selectedFunders}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-violet-50/40 to-zinc-50 dark:from-zinc-950 dark:via-violet-950/20 dark:to-zinc-950">
      <header className="px-6 py-5 border-b border-zinc-200/60 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <Logo size="md" />
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

        <ModeToggle mode="individuel" onSwitchMode={setMode} />

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
          {step === 1 && (
            <FormationStep value={formation} onChange={setFormation} formations={formations} />
          )}
          {step === 2 && <FundingStep value={funding} onChange={setFunding} />}
          {step === 3 && (
            <DocumentsStep
              docs={docs}
              files={files}
              onFile={(k, f) => setFiles((prev) => ({ ...prev, [k]: f }))}
              funderLabel={selectedFunders.map((f) => f.label).join(', ')}
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
                onClick={tryContinue}
                className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
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
          <DateOfBirthInput
            value={value.birthDate}
            onChange={(iso) => update('birthDate', iso)}
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
  formations,
}: {
  value: { formationId: string; preferredModality: string; preferredStart: string; message: string };
  onChange: (v: typeof value) => void;
  formations: PublicFormation[];
}) {
  const update = <K extends keyof typeof value>(k: K, v: (typeof value)[K]) =>
    onChange({ ...value, [k]: v });

  const [query, setQuery] = useState('');
  const [activeCats, setActiveCats] = useState<Set<string>>(new Set());

  const categoryLabel = (cat: string | null) => cat ?? 'Autres';

  const toggleCat = (cat: string) => {
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const countByCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of formations) {
      const cat = f.category ?? 'Autres';
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    return map;
  }, [formations]);

  const orderedCats = useMemo(
    () => Array.from(countByCat.keys()).sort((a, b) => a.localeCompare(b, 'fr')),
    [countByCat],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return formations.filter((f) => {
      const cat = f.category ?? 'Autres';
      if (activeCats.size > 0 && !activeCats.has(cat)) return false;
      if (q) {
        const haystack = `${f.title} ${f.code} ${cat}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [formations, query, activeCats]);

  const grouped = useMemo(() => {
    const groups = new Map<string, PublicFormation[]>();
    for (const f of filtered) {
      const cat = f.category ?? 'Autres';
      const arr = groups.get(cat) ?? [];
      arr.push(f);
      groups.set(cat, arr);
    }
    return orderedCats
      .filter((cat) => groups.has(cat))
      .map((cat) => ({ cat, list: groups.get(cat)! }));
  }, [filtered, orderedCats]);

  return (
    <section className="p-6 space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100">Quelle formation vous intéresse ?</h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Sélectionnez la formation visée et vos préférences de format.
        </p>
      </div>

      <FormField label="Formation" required>
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une formation, un code, une thématique…"
              className={`${inputClass} pl-9`}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition p-1"
                aria-label="Effacer la recherche"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Category chips */}
          {orderedCats.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveCats(new Set())}
                className={`text-[12px] font-medium px-3 py-1 rounded-full border transition ${
                  activeCats.size === 0
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200/60 dark:border-zinc-800 hover:border-violet-300 dark:hover:border-violet-800 hover:text-violet-700 dark:hover:text-violet-300'
                }`}
              >
                Toutes ({formations.length})
              </button>
              {orderedCats.map((cat) => {
                const count = countByCat.get(cat) ?? 0;
                if (count === 0) return null;
                const active = activeCats.has(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCat(cat)}
                    className={`text-[12px] font-medium px-3 py-1 rounded-full border transition ${
                      active
                        ? 'bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border-violet-300 dark:border-violet-800'
                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200/60 dark:border-zinc-800 hover:border-violet-300 dark:hover:border-violet-800 hover:text-violet-700 dark:hover:text-violet-300'
                    }`}
                  >
                    {categoryLabel(cat)} <span className="text-zinc-400 dark:text-zinc-500">{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Results count */}
          {(query || activeCats.size > 0) && (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 px-1">
              {filtered.length === 0
                ? 'Aucune formation ne correspond'
                : `${filtered.length} formation${filtered.length > 1 ? 's' : ''} sur ${formations.length}`}
            </p>
          )}

          {/* Groups */}
          {filtered.length === 0 ? (
            <div className="border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-8 text-center">
              <Search className="w-5 h-5 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-1">
                {formations.length === 0
                  ? 'Aucune formation disponible pour le moment'
                  : 'Pas de formation pour ces critères'}
              </p>
              {(query || activeCats.size > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setActiveCats(new Set());
                  }}
                  className="text-[12px] text-violet-600 dark:text-violet-400 hover:underline font-medium"
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(({ cat, list }) => (
                <div key={cat}>
                  <div className="flex items-baseline justify-between mb-2 px-1">
                    <p className="text-[11px] uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold">
                      {categoryLabel(cat)}
                    </p>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                      {list.length} formation{list.length > 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {list.map((f) => {
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
                            </div>
                            {checked && <Check className="w-4 h-4 text-violet-600 flex-shrink-0 mt-1" />}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
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
  value: Funding;
  onChange: (v: Funding) => void;
}) {
  const update = <K extends keyof Funding>(k: K, v: Funding[K]) =>
    onChange({ ...value, [k]: v });

  const isIndividual = value.status === 'independant' || value.status === 'particulier';

  const toggleFunder = (funder: FunderValue) => {
    const next = value.funderKinds.includes(funder)
      ? value.funderKinds.filter((f) => f !== funder)
      : [...value.funderKinds, funder];
    update('funderKinds', next);
  };

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
                onChange={() => update('status', opt.v as Funding['status'])}
                className="sr-only"
              />
              <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{opt.l}</p>
            </label>
          ))}
        </div>
      </FormField>

      {!isIndividual && (
        <div className="space-y-5 border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-4 bg-zinc-50/40 dark:bg-zinc-950/40">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-violet-600" />
            <h3 className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">Entreprise</h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Nom de l'entreprise">
              <input
                type="text"
                value={value.companyName}
                onChange={(e) => update('companyName', e.target.value)}
                placeholder="Acme Conseil"
                className={inputClass}
              />
            </FormField>
            <FormField label="SIRET">
              <input
                type="text"
                value={value.companySiret}
                onChange={(e) => update('companySiret', e.target.value)}
                placeholder="123 456 789 00012"
                className={inputClass}
              />
            </FormField>
          </div>

          <FormField label="Adresse">
            <input
              type="text"
              value={value.companyAddressLine1}
              onChange={(e) => update('companyAddressLine1', e.target.value)}
              placeholder="12 rue de la Formation"
              className={inputClass}
            />
          </FormField>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Code postal">
              <input
                type="text"
                value={value.companyAddressPostalCode}
                onChange={(e) => update('companyAddressPostalCode', e.target.value)}
                placeholder="75001"
                className={inputClass}
              />
            </FormField>
            <div className="col-span-2">
              <FormField label="Ville">
                <input
                  type="text"
                  value={value.companyAddressCity}
                  onChange={(e) => update('companyAddressCity', e.target.value)}
                  placeholder="Paris"
                  className={inputClass}
                />
              </FormField>
            </div>
          </div>

          <div className="border-t border-zinc-200/60 dark:border-zinc-800 pt-4 space-y-5">
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
              Référent qui suivra le dossier côté entreprise.
            </p>
            <FormField label="Référent">
              <input
                type="text"
                value={value.referentName}
                onChange={(e) => update('referentName', e.target.value)}
                placeholder="Jean Dupont — Responsable formation"
                className={inputClass}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Email du référent">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                  <input
                    type="email"
                    value={value.referentEmail}
                    onChange={(e) => update('referentEmail', e.target.value)}
                    placeholder="j.dupont@acme.fr"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </FormField>
              <FormField label="Téléphone du référent">
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                  <input
                    type="tel"
                    value={value.referentPhone}
                    onChange={(e) => update('referentPhone', e.target.value)}
                    placeholder="01 23 45 67 89"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </FormField>
            </div>
          </div>
        </div>
      )}

      <FormField
        label="Mode(s) de financement envisagé(s)"
        hint="Plusieurs choix possibles."
        required
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {FUNDER_OPTIONS.map((f) => {
            const checked = value.funderKinds.includes(f.value);
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
                  type="checkbox"
                  name="funderKinds"
                  checked={checked}
                  onChange={() => toggleFunder(f.value)}
                  className="mt-0.5 accent-violet-600"
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{f.label}</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{f.hint}</p>
                </div>
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
  funderLabel,
}: {
  docs: DocRequirement[];
  files: Record<string, File | null>;
  onFile: (k: string, f: File | null) => void;
  funderLabel: string;
}) {
  return (
    <section className="p-6 space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100">Pièces justificatives</h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          La liste ci-dessous est adaptée à votre mode de financement
          {funderLabel && <strong className="font-semibold text-zinc-900 dark:text-zinc-100"> ({funderLabel})</strong>}.
        </p>
      </div>

      <div className="flex items-start gap-2 bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/40 rounded-lg px-3 py-2.5 text-[12px] text-violet-900 dark:text-violet-200">
        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <p>
          Formats acceptés : PDF, JPG, PNG. Taille max 10 Mo par document. Vous pourrez en ajouter d'autres plus tard depuis votre espace.
        </p>
      </div>

      {docs.length === 0 ? (
        <div className="border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-8 text-center">
          <FileText className="w-5 h-5 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Aucune pièce justificative requise pour le financement sélectionné.
          </p>
        </div>
      ) : (
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
      )}
    </section>
  );
}

function DocUploader({
  doc,
  file,
  onFile,
}: {
  doc: DocRequirement;
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
  funders,
}: {
  identity: { firstName: string; lastName: string; email: string };
  formation: PublicFormation | undefined;
  funders: { label: string }[];
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
          {funders.length > 0 && (
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-[12px] text-zinc-500 dark:text-zinc-400">Financement</span>
              <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                {funders.map((f) => f.label).join(', ')}
              </span>
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

// ─── Bascule individuel / entreprise ──────────────────────────────────────

function ModeToggle({
  mode,
  onSwitchMode,
}: {
  mode: Mode;
  onSwitchMode: (m: Mode) => void;
}) {
  const opts: { v: Mode; label: string; icon: typeof User }[] = [
    { v: 'individuel', label: 'Je m’inscris', icon: User },
    { v: 'entreprise', label: 'J’inscris mes salariés', icon: Building2 },
  ];
  return (
    <div className="flex justify-center mb-8">
      <div className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 rounded-full p-1">
        {opts.map((o) => {
          const Icon = o.icon;
          const active = o.v === mode;
          return (
            <button
              key={o.v}
              type="button"
              onClick={() => onSwitchMode(o.v)}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-medium transition ${
                active
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Parcours entreprise (plusieurs salariés) ─────────────────────────────

type Employee = {
  civility: 'm' | 'mme';
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  rqth: boolean;
};
const emptyEmployee = (): Employee => ({
  civility: 'mme',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  birthDate: '',
  rqth: false,
});

const COMPANY_STEPS = [
  { key: 'company', label: 'Entreprise', icon: Building2 },
  { key: 'formation', label: 'Formation', icon: GraduationCap },
  { key: 'funding', label: 'Financement', icon: User },
  { key: 'employees', label: 'Salariés', icon: Users },
] as const;

function CompanyFlow({
  formations,
  onSwitchMode,
}: {
  formations: PublicFormation[];
  onSwitchMode: (m: Mode) => void;
}) {
  const searchParams = useSearchParams();
  const preselectedFormation = searchParams.get('formation') ?? '';

  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [createdCount, setCreatedCount] = useState(0);

  const [company, setCompany] = useState({
    companyName: '',
    companySiret: '',
    companyAddressLine1: '',
    companyAddressCity: '',
    companyAddressPostalCode: '',
    referentName: '',
    referentEmail: '',
    referentPhone: '',
  });
  const [formation, setFormation] = useState({
    formationId: preselectedFormation,
    preferredModality: 'presentiel',
    preferredStart: '',
    message: '',
  });
  const [funderKinds, setFunderKinds] = useState<FunderValue[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([emptyEmployee()]);

  const selectedFormation = formations.find((f) => f.id === formation.formationId);
  const selectedFunders = FUNDER_OPTIONS.filter((f) => funderKinds.includes(f.value));

  const employeesValid =
    employees.length > 0 &&
    employees.every((e) => e.firstName.trim() && e.lastName.trim() && e.email.trim());

  const missingFields = (() => {
    if (step === 0) return company.companyName.trim() ? [] : ["Nom de l'entreprise"];
    if (step === 1) return formation.formationId ? [] : ['Formation'];
    if (step === 2) return funderKinds.length > 0 ? [] : ['Mode de financement'];
    if (step === 3) return employeesValid ? [] : ['Au moins un salarié (nom, prénom, email)'];
    return [];
  })();
  const canContinue = missingFields.length === 0;

  const tryContinue = () => {
    if (canContinue) {
      setStep(step + 1);
      setSubmitError(null);
    } else {
      setSubmitError(`Pour continuer, renseignez : ${missingFields.join(', ')}.`);
    }
  };

  const handleSubmit = () => {
    if (!employeesValid || funderKinds.length === 0) return;
    setSubmitError(null);

    const payload: CompanyEnrollmentFields = {
      companyName: company.companyName,
      companySiret: company.companySiret,
      companyAddress: {
        line1: company.companyAddressLine1,
        city: company.companyAddressCity,
        postalCode: company.companyAddressPostalCode,
      },
      referentName: company.referentName,
      referentEmail: company.referentEmail,
      referentPhone: company.referentPhone,
      formationId: formation.formationId,
      preferredModality: formation.preferredModality as CompanyEnrollmentFields['preferredModality'],
      preferredStartDate: formation.preferredStart,
      message: formation.message,
      funderKinds,
      employees: employees.map((e) => ({
        civility: e.civility,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        phone: e.phone,
        birthDate: e.birthDate,
        rqth: e.rqth,
      })),
    };

    const fd = new FormData();
    fd.set('payload', JSON.stringify(payload));

    startTransition(async () => {
      const result = await submitCompanyEnrollment(fd);
      if (result.ok) {
        setCreatedCount(result.count);
        setSubmitted(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setSubmitError(
          result.error === 'invalid_input'
            ? 'Certains champs sont invalides. Merci de vérifier votre saisie.'
            : "Impossible d'envoyer les inscriptions pour le moment. Réessayez dans quelques instants.",
        );
      }
    });
  };

  if (submitted) {
    return (
      <CompanySuccessView
        count={createdCount}
        companyName={company.companyName}
        formation={selectedFormation}
        funders={selectedFunders}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-violet-50/40 to-zinc-50 dark:from-zinc-950 dark:via-violet-950/20 dark:to-zinc-950">
      <header className="px-6 py-5 border-b border-zinc-200/60 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <Logo size="md" />
            <span className="text-zinc-300 dark:text-zinc-700">·</span>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Inscription entreprise</p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">
            Inscrire mes salariés
          </h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
            Renseignez l&apos;entreprise et la formation, puis ajoutez vos salariés.
          </p>
        </div>

        <ModeToggle mode="entreprise" onSwitchMode={onSwitchMode} />

        <ol className="flex items-center justify-center gap-0.5 mb-8 flex-wrap">
          {COMPANY_STEPS.map((s, i) => {
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
                {i < COMPANY_STEPS.length - 1 && (
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-700 mx-0.5" />
                )}
              </li>
            );
          })}
        </ol>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm">
          {step === 0 && <CompanyStep value={company} onChange={setCompany} />}
          {step === 1 && (
            <FormationStep value={formation} onChange={setFormation} formations={formations} />
          )}
          {step === 2 && <CompanyFundingStep funderKinds={funderKinds} onChange={setFunderKinds} />}
          {step === 3 && <EmployeesStep employees={employees} onChange={setEmployees} />}

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
              <button
                type="button"
                onClick={() => onSwitchMode('individuel')}
                className="text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition"
              >
                Inscription individuelle
              </button>
            )}

            {step < COMPANY_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={tryContinue}
                className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
              >
                Continuer
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!employeesValid || pending}
                className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
              >
                <Check className="w-3.5 h-3.5" />
                {pending
                  ? 'Envoi en cours…'
                  : `Inscrire ${employees.length} salarié${employees.length > 1 ? 's' : ''}`}
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
          Vos données sont traitées dans le strict respect du RGPD.
        </p>
      </main>
    </div>
  );
}

// ─── Entreprise : société + référent ──────────────────────────────────────

function CompanyStep({
  value,
  onChange,
}: {
  value: {
    companyName: string;
    companySiret: string;
    companyAddressLine1: string;
    companyAddressCity: string;
    companyAddressPostalCode: string;
    referentName: string;
    referentEmail: string;
    referentPhone: string;
  };
  onChange: (v: typeof value) => void;
}) {
  const update = <K extends keyof typeof value>(k: K, v: (typeof value)[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <section className="p-6 space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
          <Building2 className="w-4 h-4 text-violet-600" /> Votre entreprise
        </h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Ces informations seront associées à chaque salarié inscrit.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Nom de l'entreprise" required>
          <input
            type="text"
            value={value.companyName}
            onChange={(e) => update('companyName', e.target.value)}
            placeholder="Acme Conseil"
            className={inputClass}
          />
        </FormField>
        <FormField label="SIRET">
          <input
            type="text"
            value={value.companySiret}
            onChange={(e) => update('companySiret', e.target.value)}
            placeholder="123 456 789 00012"
            className={inputClass}
          />
        </FormField>
      </div>

      <FormField label="Adresse">
        <input
          type="text"
          value={value.companyAddressLine1}
          onChange={(e) => update('companyAddressLine1', e.target.value)}
          placeholder="12 rue de la Formation"
          className={inputClass}
        />
      </FormField>

      <div className="grid grid-cols-3 gap-3">
        <FormField label="Code postal">
          <input
            type="text"
            value={value.companyAddressPostalCode}
            onChange={(e) => update('companyAddressPostalCode', e.target.value)}
            placeholder="75001"
            className={inputClass}
          />
        </FormField>
        <div className="col-span-2">
          <FormField label="Ville">
            <input
              type="text"
              value={value.companyAddressCity}
              onChange={(e) => update('companyAddressCity', e.target.value)}
              placeholder="Paris"
              className={inputClass}
            />
          </FormField>
        </div>
      </div>

      <div className="border-t border-zinc-200/60 dark:border-zinc-800 pt-4 space-y-5">
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Référent qui suivra les dossiers côté entreprise (recevra la confirmation).
        </p>
        <FormField label="Référent">
          <input
            type="text"
            value={value.referentName}
            onChange={(e) => update('referentName', e.target.value)}
            placeholder="Jean Dupont — Responsable formation"
            className={inputClass}
          />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Email du référent">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
              <input
                type="email"
                value={value.referentEmail}
                onChange={(e) => update('referentEmail', e.target.value)}
                placeholder="j.dupont@acme.fr"
                className={`${inputClass} pl-9`}
              />
            </div>
          </FormField>
          <FormField label="Téléphone du référent">
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
              <input
                type="tel"
                value={value.referentPhone}
                onChange={(e) => update('referentPhone', e.target.value)}
                placeholder="01 23 45 67 89"
                className={`${inputClass} pl-9`}
              />
            </div>
          </FormField>
        </div>
      </div>
    </section>
  );
}

// ─── Entreprise : financement ─────────────────────────────────────────────

function CompanyFundingStep({
  funderKinds,
  onChange,
}: {
  funderKinds: FunderValue[];
  onChange: (v: FunderValue[]) => void;
}) {
  const toggle = (funder: FunderValue) => {
    onChange(
      funderKinds.includes(funder)
        ? funderKinds.filter((f) => f !== funder)
        : [...funderKinds, funder],
    );
  };

  return (
    <section className="p-6 space-y-5">
      <div>
        <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100">
          Comment finançons-nous cette formation ?
        </h2>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          S&apos;applique à l&apos;ensemble des salariés de ce groupe.
        </p>
      </div>

      <FormField label="Mode(s) de financement envisagé(s)" hint="Plusieurs choix possibles." required>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {FUNDER_OPTIONS.map((f) => {
            const checked = funderKinds.includes(f.value);
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
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(f.value)}
                  className="mt-0.5 accent-violet-600"
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{f.label}</p>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">{f.hint}</p>
                </div>
              </label>
            );
          })}
        </div>
      </FormField>
    </section>
  );
}

// ─── Entreprise : liste des salariés ──────────────────────────────────────

function EmployeesStep({
  employees,
  onChange,
}: {
  employees: Employee[];
  onChange: (v: Employee[]) => void;
}) {
  const update = (idx: number, patch: Partial<Employee>) =>
    onChange(employees.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  const add = () => onChange([...employees, emptyEmployee()]);
  const remove = (idx: number) => onChange(employees.filter((_, i) => i !== idx));

  return (
    <section className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-600" /> Vos salariés
          </h2>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
            Ajoutez chaque salarié à inscrire. Les pièces justificatives seront demandées ensuite par
            l&apos;organisme.
          </p>
        </div>
        <button
          type="button"
          onClick={add}
          className="flex-shrink-0 text-[12px] text-violet-600 hover:text-violet-700 dark:text-violet-400 inline-flex items-center gap-1 font-medium"
        >
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>

      <ul className="space-y-3">
        {employees.map((emp, idx) => (
          <li
            key={idx}
            className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-4 space-y-3 bg-zinc-50/40 dark:bg-zinc-950/40"
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                Salarié {idx + 1}
              </span>
              {employees.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  aria-label="Retirer ce salarié"
                  className="text-zinc-400 hover:text-rose-600 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Prénom" required>
                <input
                  type="text"
                  value={emp.firstName}
                  onChange={(e) => update(idx, { firstName: e.target.value })}
                  placeholder="Alice"
                  className={inputClass}
                />
              </FormField>
              <FormField label="Nom" required>
                <input
                  type="text"
                  value={emp.lastName}
                  onChange={(e) => update(idx, { lastName: e.target.value })}
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
                  value={emp.email}
                  onChange={(e) => update(idx, { email: e.target.value })}
                  placeholder="alice.martin@acme.fr"
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
                    value={emp.phone}
                    onChange={(e) => update(idx, { phone: e.target.value })}
                    placeholder="06 12 34 56 78"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </FormField>
              <FormField label="Date de naissance">
                <DateOfBirthInput
                  value={emp.birthDate}
                  onChange={(iso) => update(idx, { birthDate: iso })}
                />
              </FormField>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-[12px] text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={emp.rqth}
                onChange={(e) => update(idx, { rqth: e.target.checked })}
                className="accent-violet-600"
              />
              <Accessibility className="w-3.5 h-3.5 text-blue-500" />
              RQTH (aménagement éventuel)
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Entreprise : confirmation ────────────────────────────────────────────

function CompanySuccessView({
  count,
  companyName,
  formation,
  funders,
}: {
  count: number;
  companyName: string;
  formation: PublicFormation | undefined;
  funders: { label: string }[];
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
          {count} salarié{count > 1 ? 's' : ''} inscrit{count > 1 ? 's' : ''}
        </h1>
        <p className="text-[14px] text-zinc-600 dark:text-zinc-400 mb-8">
          Les pré-inscriptions de{' '}
          <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{companyName}</strong> ont
          bien été reçues. L&apos;organisme revient vers vous sous 48 h ouvrées.
        </p>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-200/60 dark:divide-zinc-800 text-left mb-8">
          {formation && (
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-[12px] text-zinc-500 dark:text-zinc-400">Formation</span>
              <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {formation.title}
              </span>
            </div>
          )}
          <div className="px-5 py-3 flex items-center justify-between gap-3">
            <span className="text-[12px] text-zinc-500 dark:text-zinc-400">Salariés</span>
            <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{count}</span>
          </div>
          {funders.length > 0 && (
            <div className="px-5 py-3 flex items-center justify-between gap-3">
              <span className="text-[12px] text-zinc-500 dark:text-zinc-400">Financement</span>
              <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
                {funders.map((f) => f.label).join(', ')}
              </span>
            </div>
          )}
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[13px] text-violet-600 hover:text-violet-700 font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Revenir à l&apos;accueil
        </Link>
      </main>
    </div>
  );
}
