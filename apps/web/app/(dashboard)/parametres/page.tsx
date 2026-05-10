// ARCHETYPE: command
// Justification: réglages de l'organisation — listes plates par section, peu d'actions.

import { currentOrg, currentUser } from '@/shared/mock/data';
import { SectionLabel } from '@/shared/ui/section-label';
import { DataList, DataRow } from '@/shared/ui/data-row';

export default function ParametresPage() {
  return (
    <div className="max-w-3xl w-full mx-auto px-6 py-8 space-y-8">
      <header>
        <SectionLabel className="mb-1">Configuration</SectionLabel>
        <h1 className="text-2xl font-medium">Paramètres</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          Réglages de l'organisation, des membres et des intégrations.
        </p>
      </header>

      <section>
        <SectionLabel className="mb-3">Organisation</SectionLabel>
        <DataList>
          <DataRow left="Nom commercial" right={currentOrg.name} />
          <DataRow left="Raison sociale" right={currentOrg.legal_name} />
          <DataRow left="SIRET" right={<span className="font-mono text-[11px]">{currentOrg.siret}</span>} />
          <DataRow left="Déclaration d'activité" right={<span className="font-mono text-[11px]">{currentOrg.declaration_activite}</span>} />
          <DataRow left="Certification Qualiopi" right={<span className="text-emerald-600">depuis {currentOrg.qualiopi_certified_at}</span>} />
        </DataList>
      </section>

      <section>
        <SectionLabel className="mb-3">Membres ({1})</SectionLabel>
        <DataList>
          <DataRow
            left={
              <span className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-medium text-[11px] flex items-center justify-center">
                  IL
                </span>
                <span>{currentUser.full_name}</span>
                <span className="font-mono text-[11px] text-zinc-400">{currentUser.email}</span>
              </span>
            }
            right={<span className="text-[11px] bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-2 py-0.5 rounded font-mono">owner</span>}
          />
        </DataList>
      </section>

      <section>
        <SectionLabel className="mb-3">Sécurité</SectionLabel>
        <DataList>
          <DataRow left="MFA pour les admins" right={<span className="text-emerald-600">activé</span>} />
          <DataRow left="Politique de session" right={<span className="text-zinc-500">7 jours</span>} />
          <DataRow left="Audit log" right={<span className="text-zinc-500">10 ans (Qualiopi)</span>} />
        </DataList>
      </section>

      <section>
        <SectionLabel className="mb-3">Intégrations</SectionLabel>
        <DataList>
          <DataRow left="Resend (email)" right={<span className="text-zinc-400">à configurer</span>} />
          <DataRow left="Zoom" right={<span className="text-zinc-400">à configurer</span>} />
          <DataRow left="Stripe (paiement)" right={<span className="text-zinc-400">V1.5</span>} />
        </DataList>
      </section>
    </div>
  );
}
