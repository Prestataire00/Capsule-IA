// ARCHETYPE: workflow
'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, UserCog, Loader2 } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
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
          className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour aux formateurs
        </Link>

        <header className="mb-8 flex items-center gap-3">
          <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/60 dark:to-emerald-950/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shadow-sm">
            <UserCog className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Nouveau formateur
            </h1>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Ajoutez un formateur (interne ou externe) à votre réseau.
            </p>
          </div>
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

          <FormField label="Spécialités" hint="Séparées par virgule, max 12">
            <input
              className={inputClass}
              value={specialtiesRaw}
              onChange={e => setSpecialtiesRaw(e.target.value)}
              placeholder="qualiopi, anglais, vente"
            />
          </FormField>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 text-white text-[13px] font-medium hover:bg-orange-600 disabled:opacity-50 shadow-sm transition"
            >
              {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Créer le formateur
            </button>
            {result?.ok && (
              <span className="text-[12px] text-emerald-600 dark:text-emerald-400">
                {result.invited
                  ? '✓ Fiche créée, invitation envoyée'
                  : '✓ Fiche créée (utilisateur déjà membre)'}
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
