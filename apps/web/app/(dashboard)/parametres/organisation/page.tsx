// ARCHETYPE: command
import { Award } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { DataList, DataRow } from '@/shared/ui/data-row';
import { SignatureStampSection } from './signature-stamp-section';
import { IdentitySection } from './identity-section';
import { AttendanceSettings } from './attendance-settings';

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
  vat_regime: string | null;
  default_vat_rate: number | null;
  representative_title: string | null;
  signature_path: string | null;
  stamp_path: string | null;
  logo_path: string | null;
};

const addr = (address: Record<string, unknown> | null, key: string): string => {
  const v = address?.[key];
  return typeof v === 'string' ? v : '';
};

export default async function ParametresOrganisationPage() {
  const sb = supabaseServer();

  // Organisation courante (RLS-scopé : un seul OF accessible par l'utilisateur).
  const { data } = await sb
    .schema('app')
    .from('organizations')
    .select(
      'name, legal_name, siret, declaration_activite, qualiopi_certified_at, contact_email, contact_phone, address, representative_name, representative_title, signature_path, stamp_path, logo_path, vat_regime, default_vat_rate',
    )
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  // Réglage lu à part : tant que la migration 0145 n'est pas appliquée, la
  // colonne manque et la requête principale ne doit pas en pâtir.
  const { data: reglage, error: reglageErr } = await sb
    .schema('app')
    .from('organizations')
    .select('attendance_auto_send, attendance_lunch_start, attendance_lunch_end' as never)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  const r = reglage as { attendance_auto_send?: boolean; attendance_lunch_start?: string; attendance_lunch_end?: string } | null;
  const envoiAuto = Boolean(r?.attendance_auto_send);

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
    vat_regime: 'exempt',
    default_vat_rate: 0,
    representative_title: null,
    signature_path: null,
    stamp_path: null,
    logo_path: null,
  };
  return (
    <div className="space-y-8">
      <IdentitySection
        org={{
          name: org.name ?? '',
          legalName: org.legal_name ?? '',
          siret: org.siret ?? '',
          declarationActivite: org.declaration_activite ?? '',
          contactEmail: org.contact_email ?? '',
          contactPhone: org.contact_phone ?? '',
          addressLine1: addr(org.address, 'line1'),
          addressPostalCode: addr(org.address, 'postal_code'),
          addressCity: addr(org.address, 'city'),
          representativeName: org.representative_name ?? '',
          representativeTitle: org.representative_title ?? '',
          vatRegime: org.vat_regime === 'subject' ? 'subject' : 'exempt',
          defaultVatRate: String(org.default_vat_rate ?? 0),
        }}
      />

      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-7 h-7 rounded-lg grid place-items-center bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
            <Award className="w-3.5 h-3.5" />
          </span>
          <SectionLabel>Certification Qualiopi</SectionLabel>
        </div>
        <DataList>
          <DataRow
            left="Statut"
            right={
              org.qualiopi_certified_at ? (
                <span className="text-[12px] font-semibold h-6 inline-flex items-center px-2.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">Certifié</span>
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

      <AttendanceSettings
        enabled={envoiAuto}
        available={!reglageErr}
        lunchStart={(r?.attendance_lunch_start ?? '12:30').slice(0, 5)}
        lunchEnd={(r?.attendance_lunch_end ?? '13:30').slice(0, 5)}
      />
      <SignatureStampSection
        representativeName={org.representative_name ?? null}
        representativeTitle={org.representative_title ?? null}
        hasSignature={!!org.signature_path}
        hasStamp={!!org.stamp_path}
        hasLogo={!!org.logo_path}
      />
    </div>
  );
}
