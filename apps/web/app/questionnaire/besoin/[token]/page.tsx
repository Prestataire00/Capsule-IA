// ARCHETYPE: workflow
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { ShieldCheck, ClipboardList, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Logo } from '@/shared/ui/logo';
import { verifyNeedsAnalysisToken } from '@/shared/lib/needs-analysis-token';
import { questionsDuSchema } from '@/features/questionnaire/fiche-besoin';
import { FormulaireFicheBesoin } from '@/features/questionnaire/ui/formulaire-fiche-besoin.client';
import { enregistrerFicheBesoinParLien } from './actions';

export const dynamic = 'force-dynamic';

async function loadContext(token: string) {
  const verified = await verifyNeedsAnalysisToken(token);
  if (!verified.ok) return { kind: 'invalid' as const, reason: verified.error };

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let firstName = '';
  let formationTitle: string | null = null;

  if (verified.value.dossierId) {
    const { data: dossier } = await sb
      .schema('app')
      .from('dossiers')
      .select('id, learner:learners!dossiers_learner_id_fkey(first_name, last_name), formation:formations(title)')
      .eq('id', verified.value.dossierId)
      .maybeSingle();
    if (!dossier) return { kind: 'invalid' as const, reason: 'not_found' };
    const d = dossier as unknown as {
      learner: { first_name: string; last_name: string } | null;
      formation: { title: string } | null;
    };
    firstName = d.learner?.first_name ?? '';
    formationTitle = d.formation?.title ?? null;
  } else {
    const { data: learner } = await sb
      .schema('app')
      .from('learners')
      .select('first_name')
      .eq('id', verified.value.learnerId)
      .maybeSingle();
    if (!learner) return { kind: 'invalid' as const, reason: 'not_found' };
    firstName = (learner as { first_name: string }).first_name ?? '';
  }

  const [{ data: existing }, { data: a }] = await Promise.all([
    sb.schema('app').from('questionnaire_responses').select('id').eq('assignment_id', verified.value.assignmentId).maybeSingle(),
    sb
      .schema('app')
      .from('questionnaire_assignments')
      .select('template:questionnaire_templates(schema, title, kind), session:sessions(formation:formations(title))')
      .eq('id', verified.value.assignmentId)
      .maybeSingle(),
  ]);
  // Les questions du modèle de cette fiche : celles de la formation quand
  // l'organisme l'a adaptée, sinon les questions habituelles.
  const un = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const assignation = a as unknown as {
    template: { schema: unknown; title: string | null; kind: string | null } | Array<{ schema: unknown; title: string | null; kind: string | null }> | null;
    session: { formation: { title: string } | Array<{ title: string }> | null } | null;
  } | null;
  const modele = un(assignation?.template);
  const questions = questionsDuSchema(modele?.schema);
  // Le même lien sert aux autres questionnaires d'un stagiaire sans dossier (projetés en salle).
  const fiche = !modele?.kind || modele.kind === 'positionnement';
  const titreModele = modele?.title ?? null;
  formationTitle ??= un(un(assignation?.session)?.formation)?.title ?? null;

  return { kind: 'ok' as const, answered: Boolean(existing), firstName, formationTitle, questions, fiche, titreModele };
}

function Shell({ children, libelle = 'Fiche besoin' }: { children: React.ReactNode; libelle?: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-violet-50/40 to-zinc-50 dark:from-zinc-950 dark:via-violet-950/20 dark:to-zinc-950">
      <header className="px-6 py-5 border-b border-zinc-200/60 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto flex items-center gap-2.5">
          <Logo size="md" />
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{libelle}</p>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}

function InfoScreen({
  tone,
  title,
  message,
}: {
  tone: 'error' | 'success';
  title: string;
  message: string;
}) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertTriangle;
  const color =
    tone === 'success'
      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
      : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400';
  return (
    <Shell>
      <div className="text-center py-12">
        <span className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 ${color}`}>
          <Icon className="w-8 h-8" />
        </span>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">
          {title}
        </h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">{message}</p>
      </div>
    </Shell>
  );
}

export default async function FicheBesoinPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { error?: string };
}) {
  const ctx = await loadContext(params.token);

  if (ctx.kind === 'invalid') {
    const message =
      ctx.reason === 'expired_token'
        ? 'Ce lien a expiré (60 jours). Contactez votre organisme de formation pour en obtenir un nouveau.'
        : ctx.reason === 'not_found'
        ? 'Dossier introuvable. Le lien est peut-être obsolète.'
        : "Ce lien n'est pas valide.";
    return <InfoScreen tone="error" title="Lien indisponible" message={message} />;
  }

  if (ctx.answered) {
    return (
      <InfoScreen
        tone="success"
        title={ctx.fiche ? 'Fiche besoin déjà complétée' : 'Questionnaire déjà complété'}
        message={ctx.fiche ? 'Merci, vos réponses ont bien été enregistrées. Votre formateur les consultera avant le démarrage.' : 'Merci, vos réponses ont bien été enregistrées.'}
      />
    );
  }

  const learnerName = ctx.firstName;
  const formationTitle = ctx.formationTitle;

  return (
    <Shell libelle={ctx.fiche ? 'Fiche besoin' : 'Questionnaire'}>
      <div className="mb-8">
        <span className="inline-flex w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-950/60 dark:to-violet-950/30 text-violet-700 dark:text-violet-300 items-center justify-center shadow-sm mb-4">
          <ClipboardList className="w-5 h-5" />
        </span>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {learnerName ? `Bonjour ${learnerName},` : ctx.fiche ? 'Votre fiche besoin' : (ctx.titreModele ?? 'Votre questionnaire')}
        </h1>
        {ctx.fiche ? (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
            Avant de démarrer{formationTitle ? ` « ${formationTitle} »` : ' votre formation'}, aidez-nous à
            analyser vos besoins. Cela prend environ 10 minutes et nous permet d&apos;adapter le parcours.
          </p>
        ) : (
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
            {ctx.titreModele ?? 'Questionnaire'}
            {formationTitle ? ` · ${formationTitle}` : ''} — quelques minutes, merci pour vos réponses.
          </p>
        )}
      </div>

      {searchParams.error && (
        <div className="mb-5 flex items-start gap-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg px-4 py-3 text-[13px]">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>
            {searchParams.error === 'invalid'
              ? 'Merci de vérifier votre saisie (les objectifs sont obligatoires).'
              : "Une erreur est survenue. Réessayez dans quelques instants."}
          </p>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-6 space-y-5">
        <FormulaireFicheBesoin
          questions={ctx.questions}
          enregistrer={enregistrerFicheBesoinParLien.bind(null, params.token)}
          libelleBouton={ctx.fiche ? 'Envoyer ma fiche besoin' : 'Envoyer mes réponses'}
          messageSucces={ctx.fiche ? 'Merci, vos réponses sont enregistrées. Votre formateur les consultera avant le démarrage.' : 'Merci, vos réponses sont enregistrées.'}
        />
        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 inline-flex items-center gap-1.5">
          <ShieldCheck className="w-3 h-3" /> Données traitées dans le respect du RGPD.
        </p>
      </div>
    </Shell>
  );
}
