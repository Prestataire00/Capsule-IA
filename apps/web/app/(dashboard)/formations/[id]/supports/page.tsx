// ARCHETYPE: workflow
// Justification: gestionnaire de supports pédagogiques par module — upload, publication, suppression.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BookOpen, FileText, FolderOpen } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { StatusPill } from '@/shared/ui/status-pill';
import {
  SupportsUploader,
  TogglePublishButton,
  DeleteSupportButton,
} from './supports-uploader';
import { getCurrentMember } from '@/shared/lib/auth/current-member';

type ResourceRow = {
  id: string;
  title: string;
  mime_type: string;
  file_size_bytes: number | null;
  is_published: boolean;
};

type ModuleWithResources = {
  moduleId: string;
  moduleTitle: string;
  position: number;
  resources: ResourceRow[];
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function mimeLabel(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'image/png': 'PNG',
    'image/jpeg': 'JPEG',
  };
  return map[mime] ?? mime.split('/')[1]?.toUpperCase() ?? '—';
}

export default async function FormationSupportsPage({
  params,
}: {
  params: { id: string };
}) {
  const sb = supabaseServer();

  // Auth + org. Interrogeait `app.memberships`, table inexistante (audit CAP-16) :
  // la page renvoyait 404 pour tout le monde, ce qui rendait muette la
  // fonctionnalité qui alimente les ressources de l'espace apprenant.
  const me = await getCurrentMember();
  if (!me) return notFound();
  const orgId = me.organizationId;

  // Formation
  const { data: formation } = await sb
    .schema('app')
    .from('formations')
    .select('id, title')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!formation) return notFound();

  // Modules de la formation
  const { data: formationModules } = await sb
    .schema('app')
    .from('formation_modules')
    .select('module_id, position, modules(id, title)')
    .eq('formation_id', params.id)
    .order('position');

  const moduleRows = (
    (formationModules ?? []) as Array<{
      module_id: string;
      position: number;
      modules: { id: string; title: string } | null;
    }>
  ).filter((row) => row.modules !== null);

  // Supports par module (non supprimés, org courante)
  const moduleIds = moduleRows.map((r) => r.module_id);
  let resourcesByModule: Record<string, ResourceRow[]> = {};

  if (moduleIds.length > 0) {
    const { data: resources } = await sb
      .schema('app')
      .from('module_resources' as never)
      .select('id, title, mime_type, file_size_bytes, is_published, module_id')
      .eq('organization_id', orgId)
      .in('module_id', moduleIds)
      .is('deleted_at', null)
      .order('position') as {
      data: Array<ResourceRow & { module_id: string }> | null;
    };

    for (const r of resources ?? []) {
      // `noUncheckedIndexedAccess` : l'accès indexé peut être `undefined`, même
      // juste après l'affectation par défaut.
      const bucket = (resourcesByModule[r.module_id] ??= []);
      bucket.push(r);
    }
  }

  const modulesWithResources: ModuleWithResources[] = moduleRows.map((row) => ({
    moduleId: row.module_id,
    moduleTitle: row.modules!.title,
    position: row.position,
    resources: resourcesByModule[row.module_id] ?? [],
  }));

  const totalResources = modulesWithResources.reduce((n, m) => n + m.resources.length, 0);

  return (
    <div className="max-w-4xl w-full mx-auto px-8 py-8">
      <Link
        href={`/formations/${params.id}`}
        className="text-[13px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center gap-1.5 transition mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Retour à la formation
      </Link>

      <header className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-2xl shadow-sm p-6 mb-6">
        <div className="flex items-start gap-4">
          <span className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm bg-violet-100 dark:bg-violet-950/40">
            <FolderOpen className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </span>
          <div>
            <SectionLabel className="mb-1">Supports pédagogiques</SectionLabel>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              {(formation as { title: string }).title}
            </h1>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mt-1">
              {modulesWithResources.length} module{modulesWithResources.length !== 1 ? 's' : ''} —{' '}
              {totalResources} support{totalResources !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </header>

      {modulesWithResources.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl p-8 text-center shadow-sm">
          <BookOpen className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            Cette formation n&apos;a aucun module rattaché.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {modulesWithResources.map((mod) => (
            <section
              key={mod.moduleId}
              className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden"
            >
              {/* En-tête du module */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                <span className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                  <BookOpen className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                    {mod.moduleTitle}
                  </p>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    Module {mod.position + 1} — {mod.resources.length} support{mod.resources.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              <div className="px-5 py-4 space-y-3">
                {/* Liste des supports */}
                {mod.resources.length === 0 ? (
                  <p className="text-[12px] text-zinc-400 dark:text-zinc-500 italic">
                    Aucun support pour ce module.
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 -my-1">
                    {mod.resources.map((res) => (
                      <li
                        key={res.id}
                        className="flex items-center gap-3 py-2.5 flex-wrap"
                      >
                        <span className="w-6 h-6 rounded-md bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-3 h-3 text-zinc-500 dark:text-zinc-400" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-zinc-900 dark:text-zinc-100 truncate">
                            {res.title}
                          </p>
                          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                            {mimeLabel(res.mime_type)} · {formatBytes(res.file_size_bytes)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <StatusPill tone={res.is_published ? 'success' : 'neutral'} variant="soft">
                            {res.is_published ? 'Publié' : 'Masqué'}
                          </StatusPill>
                          <TogglePublishButton
                            resourceId={res.id}
                            isPublished={res.is_published}
                          />
                          <DeleteSupportButton resourceId={res.id} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Uploader */}
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                  <SectionLabel className="mb-2">Ajouter un support</SectionLabel>
                  <SupportsUploader
                    moduleId={mod.moduleId}
                    organizationId={orgId}
                    formationId={params.id}
                  />
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
