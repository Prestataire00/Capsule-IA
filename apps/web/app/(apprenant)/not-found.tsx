import { LinkIcon } from 'lucide-react';

// Affichée quand un lien apprenant (espace, signature, questionnaire) est
// invalide, expiré, ou pointe vers un dossier introuvable.
export default function ApprenantNotFound() {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-2xl shadow-sm p-8">
        <span className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-300 flex items-center justify-center mx-auto mb-4">
          <LinkIcon className="w-5 h-5" />
        </span>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Lien invalide ou expiré</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2 leading-relaxed">
          Ce lien d&apos;accès n&apos;est plus valide, a expiré, ou ne correspond à aucun dossier.
          Rapprochez-vous de votre organisme de formation pour recevoir un nouveau lien personnel.
        </p>
      </div>
    </div>
  );
}
