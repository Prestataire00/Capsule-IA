'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { sendNeedsAnalysisForLearner } from '@/features/questionnaire/needs-analysis';

const admin = () =>
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const ADMIN_ROLES = ['owner', 'admin', 'gestionnaire'] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

const STATUTS = ['salarie', 'dirigeant', 'independant'] as const;

// Org de l'utilisateur connecté (membership par défaut, rôle admin) — pas « la première org ».
async function resolveAdminOrgId(userId: string): Promise<string | null> {
  const sb = admin();
  const { data: member } = await (sb as never as {
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

export async function createLearner(fd: FormData): Promise<void> {
  const sb = admin();
  const {
    data: { user },
  } = await supabaseServer().auth.getUser();
  if (!user) redirect('/login');
  const orgId = await resolveAdminOrgId(user.id);
  if (!orgId) redirect('/apprenants?error=forbidden');

  const firstName = str(fd, 'firstName');
  const lastName = str(fd, 'lastName');
  const email = str(fd, 'email');
  // L'adresse n'est plus exigée (0176) : sans elle, aucun envoi automatique ne
  // concerne ce stagiaire, mais il existe et s'émarge — par son nom, décidé en
  // réunion du 21/09/2026.
  if (!firstName || !lastName) redirect('/apprenants/nouveau?error=missing');

  const statutRaw = str(fd, 'statut');
  const statut = statutRaw && (STATUTS as readonly string[]).includes(statutRaw) ? statutRaw : null;

  const { data: created, error } = await sb
    .schema('app')
    .from('learners')
    .insert({
      organization_id: orgId,
      first_name: firstName,
      last_name: lastName,
      // Vide plutôt que null, l'index unique compterait deux chaînes vides
      // comme un doublon : deux stagiaires sans adresse ne pourraient pas
      // coexister (0176).
      email: email || null,
      phone: str(fd, 'phone'),
      birth_date: str(fd, 'birthDate'),
      company_id: str(fd, 'companyId'),
      position: str(fd, 'position'),
      statut,
      rqth: fd.get('rqth') === 'on',
      accessibility_notes: str(fd, 'accessibilityNotes'),
    })
    .select('id')
    .single();
  if (error) redirect(`/apprenants/nouveau?error=${encodeURIComponent(error.message)}`);

  // Fiche besoin (analyse des besoins) envoyée automatiquement à l'apprenant
  // dès sa création — non bloquant, idempotent (filet cron en complément).
  const learnerId = (created as { id?: string } | null)?.id;
  if (learnerId) {
    try {
      await sendNeedsAnalysisForLearner({ learnerId });
    } catch (e) {
      console.error('[createLearner] envoi fiche besoin échoué', e);
    }
  }

  redirect('/apprenants');
}
