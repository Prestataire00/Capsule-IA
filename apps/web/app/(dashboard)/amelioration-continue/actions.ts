'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { supabaseServer } from '@/shared/lib/supabase/server';

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

const VEILLE_CATEGORIES = ['legale', 'metier', 'pedagogique', 'technologique', 'handicap', 'autre'] as const;
const ORIGINS = ['reclamation', 'satisfaction', 'audit', 'veille', 'autre'] as const;
const PRIORITIES = ['low', 'medium', 'high'] as const;
const STATUSES = ['open', 'in_progress', 'done'] as const;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};
const inSet = <T extends readonly string[]>(set: T, v: string | null): v is T[number] =>
  v !== null && (set as readonly string[]).includes(v);

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

async function requireOrg(): Promise<string> {
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();
  if (!user) redirect('/login');
  const orgId = await resolveAdminOrgId(user.id);
  if (!orgId) redirect('/amelioration-continue?error=forbidden');
  return orgId;
}

export async function createVeilleEntry(fd: FormData): Promise<void> {
  const orgId = await requireOrg();
  const category = str(fd, 'category');
  const title = str(fd, 'title');
  if (!inSet(VEILLE_CATEGORIES, category) || !title) {
    redirect('/amelioration-continue?error=invalid_veille');
  }
  const { error } = await supabaseAdmin().schema('app').from('veille_entries').insert({
    organization_id: orgId,
    category,
    title,
    summary: str(fd, 'summary'),
    source_url: str(fd, 'source_url'),
    impact: str(fd, 'impact'),
  } as never);
  if (error) redirect(`/amelioration-continue?error=${encodeURIComponent(error.message)}`);
  revalidatePath('/amelioration-continue');
  redirect('/amelioration-continue');
}

export async function createImprovementAction(fd: FormData): Promise<void> {
  const orgId = await requireOrg();
  const origin = str(fd, 'origin') ?? 'autre';
  const title = str(fd, 'title');
  if (!inSet(ORIGINS, origin) || !title) {
    redirect('/amelioration-continue?error=invalid_action');
  }
  const priority = str(fd, 'priority');
  const { error } = await supabaseAdmin().schema('app').from('improvement_actions').insert({
    organization_id: orgId,
    origin,
    complaint_id: str(fd, 'complaint_id'),
    title,
    description: str(fd, 'description'),
    owner: str(fd, 'owner'),
    priority: inSet(PRIORITIES, priority) ? priority : 'medium',
    due_date: str(fd, 'due_date'),
  } as never);
  if (error) redirect(`/amelioration-continue?error=${encodeURIComponent(error.message)}`);
  revalidatePath('/amelioration-continue');
  redirect('/amelioration-continue');
}

export async function updateImprovementStatus(fd: FormData): Promise<void> {
  await requireOrg();
  const id = str(fd, 'id');
  const status = str(fd, 'status');
  if (!id || !inSet(STATUSES, status)) redirect('/amelioration-continue?error=invalid_status');
  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
    done_at: status === 'done' ? new Date().toISOString() : null,
  };
  const { error } = await supabaseAdmin()
    .schema('app')
    .from('improvement_actions')
    .update(patch as never)
    .eq('id', id);
  if (error) redirect(`/amelioration-continue?error=${encodeURIComponent(error.message)}`);
  revalidatePath('/amelioration-continue');
  redirect('/amelioration-continue');
}
