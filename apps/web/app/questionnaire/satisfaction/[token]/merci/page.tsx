// ARCHETYPE: workflow
import { CheckCircle2, Sparkles } from 'lucide-react';
import { Logo } from '@/shared/ui/logo';

export default function MerciPage({ searchParams }: { searchParams: { status?: string } }) {
  const already = searchParams.status === 'already';

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-violet-50/40 to-zinc-50 dark:from-zinc-950 dark:via-violet-950/20 dark:to-zinc-950">
      <header className="px-6 py-5 border-b border-zinc-200/60 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto flex items-center gap-2.5">
          <Logo size="md" />
        </div>
      </header>

      <main className="max-w-xl mx-auto px-6 py-20 text-center">
        <span className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-950/60 dark:to-emerald-950/30 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mx-auto mb-6 shadow-sm">
          <CheckCircle2 className="w-8 h-8" />
        </span>
        <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight mb-3">
          {already ? 'Déjà reçu, merci 🙏' : 'Merci pour votre retour 💜'}
        </h1>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400 mb-8">
          {already
            ? 'Vous avez déjà répondu à ce questionnaire.'
            : 'Votre avis a bien été enregistré. Il nourrit l\'amélioration continue de notre offre de formation.'}
        </p>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 inline-flex items-center justify-center gap-1.5 w-full">
          <Sparkles className="w-3 h-3 text-violet-500" />
          Vous pouvez fermer cette page · données traitées RGPD
        </p>
      </main>
    </div>
  );
}
