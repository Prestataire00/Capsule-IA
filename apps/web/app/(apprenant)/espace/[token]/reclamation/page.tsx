// ARCHETYPE: workflow
import { notFound } from 'next/navigation';
import {
  MessageSquareWarning,
  AlertTriangle,
  Send,
  Inbox,
  Hourglass,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { resolveApprenantContext } from '../_lib';
import { submitComplaint } from '../actions';

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<string, string> = {
  pedagogie: 'Contenu / pédagogie',
  organisation: 'Organisation / logistique',
  accessibilite: 'Accessibilité',
  administratif: 'Administratif',
  relation: 'Relation formateur',
  autre: 'Autre',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  open: { bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', label: 'Ouverte', icon: Inbox },
  in_progress: { bg: 'bg-blue-50 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-300', label: 'En cours', icon: Hourglass },
  resolved: { bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', label: 'Résolue', icon: CheckCircle2 },
  closed: { bg: 'bg-zinc-50 dark:bg-zinc-900', text: 'text-zinc-600 dark:text-zinc-400', label: 'Clôturée', icon: XCircle },
};

export default async function EspaceReclamationPage({ params }: { params: { token: string } }) {
  const ctx = await resolveApprenantContext(params.token);
  if (!ctx) return notFound();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      <header className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-rose-100 to-rose-50 dark:from-rose-950/60 dark:to-rose-950/30 text-rose-700 dark:text-rose-300 flex items-center justify-center shadow-sm">
          <MessageSquareWarning className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">Réclamation</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5">
            Signalez tout dysfonctionnement — traitement confidentiel, réponse sous 15 j ouvrés.
          </p>
        </div>
      </header>

      {/* Historique */}
      {ctx.complaints.length > 0 && (
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-5">
          <p className="text-[11px] uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold mb-3">
            Mes réclamations ({ctx.complaints.length})
          </p>
          <ul className="space-y-2">
            {ctx.complaints.map((c) => {
              const st = STATUS_STYLES[c.status] ?? STATUS_STYLES.open!;
              const Icon = st.icon;
              return (
                <li
                  key={c.id}
                  className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg p-4 hover:bg-zinc-50 dark:hover:bg-zinc-950 transition"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">{c.reference}</p>
                      <p className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 truncate">{c.subject}</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {CATEGORY_LABELS[c.category] ?? c.category} · {new Date(c.createdAt).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-1 rounded-full inline-flex items-center gap-1 flex-shrink-0 ${st.bg} ${st.text}`}>
                      <Icon className="w-2.5 h-2.5" />
                      {st.label}
                    </span>
                  </div>
                  {c.resolution && (
                    <p className="text-[12px] text-zinc-600 dark:text-zinc-400 mt-2 p-3 bg-zinc-50 dark:bg-zinc-950 rounded-md italic">
                      Réponse : {c.resolution}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Formulaire */}
      <section className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-5">
        <p className="text-[11px] uppercase tracking-wider text-violet-600 dark:text-violet-400 font-semibold mb-4">
          Nouvelle réclamation
        </p>

        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 rounded-lg px-3 py-2.5 mb-5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-900 dark:text-amber-200">
            Nous nous engageons à vous répondre sous <strong className="font-semibold">15 jours ouvrés</strong>. Les réclamations sont traitées de façon confidentielle.
          </p>
        </div>

        <form action={submitComplaint} className="space-y-4">
          <input type="hidden" name="token" value={params.token} />

          <label className="block">
            <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
              Type de réclamation <span className="text-rose-500">*</span>
            </span>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <label
                  key={value}
                  className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-violet-50 dark:has-[:checked]:bg-violet-950/40 has-[:checked]:border-violet-300 dark:has-[:checked]:border-violet-800 transition"
                >
                  <input type="radio" name="category" value={value} required className="sr-only" />
                  <p className="text-[12px] font-medium text-zinc-900 dark:text-zinc-100">{label}</p>
                </label>
              ))}
            </div>
          </label>

          <label className="block">
            <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
              Sujet <span className="text-rose-500">*</span>
            </span>
            <input
              type="text"
              name="subject"
              required
              minLength={3}
              placeholder="En une phrase, l'objet de votre réclamation"
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-violet-300 dark:focus:border-violet-700 focus:ring-2 focus:ring-violet-500/10 placeholder:text-zinc-400 transition"
            />
          </label>

          <label className="block">
            <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
              Description détaillée <span className="text-rose-500">*</span>
            </span>
            <textarea
              name="description"
              required
              minLength={10}
              rows={5}
              placeholder="Décrivez la situation, les éléments factuels et la solution que vous attendez."
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-violet-300 dark:focus:border-violet-700 focus:ring-2 focus:ring-violet-500/10 placeholder:text-zinc-400 transition"
            />
          </label>

          <div className="flex items-center justify-between gap-3 pt-2">
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Envoyé en votre nom :{' '}
              <strong className="font-medium text-zinc-700 dark:text-zinc-300">
                {ctx.learner.firstName} {ctx.learner.lastName}
              </strong>
            </p>
            <button
              type="submit"
              className="bg-violet-600 hover:bg-violet-700 text-white text-[13px] font-medium px-4 py-2 rounded-lg transition shadow-sm inline-flex items-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              Envoyer
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
