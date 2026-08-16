// ARCHETYPE: workflow
// Justification: formulaire de création/édition d'une formation (catalogue), 5 sections
// accordéon reprises de SoSafe — écrit dans app.formations + metadata.catalog.
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, Controller, type Control, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Info,
  Award,
  GraduationCap,
  ClipboardCheck,
  Accessibility,
  Check,
  AlertCircle,
} from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { AccordionSection } from '@/shared/ui/accordion-section';
import { RichText } from '@/shared/ui/rich-text';
import { cn } from '@/shared/lib/cn';
import {
  ACTION_TYPES,
  CERTIF_TYPES,
  FUNDING_TYPES,
  MODALITIES,
  NSF_CODES,
  NSF_FREE_ENTRY,
  PROGRAM_CATEGORIES,
  STATUSES,
  VALIDITY_UNITS,
} from '../constants';
import {
  formationFormSchema,
  emptyFormationValues,
  type FormationFormValues,
} from '../formation.schema';
import { createFormation, updateFormation } from '../actions';
import { ImportProgrammeButton } from './import-programme.client';
import type { ExtractedProgramme } from '../programme/extract-from-pdf';

type Trainer = { id: string; name: string };

const ERROR_LABELS: Record<string, string> = {
  code_already_exists: 'Ce code interne est déjà utilisé par une autre formation de votre organisme.',
  forbidden_not_admin: "Vous n'avez pas les droits pour gérer le catalogue.",
  unauthenticated: 'Session expirée, reconnectez-vous.',
  invalid_input: 'Certains champs sont invalides, vérifiez le formulaire.',
  not_found: 'Cette formation est introuvable.',
};

// Champs de chaque section repliable — sert à rouvrir la bonne section quand un
// champ invalide s'y cache (sinon l'erreur reste dans une section fermée = submit
// silencieux, l'utilisateur ne voit rien se passer).
const SECTION2_FIELDS = [
  'actionType', 'isDpc', 'diplomeVise', 'titreVise', 'codeNsf', 'certifying', 'qualifying',
  'certificationObtention', 'certificationDetails', 'validityValue', 'validityUnit', 'recyclingEnabled',
  'recyclingReminderValue', 'recyclingReminderUnit', 'certifType', 'rncpCode', 'rsCode', 'certificateur',
  'certifEmetteur', 'certifNomCertificateur', 'certifIdentifiantCertificateur', 'certifNumeroContrat',
  'certifModaliteAcces', 'certifModaliteObtention', 'certifDateEnregistrement', 'certifDonneeCertifiee',
  'fundingTypes',
] as const;
const SECTION3_FIELDS = [
  'programContent', 'objectives', 'targetAudience', 'pedagogicalMethod', 'teachingTeam',
  'defaultTrainerId', 'deroulement',
] as const;
const SECTION4_FIELDS = ['evaluationMethod', 'resultIndicators'] as const;
const SECTION5_FIELDS = [
  'prerequisites', 'accessibilityInfo', 'accessDelay', 'referentContact', 'referentHandicap',
] as const;

// Seuls les champs de la section 1 affichent leur erreur en ligne ; ailleurs on
// nomme le champ fautif dans le bandeau, sinon l'utilisateur ouvre une section
// sans savoir quoi corriger.
const FIELD_LABELS: Record<string, string> = {
  title: 'Titre', subtitle: 'Sous-titre', code: 'Code interne', version: 'Version',
  description: 'Description', modality: 'Modalité', durationHours: 'Durée (heures)',
  durationDays: 'Durée (jours)', effectifMin: 'Effectif minimum', effectifMax: 'Effectif maximum',
  status: 'Statut', priceMode: 'Unité des tarifs', priceVatRate: 'Taux de TVA',
  priceBase: 'Tarif de base', priceEntreprise: 'Tarif entreprise',
  priceParticulier: 'Tarif particulier', priceIndependant: 'Tarif indépendant',
  categories: 'Catégories', imageUrl: 'Image', videoUrl: 'Vidéo',
  defaultLocation: 'Lieu par défaut', defaultCity: 'Ville par défaut',
  defaultDepartment: 'Département par défaut',
  actionType: "Type d'action", diplomeVise: 'Diplôme visé', titreVise: 'Titre visé',
  codeNsf: 'Code NSF', certificationObtention: "Modalités d'obtention",
  certificationDetails: 'Détails sur la certification', validityValue: 'Durée de validité',
  recyclingReminderValue: 'Relance à effectuer', certifType: 'Type de certification',
  rncpCode: 'Code RNCP', rsCode: 'Code RS', certificateur: 'Certificateur',
  certifEmetteur: 'Identifiant émetteur', certifNomCertificateur: 'Nom du certificateur',
  certifIdentifiantCertificateur: 'Identifiant certificateur',
  certifNumeroContrat: 'Numéro de contrat', certifModaliteAcces: "Modalité d'accès",
  certifModaliteObtention: "Modalité d'obtention",
  certifDateEnregistrement: "Date d'enregistrement", fundingTypes: 'Financements possibles',
  programContent: 'Programme détaillé', objectives: 'Objectifs pédagogiques',
  targetAudience: 'Public visé', pedagogicalMethod: 'Méthodes pédagogiques',
  teachingTeam: 'Équipe pédagogique', defaultTrainerId: 'Formateur par défaut',
  deroulement: 'Déroulement', evaluationMethod: "Modalités d'évaluation",
  resultIndicators: 'Indicateurs de résultats', prerequisites: 'Prérequis',
  accessibilityInfo: 'Accessibilité handicap', accessDelay: "Délai d'accès",
  referentContact: 'Référent pédagogique', referentHandicap: 'Référent handicap',
};

// ── Wrappers présentationnels (module scope → pas de remount au render) ─────────
function Err({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <span className="text-[11px] text-rose-500 block mt-1">{msg}</span>;
}

function Row({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <div className={cn('grid gap-3', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-3', cols === 4 && 'sm:grid-cols-4')}>
      {children}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer p-3 -mx-1 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-950 transition">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-violet-600"
      />
      <span>
        <span className="text-[13px] text-zinc-900 dark:text-zinc-100 font-medium block">{label}</span>
        {description && (
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-0.5">{description}</span>
        )}
      </span>
    </label>
  );
}

function MultiCheck({
  options,
  selected,
  onToggle,
}: {
  options: readonly { value: string; label: string }[] | readonly string[];
  selected: string[];
  onToggle: (next: string[]) => void;
}) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <div className="flex flex-wrap gap-2">
      {opts.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onToggle(on ? selected.filter((s) => s !== o.value) : [...selected, o.value])}
            className={cn(
              'text-[12px] px-3 py-1.5 rounded-full border transition',
              on
                ? 'bg-violet-50 dark:bg-violet-950/40 border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300'
                : 'bg-white dark:bg-zinc-900 border-zinc-200/60 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function RichField({
  name,
  label,
  control,
  placeholder,
  minHeight,
}: {
  name: keyof FormationFormValues;
  label: string;
  control: Control<FormationFormValues>;
  placeholder?: string;
  minHeight?: number;
}) {
  return (
    <FormField label={label}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <RichText
            value={(field.value as string) ?? ''}
            onChange={field.onChange}
            placeholder={placeholder}
            minHeight={minHeight}
          />
        )}
      />
    </FormField>
  );
}

function ListField({
  name,
  label,
  control,
  hint,
  placeholder,
}: {
  name: 'objectives' | 'prerequisites';
  label: string;
  control: Control<FormationFormValues>;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <FormField label={label} hint={hint ?? 'Une ligne = un élément.'}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <textarea
            rows={4}
            placeholder={placeholder}
            className={inputClass}
            value={(field.value as string[]).join('\n')}
            onChange={(e) => field.onChange(e.target.value.split('\n'))}
          />
        )}
      />
    </FormField>
  );
}

export type OrgVat = { regime: 'exempt' | 'subject'; rate: number };

export function FormationForm({
  mode,
  formationId,
  initial,
  trainers = [],
  orgVat = { regime: 'exempt', rate: 0 },
}: {
  mode: 'create' | 'edit';
  formationId?: string;
  initial?: FormationFormValues;
  trainers?: Trainer[];
  /** Régime de TVA de l'organisme (Paramètres → Organisation) : sert de taux par défaut. */
  orgVat?: OrgVat;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormationFormValues>({
    resolver: zodResolver(formationFormSchema),
    defaultValues:
      initial ??
      ({
        ...emptyFormationValues,
        priceVatRate: orgVat.regime === 'subject' ? String(orgVat.rate) : '',
      } as FormationFormValues),
  });

  // Le sélecteur NSF bascule en saisie libre quand la nomenclature ne couvre pas
  // la spécialité (IA, automatisation…). Une valeur enregistrée hors liste — y
  // compris l'ancienne sentinelle `professionnel` — rouvre la saisie libre.
  const codeNsf = watch('codeNsf');
  const [nsfFree, setNsfFree] = useState(() => {
    const initialCode = initial?.codeNsf ?? '';
    return initialCode !== '' && !NSF_CODES.some((n) => n.value === initialCode);
  });

  const priceMode = watch('priceMode');
  const priceVatRate = watch('priceVatRate');
  const priceBase = watch('priceBase');
  const vatRate = Number(priceVatRate) > 0 ? Number(priceVatRate) : 0;
  const priceUnit = priceMode === 'ttc' ? 'TTC' : 'HT';
  // Contrepartie du tarif de base dans l'autre unité, pour lever le doute à la saisie.
  const priceCounterpart = (() => {
    const amount = Number(priceBase);
    if (!Number.isFinite(amount) || amount <= 0 || vatRate === 0) return null;
    const other = priceMode === 'ttc' ? amount / (1 + vatRate / 100) : amount * (1 + vatRate / 100);
    return `${other.toFixed(2).replace('.', ',')} € ${priceMode === 'ttc' ? 'HT' : 'TTC'}`;
  })();

  const recyclingEnabled = watch('recyclingEnabled');
  const certifying = watch('certifying');
  const qualifying = watch('qualifying');
  const showCertifBlock = certifying || qualifying;

  const hasErrorIn = (fields: readonly string[]): boolean => fields.some((f) => f in errors);

  // Submit bloqué par la validation zod : sans ce handler, l'erreur d'un champ dans
  // une section repliée reste invisible → « rien ne se passe » au clic sur Créer.
  const onInvalid = (invalid: FieldErrors<FormationFormValues>) => {
    const names = Object.keys(invalid).map((f) => FIELD_LABELS[f] ?? f);
    setServerError(
      `Impossible d'enregistrer : ${names.length > 1 ? 'champs invalides' : 'champ invalide'} — ${names.join(', ')}. Les sections concernées ont été ouvertes, corrigez puis réessayez.`,
    );
  };

  // Import PDF : on ne remplit que les champs encore vides, pour qu'un second
  // import (ou un import sur une fiche en cours) n'efface pas la saisie.
  const applyImportedProgramme = (data: ExtractedProgramme) => {
    const fill = (name: keyof FormationFormValues, value: string | string[]) => {
      if (Array.isArray(value) ? value.length === 0 : value === '') return;
      const current = getValues(name);
      const empty = Array.isArray(current) ? current.length === 0 : !String(current ?? '').trim();
      if (empty) setValue(name, value as never, { shouldDirty: true });
    };

    fill('title', data.title);
    fill('subtitle', data.subtitle);
    fill('durationHours', data.durationHours);
    fill('programContent', data.programContent);
    fill('objectives', data.objectives);
    fill('targetAudience', data.targetAudience);
    fill('prerequisites', data.prerequisites);
    fill('pedagogicalMethod', data.pedagogicalMethod);
    fill('teachingTeam', data.teachingTeam);
    fill('deroulement', data.deroulement);
    fill('evaluationMethod', data.evaluationMethod);
    fill('resultIndicators', data.resultIndicators);
    fill('accessibilityInfo', data.accessibilityInfo);
  };

  const onValid = (values: FormationFormValues) => {
    setServerError(null);
    const cleaned: FormationFormValues = {
      ...values,
      objectives: values.objectives.map((s) => s.trim()).filter(Boolean),
      prerequisites: values.prerequisites.map((s) => s.trim()).filter(Boolean),
    };
    startTransition(async () => {
      const res =
        mode === 'create'
          ? await createFormation(cleaned)
          : await updateFormation(formationId as string, cleaned);
      if (res.ok) {
        router.push(mode === 'create' ? '/formations' : `/formations/${res.id}`);
        router.refresh();
      } else {
        setServerError(ERROR_LABELS[res.error] ?? 'Une erreur est survenue, réessayez.');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid, onInvalid)} className="space-y-4">
      {/* ── Section 1 : Infos générales ─────────────────────────────────── */}
      <AccordionSection
        title="Informations générales"
        description="Identité, modalité, durée, tarifs et publication."
        icon={<Info className="w-4 h-4" />}
        defaultOpen
      >
        <Row>
          <FormField label="Titre" required>
            <input {...register('title')} placeholder="Initiation à la comptabilité générale" className={inputClass} />
            <Err msg={errors.title?.message} />
          </FormField>
          <FormField label="Sous-titre">
            <input {...register('subtitle')} placeholder="Attestation, niveau 1…" className={inputClass} />
          </FormField>
        </Row>
        <Row cols={3}>
          <FormField label="Code interne" hint="Auto-généré depuis le titre si vide.">
            <input {...register('code')} placeholder="FORM-COMPTA-01" className={`${inputClass} font-mono`} />
          </FormField>
          <FormField label="Version">
            <input {...register('version')} className={inputClass} />
          </FormField>
          <FormField label="Statut">
            <select {...register('status')} className={inputClass}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </FormField>
        </Row>
        <RichField name="description" label="Description" control={control} placeholder="Présentation générale de la formation…" minHeight={110} />
        <Row>
          <FormField label="Modalité" required>
            <select {...register('modality')} className={inputClass}>
              {MODALITIES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Vidéo de présentation (URL)">
            <input {...register('videoUrl')} placeholder="https://youtube.com/…" className={inputClass} />
          </FormField>
        </Row>
        <Row cols={4}>
          <FormField label="Durée (heures)" required>
            <input type="number" min={0} step="0.5" {...register('durationHours')} placeholder="14" className={inputClass} />
            <Err msg={errors.durationHours?.message} />
          </FormField>
          <FormField label="Durée (jours)">
            <input type="number" min={0} step="0.5" {...register('durationDays')} placeholder="2" className={inputClass} />
          </FormField>
          <FormField label="Effectif min">
            <input type="number" min={0} {...register('effectifMin')} className={inputClass} />
          </FormField>
          <FormField label="Effectif max">
            <input type="number" min={0} {...register('effectifMax')} placeholder="12" className={inputClass} />
          </FormField>
        </Row>
        <Row cols={2}>
          <FormField label="Tarifs saisis en">
            <select {...register('priceMode')} className={inputClass}>
              <option value="ht">Hors taxes (HT)</option>
              <option value="ttc">Toutes taxes comprises (TTC)</option>
            </select>
          </FormField>
          <FormField label="Taux de TVA (%)">
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              {...register('priceVatRate')}
              placeholder={orgVat.regime === 'subject' ? String(orgVat.rate) : '0 — organisme exonéré'}
              className={inputClass}
            />
            <Err msg={errors.priceVatRate?.message} />
          </FormField>
        </Row>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 -mt-1">
          {orgVat.regime === 'exempt' ? (
            <>
              Votre organisme est déclaré <strong>exonéré de TVA</strong> (art. 261-4-4°a CGI) :
              laissez le taux à 0, HT et TTC sont alors identiques. Le régime se change dans
              Paramètres → Organisation.
            </>
          ) : (
            <>
              Taux par défaut de votre organisme : <strong>{orgVat.rate} %</strong>. Vous pouvez le
              remplacer ici pour cette formation.
            </>
          )}{' '}
          Les montants sont <strong>enregistrés en HT</strong> — c'est ce que reprennent le devis,
          la facturation et le BPF.
        </p>
        <Row cols={4}>
          <FormField label={`Prix de base (€ ${priceUnit})`} required>
            <input type="number" min={0} {...register('priceBase')} placeholder="1200" className={inputClass} />
            <Err msg={errors.priceBase?.message} />
            {priceCounterpart && (
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-1">
                soit {priceCounterpart}
              </span>
            )}
          </FormField>
          <FormField label={`Prix entreprise (€ ${priceUnit})`}>
            <input type="number" min={0} {...register('priceEntreprise')} className={inputClass} />
          </FormField>
          <FormField label={`Prix particulier (€ ${priceUnit})`}>
            <input type="number" min={0} {...register('priceParticulier')} className={inputClass} />
          </FormField>
          <FormField label={`Prix indépendant (€ ${priceUnit})`}>
            <input type="number" min={0} {...register('priceIndependant')} className={inputClass} />
          </FormField>
        </Row>
        <FormField label="Catégories">
          <Controller
            control={control}
            name="categories"
            render={({ field }) => (
              <MultiCheck options={PROGRAM_CATEGORIES} selected={field.value} onToggle={field.onChange} />
            )}
          />
        </FormField>
        <Row cols={3}>
          <FormField label="Lieu par défaut">
            <input {...register('defaultLocation')} placeholder="Centre de formation…" className={inputClass} />
          </FormField>
          <FormField label="Ville">
            <input {...register('defaultCity')} className={inputClass} />
          </FormField>
          <FormField label="Département">
            <input {...register('defaultDepartment')} placeholder="Var (83)" className={inputClass} />
          </FormField>
        </Row>
        <FormField label="Image (URL)">
          <input {...register('imageUrl')} placeholder="https://…" className={inputClass} />
        </FormField>
        <Controller
          control={control}
          name="eligibleCpf"
          render={({ field }) => (
            <Toggle label="Éligible CPF" checked={field.value} onChange={field.onChange} />
          )}
        />
        <Controller
          control={control}
          name="publishedToCatalog"
          render={({ field }) => (
            <Toggle
              label="Publier sur le catalogue en ligne"
              description="Visible des apprenants sur la page d'inscription publique."
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </AccordionSection>

      {/* ── Section 2 : Type d'action & certification ───────────────────── */}
      <AccordionSection
        title="Type d'action & certification"
        description="Nomenclature BPF, code NSF, certification France Compétences."
        icon={<Award className="w-4 h-4" />}
        forceOpen={hasErrorIn(SECTION2_FIELDS)}
      >
        <Row cols={3}>
          <FormField label="Type d'action">
            <select {...register('actionType')} className={inputClass}>
              {ACTION_TYPES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Diplôme visé">
            <input {...register('diplomeVise')} placeholder="Aucun, BTS…" className={inputClass} />
          </FormField>
          <FormField label="Titre visé">
            <input {...register('titreVise')} className={inputClass} />
          </FormField>
        </Row>
        <Row cols={3}>
          <FormField label="Code NSF">
            <div className="space-y-2">
              <select
                value={nsfFree ? NSF_FREE_ENTRY : codeNsf}
                onChange={(e) => {
                  const picked = e.target.value;
                  setNsfFree(picked === NSF_FREE_ENTRY);
                  setValue('codeNsf', picked === NSF_FREE_ENTRY ? '' : picked, { shouldDirty: true });
                }}
                className={inputClass}
              >
                {NSF_CODES.map((n) => (
                  <option key={n.value} value={n.value}>
                    {n.label}
                  </option>
                ))}
              </select>
              {nsfFree && (
                <input
                  {...register('codeNsf')}
                  placeholder="Ex. : Intelligence artificielle générative"
                  className={inputClass}
                  aria-label="Spécialité NSF en saisie libre"
                />
              )}
            </div>
            <Err msg={errors.codeNsf?.message} />
          </FormField>
          <FormField label="Type de certification">
            <select {...register('certifType')} className={inputClass}>
              {CERTIF_TYPES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Certificateur">
            <input {...register('certificateur')} placeholder="France Compétences…" className={inputClass} />
          </FormField>
        </Row>
        <Row cols={2}>
          <FormField label="Code RNCP">
            <input {...register('rncpCode')} placeholder="RNCP12345" className={inputClass} />
          </FormField>
          <FormField label="Code RS">
            <input {...register('rsCode')} placeholder="RS1234" className={inputClass} />
          </FormField>
        </Row>
        <Controller
          control={control}
          name="isDpc"
          render={({ field }) => <Toggle label="Action DPC" checked={field.value} onChange={field.onChange} />}
        />
        <Row cols={2}>
          <Controller
            control={control}
            name="certifying"
            render={({ field }) => (
              <Toggle label="Formation certifiante" checked={field.value} onChange={field.onChange} />
            )}
          />
          <Controller
            control={control}
            name="qualifying"
            render={({ field }) => (
              <Toggle label="Formation qualifiante" checked={field.value} onChange={field.onChange} />
            )}
          />
        </Row>
        {showCertifBlock && (
          <div className="rounded-lg border border-violet-200/60 dark:border-violet-900/40 bg-violet-50/40 dark:bg-violet-950/20 p-4 space-y-4">
            <FormField label="Modalités d'obtention">
              <textarea rows={3} {...register('certificationObtention')} className={inputClass} placeholder="Conditions de réussite, examen…" />
            </FormField>
            <FormField label="Détails sur la certification">
              <textarea rows={2} {...register('certificationDetails')} className={inputClass} />
            </FormField>
            <Row cols={2}>
              <FormField label="Durée de validité">
                <div className="flex gap-2">
                  <input type="number" min={0} {...register('validityValue')} placeholder="4" className={inputClass} />
                  <select {...register('validityUnit')} className={inputClass}>
                    {VALIDITY_UNITS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              </FormField>
              <FormField label="Date d'enregistrement">
                <input type="date" {...register('certifDateEnregistrement')} className={inputClass} />
              </FormField>
            </Row>
            <Row cols={2}>
              <FormField label="Identifiant émetteur">
                <input {...register('certifEmetteur')} className={inputClass} />
              </FormField>
              <FormField label="Nom du certificateur">
                <input {...register('certifNomCertificateur')} className={inputClass} />
              </FormField>
            </Row>
            <Row cols={2}>
              <FormField label="Identifiant certificateur">
                <input {...register('certifIdentifiantCertificateur')} className={inputClass} />
              </FormField>
              <FormField label="Numéro de contrat">
                <input {...register('certifNumeroContrat')} className={inputClass} />
              </FormField>
            </Row>
            <Row cols={2}>
              <FormField label="Modalité d'accès">
                <input {...register('certifModaliteAcces')} className={inputClass} />
              </FormField>
              <FormField label="Modalité d'obtention">
                <input {...register('certifModaliteObtention')} className={inputClass} />
              </FormField>
            </Row>
            <Controller
              control={control}
              name="certifDonneeCertifiee"
              render={({ field }) => (
                <Toggle label="Donnée certifiée" checked={field.value} onChange={field.onChange} />
              )}
            />
          </div>
        )}
        <Controller
          control={control}
          name="recyclingEnabled"
          render={({ field }) => (
            <Toggle
              label="Formation avec recyclage"
              description="Déclenche une relance à échéance."
              checked={field.value}
              onChange={field.onChange}
            />
          )}
        />
        {recyclingEnabled && (
          <FormField label="Relance à effectuer">
            <div className="flex gap-2 max-w-xs">
              <input type="number" min={0} {...register('recyclingReminderValue')} placeholder="6" className={inputClass} />
              <select {...register('recyclingReminderUnit')} className={inputClass}>
                {VALIDITY_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </FormField>
        )}
        <FormField label="Financements possibles">
          <Controller
            control={control}
            name="fundingTypes"
            render={({ field }) => (
              <MultiCheck options={FUNDING_TYPES} selected={field.value} onToggle={field.onChange} />
            )}
          />
        </FormField>
      </AccordionSection>

      {/* ── Section 3 : Contenu pédagogique ─────────────────────────────── */}
      <AccordionSection
        title="Contenu pédagogique"
        description="Programme, objectifs, public, méthodes et équipe."
        icon={<GraduationCap className="w-4 h-4" />}
        forceOpen={hasErrorIn(SECTION3_FIELDS)}
      >
        <div className="rounded-lg border border-dashed border-zinc-200/80 dark:border-zinc-800 p-3">
          <ImportProgrammeButton onImported={applyImportedProgramme} />
        </div>
        <RichField name="programContent" label="Programme détaillé / Syllabus" control={control} minHeight={150} />
        <ListField name="objectives" label="Objectifs pédagogiques" control={control} placeholder={'Comprendre le bilan\nSaisir des écritures'} />
        <FormField label="Public visé">
          <textarea rows={3} {...register('targetAudience')} className={inputClass} placeholder="Comptables débutants…" />
        </FormField>
        <RichField name="pedagogicalMethod" label="Méthodes pédagogiques" control={control} minHeight={90} />
        <RichField name="teachingTeam" label="Équipe pédagogique" control={control} minHeight={90} />
        <Row cols={2}>
          <FormField label="Formateur par défaut">
            <select {...register('defaultTrainerId')} className={inputClass}>
              <option value="">— Aucun —</option>
              {trainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </FormField>
        </Row>
        <FormField label="Déroulement (visible apprenant)">
          <textarea rows={3} {...register('deroulement')} className={inputClass} />
        </FormField>
      </AccordionSection>

      {/* ── Section 4 : Évaluation & résultats ───────────────────────────── */}
      <AccordionSection
        title="Évaluation & résultats"
        description="Modalités d'évaluation et indicateurs."
        icon={<ClipboardCheck className="w-4 h-4" />}
        forceOpen={hasErrorIn(SECTION4_FIELDS)}
      >
        <RichField name="evaluationMethod" label="Modalités d'évaluation" control={control} minHeight={90} />
        <RichField name="resultIndicators" label="Indicateurs de résultats" control={control} minHeight={90} />
      </AccordionSection>

      {/* ── Section 5 : Accessibilité & contact ──────────────────────────── */}
      <AccordionSection
        title="Accessibilité & contact"
        description="Prérequis, handicap, délais et référents."
        icon={<Accessibility className="w-4 h-4" />}
        forceOpen={hasErrorIn(SECTION5_FIELDS)}
      >
        <ListField name="prerequisites" label="Prérequis" control={control} placeholder={'Aucun prérequis'} />
        <RichField name="accessibilityInfo" label="Accessibilité handicap" control={control} minHeight={90} />
        <FormField label="Délais et modalités d'accès">
          <textarea rows={3} {...register('accessDelay')} className={inputClass} />
        </FormField>
        <Row cols={2}>
          <FormField label="Contact référent">
            <input {...register('referentContact')} placeholder="Nom et coordonnées" className={inputClass} />
          </FormField>
          <FormField label="Référent handicap">
            <input {...register('referentHandicap')} placeholder="Nom et coordonnées" className={inputClass} />
          </FormField>
        </Row>
      </AccordionSection>

      {serverError && (
        <div className="flex items-center gap-2 text-[13px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/40 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {serverError}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <Link href="/formations" className="text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition">
          Annuler
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="bg-violet-600 hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
        >
          <Check className="w-3.5 h-3.5" />
          {pending ? 'Enregistrement…' : mode === 'create' ? 'Créer la formation' : 'Enregistrer les modifications'}
        </button>
      </div>
    </form>
  );
}
