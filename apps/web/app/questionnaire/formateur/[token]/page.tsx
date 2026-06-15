// ARCHETYPE: workflow
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { ShieldCheck, Send, Star, Sparkles, AlertTriangle } from 'lucide-react';
import { Logo } from '@/shared/ui/logo';
import { verifyTrainerSatisfactionToken } from '@/shared/lib/trainer-satisfaction-token';
import { submitTrainerSatisfaction } from './actions';

export const dynamic = 'force-dynamic';

async function loadContext(token: string) {
  const verified = await verifyTrainerSatisfactionToken(token);
  if (!verified.ok) return { kind: 'invalid' as const, reason: verified.error };

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: dossier } = await sb
    .schema('app')
    .from('dossiers')
    .select('id, reference, formation:formations(title)')
    .eq('id', verified.value.dossierId)
    .maybeSingle();
  if (!dossier) return { kind: 'invalid' as const, reason: 'not_found' };

  const { data: trainer } = await sb
    .schema('app')
    .from('trainers')
    .select('first_name')
    .eq('id', verified.value.trainerId)
    .maybeSingle();

  const { data: existing } = await sb
    .schema('app')
    .from('questionnaire_responses')
    .select('id')
    .eq('assignment_id', verified.value.assignmentId)
    .maybeSingle();

  return {
    kind: 'ok' as const,
    answered: Boolean(existing),
    trainerFirstName: (trainer as { first_name: string } | null)?.first_name ?? null,
    dossier: dossier as unknown as { id: string; reference: string; formation: { title: string } | null },
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-violet-50/40 to-zinc-50 dark:from-zinc-950 dark:via-violet-950/20 dark:to-zinc-950">
      {children}
    </div>
  );
}

export default async function TrainerSatisfactionPage({
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
        ? 'Ce lien a expiré (60 jours). Contactez l’organisme pour en obtenir un nouveau.'
        : ctx.reason === 'not_found'
        ? 'Dossier introuvable. Le lien est peut-être obsolète.'
        : "Ce lien n'est pas valide.";
    return (
      <Shell>
        <main className="max-w-xl mx-auto px-6 py-20 text-center">
          <span className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-7 h-7" />
          </span>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Lien invalide</h1>
          <p className="text-[14px] text-zinc-600 dark:text-zinc-400">{message}</p>
        </main>
      </Shell>
    );
  }

  if (ctx.answered) {
    return (
      <Shell>
        <main className="max-w-xl mx-auto px-6 py-20 text-center">
          <Sparkles className="w-12 h-12 text-violet-500 mx-auto mb-6" />
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Déjà répondu, merci 🙏</h1>
          <p className="text-[14px] text-zinc-600 dark:text-zinc-400">
            Votre retour de formateur a bien été enregistré pour cette formation.
          </p>
        </main>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="px-6 py-5 border-b border-zinc-200/60 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto flex items-center gap-2.5">
          <Logo size="md" />
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Retour formateur</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-[12px] uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold mb-2">
            Questionnaire formateur
          </p>
          <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mb-2">
            Comment s'est passée cette mission{ctx.trainerFirstName ? `, ${ctx.trainerFirstName}` : ''} ?
          </h1>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
            <strong className="text-zinc-700 dark:text-zinc-300">{ctx.dossier.formation?.title ?? 'La formation'}</strong> · 2 minutes · votre retour améliore l'organisation
          </p>
        </div>

        {searchParams.error && (
          <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200/60 dark:border-rose-900/40 text-rose-800 dark:text-rose-200 rounded-lg px-4 py-3 text-[13px] mb-6">
            {searchParams.error === 'invalid'
              ? "Certaines réponses sont incomplètes. Merci de tout renseigner avant d'envoyer."
              : 'Une erreur est survenue, merci de réessayer.'}
          </div>
        )}

        <form action={submitTrainerSatisfaction} className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-200/60 dark:divide-zinc-800">
          <input type="hidden" name="token" value={params.token} />

          <section className="p-6">
            <label className="block">
              <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 block mb-1">
                Recommanderiez-vous de collaborer avec cet organisme ? <span className="text-rose-500">*</span>
              </span>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-3">0 = pas du tout · 10 = tout à fait</p>
              <div className="grid grid-cols-11 gap-1">
                {Array.from({ length: 11 }, (_, i) => (
                  <label key={i} className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg py-2 cursor-pointer text-center hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-600 has-[:checked]:border-violet-600 has-[:checked]:text-white transition">
                    <input type="radio" name="nps" value={i} required className="sr-only" />
                    <p className="text-[13px] font-medium">{i}</p>
                  </label>
                ))}
              </div>
            </label>
          </section>

          {[
            { key: 'overallRating', label: 'Satisfaction globale de la mission' },
            { key: 'organizationRating', label: 'Organisation & logistique de l’organisme (planning, infos, supports)' },
            { key: 'groupRating', label: 'Engagement et niveau du groupe d’apprenants' },
          ].map(({ key, label }) => (
            <section key={key} className="p-6">
              <label className="block">
                <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 block mb-3">
                  {label} <span className="text-rose-500">*</span>
                </span>
                <div className="grid grid-cols-5 gap-2 max-w-md">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <label key={v} className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg py-3 cursor-pointer text-center hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-50 dark:has-[:checked]:bg-violet-950/40 has-[:checked]:border-violet-300 dark:has-[:checked]:border-violet-800 transition">
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
              <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">Ce qui a bien fonctionné</span>
              <textarea name="whatWorked" rows={3} placeholder="Ex: groupe motivé, bonne coordination…" className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-violet-300 dark:focus:border-violet-700 focus:ring-2 focus:ring-violet-500/10 placeholder:text-zinc-400 transition" />
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">Pistes d'amélioration côté organisation</span>
              <textarea name="whatToImprove" rows={3} placeholder="Ex: infos logistiques plus tôt, accès supports…" className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-violet-300 dark:focus:border-violet-700 focus:ring-2 focus:ring-violet-500/10 placeholder:text-zinc-400 transition" />
            </label>
          </section>

          <div className="px-6 py-4 bg-zinc-50/40 dark:bg-zinc-950/40 flex items-center justify-between gap-3 rounded-b-xl">
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Réponses utilisées pour la démarche qualité</p>
            <button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2">
              <Send className="w-3.5 h-3.5" />
              Envoyer mon retour
            </button>
          </div>
        </form>

        <p className="text-center text-[11px] text-zinc-500 dark:text-zinc-400 mt-6 inline-flex items-center justify-center gap-1.5 w-full">
          <ShieldCheck className="w-3 h-3" />
          Lien personnel signé · données traitées RGPD · obligation Qualiopi
        </p>
      </main>
    </Shell>
  );
}
