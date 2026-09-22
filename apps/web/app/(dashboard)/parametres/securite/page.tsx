// ARCHETYPE: command
import { ShieldCheck, Lock, History, FileCheck, KeyRound } from 'lucide-react';
import { requireAccess } from '@/shared/lib/auth/require-access';
import { SectionLabel } from '@/shared/ui/section-label';
import { DataList, DataRow } from '@/shared/ui/data-row';
import { ChangePasswordForm } from './_components/change-password-form.client';

export default async function ParametresSecuritePage() {
  // Garde descendue du gabarit : la Corbeille partage désormais cette
  // section sans en partager la restriction (voir OUVERT_A_TOUS).
  await requireAccess('settings');
  return (
    <div className="space-y-8">
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-7 h-7 rounded-lg grid place-items-center bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 shrink-0">
            <KeyRound className="w-3.5 h-3.5" />
          </span>
          <SectionLabel>Mot de passe</SectionLabel>
        </div>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-4 max-w-md">
          Modifiez votre mot de passe de connexion. Votre mot de passe actuel vous sera demandé.
        </p>
        <ChangePasswordForm />
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-7 h-7 rounded-lg grid place-items-center bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 shrink-0">
            <Lock className="w-3.5 h-3.5" />
          </span>
          <SectionLabel>Authentification</SectionLabel>
        </div>
        <DataList>
          <DataRow
            left="MFA pour les administrateurs"
            right={<span className="text-[12px] font-semibold h-6 inline-flex items-center gap-1 px-2.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"><ShieldCheck className="w-3 h-3" /> Activé</span>}
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
          <span className="w-7 h-7 rounded-lg grid place-items-center bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 shrink-0">
            <History className="w-3.5 h-3.5" />
          </span>
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
          <span className="w-7 h-7 rounded-lg grid place-items-center bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 shrink-0">
            <FileCheck className="w-3.5 h-3.5" />
          </span>
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
            right={<a href="#" className="text-orange-600 dark:text-orange-400 font-semibold hover:underline text-[12px]">Voir</a>}
          />
        </DataList>
      </section>
    </div>
  );
}
