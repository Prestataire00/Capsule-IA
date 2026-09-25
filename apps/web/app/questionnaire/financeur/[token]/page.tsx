// ARCHETYPE: workflow
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { ShieldCheck, Send, Sparkles, AlertTriangle } from 'lucide-react';
import { Logo } from '@/shared/ui/logo';
import { verifyQuestionnaireToken } from '@/shared/lib/questionnaire-token';
import { QuestionRenderer } from '@/features/questionnaire/question-renderer';
import type { QuestionnaireSchema } from '@/features/questionnaire/schema';
import { submitFunderQuestionnaire } from './actions';

export const dynamic = 'force-dynamic';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function loadContext(token: string) {
  const verified = await verifyQuestionnaireToken(token);
  if (!verified.ok) return { kind: 'invalid' as const, reason: verified.error };

  const sb = admin();

  const { data: assignment } = await sb
    .schema('app')
    .from('questionnaire_assignments')
    .select('id, status, template_id, recipient_kind')
    .eq('id', verified.value.assignmentId)
    .maybeSingle();

  if (!assignment) return { kind: 'invalid' as const, reason: 'not_found' };

  const { data: template } = await sb
    .schema('app')
    .from('questionnaire_templates')
    .select('schema, title, thank_you_message')
    .eq('id', (assignment as { template_id: string }).template_id)
    .maybeSingle();

  if (!template) return { kind: 'invalid' as const, reason: 'not_found' };

  return {
    kind: 'ok' as const,
    // Le destinataire donne le libellé : la page sert aussi bien un financeur
    // qu'une entreprise cliente, et rien d'autre n'y est propre à l'un ou à
    // l'autre. La dupliquer pour changer trois mots aurait fait deux écrans à
    // maintenir, qui auraient divergé.
    destinataire:
      (assignment as { recipient_kind?: string | null }).recipient_kind === 'company_rep'
        ? 'Questionnaire entreprise'
        : 'Questionnaire financeur',
    completed: (assignment as { status: string }).status === 'completed',
    schema: (template as { schema: unknown }).schema as QuestionnaireSchema,
    title: (template as { title: string }).title,
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-orange-50/40 to-zinc-50 dark:from-zinc-950 dark:via-orange-950/20 dark:to-zinc-950">
      {children}
    </div>
  );
}

function InvalidScreen({ reason }: { reason: string }) {
  const message =
    reason === 'expired_token'
      ? 'Ce lien a expiré (60 jours). Contactez l\'organisme de formation pour en obtenir un nouveau.'
      : reason === 'not_found'
      ? 'Questionnaire introuvable. Le lien est peut-être obsolète.'
      : 'Ce lien n\'est pas valide.';

  return (
    <Shell>
      <main className="max-w-xl mx-auto px-6 py-20 text-center">
        <span className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-7 h-7" />
        </span>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Lien invalide</h1>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400">{message}</p>
      </main>
    </Shell>
  );
}

export default async function FunderQuestionnairePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { error?: string };
}) {
  const ctx = await loadContext(params.token);

  if (ctx.kind === 'invalid') {
    return <InvalidScreen reason={ctx.reason} />;
  }

  if (ctx.completed) {
    return (
      <Shell>
        <main className="max-w-xl mx-auto px-6 py-20 text-center">
          <Sparkles className="w-12 h-12 text-orange-500 mx-auto mb-6" />
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Déjà répondu, merci 🙏</h1>
          <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
            Ce questionnaire a déjà été complété. Nous prenons vos réponses en compte avec attention.
          </p>
        </main>
      </Shell>
    );
  }

  const questions = ctx.schema?.questions ?? [];

  return (
    <Shell>
      <header className="px-6 py-5 border-b border-zinc-200/60 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto flex items-center gap-2.5">
          <Logo size="md" />
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{ctx.destinataire}</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-[12px] uppercase tracking-wider text-orange-600 dark:text-orange-400 font-semibold mb-2">
            Questionnaire
          </p>
          <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">
            {ctx.title}
          </h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Vos réponses contribuent au suivi qualité de la formation financée.
          </p>
        </div>

        {searchParams.error && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg px-4 py-3 text-[13px] mb-6">
            {searchParams.error === 'invalid'
              ? 'Certaines réponses sont incomplètes. Merci de tout renseigner avant d\'envoyer.'
              : 'Une erreur est survenue, merci de réessayer.'}
          </div>
        )}

        <form
          action={submitFunderQuestionnaire}
          className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm"
        >
          <input type="hidden" name="token" value={params.token} />

          <QuestionRenderer questions={questions} />

          <div className="px-6 py-4 bg-zinc-50/40 dark:bg-zinc-950/40 flex items-center justify-between gap-3 rounded-b-xl border-t border-zinc-200/60 dark:border-zinc-800">
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Réponses traitées conformément au RGPD</p>
            <button
              type="submit"
              className="bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              Envoyer mes réponses
            </button>
          </div>
        </form>

        <p className="text-center text-[11px] text-zinc-500 dark:text-zinc-400 mt-6 inline-flex items-center justify-center gap-1.5 w-full">
          <ShieldCheck className="w-3 h-3" />
          Lien personnel signé · données traitées RGPD
        </p>
      </main>
    </Shell>
  );
}
