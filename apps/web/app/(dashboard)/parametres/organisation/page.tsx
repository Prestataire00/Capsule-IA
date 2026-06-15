// ARCHETYPE: command
import { Building2, Hash, FileBadge, Award, MapPin, Mail } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { DataList, DataRow } from '@/shared/ui/data-row';
import { SignatureStampSection } from './signature-stamp-section';

export const dynamic = 'force-dynamic';

type OrgRow = {
  name: string;
  legal_name: string | null;
  siret: string | null;
  declaration_activite: string | null;
  qualiopi_certified_at: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: Record<string, unknown> | null;
  representative_name: string | null;
  representative_title: string | null;
  signature_path: string | null;
  stamp_path: string | null;
};

const fmtAddress = (address: Record<string, unknown> | null): string | null => {
  if (!address) return null;
  const parts = [address.street, address.postal_code, address.city]
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
  return parts.length ? parts.join(', ') : null;
};

export default async function ParametresOrganisationPage() {
  const sb = supabaseServer();

  // Organisation courante (RLS-scopé : un seul OF accessible par l'utilisateur).
  const { data } = await sb
    .schema('app')
    .from('organizations')
    .select(
      'name, legal_name, siret, declaration_activite, qualiopi_certified_at, contact_email, contact_phone, address, representative_name, representative_title, signature_path, stamp_path',
    )
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  const org = (data as unknown as OrgRow | null) ?? {
    name: '—',
    legal_name: null,
    siret: null,
    declaration_activite: null,
    qualiopi_certified_at: null,
    contact_email: null,
    contact_phone: null,
    address: null,
    representative_name: null,
    representative_title: null,
    signature_path: null,
    stamp_path: null,
  };
  const formattedAddress = fmtAddress(org.address);

  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-3.5 h-3.5 text-violet-500" />
          <SectionLabel>Identité légale</SectionLabel>
        </div>
        <DataList>
          <DataRow left="Nom commercial" right={org.name} />
          <DataRow left="Raison sociale" right={org.legal_name ?? '—'} />
          <DataRow
            left="SIRET"
            right={<span className="font-mono text-[11px]">{org.siret ?? '—'}</span>}
          />
          <DataRow
            left="Déclaration d'activité"
            right={<span className="font-mono text-[11px]">{org.declaration_activite ?? '—'}</span>}
          />
        </DataList>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Award className="w-3.5 h-3.5 text-violet-500" />
          <SectionLabel>Certification Qualiopi</SectionLabel>
        </div>
        <DataList>
          <DataRow
            left="Statut"
            right={
              org.qualiopi_certified_at ? (
                <span className="text-emerald-600 dark:text-emerald-400">Certifié</span>
              ) : (
                <span className="text-zinc-500 dark:text-zinc-400">Non renseigné</span>
              )
            }
          />
          <DataRow
            left="Certifié depuis"
            right={<span className="text-zinc-700 dark:text-zinc-300">{org.qualiopi_certified_at ?? '—'}</span>}
          />
          <DataRow
            left="Prochain audit"
            right={<span className="text-zinc-500 dark:text-zinc-400">à venir</span>}
          />
        </DataList>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Mail className="w-3.5 h-3.5 text-violet-500" />
          <SectionLabel>Contact public</SectionLabel>
        </div>
        <DataList>
          <DataRow
            left="Email"
            right={
              org.contact_email ? (
                <span className="text-zinc-700 dark:text-zinc-300">{org.contact_email}</span>
              ) : (
                <span className="text-zinc-500 dark:text-zinc-400">à configurer</span>
              )
            }
          />
          <DataRow
            left="Téléphone"
            right={
              org.contact_phone ? (
                <span className="text-zinc-700 dark:text-zinc-300">{org.contact_phone}</span>
              ) : (
                <span className="text-zinc-500 dark:text-zinc-400">à configurer</span>
              )
            }
          />
          <DataRow
            left="Adresse"
            right={
              formattedAddress ? (
                <span className="text-zinc-700 dark:text-zinc-300">{formattedAddress}</span>
              ) : (
                <span className="text-zinc-500 dark:text-zinc-400">à configurer</span>
              )
            }
          />
        </DataList>
      </section>

      <SignatureStampSection
        representativeName={org.representative_name ?? null}
        representativeTitle={org.representative_title ?? null}
        hasSignature={!!org.signature_path}
        hasStamp={!!org.stamp_path}
      />
    </div>
  );
}
