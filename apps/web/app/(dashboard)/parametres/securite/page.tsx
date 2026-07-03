// ARCHETYPE: command
import { ShieldCheck, Lock, History, FileCheck, KeyRound } from 'lucide-react';
import { SectionLabel } from '@/shared/ui/section-label';
import { DataList, DataRow } from '@/shared/ui/data-row';
import { ChangePasswordForm } from './_components/change-password-form.client';

export default function ParametresSecuritePage() {
  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center gap-2 mb-3">
          <KeyRound className="w-3.5 h-3.5 text-violet-500" />
          <SectionLabel>Mot de passe</SectionLabel>
        </div>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-4 max-w-md">
          Modifiez votre mot de passe de connexion. Votre mot de passe actuel vous sera demandé.
        </p>
        <ChangePasswordForm />
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-3.5 h-3.5 text-violet-500" />
          <SectionLabel>Authentification</SectionLabel>
        </div>
        <DataList>
          <DataRow
            left="MFA pour les administrateurs"
            right={<span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 text-[12px]"><ShieldCheck className="w-3 h-3" /> Activé</span>}
          />
          <DataRow
            left="Politique de session"
            right={<span className="text-zinc-700 dark:text-zinc-300">7 jours</span>}
          />
          <DataRow
            left="Connexion à privilégier"
            right={<span className="text-zinc-700 dark:text-zinc-300">Email + magic link</span>}
          />
        </DataList>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <History className="w-3.5 h-3.5 text-violet-500" />
          <SectionLabel>Conservation et audit</SectionLabel>
        </div>
        <DataList>
          <DataRow
            left="Audit log"
            right={<span className="text-zinc-700 dark:text-zinc-300">10 ans (obligation Qualiopi)</span>}
          />
          <DataRow
            left="Données apprenants"
            right={<span className="text-zinc-700 dark:text-zinc-300">5 ans après fin de formation</span>}
          />
          <DataRow
            left="Signatures électroniques"
            right={<span className="text-zinc-700 dark:text-zinc-300">10 ans, hash SHA-256</span>}
          />
        </DataList>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <FileCheck className="w-3.5 h-3.5 text-violet-500" />
          <SectionLabel>RGPD</SectionLabel>
        </div>
        <DataList>
          <DataRow
            left="DPO désigné"
            right={<span className="text-zinc-500 dark:text-zinc-400">à configurer</span>}
          />
          <DataRow
            left="Registre des traitements"
            right={<span className="text-emerald-600 dark:text-emerald-400">à jour</span>}
          />
          <DataRow
            left="Politique de confidentialité"
            right={<a href="#" className="text-violet-600 dark:text-violet-400 hover:underline text-[12px]">Voir</a>}
          />
        </DataList>
      </section>
    </div>
  );
}
