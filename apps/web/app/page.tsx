// ARCHETYPE: command
// Justification: page d'aperçu/exploration du squelette projet — densité, lecture rapide, zéro action à mener.

const stats = [
  { label: 'Bounded contexts', value: '13', total: null },
  { label: 'Migrations SQL', value: '24', total: null },
  { label: 'Tables', value: '35', total: null },
  { label: 'Domain events', value: '57', total: null },
] as const;

const contexts = [
  'identity', 'crm', 'catalog', 'dossier', 'scheduling', 'attendance',
  'documents', 'qualiopi', 'questionnaire', 'complaint', 'billing',
  'automation', 'notification',
] as const;

const status = [
  { label: 'Schéma SQL + RLS', tone: 'ok' as const, value: 'prêt' },
  { label: "Catalogue d'events Zod", tone: 'ok' as const, value: 'prêt' },
  { label: 'Domain Dossier (agrégat racine)', tone: 'ok' as const, value: 'prêt' },
  { label: 'Rules Cursor + Charte UI', tone: 'ok' as const, value: 'prêt' },
  { label: 'UI features (liste dossiers, vue 360, wizard…)', tone: 'todo' as const, value: 'à coder' },
  { label: 'Edge Functions (dispatcher, generate-document, sign…)', tone: 'todo' as const, value: 'squelettes documentés' },
  { label: '11 autres bounded contexts', tone: 'todo' as const, value: 'à bootstrap via prompts' },
];

const docLinks = [
  { code: '01', title: 'Vision architecture' },
  { code: '02', title: 'Schéma SQL' },
  { code: '03', title: 'Domain models TS' },
  { code: '04', title: "Catalogue d'events Zod" },
  { code: '05', title: 'RLS policies' },
  { code: '06', title: 'Frontend' },
  { code: '07', title: 'Edge Functions' },
  { code: '08', title: 'Workflows métier' },
  { code: '09', title: 'Wireframes' },
];

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <header className="flex items-start justify-between mb-12">
          <div>
            <p className="text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 mb-1">
              i-a-infinity OF
            </p>
            <h1 className="text-2xl font-medium">TMS Qualiopi · squelette V0</h1>
            <p className="text-[15px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-xl">
              Architecture posée, plate-forme à construire feature par feature.
              Cette page n'est pas le produit — c'est l'aperçu du squelette.
            </p>
          </div>
          <span className="font-mono text-[11px] bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded">
            v0.0.1
          </span>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12">
          {stats.map((s) => (
            <div
              key={s.label}
              className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-md px-3 py-2.5"
            >
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{s.label}</p>
              <p className="text-xl font-medium mt-0.5">{s.value}</p>
            </div>
          ))}
        </section>

        <section className="mb-12">
          <p className="text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 mb-3">
            Bounded contexts
          </p>
          <div className="flex flex-wrap gap-1.5">
            {contexts.map((c) => {
              const isRoot = c === 'dossier';
              return (
                <span
                  key={c}
                  className={
                    isRoot
                      ? 'font-mono text-[11px] bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-2 py-0.5 rounded'
                      : 'font-mono text-[11px] bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded'
                  }
                >
                  {c}
                </span>
              );
            })}
          </div>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-3">
            <span className="font-mono text-[11px] bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 px-1.5 py-0.5 rounded">
              dossier
            </span>{' '}
            est l'agrégat racine — implémenté. Les 12 autres se bootstrappent via{' '}
            <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
              docs/prompts/features/
            </span>
            .
          </p>
        </section>

        <section className="mb-12">
          <p className="text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 mb-3">
            Statut
          </p>
          <ul className="text-[13px] divide-y divide-zinc-200/60 dark:divide-zinc-800 border-y border-zinc-200/60 dark:border-zinc-800">
            {status.map((s) => {
              const tone =
                s.tone === 'ok'
                  ? 'text-emerald-600 dark:text-emerald-500'
                  : 'text-amber-600 dark:text-amber-500';
              const dot = s.tone === 'ok' ? 'bg-emerald-500' : 'bg-amber-500';
              return (
                <li key={s.label} className="py-2.5 flex justify-between gap-4">
                  <span className="text-zinc-700 dark:text-zinc-300">{s.label}</span>
                  <span className={`${tone} inline-flex items-center gap-1.5 flex-shrink-0`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                    {s.value}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <p className="text-[10px] tracking-wider uppercase text-zinc-400 dark:text-zinc-500 mb-3">
            Documentation
          </p>
          <ul className="text-[13px] divide-y divide-zinc-200/60 dark:divide-zinc-800 border-y border-zinc-200/60 dark:border-zinc-800">
            {docLinks.map((d) => (
              <li
                key={d.code}
                className="py-2.5 flex items-center gap-3 text-zinc-700 dark:text-zinc-300"
              >
                <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 w-6">
                  {d.code}
                </span>
                <span>{d.title}</span>
                <span className="ml-auto font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
                  docs/architecture/{d.code}-*.md
                </span>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-16 border-t border-zinc-200/60 dark:border-zinc-800 pt-3 text-[10px] text-zinc-400 dark:text-zinc-500 font-mono flex justify-between">
          <span>
            docs · prompts · supabase/migrations · apps/web/features
          </span>
          <span>v0.0.1</span>
        </footer>
      </div>
    </main>
  );
}
