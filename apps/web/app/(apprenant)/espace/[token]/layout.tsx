// ARCHETYPE: shared (shell espace apprenant — sidebar de navigation)
import { notFound } from 'next/navigation';
import { resolveApprenantContext } from './_lib';
import { EspaceSidebar } from './_components/espace-sidebar';

export const dynamic = 'force-dynamic';

export default async function EspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { token: string };
}) {
  const ctx = await resolveApprenantContext(params.token);
  if (!ctx) return notFound();

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-3rem)] bg-gradient-to-br from-zinc-50 via-violet-50/30 to-zinc-50 dark:from-zinc-950 dark:via-violet-950/15 dark:to-zinc-950">
      <EspaceSidebar
        token={params.token}
        organizationName={ctx.organization.name}
        organizationLogoUrl={ctx.organization.logoUrl}
        learnerFirstName={ctx.learner.firstName}
        learnerLastName={ctx.learner.lastName}
        dossierReference={ctx.dossier.reference}
      />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
