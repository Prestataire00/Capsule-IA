// ARCHETYPE: workflow
// Justification: génération IA + validation des documents juridiques de l'OF.

import { Scale, ScrollText, Receipt, BookOpen } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { saveLegalDocEdit } from './actions';
import { LegalDocButtons } from './legal-doc-buttons.client';
import type { LegalKind } from '@/shared/lib/legifrance/mapping';

const DOCS: { kind: LegalKind; label: string; icon: typeof Scale; tone: string }[] = [
  { kind: 'reglement_interieur', label: 'Règlement intérieur', icon: ScrollText, tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
  { kind: 'cgv', label: 'Conditions générales de vente', icon: Receipt, tone: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' },
  { kind: 'livret_accueil', label: "Livret d'accueil", icon: BookOpen, tone: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300' },
];

export default async function DocumentsLegauxPage() {
  const sb = supabaseServer();
  const { data: org } = await sb.schema('app').from('organizations').select('id').limit(1).maybeSingle();
  const orgId = (org as { id?: string } | null)?.id ?? '';

  const { data: docs } = await sb
    .schema('app')
    .from('org_legal_documents')
    .select('kind, status, content_md, sources_used, generated_model, validated_at, pdf_storage_path')
    .eq('organization_id', orgId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byKind = new Map<string, any>(((docs as any[]) ?? []).map((d) => [d.kind, d]));

  return (
    <div className="space-y-8">
      <header className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl grid place-items-center text-white bg-emerald-500 shadow-md shadow-emerald-500/30 shrink-0">
          <Scale className="w-5 h-5" />
        </span>
        <div>
        <SectionLabel>Documents juridiques (assistés par IA)</SectionLabel>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1">
          Génération à partir des sources officielles (Légifrance) —{' '}
          <strong>aide à la rédaction, pas un conseil juridique</strong> : relisez et validez avant usage.
        </p>
        </div>
      </header>

      {DOCS.map(({ kind, label, icon: DocIcon, tone }) => {
        const d = byKind.get(kind);
        const sources = (d?.sources_used as Array<{ ref: string }> | undefined) ?? [];
        return (
          <section key={kind} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/70 dark:border-zinc-800 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-[15px] text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-2.5">
                <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${tone}`}>
                  <DocIcon className="w-4 h-4" />
                </span>
                {label}
              </h3>
              <span className="text-[12px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                {d
                  ? d.status === 'validated'
                    ? `Validé le ${new Date(d.validated_at).toLocaleDateString('fr-FR')}`
                    : 'Brouillon'
                  : 'Non généré'}
              </span>
            </div>

            <div className="flex flex-wrap items-start gap-3">
              <LegalDocButtons orgId={orgId} kind={kind} hasDraft={Boolean(d)} isDraft={d?.status === 'draft'} />
              {d?.pdf_storage_path && <span className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400 self-center">PDF généré</span>}
            </div>

            {d?.content_md && (
              <form
                action={async (fd: FormData) => {
                  'use server';
                  await saveLegalDocEdit(orgId, kind, String(fd.get('content') ?? ''));
                }}
                className="space-y-2"
              >
                <textarea
                  name="content"
                  defaultValue={d.content_md}
                  rows={10}
                  className="w-full text-[13px] leading-relaxed border border-zinc-200/80 dark:border-zinc-800 rounded-lg p-3 bg-white dark:bg-zinc-950/40 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-orange-300 dark:focus:border-orange-800 focus:ring-4 focus:ring-orange-500/10 transition"
                />
                <button type="submit" className="h-8 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-[12px] font-semibold px-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition">
                  Enregistrer les modifications
                </button>
              </form>
            )}

            {sources.length > 0 && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Sources citées : {sources.map((s) => s.ref).join(', ')}
                {d?.generated_model ? ` · ${d.generated_model}` : ''}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
