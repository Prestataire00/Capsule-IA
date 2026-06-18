// ARCHETYPE: command
// Justification: génération + liste réelle des documents du dossier.

import { FileText, Download } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';

// Documents générables à la volée (routes API existantes : génèrent, persistent et
// renvoient le PDF). Le clic ouvre/recharge le PDF dans un nouvel onglet.
const GENERATORS = [
  { kind: 'convention', label: 'Convention de formation', route: 'convention.pdf' },
  { kind: 'programme', label: 'Programme détaillé', route: 'programme.pdf' },
  { kind: 'attestation_fin', label: 'Attestation de fin', route: 'attestation.pdf' },
  { kind: 'certificat_realisation', label: 'Certificat de réalisation', route: 'certificat.pdf' },
] as const;

// kind persisté → route de (re)génération pour le lien « Ouvrir ».
const KIND_TO_ROUTE: Record<string, string> = {
  convention: 'convention.pdf',
  attestation_fin: 'attestation.pdf',
  certificat_realisation: 'certificat.pdf',
};

export default async function DocumentsPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer();
  const { data } = await sb
    .schema('app')
    .from('documents')
    .select('id, title, kind, status, created_at')
    .eq('dossier_id', params.id)
    .order('created_at', { ascending: false });
  const rows =
    (data as unknown as Array<{
      id: string;
      title: string;
      kind: string;
      status: string;
      created_at: string;
    }>) ?? [];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <SectionLabel>Générer un document</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {GENERATORS.map((g) => (
            <a
              key={g.kind}
              href={`/api/dossiers/${params.id}/${g.route}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2.5 hover:border-violet-300 dark:hover:border-violet-800 transition"
            >
              <FileText className="w-4 h-4 text-violet-500 flex-shrink-0" />
              <span className="text-[13px] text-zinc-900 dark:text-zinc-100 flex-1 truncate">{g.label}</span>
              <Download className="w-3.5 h-3.5 text-zinc-400 group-hover:text-violet-500 transition" />
            </a>
          ))}
        </div>
        <p className="text-[11px] text-zinc-400">
          Le document est généré avec les données actuelles du dossier puis enregistré automatiquement.
        </p>
      </section>

      <section className="space-y-3">
        <SectionLabel>Documents générés ({rows.length})</SectionLabel>
        {rows.length === 0 ? (
          <p className="text-[13px] text-zinc-500">
            Aucun document généré pour ce dossier. Utilisez les boutons ci-dessus.
          </p>
        ) : (
          <ul className="border-y border-zinc-200/60 dark:border-zinc-800 divide-y divide-zinc-200/60 dark:divide-zinc-800">
            {rows.map((d) => {
              const route = KIND_TO_ROUTE[d.kind];
              return (
                <li key={d.id} className="py-3 px-1 text-[13px] flex items-center justify-between gap-3">
                  <span className="truncate">{d.title}</span>
                  <span className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-[11px] text-zinc-400">{d.kind}</span>
                    <StatusPill tone={d.status === 'ready' ? 'success' : 'neutral'}>{d.status}</StatusPill>
                    {route && (
                      <a
                        href={`/api/dossiers/${params.id}/${route}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] text-violet-600 hover:text-violet-700 dark:text-violet-400 inline-flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        Ouvrir
                      </a>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
