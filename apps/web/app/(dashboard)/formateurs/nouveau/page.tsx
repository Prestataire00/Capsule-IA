// ARCHETYPE: workflow
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { SectionLabel } from '@/shared/ui/section-label';
import { createTrainer, type CreateTrainerResult } from './actions';

export default function NouveauFormateurPage() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<CreateTrainerResult | null>(null);
  const [specialtiesRaw, setSpecialtiesRaw] = useState('');
  const router = useRouter();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const specialties = specialtiesRaw
      .split(',').map(s => s.trim()).filter(Boolean).slice(0, 12);
    fd.set('specialties', JSON.stringify(specialties));

    startTransition(async () => {
      const res = await createTrainer(fd);
      setResult(res);
      if (res.ok) setTimeout(() => router.push('/formateurs'), 1500);
    });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-2xl w-full mx-auto px-8 py-10">
        <Link
          href="/formateurs"
          className="text-[12px] text-zinc-500 hover:text-orange-600 dark:hover:text-orange-400 inline-flex items-center gap-1 transition mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour aux formateurs
        </Link>

        <header className="mb-8">
          <SectionLabel className="mb-2">Formateurs</SectionLabel>
          <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Nouveau formateur</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3">Ajoutez un formateur (interne ou externe) à votre réseau.</p>
        </header>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Prénom" required>
              <input name="firstName" className={inputClass} required maxLength={100} />
            </FormField>
            <FormField label="Nom" required>
              <input name="lastName" className={inputClass} required maxLength={100} />
            </FormField>
          </div>

          <FormField label="Email" required hint="Un magic link sera envoyé si l'adresse n'a pas encore de compte">
            <input name="email" type="email" className={inputClass} required maxLength={255} />
          </FormField>

          <FormField label="Téléphone">
            <input name="phone" className={inputClass} maxLength={30} />
          </FormField>

          <FormField label="Type">
            <label className="inline-flex items-center gap-2 text-[13px] mr-4">
              <input type="radio" name="isInternal" value="true" defaultChecked /> Interne
            </label>
            <label className="inline-flex items-center gap-2 text-[13px]">
              <input type="radio" name="isInternal" value="false" /> Externe (freelance)
            </label>
          </FormField>

          <FormField label="SIRET" hint="14 chiffres — si formateur externe">
            <input name="siret" className={inputClass} pattern="\d{14}" maxLength={14} />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="NDA" hint="N° de déclaration d'activité (si sous-traitant)">
              <input name="nda" className={inputClass} maxLength={50} />
            </FormField>
            <FormField label="Lien Zoom personnel">
              <input name="zoomUrl" type="url" className={inputClass} maxLength={500} placeholder="https://zoom.us/j/…" />
            </FormField>
          </div>

          <FormField label="Spécialités" hint="Séparées par virgule, max 12">
            <input
              className={inputClass}
              value={specialtiesRaw}
              onChange={e => setSpecialtiesRaw(e.target.value)}
              placeholder="qualiopi, anglais, vente"
            />
          </FormField>

          {/* Profil public — repris tel quel dans l'équipe pédagogique des formations */}
          <div className="border-t border-zinc-200/70 dark:border-zinc-800 pt-4 space-y-4">
            <p className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100">Profil</p>

            <FormField
              label="Description"
              hint="Parcours, spécialités, expérience — reprise dans l'équipe pédagogique des formations et visible au catalogue"
            >
              <textarea
                name="bio"
                rows={4}
                maxLength={5000}
                className={inputClass}
                placeholder="15 ans d'expérience en comptabilité, formateur certifié…"
              />
            </FormField>

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Photo" hint="PNG/JPG/WebP, max 2 Mo — visible au catalogue">
                <input type="file" name="photo" accept="image/png,image/jpeg,image/webp" className={inputClass} />
              </FormField>
              <FormField label="CV" hint="PDF/PNG/JPG, max 10 Mo — preuve Qualiopi, non publié">
                <input type="file" name="cv" accept="application/pdf,image/png,image/jpeg" className={inputClass} />
              </FormField>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-orange-500 text-white text-[13px] font-semibold hover:bg-orange-600 disabled:opacity-50 shadow-sm shadow-orange-600/30 ring-1 ring-inset ring-white/10 transition"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Créer le formateur
            </button>
            {result?.ok && (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                {result.invited
                  ? 'Fiche créée, invitation envoyée'
                  : 'Fiche créée (utilisateur déjà membre)'}
              </span>
            )}
            {result && !result.ok && (
              <span className="text-[12px] text-red-600 dark:text-red-400">Erreur : {result.error}</span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
