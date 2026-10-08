// ARCHETYPE: command
// Justification: questionnaires du dossier — suivi de tout ce qui est parti
// (à qui, quand, réponse, e-mail), puis les envois par destinataire.

import { UserRound, Landmark, GraduationCap, Building2 } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { ACCENTS, type Accent } from '@/shared/ui/kpi-card';
import { loadSuiviEnvois } from '@/features/questionnaire/suivi-envois-store';
import { modeleSatisfaction } from '@/features/questionnaire/satisfaction';
import { apprenantsDuDossier } from '@/features/questionnaire/envoyer-a-un-apprenant';
import { SendFunder } from './send-funder';
import { AssignLearner } from './assign-learner';
import { SendTrainer } from './send-trainer';
import { SendCompany } from './send-company';
import { SuiviEnvois } from './suivi-envois';
import { ReponsesRecues } from './reponses-recues';

// Types de questionnaires affectables à un apprenant (le financeur a son propre flux).
const LEARNER_KINDS = new Set([
  'positionnement',
  'satisfaction_chaud',
  'satisfaction_froid',
  'evaluation_acquis',
  'custom',
]);

export default async function QuestionnairesPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();

  const [{ data: tplData }, { data: funderLinks }, { data: liensFormateur }, { data: dossierRow }, suivi] =
    await Promise.all([
      sb
        .schema('app')
        .from('questionnaire_templates')
        .select('id, title, kind')
        .is('deleted_at', null)
        .order('title', { ascending: true }),
      sb.schema('app').from('dossier_funders').select('funder:funders(id, name)').eq('dossier_id', params.id),
      sb
        .schema('app')
        .from('dossier_trainers')
        .select('trainer:trainers(id, first_name, last_name, email)')
        .eq('dossier_id', params.id),
      sb.schema('app').from('dossiers').select('company_id, organization_id').eq('id', params.id).maybeSingle(),
      loadSuiviEnvois(sb, params.id),
    ]);

  // Le questionnaire de satisfaction de l'organisme en tête : c'est lui qu'on renvoie le plus souvent.
  const organizationId = (dossierRow as { organization_id: string } | null)?.organization_id ?? null;
  const satisfaction = organizationId ? await modeleSatisfaction(sb as never, organizationId) : null;
  const templates = ((tplData as { id: string; title: string; kind: string }[] | null) ?? [])
    .filter((t) => LEARNER_KINDS.has(t.kind))
    .sort((a, b) => Number(b.id === satisfaction?.id) - Number(a.id === satisfaction?.id));

  // Tous les stagiaires du dossier (groupe compris), pour viser l'un d'eux.
  const apprenants = await apprenantsDuDossier(params.id);

  const funders = ((funderLinks as { funder: { id: string; name: string } | null }[] | null) ?? [])
    .map((l) => l.funder)
    .filter((f): f is { id: string; name: string } => !!f);

  const formateurs = (
    (liensFormateur as { trainer: { id: string; first_name: string; last_name: string; email: string | null } | null }[] | null) ?? []
  )
    .map((l) => l.trainer)
    .filter((t): t is { id: string; first_name: string; last_name: string; email: string | null } => !!t)
    .map((t) => ({ id: t.id, nom: `${t.first_name} ${t.last_name}`.trim() || 'Formateur', email: t.email }));

  // Entreprise cliente : on interroge une PERSONNE, pas une société. Ses
  // interlocuteurs sont les contacts de l'entreprise du dossier.
  const companyId = (dossierRow as { company_id: string | null } | null)?.company_id ?? null;
  const { data: contactsRows } = companyId
    ? await sb
        .schema('app')
        .from('contacts')
        .select('id, first_name, last_name, email, is_primary')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('is_primary', { ascending: false })
    : { data: [] };
  const contacts = (
    (contactsRows as { id: string; first_name: string | null; last_name: string | null; email: string | null }[] | null) ?? []
  ).map((c) => ({
    id: c.id,
    nom: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || 'Interlocuteur',
    email: c.email,
  }));

  return (
    <div className="space-y-10">
      <ReponsesRecues sb={sb as never} dossierId={params.id} />

      <SuiviEnvois dossierId={params.id} envois={suivi.envois} courriels={suivi.courriels} />

      <div className="space-y-4">
        <SectionLabel>Envoyer un questionnaire</SectionLabel>
        <div className="grid gap-4 lg:grid-cols-2">
          <Envoi titre="Apprenants" icon={UserRound} accent="rose">
            <AssignLearner dossierId={params.id} templates={templates} apprenants={apprenants} />
          </Envoi>
          <Envoi
            titre="Entreprise"
            icon={Building2}
            accent="blue"
            aide="Le client qui commande est une partie prenante attendue par Qualiopi : ce qu’il pense de l’organisation et de l’effet sur ses équipes ne se lit dans aucun autre questionnaire."
          >
            <SendCompany dossierId={params.id} contacts={contacts} />
          </Envoi>
          <Envoi
            titre="Formateur"
            icon={GraduationCap}
            accent="purple"
            aide="Il part aussi tout seul le lendemain d’un dossier terminé — ceci sert à le demander avant, ou à le renvoyer."
          >
            <SendTrainer dossierId={params.id} formateurs={formateurs} />
          </Envoi>
          <Envoi titre="Financeur" icon={Landmark} accent="emerald">
            <SendFunder dossierId={params.id} funders={funders} />
          </Envoi>
        </div>
      </div>
    </div>
  );
}

function Envoi({
  titre,
  icon: Icon,
  accent,
  aide,
  children,
}: {
  titre: string;
  icon: ComponentType<{ className?: string }>;
  accent: Accent;
  aide?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200/70 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-5 space-y-3">
      <h3 className="flex items-center gap-2.5 text-[15px] font-medium text-zinc-900 dark:text-zinc-100">
        <span className={`w-8 h-8 rounded-lg grid place-items-center ${ACCENTS[accent].soft}`}>
          <Icon className="w-4 h-4" />
        </span>
        {titre}
      </h3>
      {aide && <p className="text-[12px] text-zinc-500 dark:text-zinc-400">{aide}</p>}
      {children}
    </section>
  );
}
