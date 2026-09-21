// ARCHETYPE: workflow
// Justification: le client répond à sa fiche besoin depuis un lien, sans compte.

import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { verifyFicheBesoinToken } from '@/shared/lib/fiche-besoin-token';
import { ficheBesoinRemplie, type ReponsesFicheBesoin } from '@/features/questionnaire/fiche-besoin';
import { FormulaireFicheBesoin } from '@/features/questionnaire/ui/formulaire-fiche-besoin.client';
import { enregistrerFicheBesoinDemande } from './actions';

export const dynamic = 'force-dynamic';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

function Ecran({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-10 px-4">
      <div className="max-w-xl mx-auto">{children}</div>
    </div>
  );
}

export default async function FicheBesoinDemandePage({ params }: { params: { token: string } }) {
  const verifie = await verifyFicheBesoinToken(params.token);
  if (!verifie.ok) {
    return (
      <Ecran>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-center">
          <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
            {verifie.error === 'expired_token' ? 'Ce lien a expiré.' : 'Ce lien n’est pas valide.'}
          </p>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
            Demandez-en un nouveau à votre organisme de formation.
          </p>
        </div>
      </Ecran>
    );
  }

  const sb = admin();
  const [{ data: p }, { data: org }] = await Promise.all([
    sb
      .schema('app')
      .from('prospects')
      .select('first_name, needs_analysis')
      .eq('id', verifie.value.prospectId)
      .maybeSingle(),
    sb.schema('app').from('organizations').select('name').eq('id', verifie.value.organizationId).maybeSingle(),
  ]);
  const prospect = p as { first_name: string | null; needs_analysis: ReponsesFicheBesoin | null } | null;
  const dejaRempli = ficheBesoinRemplie(prospect?.needs_analysis);

  return (
    <Ecran>
      <header className="mb-6">
        <p className="text-[12px] uppercase tracking-[0.08em] font-semibold text-orange-600">
          {(org as { name: string } | null)?.name ?? 'Votre organisme de formation'}
        </p>
        <h1 className="text-[26px] font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
          {prospect?.first_name ? `Bonjour ${prospect.first_name},` : 'Analyse de vos besoins'}
        </h1>
        <p className="text-[14px] text-zinc-600 dark:text-zinc-400 mt-2">
          Quelques questions pour adapter la formation à votre situation. Elles nous servent à préparer le programme :
          répondez librement, il n’y a pas de mauvaise réponse.
        </p>
      </header>

      <div className="rounded-2xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm">
        {/* Les réponses déjà données sont pré-remplies : le client peut les
            compléter sans tout ressaisir. */}
        <FormulaireFicheBesoin
          valeurs={prospect?.needs_analysis ?? null}
          enregistrer={async (reponses) => enregistrerFicheBesoinDemande(params.token, reponses)}
          libelleBouton={dejaRempli ? 'Mettre à jour mes réponses' : 'Envoyer mes réponses'}
        />
      </div>
    </Ecran>
  );
}
