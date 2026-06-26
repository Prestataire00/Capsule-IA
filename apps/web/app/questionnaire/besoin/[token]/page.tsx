// ARCHETYPE: workflow
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { ShieldCheck, Send, ClipboardList, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Logo } from '@/shared/ui/logo';
import { verifyNeedsAnalysisToken } from '@/shared/lib/needs-analysis-token';
import { submitNeedsAnalysis } from './actions';

export const dynamic = 'force-dynamic';

async function loadContext(token: string) {
  const verified = await verifyNeedsAnalysisToken(token);
  if (!verified.ok) return { kind: 'invalid' as const, reason: verified.error };

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: dossier } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, reference, learner:learners(first_name, last_name), formation:formations(title)')
    .eq('id', verified.value.dossierId)
    .maybeSingle();

  if (!dossier) return { kind: 'invalid' as const, reason: 'not_found' };

  const { data: existing } = await sb
    .schema('app')
    .from('questionnaire_responses')
    .select('id')
    .eq('assignment_id', verified.value.assignmentId)
    .maybeSingle();

  return {
    kind: 'ok' as const,
    answered: Boolean(existing),
    dossier: dossier as unknown as {
      id: string;
      reference: string;
      learner: { first_name: string; last_name: string } | null;
      formation: { title: string } | null;
    },
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-violet-50/40 to-zinc-50 dark:from-zinc-950 dark:via-violet-950/20 dark:to-zinc-950">
      <header className="px-6 py-5 border-b border-zinc-200/60 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto flex items-center gap-2.5">
          <Logo size="md" />
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Fiche besoin</p>
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
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">{message}</p>
      </div>
    </Shell>
  );
}

const inputCls =
  'w-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-violet-300 dark:focus:border-violet-700';

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
        title="Fiche besoin déjà complétée"
        message="Merci, vos réponses ont bien été enregistrées. Votre formateur les consultera avant le démarrage."
      />
    );
  }

  const learnerName = ctx.dossier.learner
    ? `${ctx.dossier.learner.first_name}`
    : '';
  const formationTitle = ctx.dossier.formation?.title ?? null;

  return (
    <Shell>
      <div className="mb-8">
        <span className="inline-flex w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-violet-50 dark:from-violet-950/60 dark:to-violet-950/30 text-violet-700 dark:text-violet-300 items-center justify-center shadow-sm mb-4">
          <ClipboardList className="w-5 h-5" />
        </span>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {learnerName ? `Bonjour ${learnerName},` : 'Votre fiche besoin'}
        </h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-2">
          Avant de démarrer{formationTitle ? ` « ${formationTitle} »` : ' votre formation'}, aidez-nous à
          analyser vos besoins. Cela prend environ 10 minutes et nous permet d&apos;adapter le parcours.
        </p>
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

      <form
        action={submitNeedsAnalysis}
        className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-6 space-y-6"
      >
        <input type="hidden" name="token" value={params.token} />

        <fieldset>
          <legend className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 mb-3">
            Votre niveau actuel sur le sujet de la formation
          </legend>
          <div className="grid grid-cols-5 gap-1.5">
            {[
              { v: 1, l: 'Débutant' },
              { v: 2, l: 'Bases' },
              { v: 3, l: 'Intermédiaire' },
              { v: 4, l: 'Avancé' },
              { v: 5, l: 'Expert' },
            ].map((opt) => (
              <label
                key={opt.v}
                className="border border-zinc-200/60 dark:border-zinc-800 rounded-md px-2 py-2 text-[11px] text-center cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-600 has-[:checked]:text-white has-[:checked]:border-violet-600 transition"
              >
                <input
                  type="radio"
                  name="currentLevel"
                  value={opt.v}
                  defaultChecked={opt.v === 1}
                  className="sr-only"
                />
                {opt.l}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 block mb-1.5">
            Quels sont vos objectifs pour cette formation ? <span className="text-rose-500">*</span>
          </span>
          <textarea
            name="objectives"
            required
            rows={3}
            placeholder="Ce que vous souhaitez savoir faire à l'issue de la formation…"
            className={inputCls}
          />
        </label>

        <label className="block">
          <span className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 block mb-1.5">
            Vos attentes particulières
          </span>
          <textarea
            name="expectations"
            rows={2}
            placeholder="Thèmes prioritaires, applications concrètes attendues…"
            className={inputCls}
          />
        </label>

        <label className="block">
          <span className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 block mb-1.5">
            Contraintes éventuelles (planning, organisation…)
          </span>
          <textarea name="constraints" rows={2} placeholder="Disponibilités, contraintes…" className={inputCls} />
        </label>

        <label className="block">
          <span className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 block mb-1.5">
            Besoin d&apos;aménagement (situation de handicap)
          </span>
          <textarea
            name="accommodations"
            rows={2}
            placeholder="Indiquez tout besoin d'adaptation — nous restons à votre écoute."
            className={inputCls}
          />
        </label>

        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3" /> Données traitées dans le respect du RGPD.
          </p>
          <button
            type="submit"
            className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
          >
            <Send className="w-3.5 h-3.5" />
            Envoyer ma fiche besoin
          </button>
        </div>
      </form>
    </Shell>
  );
}
