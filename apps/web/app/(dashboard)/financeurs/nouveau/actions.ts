'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { normaliserSiret, siretValide } from '@/shared/lib/siret';

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

const FUNDER_KINDS = [
  'opco',
  'cpf',
  'pole_emploi',
  'region',
  'autofinancement',
  'entreprise',
  'autre',
] as const;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

// Résout l'org de l'utilisateur connecté (membership par défaut, rôle admin),
// cf. features/formations/actions.ts — JAMAIS « la première org ».
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
                  maybeSingle: () => Promise<{
                    data: { organization_id: string; role: string } | null;
                  }>;
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

export async function createFunder(fd: FormData): Promise<void> {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const orgId = await resolveAdminOrgId(user.id);
  if (!orgId) redirect('/financeurs?error=forbidden');

  const name = str(fd, 'name');
  if (!name) redirect('/financeurs/nouveau?error=missing');

  // Multi-types : cases à cocher partageant le name "kind".
  const kinds = fd
    .getAll('kind')
    .map(String)
    .filter((k): k is (typeof FUNDER_KINDS)[number] =>
      (FUNDER_KINDS as readonly string[]).includes(k),
    );
  if (kinds.length === 0) redirect('/financeurs/nouveau?error=no_kind');

  // SIRET facultatif à la saisie — on ne l'a pas toujours sous la main —, mais
  // refusé s'il est faux : un identifiant erroné fait rejeter la facture
  // électronique, et l'erreur ne se voit qu'à l'impayé.
  const siretSaisi = str(fd, 'siret');
  if (siretSaisi && !siretValide(siretSaisi)) {
    redirect('/financeurs/nouveau?error=siret_invalide');
  }

  const admin = supabaseAdmin();
  const { error } = await admin.schema('app').from('funders').insert({
    organization_id: orgId,
    name,
    kind: kinds[0], // type principal (rétro-compat)
    kinds,
    siret: siretSaisi ? normaliserSiret(siretSaisi) : null,
    contact_email: str(fd, 'email'),
    external_id: str(fd, 'externalId'),
  } as never);
  if (error) redirect(`/financeurs/nouveau?error=${encodeURIComponent(error.message)}`);

  revalidatePath('/financeurs');
  redirect('/financeurs');
}
