// ARCHETYPE: command
// Justification: fiche formateur réelle — coordonnées, infos contractuelles, dépôt du contrat.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail, Phone, ShieldCheck, Video, FileSignature, Building, Briefcase, UserRound } from 'lucide-react';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { ContractUpload } from './contract-upload';
import { ContractGenerate } from './contract-generate';
import { TrainerProfileEdit } from './profile-edit';

type Trainer = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  is_internal: boolean;
  siret: string | null;
  nda: string | null;
  zoom_url: string | null;
  specialties: string[] | null;
  contract_path: string | null;
  photo_path: string | null;
  cv_path: string | null;
  bio: string | null;
};

function trainerPhotoUrl(path: string | null): string | null {
  if (!path) return null;
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/trainer-photos/${path}`;
}

export default async function FormateurDetailPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('trainers')
    .select('id, organization_id, first_name, last_name, email, phone, is_internal, siret, nda, zoom_url, specialties, contract_path, photo_path, cv_path, bio')
    .eq('id', params.id)
    .is('deleted_at', null)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = data as any as Trainer | null;
  if (!t) return notFound();

  let signedUrl: string | null = null;
  if (t.contract_path) {
    const { data: signed } = await sb.storage.from('trainer-contracts').createSignedUrl(t.contract_path, 60);
    signedUrl = signed?.signedUrl ?? null;
  }

  // Contrat de sous-traitance déjà généré (document standalone) pour ce formateur.
  const { data: contractDoc } = await sb
    .schema('app')
    .from('documents')
    .select('id')
    .eq('organization_id', t.organization_id)
    .eq('kind', 'trainer_contract')
    .eq('metadata->>trainer_id', t.id)
    .is('deleted_at', null)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const contractDocId = (contractDoc as { id: string } | null)?.id ?? null;

  const initials = `${t.first_name[0] ?? ''}${t.last_name[0] ?? ''}`.toUpperCase();
  const photoUrl = trainerPhotoUrl(t.photo_path);
  // Bucket privé : URL signée courte, régénérée à chaque affichage de la fiche.
  const cvUrl = t.cv_path
    ? (await sb.storage.from('trainer-cvs').createSignedUrl(t.cv_path, 60 * 10)).data?.signedUrl ?? null
    : null;

  return (
    <div className="max-w-3xl w-full mx-auto px-8 py-8">
      <Link
        href="/formateurs"
        className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Retour aux formateurs
      </Link>

      <header className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-2xl shadow-sm p-6 mb-6">
        <div className="flex items-start gap-4">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="w-14 h-14 rounded-full object-cover shadow-sm flex-shrink-0" />
          ) : (
            <span className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 flex items-center justify-center text-[16px] font-medium shadow-sm flex-shrink-0">
              {initials}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {t.first_name} {t.last_name}
            </h1>
            <div className="flex items-center gap-3 mt-2 flex-wrap text-[12px] text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{t.email}</span>
              {t.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{t.phone}</span>}
              <span className={
                t.is_internal
                  ? 'inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400'
                  : 'inline-flex items-center gap-1 text-blue-700 dark:text-blue-400'
              }>
                {t.is_internal ? <Building className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}
                {t.is_internal ? 'Interne' : 'Externe'}
              </span>
            </div>
            {t.specialties && t.specialties.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {t.specialties.map((s) => (
                  <span key={s} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {t.bio && (
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400 leading-relaxed mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 whitespace-pre-line">
            {t.bio}
          </p>
        )}
      </header>

      <div className="mb-6">
        <Card title="Profil public" icon={UserRound}>
          <TrainerProfileEdit trainerId={t.id} photoUrl={photoUrl} initials={initials} bio={t.bio ?? ''} cvUrl={cvUrl} />
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Infos contractuelles" icon={ShieldCheck}>
          <Row label="SIRET" value={t.siret} mono />
          <Row label="NDA" value={t.nda} mono />
          <Row
            label="Lien Zoom"
            value={
              t.zoom_url ? (
                <a href={t.zoom_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400 hover:underline">
                  <Video className="w-3 h-3" /> Ouvrir
                </a>
              ) : null
            }
          />
        </Card>

        <Card title="Contrat de sous-traitance" icon={FileSignature}>
          <ContractGenerate trainerId={t.id} existingDocumentId={contractDocId} />
          <div className="my-4 border-t border-zinc-100 dark:border-zinc-800" />
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
            Ou déposer un PDF signé
          </p>
          <ContractUpload trainerId={t.id} hasContract={!!t.contract_path} signedUrl={signedUrl} />
        </Card>
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-3.5 h-3.5 text-zinc-400" />
        <p className="text-[11px] tracking-wider uppercase text-zinc-500 dark:text-zinc-400 font-medium">{title}</p>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[13px]">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className={mono ? 'font-mono text-[12px] text-zinc-700 dark:text-zinc-300' : 'text-zinc-700 dark:text-zinc-300'}>
        {value ?? <span className="text-zinc-400">—</span>}
      </span>
    </div>
  );
}
