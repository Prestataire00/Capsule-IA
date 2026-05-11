// ARCHETYPE: command
import { Building2, Hash, FileBadge, Award, MapPin, Mail } from 'lucide-react';
import { currentOrg } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { DataList, DataRow } from '@/shared/ui/data-row';

export default function ParametresOrganisationPage() {
  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-3.5 h-3.5 text-violet-500" />
          <SectionLabel>Identité légale</SectionLabel>
        </div>
        <DataList>
          <DataRow left="Nom commercial" right={currentOrg.name} />
          <DataRow left="Raison sociale" right={currentOrg.legal_name} />
          <DataRow
            left="SIRET"
            right={<span className="font-mono text-[11px]">{currentOrg.siret}</span>}
          />
          <DataRow
            left="Déclaration d'activité"
            right={<span className="font-mono text-[11px]">{currentOrg.declaration_activite}</span>}
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
            right={<span className="text-emerald-600 dark:text-emerald-400">Certifié</span>}
          />
          <DataRow
            left="Certifié depuis"
            right={<span className="text-zinc-700 dark:text-zinc-300">{currentOrg.qualiopi_certified_at}</span>}
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
            right={<span className="text-zinc-500 dark:text-zinc-400">à configurer</span>}
          />
          <DataRow
            left="Téléphone"
            right={<span className="text-zinc-500 dark:text-zinc-400">à configurer</span>}
          />
          <DataRow
            left="Adresse"
            right={<span className="text-zinc-500 dark:text-zinc-400">à configurer</span>}
          />
        </DataList>
      </section>
    </div>
  );
}
