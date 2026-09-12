'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authActionClient } from '@/shared/lib/safe-action';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { generateConventionPDF } from '@/features/documents/generate-convention-pdf';
import { buildConventionInput } from '@/features/documents/build-convention-input';
import { loadDossierPayers, type DossierPayer } from '@/features/documents/dossier-payers';
import { persistGeneratedDocument } from '@/features/documents/persist-document';

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

async function resolveAdminOrgId(userId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data: member } = await (admin as never as {
    schema: (s: string) => {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            is: (k: string, v: null) => {
              order: (k: string, o: { ascending: boolean }) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{ data: { organization_id: string; role: string } | null }>;
                };
              };
            };
          };
        };
      };
    };
  })
    .schema('app')
    .from('members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('is_default_org', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!member?.organization_id) return null;
  if (!ADMIN_ROLES.includes(member.role as AdminRole)) return null;
  return member.organization_id;
}

/**
 * Génère une convention de formation par payeur du dossier (chaque financeur + reste à charge),
 * chacune persistée comme document distinct. Si le dossier n'a ni financeur ni reste à charge,
 * génère une convention générique unique.
 */
export const generateConventions = authActionClient
  .schema(z.object({ dossierId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const orgId = await resolveAdminOrgId(ctx.userId as unknown as string);
    if (!orgId) return { ok: false as const, error: 'forbidden_not_admin' };

    const admin = supabaseAdmin();

    // Garde-fou : le dossier appartient bien à l'org de l'admin.
    const { data: dossierRow } = await admin
      .schema('app')
      .from('dossiers')
      .select('id, organization_id')
      .eq('id', parsedInput.dossierId)
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!dossierRow) return { ok: false as const, error: 'dossier_not_found' };

    const payers = await loadDossierPayers(admin as never, parsedInput.dossierId);
    // Aucun payeur → une convention générique (sans financeur).
    const targets: (DossierPayer | null)[] = payers.length > 0 ? payers : [null];

    let count = 0;
    for (const payer of targets) {
      const built = await buildConventionInput(admin as never, parsedInput.dossierId, payer);
      if (!built) return { ok: false as const, error: 'dossier_not_found' };

      const pdfBytes = await generateConventionPDF(built.input);
      const titleSuffix = payer ? ` — ${payer.modeLabel}` : '';
      await persistGeneratedDocument(admin as never, {
        organizationId: orgId,
        dossierId: parsedInput.dossierId,
        kind: 'convention',
        title: `Convention de formation${titleSuffix}`,
        bytes: pdfBytes,
        generationInput: built.input,
        // Une entrée par convention (dossier + payeur) : régénérer remplace la
        // version affichée, l'ancienne reste en historique. Pièce signée : figée.
        sourceKey: `convention:${parsedInput.dossierId}:${payer?.payer ?? 'reste'}`,
        metadata: payer
          ? { payer: payer.payer, funder_name: payer.funderName, mode_label: payer.modeLabel }
          : { payer: null },
      });
      count += 1;
    }

    revalidatePath(`/dossiers/${parsedInput.dossierId}/documents`);
    return { ok: true as const, count };
  });
