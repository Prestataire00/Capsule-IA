// ARCHETYPE: workflow
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { ShieldCheck, Send, Star, Sparkles, AlertTriangle } from 'lucide-react';
import { Logo } from '@/shared/ui/logo';
import { verifySatisfactionToken } from '@/shared/lib/satisfaction-token';
import { submitSatisfaction } from './actions';

export const dynamic = 'force-dynamic';

async function loadContext(token: string) {
  const verified = await verifySatisfactionToken(token);
  if (!verified.ok) return { kind: 'invalid' as const, reason: verified.error };

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: dossier } = await sb
    .schema('app')
    .from('dossiers')
    .select(`
      id, reference,
      learner:learners(first_name, last_name),
      formation:formations(title)
    `)
    .eq('id', verified.value.dossierId)
    .maybeSingle();

  if (!dossier) return { kind: 'invalid' as const, reason: 'not_found' };

  // Anti-doublon : check si déjà répondu
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

function InvalidScreen({ reason }: { reason: string }) {
  const message =
    reason === 'expired_token'
      ? 'Ce lien a expiré (60 jours). Contactez votre OF pour en obtenir un nouveau.'
      : reason === 'not_found'
      ? 'Dossier introuvable. Le lien est peut-être obsolète.'
      : 'Ce lien n\'est pas valide.';

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-violet-50/40 to-zinc-50 dark:from-zinc-950 dark:via-violet-950/20 dark:to-zinc-950">
      <main className="max-w-xl mx-auto px-6 py-20 text-center">
        <span className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-7 h-7" />
        </span>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Lien invalide</h1>
        <p className="text-[14px] text-zinc-600 dark:text-zinc-400">{message}</p>
      </main>
    </div>
  );
}

export default async function SatisfactionPage({
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

  if (ctx.answered) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-violet-50/40 to-zinc-50 dark:from-zinc-950 dark:via-violet-950/20 dark:to-zinc-950">
        <main className="max-w-xl mx-auto px-6 py-20 text-center">
          <Sparkles className="w-12 h-12 text-violet-500 mx-auto mb-6" />
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Déjà répondu, merci 🙏</h1>
          <p className="text-[14px] text-zinc-600 dark:text-zinc-400">
            Vous avez déjà partagé votre avis sur cette formation. Nous le prenons en compte avec attention.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-violet-50/40 to-zinc-50 dark:from-zinc-950 dark:via-violet-950/20 dark:to-zinc-950">
      <header className="px-6 py-5 border-b border-zinc-200/60 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto flex items-center gap-2.5">
          <Logo size="md" />
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Satisfaction</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-[12px] uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold mb-2">
            Questionnaire de satisfaction
          </p>
          <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">
            Comment s'est passée votre formation{ctx.dossier.learner ? `, ${ctx.dossier.learner.first_name}` : ''} ?
          </h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
            <strong className="text-zinc-700 dark:text-zinc-300">{ctx.dossier.formation?.title ?? 'Votre formation'}</strong> · 5 minutes chrono · 100% confidentiel
          </p>
        </div>

        {searchParams.error && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg px-4 py-3 text-[13px] mb-6">
            {searchParams.error === 'invalid'
              ? 'Certaines réponses sont incomplètes. Merci de tout renseigner avant d\'envoyer.'
              : 'Une erreur est survenue, merci de réessayer.'}
          </div>
        )}

        <form action={submitSatisfaction} className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-200/60 dark:divide-zinc-800">
          <input type="hidden" name="token" value={params.token} />

          <section className="p-6">
            <label className="block">
              <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 block mb-1">
                Recommanderiez-vous cette formation à un collègue ? <span className="text-rose-500">*</span>
              </span>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-3">
                0 = pas du tout · 10 = tout à fait
              </p>
              <div className="grid grid-cols-11 gap-1">
                {Array.from({ length: 11 }, (_, i) => (
                  <label
                    key={i}
                    className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg py-2 cursor-pointer text-center hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-600 has-[:checked]:border-violet-600 has-[:checked]:text-white transition"
                  >
                    <input type="radio" name="nps" value={i} required className="sr-only" />
                    <p className="text-[13px] font-medium">{i}</p>
                  </label>
                ))}
              </div>
            </label>
          </section>

          {[
            { key: 'overallRating', label: 'Satisfaction globale' },
            { key: 'pedagogyRating', label: 'Qualité pédagogique (formateur, contenu)' },
            { key: 'organizationRating', label: 'Organisation pratique (planning, supports, lieux)' },
          ].map(({ key, label }) => (
            <section key={key} className="p-6">
              <label className="block">
                <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 block mb-3">
                  {label} <span className="text-rose-500">*</span>
                </span>
                <div className="grid grid-cols-5 gap-2 max-w-md">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <label
                      key={v}
                      className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg py-3 cursor-pointer text-center hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-50 dark:has-[:checked]:bg-violet-950/40 has-[:checked]:border-violet-300 dark:has-[:checked]:border-violet-800 transition"
                    >
                      <input type="radio" name={key} value={v} required className="sr-only" />
                      <div className="flex items-center justify-center gap-0.5">
                        {Array.from({ length: v }, (_, i) => (
                          <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-1">{v}/5</p>
                    </label>
                  ))}
                </div>
              </label>
            </section>
          ))}

          <section className="p-6 space-y-4">
            <label className="block">
              <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
                Ce qui a particulièrement fonctionné
              </span>
              <textarea
                name="whatWorked"
                rows={3}
                placeholder="Ex: les cas pratiques, la disponibilité du formateur…"
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-violet-300 dark:focus:border-violet-700 focus:ring-2 focus:ring-violet-500/10 placeholder:text-zinc-400 transition"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
                Pistes d'amélioration
              </span>
              <textarea
                name="whatToImprove"
                rows={3}
                placeholder="Ex: plus de temps sur tel module, supports à étoffer…"
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-violet-300 dark:focus:border-violet-700 focus:ring-2 focus:ring-violet-500/10 placeholder:text-zinc-400 transition"
              />
            </label>
          </section>

          <div className="px-6 py-4 bg-zinc-50/40 dark:bg-zinc-950/40 flex items-center justify-between gap-3 rounded-b-xl">
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Réponses anonymisées avant agrégation
            </p>
            <button
              type="submit"
              className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              Envoyer mon avis
            </button>
          </div>
        </form>

        <p className="text-center text-[11px] text-zinc-500 dark:text-zinc-400 mt-6 inline-flex items-center justify-center gap-1.5 w-full">
          <ShieldCheck className="w-3 h-3" />
          Lien personnel signé · données traitées RGPD · obligation Qualiopi I30/I31
        </p>
      </main>
    </div>
  );
}
