// ARCHETYPE: command
// Justification: fiche formateur réelle — coordonnées, infos contractuelles, dépôt du contrat.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail, Phone, ShieldCheck, Video, FileSignature, Building, Briefcase, UserRound, UserCog, Receipt } from 'lucide-react';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { ACCENTS, type Accent } from '@/shared/ui/kpi-card';
import { libre } from '@/features/trainer-space/billing';
import { ManageOnly } from '@/shared/components/auth/manage-only';
import { DeleteEntityButton } from '@/features/corbeille/ui/delete-entity-button.client';
import { ContractUpload } from './contract-upload';
import { ContractGenerate } from './contract-generate';
import { TrainerProfileEdit } from './profile-edit';
import { TrainerIdentityEdit } from './identity-edit';
import { SpaceAccess } from './space-access';

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
  tarif_base: 'heure' | 'jour' | 'session' | null;
  tarif_cents: number | null;
};

const AVATARS = [
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
] as const;

function avatarTone(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % AVATARS.length;
  return AVATARS[h] ?? AVATARS[0];
}

function trainerPhotoUrl(path: string | null): string | null {
  if (!path) return null;
  return `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/trainer-photos/${path}`;
}

export default async function FormateurDetailPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('trainers')
    .select(
      'id, organization_id, first_name, last_name, email, phone, is_internal, siret, nda, zoom_url, specialties, contract_path, photo_path, cv_path, bio, user_id, space_disabled_at, tarif_base, tarif_cents',
    )
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

  // Éléments en attente de décision (lisibles par les rôles « facturation » seulement).
  const [{ count: facturesEnAttente }, { count: fraisEnAttente }] = await Promise.all([
    libre(sb).schema('app').from('trainer_invoices').select('id', { count: 'exact', head: true }).eq('trainer_id', t.id).eq('status', 'soumise'),
    libre(sb).schema('app').from('trainer_expenses').select('id', { count: 'exact', head: true }).eq('trainer_id', t.id).eq('status', 'soumise'),
  ]);
  const aTraiter = (facturesEnAttente ?? 0) + (fraisEnAttente ?? 0);

  const initials = `${t.first_name[0] ?? ''}${t.last_name[0] ?? ''}`.toUpperCase();
  const photoUrl = trainerPhotoUrl(t.photo_path);
  // Bucket privé : URL signée courte, régénérée à chaque affichage de la fiche.
  const cvUrl = t.cv_path
    ? (await sb.storage.from('trainer-cvs').createSignedUrl(t.cv_path, 60 * 10)).data?.signedUrl ?? null
    : null;

  return (
    <div className="max-w-3xl w-full mx-auto px-8 py-9">
      <header className="mb-7 rounded-2xl border bg-gradient-to-br from-teal-50 to-white border-teal-100 dark:from-teal-950/40 dark:to-zinc-900 dark:border-teal-900/40 px-7 py-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Link
            href="/formateurs"
            className="text-[12px] text-zinc-500 hover:text-orange-600 dark:hover:text-orange-400 inline-flex items-center gap-1 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Retour aux formateurs
          </Link>
          <span className="text-zinc-300 dark:text-zinc-700" aria-hidden>
            ·
          </span>
          <SectionLabel>Formateur</SectionLabel>
        </div>
        <div className="flex items-start gap-4">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="w-14 h-14 rounded-full object-cover shadow-sm flex-shrink-0" />
          ) : (
            <span className={`w-14 h-14 rounded-full flex items-center justify-center text-[17px] font-bold flex-shrink-0 ${avatarTone(`${t.first_name} ${t.last_name}`)}`}>
              {initials}
            </span>
          )}
          <div className="min-w-0 pt-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">
                {t.first_name} {t.last_name}
              </h1>
              <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[12px] font-semibold ${t.is_internal ? ACCENTS.blue.soft : ACCENTS.purple.soft}`}>
                {t.is_internal ? <Building className="w-3.5 h-3.5" /> : <Briefcase className="w-3.5 h-3.5" />}
                {t.is_internal ? 'Interne' : 'Externe'}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-3 flex-wrap text-[13px] text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{t.email}</span>
              {t.phone && <span className="inline-flex items-center gap-1.5 tabular-nums"><Phone className="w-3.5 h-3.5" />{t.phone}</span>}
            </div>
            {t.specialties && t.specialties.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {t.specialties.map((s) => (
                  <span
                    key={s}
                    className={`inline-flex items-center h-6 px-2 rounded-md text-[12px] font-semibold ${ACCENTS.teal.soft}`}
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className="ml-auto shrink-0 pt-1">
            <ManageOnly section="dossiers">
              <DeleteEntityButton
                entite="formateur"
                id={params.id}
                nom={`${t.first_name} ${t.last_name}`}
                article="ce formateur"
                variant="button"
                redirigerVers="/formateurs"
              />
            </ManageOnly>
          </span>
        </div>
        {t.bio && (
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400 leading-relaxed mt-5 pt-5 border-t border-teal-100 dark:border-teal-900/40 whitespace-pre-line">
            {t.bio}
          </p>
        )}
      </header>

      <div className="mb-6">
        <Card title="Fiche formateur" icon={UserCog} accent="teal">
          <TrainerIdentityEdit
            trainerId={t.id}
            initial={{
              firstName: t.first_name ?? '',
              lastName: t.last_name ?? '',
              email: t.email ?? '',
              phone: t.phone ?? '',
              isInternal: Boolean(t.is_internal),
              siret: t.siret ?? '',
              nda: t.nda ?? '',
              zoomUrl: t.zoom_url ?? '',
              specialties: t.specialties ?? [],
              tarifBase: t.tarif_base ?? '',
              tarifEuros: t.tarif_cents != null ? String(Number(t.tarif_cents) / 100).replace('.', ',') : '',
            }}
          />

          <div className="mt-4 pt-4 border-t border-zinc-200/70 dark:border-zinc-800">
            <SpaceAccess
              trainerId={t.id}
              disabledAt={(t as { space_disabled_at?: string | null }).space_disabled_at ?? null}
              hasAccount={Boolean((t as { user_id?: string | null }).user_id)}
            />
          </div>
        </Card>
      </div>

      <div className="mb-6">
        <Card title="Profil public" icon={UserRound} accent="rose">
          <TrainerProfileEdit trainerId={t.id} photoUrl={photoUrl} initials={initials} bio={t.bio ?? ''} cvUrl={cvUrl} />
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Infos contractuelles" icon={ShieldCheck} accent="purple">
          <Row label="SIRET" value={t.siret} mono />
          <Row label="NDA" value={t.nda} mono />
          <Row
            label="Lien Zoom"
            value={
              t.zoom_url ? (
                <a href={t.zoom_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-bold bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/50 dark:text-orange-300 transition">
                  <Video className="w-3 h-3" /> Ouvrir
                </a>
              ) : null
            }
          />
        </Card>

        <Card title="Contrat de sous-traitance" icon={FileSignature} accent="blue">
          <ContractGenerate trainerId={t.id} existingDocumentId={contractDocId} />
          <div className="my-4 border-t border-zinc-100 dark:border-zinc-800" />
          <p className="text-[11px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
            Ou déposer un PDF signé
          </p>
          <ContractUpload trainerId={t.id} hasContract={!!t.contract_path} signedUrl={signedUrl} />
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Factures & frais" icon={Receipt} accent="emerald">
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400 tabular-nums flex items-center gap-2 flex-wrap">
            {aTraiter > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold ${ACCENTS.amber.soft}`}>{aTraiter}</span>
            )}
            {aTraiter > 0
              ? `${aTraiter} élément${aTraiter > 1 ? 's' : ''} à valider (factures d’honoraires, notes de frais).`
              : 'Aucune facture ni note de frais en attente.'}
          </p>
          <Link
            href={`/formateurs/facturation?formateur=${t.id}`}
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-orange-600 dark:text-orange-400 hover:underline"
          >
            Voir ses factures et notes de frais →
          </Link>
        </Card>
      </div>
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  accent,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: Accent;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${ACCENTS[accent].soft}`}>
          <Icon className="w-4 h-4" />
        </span>
        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400">{title}</p>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[13px]">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className={mono ? 'font-mono text-[12px] text-zinc-900 dark:text-zinc-100' : 'font-semibold text-zinc-900 dark:text-zinc-100'}>
        {value ?? <span className="text-zinc-400">—</span>}
      </span>
    </div>
  );
}
