// ARCHETYPE: workflow
import { CheckCircle2 } from 'lucide-react';
import { Logo } from '@/shared/ui/logo';

export default function MerciPage({ searchParams }: { searchParams: { status?: string } }) {
  const already = searchParams.status === 'already';
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-violet-50/40 to-zinc-50 dark:from-zinc-950 dark:via-violet-950/20 dark:to-zinc-950">
      <header className="px-6 py-5 border-b border-zinc-200/60 dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto">
          <Logo size="md" />
        </div>
      </header>
      <main className="max-w-xl mx-auto px-6 py-20 text-center">
        <span className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-8 h-8" />
        </span>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
          {already ? 'Déjà enregistré, merci 🙏' : 'Merci pour votre retour 🙏'}
        </h1>
        <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
          Votre avis de formateur contribue à améliorer l'organisation des prochaines sessions.
        </p>
      </main>
    </div>
  );
}
