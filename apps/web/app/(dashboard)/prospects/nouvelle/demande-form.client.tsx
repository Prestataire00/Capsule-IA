'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, FileText, Loader2, X } from 'lucide-react';
import { supabaseBrowser } from '@/shared/lib/supabase/client';
import { deposerProgramme, preparerDepotProgramme } from '../[id]/proposition-actions';
import { lireProgramme } from './lire-programme-action';
import { FUNDER_OPTIONS } from '@/features/prospect/funding';
import { parseEurosToCents } from '@/features/billing/domain/quote';
import { siretValide } from '@/shared/lib/siret';
import { EntrepriseAutocomplete } from '@/app/inscription/entreprise-autocomplete';
import { createDemande } from './actions';

export type FormationOption = { id: string; title: string; code: string | null; priceCents: number; hours: number };
/** La personne à reprendre comme « qui fait la demande » pour une entreprise. */
export type Interlocuteur = { firstName: string; lastName: string; email: string; phone: string };
/** Une fiche entreprise déjà au CRM. */
export type EntrepriseCrm = {
  id: string;
  name: string;
  siret: string;
  conventionCollective: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  interlocuteur: Interlocuteur | null;
};

const SITUATIONS = [
  { value: 'salarie', label: 'Salarié(e)' },
  { value: 'demandeur', label: "Demandeur d'emploi" },
  { value: 'independant', label: 'Indépendant(e)' },
  { value: 'particulier', label: 'Particulier' },
] as const;

/**
 * Pour qui est la demande.
 *
 * Le formulaire présentait tout à tout le monde : on demandait sa situation à
 * une entreprise, et un SIRET à un particulier. Le premier choix commande
 * désormais la suite — c'est aussi lui qui dit si l'annuaire des entreprises a
 * quelque chose à remplir.
 *
 * Il ne s'enregistre pas : il se déduit de `situation`, qui existe déjà et que
 * les écrans, le BPF et la conversion utilisent. Une colonne de plus aurait dit
 * deux fois la même chose, avec le risque qu'elles se contredisent.
 */
const TYPES = [
  {
    value: 'entreprise',
    titre: 'Une entreprise',
    detail: 'Elle inscrit ses salariés. Nom ou SIRET suffisent : le reste vient de l’annuaire.',
    situation: 'salarie',
    financement: 'opco',
  },
  {
    value: 'particulier',
    titre: 'Un particulier',
    detail: 'Il s’inscrit pour lui-même et finance sa formation.',
    situation: 'particulier',
    financement: 'autofinancement',
  },
  {
    value: 'autre',
    titre: 'Autre',
    detail: 'Demandeur d’emploi, indépendant : la situation précise se choisit ensuite.',
    situation: 'demandeur',
    financement: '',
  },
] as const;

type TypeDemandeur = (typeof TYPES)[number]['value'];

/** Une demande existante n'a pas de type : il se relit dans sa situation. */
const typeDepuisSituation = (situation: string): TypeDemandeur =>
  situation === 'salarie' ? 'entreprise' : situation === 'particulier' ? 'particulier' : 'autre';

const MODALITES = [
  { value: '', label: 'À définir' },
  { value: 'presentiel', label: 'Présentiel' },
  { value: 'distanciel', label: 'Distanciel' },
  { value: 'hybride', label: 'Hybride' },
] as const;

const input =
  'mt-1.5 w-full h-9 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 rounded-lg px-3 text-[13px] text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 transition placeholder:text-zinc-400';
const label = 'text-[12px] font-semibold text-zinc-700 dark:text-zinc-300';
const card = 'bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-5 space-y-4';

export type ValeursDemande = {
  civility: string; firstName: string; lastName: string; email: string; phone: string;
  birthDate: string; rqth: boolean; candidateIsLearner: boolean; situation: string; funderKinds: string[];
  companyName: string; companySiret: string; conventionCollective: string;
  referentName: string; referentEmail: string; referentPhone: string;
  formationMode: 'catalogue' | 'sur-mesure' | 'plus-tard';
  formationId: string; customTitle: string; customHours: string; customPrice: string;
  customPriceMode: 'par_stagiaire' | 'forfait';
  preferredModality: string; preferredStartDate: string; message: string;
};

/**
 * Le formulaire d'une demande, pour la créer comme pour la modifier.
 *
 * Un second formulaire d'édition aurait fini par diverger de celui-ci — champs
 * oubliés d'un côté, règles de validation différentes de l'autre.
 */
export function DemandeForm({
  formations,
  entreprisesCrm = [],
  valeurs,
  enregistrer,
  libelleBouton,
}: {
  formations: FormationOption[];
  /** Entreprises du CRM auxquelles rattacher la demande. */
  entreprisesCrm?: EntrepriseCrm[];
  /** Demande existante à modifier ; absent = création. */
  valeurs?: ValeursDemande;
  /** Action de remplacement ; absente = création. */
  enregistrer?: (v: ValeursDemande) => Promise<{ ok: true } | { ok: false; error: string }>;
  libelleBouton?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Programme joint à la création : envoyé une fois la demande enregistrée,
  // et rangé sur la fiche demande (sans proposition IA, qui se lance à part).
  const [programme, setProgramme] = useState<File | null>(null);
  const fichierLu = useRef<File | null>(null);
  const [lecture, setLecture] = useState<
    { etat: 'en-cours' } | { etat: 'ok'; texte: string } | { etat: 'erreur'; texte: string } | null
  >(null);

  // Le programme choisi est lu par l'IA : intitulé et durée viennent remplir
  // la formation. Seuls les champs vides sont remplis — une saisie déjà faite
  // n'est pas écrasée.
  const choisirProgramme = async (f: File | null) => {
    fichierLu.current = f;
    setProgramme(f);
    setLecture(null);
    if (!f) return;
    setLecture({ etat: 'en-cours' });
    const donnees = new FormData();
    donnees.append('file', f);
    const r = await lireProgramme(donnees);
    // Fichier retiré ou remplacé pendant la lecture : ce résultat ne vaut plus.
    if (fichierLu.current !== f) return;
    if (!r.ok) {
      setLecture({ etat: 'erreur', texte: r.error });
      return;
    }
    // La saisie a pu avancer pendant la lecture : on part de l'état courant.
    const actuel = formCourant.current;
    const mode = actuel.formationMode === 'plus-tard' ? 'sur-mesure' : actuel.formationMode;
    const patch: Partial<typeof form> = { formationMode: mode };
    const remplis: string[] = [];
    if (mode === 'sur-mesure') {
      if (r.titre && !actuel.customTitle.trim()) {
        patch.customTitle = r.titre;
        remplis.push('intitulé');
      }
      if (r.heures && !actuel.customHours.trim()) {
        patch.customHours = r.heures;
        remplis.push('durée');
      }
    }
    setForm((prev) => ({ ...prev, ...patch }));
    setLecture(
      remplis.length
        ? { etat: 'ok', texte: `Repris du programme : ${remplis.join(' et ')}. Relisez avant d’enregistrer.` }
        : { etat: 'ok', texte: 'Programme lu : les champs de la formation étaient déjà remplis, rien n’a été changé.' },
    );
  };
  const [form, setForm] = useState({
    civility: valeurs?.civility ?? '',
    firstName: valeurs?.firstName ?? '',
    lastName: valeurs?.lastName ?? '',
    email: valeurs?.email ?? '',
    phone: valeurs?.phone ?? '',
    birthDate: valeurs?.birthDate ?? '',
    rqth: valeurs?.rqth ?? false,
    candidateIsLearner: valeurs?.candidateIsLearner ?? false,
    situation: (valeurs?.situation ?? 'salarie') as (typeof SITUATIONS)[number]['value'],
    funderKinds: valeurs?.funderKinds ?? ['opco'],
    companyName: valeurs?.companyName ?? '',
    companySiret: valeurs?.companySiret ?? '',
    conventionCollective: valeurs?.conventionCollective ?? '',
    referentName: valeurs?.referentName ?? '',
    referentEmail: valeurs?.referentEmail ?? '',
    referentPhone: valeurs?.referentPhone ?? '',
    // 'catalogue' | 'sur-mesure' | 'plus-tard'
    formationMode: (valeurs?.formationMode ?? 'sur-mesure') as 'catalogue' | 'sur-mesure' | 'plus-tard',
    formationId: valeurs?.formationId ?? '',
    customTitle: valeurs?.customTitle ?? '',
    customHours: valeurs?.customHours ?? '',
    customPrice: valeurs?.customPrice ?? '',
    customPriceMode: (valeurs?.customPriceMode ?? 'par_stagiaire') as 'par_stagiaire' | 'forfait',
    preferredModality: valeurs?.preferredModality ?? '',
    preferredStartDate: valeurs?.preferredStartDate ?? '',
    message: valeurs?.message ?? '',
    convertNow: false,
  });
  const formCourant = useRef(form);
  formCourant.current = form;

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    setError(null);
    const hours = form.customHours.trim() ? Number(form.customHours.replace(',', '.')) : null;
    const price = form.customPrice.trim() ? parseEurosToCents(form.customPrice) : null;
    if (form.formationMode === 'sur-mesure') {
      if (!form.customTitle.trim()) return setError('Indiquez l’intitulé de la formation.');
      if (form.customHours.trim() && !(hours && hours > 0)) return setError('Durée invalide (en heures).');
      if (form.customPrice.trim() && price == null) return setError('Tarif invalide (ex. 1500 ou 1500,50).');
    }

    start(async () => {
      if (enregistrer) {
        const r = await enregistrer({
          civility: form.civility,
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          birthDate: form.birthDate,
          rqth: form.rqth,
          candidateIsLearner: form.candidateIsLearner,
          situation: form.situation,
          funderKinds: form.funderKinds,
          companyName: form.companyName,
          companySiret: form.companySiret,
          conventionCollective: form.conventionCollective,
          referentName: form.referentName,
          referentEmail: form.referentEmail,
          referentPhone: form.referentPhone,
          formationMode: form.formationMode,
          formationId: form.formationId,
          customTitle: form.customTitle,
          customHours: form.customHours,
          customPrice: form.customPrice,
          customPriceMode: form.customPriceMode,
          preferredModality: form.preferredModality,
          preferredStartDate: form.preferredStartDate,
          message: form.message,
        });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        router.refresh();
        return;
      }
      const res = await createDemande({
        civility: form.civility as 'm' | 'mme' | '',
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        birthDate: form.birthDate,
        rqth: form.rqth,
        candidateIsLearner: form.candidateIsLearner,
        situation: form.situation,
        funderKinds: form.funderKinds as never,
        companyName: form.companyName,
        companySiret: form.companySiret,
        conventionCollective: form.conventionCollective,
        referentName: form.referentName,
        referentEmail: form.referentEmail,
        referentPhone: form.referentPhone,
        formationId: form.formationMode === 'catalogue' ? form.formationId : '',
        customFormationTitle: form.formationMode === 'sur-mesure' ? form.customTitle : '',
        customFormationHours: form.formationMode === 'sur-mesure' ? hours : null,
        customFormationPriceCents: form.formationMode === 'sur-mesure' ? price : null,
        customFormationPriceMode: form.customPriceMode,
        preferredModality: form.preferredModality as never,
        preferredStartDate: form.preferredStartDate,
        message: form.message,
        convertNow: form.convertNow,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (programme) {
        const prep = await preparerDepotProgramme({ prospectId: res.prospectId, nom: programme.name });
        const envoi = prep.ok
          ? await supabaseBrowser()
              .storage.from('prospect-documents')
              .uploadToSignedUrl(prep.path, prep.token, programme, {
                contentType: programme.type || 'application/octet-stream',
              })
          : null;
        const range =
          prep.ok && !envoi?.error
            ? await deposerProgramme({ prospectId: res.prospectId, nom: programme.name, path: prep.path })
            : null;
        // Échec : la fiche demande le dit et invite à redéposer.
        if (!range?.ok) {
          router.push(`/prospects/${res.prospectId}?programme_echec=1`);
          router.refresh();
          return;
        }
      }
      router.push(res.dossierId ? `/dossiers/${res.dossierId}` : `/prospects/${res.prospectId}`);
      router.refresh();
    });
  };

  // Le bloc suit la règle du schéma, sinon le SIRET deviendrait obligatoire
  // dans un champ masqué — impasse : rien ne s'enregistre et rien ne l'explique.
  const [type, setType] = useState<TypeDemandeur>(() => typeDepuisSituation(form.situation));

  /**
   * Changer de type repositionne la situation et propose un financement.
   *
   * Le financement n'est qu'une proposition : une entreprise peut payer
   * elle-même, un particulier mobiliser son CPF. On ne l'impose donc pas, on
   * évite seulement de faire ressaisir le cas courant.
   */
  const choisirType = (t: TypeDemandeur) => {
    const def = TYPES.find((x) => x.value === t)!;
    setType(t);
    setForm((f) => ({
      ...f,
      situation: def.situation,
      funderKinds: def.financement ? [def.financement] : f.funderKinds,
      // Un particulier n'a pas d'entreprise cliente : garder ces champs
      // laisserait un SIRET orphelin partir sur sa convention.
      ...(t === 'particulier'
        ? { companyName: '', companySiret: '', conventionCollective: '', referentName: '', referentEmail: '', referentPhone: '' }
        : {}),
    }));
  };

  // Le bloc entreprise suit la règle du schéma, et non le seul type choisi :
  // un financement OPCO ou employeur exige un SIRET, que le champ soit affiché
  // ou non. Sans cet accord, l'obligation tomberait dans un champ masqué.
  const entreprise =
    type === 'entreprise' ||
    form.funderKinds.includes('entreprise') ||
    form.funderKinds.includes('opco') ||
    form.companyName.trim() !== '';
  const siretSaisi = form.companySiret.trim();
  const siretFaux = siretSaisi !== '' && !siretValide(siretSaisi);

  return (
    <div className="space-y-5">
      <section className={card}>
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Pour qui est cette demande ?</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {TYPES.map((t) => {
            const actif = type === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => choisirType(t.value)}
                aria-pressed={actif}
                className={`text-left rounded-xl border p-3.5 transition ${
                  actif
                    ? 'border-orange-300 dark:border-orange-800 bg-orange-50/70 dark:bg-orange-950/30 shadow-sm'
                    : 'border-zinc-200/80 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40'
                }`}
              >
                <span
                  className={`block text-[13px] font-semibold ${
                    actif ? 'text-orange-700 dark:text-orange-300' : 'text-zinc-900 dark:text-zinc-100'
                  }`}
                >
                  {t.titre}
                </span>
                <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">{t.detail}</span>
              </button>
            );
          })}
        </div>

        {/* « Autre » couvre deux situations que le BPF distingue. */}
        {type === 'autre' && (
          <label className={`${label} block max-w-xs`}>
            Situation précise
            <select
              value={form.situation}
              onChange={(e) => set('situation', e.target.value as typeof form.situation)}
              className={input}
            >
              {SITUATIONS.filter((x) => x.value === 'demandeur' || x.value === 'independant').map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {entreprise && (
        <section className={card}>
          <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">L’entreprise cliente</h2>
          <div className="space-y-3">
            {entreprisesCrm.length > 0 && (
              <label className={label}>
                Une entreprise de votre CRM
                <select
                  value={entreprisesCrm.find((c) => c.name === form.companyName)?.id ?? ''}
                  onChange={(e) => {
                    const c = entreprisesCrm.find((x) => x.id === e.target.value);
                    if (!c) return;
                    // Nom et SIRET recopiés tels quels : c'est à eux que la
                    // conversion reconnaît la fiche existante. Le reste ne
                    // remplace pas une saisie déjà faite.
                    setForm((f) => ({
                      ...f,
                      companyName: c.name,
                      companySiret: c.siret,
                      conventionCollective: f.conventionCollective.trim() || c.conventionCollective,
                      referentName: f.referentName.trim() || c.contactName,
                      referentEmail: f.referentEmail.trim() || c.contactEmail,
                      referentPhone: f.referentPhone.trim() || c.contactPhone,
                      // Qui fait la demande : l'interlocuteur habituel de
                      // l'entreprise, à corriger si c'est quelqu'un d'autre.
                      ...(c.interlocuteur
                        ? {
                            firstName: c.interlocuteur.firstName,
                            lastName: c.interlocuteur.lastName,
                            email: c.interlocuteur.email,
                            phone: c.interlocuteur.phone,
                          }
                        : {}),
                    }));
                  }}
                  className={input}
                >
                  <option value="">— Choisir une entreprise existante —</option>
                  {entreprisesCrm.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                  Le dossier sera rattaché à cette fiche, et son interlocuteur habituel repris ci-dessous. Nouvelle
                  entreprise ? Cherchez-la dans l&apos;annuaire.
                </span>
              </label>
            )}
            {/* Le nom, le SIRET et la convention collective viennent de
                l'annuaire des entreprises de l'État. Saisis à la main, ils
                arrivaient avec leurs coquilles — un SIRET faux se paie au rejet
                de la facture, une convention approximative à l'instruction du
                dossier OPCO. La saisie manuelle reste possible juste en
                dessous : l'annuaire ignore les entreprises très récentes. */}
            <EntrepriseAutocomplete
              placeholder="Nom ou SIRET de l’entreprise (3 caractères min)…"
              onSelect={(c) =>
                setForm((f) => ({
                  ...f,
                  companyName: c.name || f.companyName,
                  companySiret: c.siret || f.companySiret,
                  // On ne remplace pas une convention déjà saisie : l'INSEE ne
                  // connaît que celle déclarée, l'organisme peut en savoir plus.
                  conventionCollective: f.conventionCollective.trim() || (c.idcc ?? ''),
                }))
              }
            />
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <label className={label}>
                Entreprise
                <input value={form.companyName} onChange={(e) => set('companyName', e.target.value)} className={input} />
              </label>
              <label className={label}>
                SIRET
                <input
                  value={form.companySiret}
                  onChange={(e) => set('companySiret', e.target.value)}
                  maxLength={20}
                  placeholder="123 456 789 00012"
                  aria-invalid={siretFaux}
                  className={siretFaux ? `${input} border-rose-400 dark:border-rose-500` : input}
                />
                <span className="block text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                  {siretFaux
                    ? 'Clé incorrecte : vérifiez les 14 chiffres.'
                    : 'Obligatoire : il identifie le client sur la convention, la facture et au BPF.'}
                </span>
              </label>
              <label className={label}>
                Convention collective
                <input
                  value={form.conventionCollective}
                  onChange={(e) => set('conventionCollective', e.target.value)}
                  maxLength={200}
                  placeholder="1486 ou Bureaux d'études techniques"
                  className={input}
                />
              </label>
            </div>
          </div>
        </section>
      )}

      <section className={card}>
        {/* « Candidat » supposait que cette personne suivait la formation. Elle
            est d'abord celle qui la demande ; qu'elle la suive se coche. */}
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">
          {type === 'entreprise' ? 'Qui fait la demande, chez le client' : 'La personne concernée'}
        </h2>
        {type === 'entreprise' && (
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400 -mt-2">
            Son interlocuteur chez vous. Par défaut, c’est lui le référent du dossier : la convention, les devis et
            les factures lui sont adressés.
          </p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className={label}>
            Civilité
            <select value={form.civility} onChange={(e) => set('civility', e.target.value)} className={input}>
              <option value="">—</option>
              <option value="m">M.</option>
              <option value="mme">Mme</option>
            </select>
          </label>
          <label className={label}>
            Prénom
            <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} className={input} />
          </label>
          <label className={label}>
            Nom
            <input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} className={input} />
          </label>
          <label className={label}>
            Date de naissance
            <input type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} className={input} />
          </label>
          <label className={label}>
            E-mail
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={input} />
          </label>
          <label className={label}>
            Téléphone
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={input} />
          </label>
          <label className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2 mt-6">
            <input type="checkbox" checked={form.rqth} onChange={(e) => set('rqth', e.target.checked)} className="w-4 h-4 accent-orange-500" />
            RQTH / adaptation
          </label>
        </div>

        {/* Celui qui commande n'est pas toujours celui qui suit : un
            responsable qui inscrit son équipe se retrouvait compté parmi les
            stagiaires, sur les émargements et au BPF. */}
        <label className="flex items-start gap-3 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={form.candidateIsLearner}
            onChange={(e) => set('candidateIsLearner', e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-orange-500"
          />
          <span>
            <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
              Cette personne suit aussi la formation
            </span>
            <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
              {form.candidateIsLearner
                ? 'Elle sera inscrite comme stagiaire, en plus d’être le référent du dossier.'
                : 'Elle est le référent du dossier — destinataire de la convention, des devis et des factures — sans être comptée parmi les stagiaires. Ceux-ci s’inscrivent ensuite.'}
            </span>
          </span>
        </label>

        {/* Quand le demandeur suit lui-même la formation, il devient stagiaire :
            quelqu'un d'autre reçoit alors la convention et les factures. C'est
            exactement ce que la conversion va chercher ici. Le demander en
            permanence faisait saisir deux fois la même personne. */}
        {entreprise && form.candidateIsLearner && (
          <div className="rounded-lg border border-zinc-200/70 dark:border-zinc-800 p-3.5 space-y-3">
            <p className="text-[12px] text-zinc-600 dark:text-zinc-400">
              Cette personne étant stagiaire, indiquez qui suit le dossier côté client — sans quoi la convention
              partirait à un stagiaire.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className={label}>
                Référent du dossier
                <input value={form.referentName} onChange={(e) => set('referentName', e.target.value)} className={input} />
              </label>
              <label className={label}>
                Son e-mail
                <input type="email" value={form.referentEmail} onChange={(e) => set('referentEmail', e.target.value)} className={input} />
              </label>
              <label className={label}>
                Son téléphone
                <input value={form.referentPhone} onChange={(e) => set('referentPhone', e.target.value)} className={input} />
              </label>
            </div>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Financement</h2>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 -mt-2">
          Cochez-en plusieurs si besoin, par exemple l&apos;entreprise et l&apos;OPCO. Le premier coché est le
          financement principal.
        </p>
        <div className="flex flex-wrap gap-2">
          {FUNDER_OPTIONS.map((f) => {
            const rang = form.funderKinds.indexOf(f.value);
            const coche = rang >= 0;
            return (
              <button
                key={f.value}
                type="button"
                aria-pressed={coche}
                title={f.hint}
                onClick={() =>
                  set(
                    'funderKinds',
                    coche ? form.funderKinds.filter((k) => k !== f.value) : [...form.funderKinds, f.value],
                  )
                }
                className={
                  coche
                    ? 'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40 text-[13px] font-semibold text-orange-700 dark:text-orange-300'
                    : 'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                }
              >
                {coche && <Check className="w-3.5 h-3.5" />}
                {f.label}
                {rang === 0 && form.funderKinds.length > 1 && (
                  <span className="text-[11px] font-normal text-orange-600/80 dark:text-orange-400/80">· principal</span>
                )}
              </button>
            );
          })}
        </div>
        {form.funderKinds.length === 0 && (
          <p className="text-[12px] text-rose-600 dark:text-rose-400">Choisissez au moins un financement.</p>
        )}
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Formation</h2>
        {/* Plus de catalogue : chaque formation est montée pour un client.
            « Déjà montée » n'est donc pas un catalogue — c'est la reprise d'une
            formation qu'on a déjà construite, avec son programme et ses
            supports. La recréer à chaque fois les dupliquerait. */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              { v: 'sur-mesure', l: 'Nouvelle formation' },
              { v: 'catalogue', l: 'Reprendre une formation déjà montée' },
              { v: 'plus-tard', l: 'À définir plus tard' },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => set('formationMode', o.v)}
              className={`text-[13px] px-3 h-9 rounded-lg border font-semibold transition ${
                form.formationMode === o.v
                  ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300'
                  : 'border-zinc-200/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>

        {form.formationMode === 'catalogue' && (
          <label className={label}>
            Formation déjà montée
            <select value={form.formationId} onChange={(e) => set('formationId', e.target.value)} className={input}>
              <option value="">— Choisir —</option>
              {formations.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                  {f.code ? ` (${f.code})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {form.formationMode === 'sur-mesure' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className={`${label} md:col-span-3`}>
              Intitulé de la formation
              <input
                value={form.customTitle}
                onChange={(e) => set('customTitle', e.target.value)}
                placeholder="Ex. Sûreté aéroportuaire — remise à niveau pour l'équipe de nuit"
                className={input}
              />
            </label>
            <label className={label}>
              Durée prévue (heures)
              <input value={form.customHours} onChange={(e) => set('customHours', e.target.value)} inputMode="decimal" className={input} />
            </label>
            <div className={label}>
              <span className="flex items-center justify-between gap-2">
                Tarif prévu (€ HT)
                <span className="inline-flex rounded-md border border-zinc-200/80 dark:border-zinc-800 p-0.5 text-[11px] font-semibold">
                  {(
                    [
                      ['par_stagiaire', 'Par stagiaire'],
                      ['forfait', 'Prix global'],
                    ] as const
                  ).map(([valeur, libelle]) => (
                    <button
                      key={valeur}
                      type="button"
                      aria-pressed={form.customPriceMode === valeur}
                      onClick={() => set('customPriceMode', valeur)}
                      className={
                        form.customPriceMode === valeur
                          ? 'px-2 py-0.5 rounded bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                          : 'px-2 py-0.5 rounded text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                      }
                    >
                      {libelle}
                    </button>
                  ))}
                </span>
              </span>
              <input
                value={form.customPrice}
                onChange={(e) => set('customPrice', e.target.value)}
                inputMode="decimal"
                aria-label={form.customPriceMode === 'forfait' ? 'Prix global de la formation' : 'Tarif par stagiaire'}
                placeholder={form.customPriceMode === 'forfait' ? 'Pour toute la formation' : 'Par stagiaire, formation entière'}
                className={input}
              />
            </div>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 md:col-span-3">
              La formation sera créée à l’ouverture du dossier, hors catalogue public. Durée et tarif servent de base au devis ;
              tout reste modifiable ensuite.
            </p>
          </div>
        )}

        {form.formationMode === 'plus-tard' && (
          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
            La demande sera enregistrée sans formation. Vous la préciserez avant d’ouvrir le dossier.
          </p>
        )}

        {/* À la modification, le programme se dépose depuis la fiche demande. */}
        {!enregistrer && (
          <div className={label}>
            Programme de la formation (facultatif)
            {programme ? (
              <div className="mt-1.5 flex items-center gap-2 h-9 px-3 rounded-lg border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-[13px] font-normal">
                <FileText className="w-4 h-4 text-orange-500 shrink-0" />
                <span className="truncate flex-1">{programme.name}</span>
                <button
                  type="button"
                  onClick={() => choisirProgramme(null)}
                  aria-label="Retirer le fichier"
                  className="text-zinc-400 hover:text-red-600 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/*"
                onChange={(e) => choisirProgramme(e.target.files?.[0] ?? null)}
                className="mt-1.5 block w-full text-[13px] font-normal text-zinc-600 dark:text-zinc-300 file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border-0 file:bg-orange-50 file:text-orange-700 dark:file:bg-orange-950/40 dark:file:text-orange-300 file:font-semibold file:text-[13px] hover:file:bg-orange-100"
              />
            )}
            <span className="block text-[11px] font-normal text-zinc-500 dark:text-zinc-400 mt-1">
              PDF de préférence : l’intitulé et la durée de la formation en sont repris. Il est rangé sur la fiche
              demande ; la proposition IA se lance ensuite, si vous le souhaitez.
            </span>
            {lecture?.etat === 'en-cours' && (
              <span className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-normal text-zinc-600 dark:text-zinc-300">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />
                Lecture du programme par l’IA…
              </span>
            )}
            {lecture && lecture.etat !== 'en-cours' && (
              <span
                className={`mt-1.5 block text-[12px] font-normal ${
                  lecture.etat === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {lecture.texte}
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            Modalité souhaitée
            <select value={form.preferredModality} onChange={(e) => set('preferredModality', e.target.value)} className={input}>
              {MODALITES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Début souhaité
            <input type="date" value={form.preferredStartDate} onChange={(e) => set('preferredStartDate', e.target.value)} className={input} />
          </label>
        </div>

        <label className={label}>
          Note interne
          <textarea
            value={form.message}
            onChange={(e) => set('message', e.target.value)}
            rows={3}
            placeholder="Contexte, contraintes, interlocuteur…"
            className={`${input} h-auto py-2`}
          />
        </label>
      </section>

      <section className={card}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.convertNow}
            onChange={(e) => set('convertNow', e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-orange-500"
          />
          <span>
            <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">La proposition est déjà acceptée : convertir en client</span>
            <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
              Sinon, la demande reste un prospect jusqu’à ce que vous cliquiez « Convertir en client ». Convertir crée l’apprenant, l’entreprise et le dossier.
            </span>
          </span>
        </label>

        {/* Quand le demandeur suit lui-même la formation, il devient stagiaire :
            quelqu'un d'autre reçoit alors la convention et les factures. C'est
            exactement ce que la conversion va chercher ici. Le demander en
            permanence faisait saisir deux fois la même personne. */}
        {entreprise && form.candidateIsLearner && (
          <div className="rounded-lg border border-zinc-200/70 dark:border-zinc-800 p-3.5 space-y-3">
            <p className="text-[12px] text-zinc-600 dark:text-zinc-400">
              Cette personne étant stagiaire, indiquez qui suit le dossier côté client — sans quoi la convention
              partirait à un stagiaire.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className={label}>
                Référent du dossier
                <input value={form.referentName} onChange={(e) => set('referentName', e.target.value)} className={input} />
              </label>
              <label className={label}>
                Son e-mail
                <input type="email" value={form.referentEmail} onChange={(e) => set('referentEmail', e.target.value)} className={input} />
              </label>
              <label className={label}>
                Son téléphone
                <input value={form.referentPhone} onChange={(e) => set('referentPhone', e.target.value)} className={input} />
              </label>
            </div>
          </div>
        )}
      </section>

      {error && (
        <p className="text-[13px] text-red-600 inline-flex items-start gap-1.5">
          <AlertTriangle className="w-4 h-4 mt-px shrink-0" />
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="h-10 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[13px] font-semibold px-4 rounded-lg shadow-sm shadow-orange-600/30 transition inline-flex items-center gap-2"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {libelleBouton ?? 'Enregistrer la demande'}
        </button>
        <button type="button" onClick={() => router.back()} className="text-[13px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          Annuler
        </button>
      </div>
    </div>
  );
}
