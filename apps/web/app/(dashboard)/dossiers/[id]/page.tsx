// ARCHETYPE: command
// Justification: vue d'ensemble réelle du dossier — compteurs + accès rapides aux onglets.

import { Calendar, FileText, Users as UsersIcon } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { ACCENTS, KpiCard, type Accent } from '@/shared/ui/kpi-card';
import { loadDossierProgress } from '@/features/dossier/load-progress';
import { DossierProgressTracker } from '@/features/dossier/progress-tracker';
import { canManageSection } from '@/shared/lib/auth/require-access';
import { ReferentCard, type ContactOption } from './referent-card.client';
import { TagsEditor } from './tags-editor';
import { BpfFieldsEditor } from './bpf-fields-editor';

export default async function DossierOverviewPage({ params }: { params: { id: string } }) {
  const sb = supabaseServer() as unknown as SupabaseClient;
  const id = params.id;
  const count = async (table: string, col = 'dossier_id') => {
    const { count } = await sb.schema('app').from(table).select('*', { count: 'exact', head: true }).eq(col, id);
    return count ?? 0;
  };
  /**
   * Séances du dossier : liaison (séance partagée) + `sessions.dossier_id`
   * (séance propre, posée par l'import d'une convention). Le compteur ne
   * lisait que la liaison et affichait 0 sur un dossier qui en avait six.
   */
  const compteSessions = async (): Promise<number> => {
    const [liens, directes] = await Promise.all([
      sb.schema('app').from('session_dossiers').select('session_id').eq('dossier_id', id),
      sb.schema('app').from('sessions').select('id').eq('dossier_id', id),
    ]);
    const ids = new Set<string>([
      ...(((liens.data ?? []) as Array<{ session_id: string }>).map((l) => l.session_id)),
      ...(((directes.data ?? []) as Array<{ id: string }>).map((s) => s.id)),
    ]);
    return ids.size;
  };

  const [sessions, documents, funders, dossier, progress] = await Promise.all([
    compteSessions(),
    count('documents'),
    count('dossier_funders'),
    sb.schema('app').from('dossiers').select('tags, action_type, trainee_category, company_id, contact_id, notes').eq('id', id).maybeSingle(),
    loadDossierProgress(sb, id),
  ]);
  const tags = ((dossier.data?.tags as string[] | null) ?? []);
  // La note du dossier — reprise de la demande, ou posée par l'import d'une
  // convention. Le formateur la lisait dans son espace ; l'organisme, lui, ne
  // la voyait nulle part.
  const notes = ((dossier.data?.notes as string | null) ?? '').trim();
  const actionType = (dossier.data?.action_type as string | null) ?? null;
  const traineeCategory = (dossier.data?.trainee_category as string | null) ?? null;

  // Référent du client (0167) : les contacts de l'entreprise cliente, pour
  // pouvoir le désigner ici — jusqu'ici seul l'import d'une convention en
  // posait un, et un dossier saisi autrement restait sans interlocuteur.
  const companyId = (dossier.data?.company_id as string | null) ?? null;
  const contactId = (dossier.data?.contact_id as string | null) ?? null;
  const [{ data: contactRows }, { data: companyRow }, peutModifier] = await Promise.all([
    companyId
      ? sb
          .schema('app')
          .from('contacts')
          .select('id, first_name, last_name, position, email, phone')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .order('is_primary', { ascending: false })
          .order('last_name', { ascending: true })
      : Promise.resolve({ data: [] }),
    companyId
      ? sb.schema('app').from('companies').select('name').eq('id', companyId).maybeSingle()
      : Promise.resolve({ data: null }),
    canManageSection('dossiers'),
  ]);
  const contacts: ContactOption[] = (
    (contactRows ?? []) as Array<{
      id: string;
      first_name: string;
      last_name: string;
      position: string | null;
      email: string | null;
      phone: string | null;
    }>
  ).map((c) => ({
    id: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
    position: c.position,
    email: c.email,
    phone: c.phone,
  }));
  const referent = contacts.find((c) => c.id === contactId) ?? null;
  const companyName = (companyRow as { name?: string } | null)?.name ?? null;

  const cards: { icon: typeof Calendar; label: string; value: number; href: string; accent: Accent }[] = [
    { icon: Calendar, label: 'Sessions', value: sessions, href: 'sessions', accent: 'blue' },
    { icon: FileText, label: 'Documents', value: documents, href: 'documents', accent: 'orange' },
    { icon: UsersIcon, label: 'Financeurs', value: funders, href: 'financeurs', accent: 'emerald' },
  ];

  return (
    <div className="space-y-6">
      <SectionLabel>Vue d'ensemble</SectionLabel>
      <DossierProgressTracker progress={progress} dossierId={params.id} peutValider={peutModifier} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(({ icon, label, value, href, accent }) => (
          <KpiCard key={href} icon={icon} label={label} value={value} accent={accent} href={`/dossiers/${id}/${href}`} />
        ))}
      </div>
      <ReferentCard
        dossierId={id}
        referent={referent}
        contacts={contacts}
        companyName={companyName}
        peutModifier={peutModifier}
      />
      {notes && (
        <section className={`rounded-xl border p-4 shadow-sm ${ACCENTS.amber.card}`}>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-amber-700 dark:text-amber-400 mb-1.5">
            Note interne
          </h2>
          <p className="text-[13px] text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">{notes}</p>
        </section>
      )}

      <BpfFieldsEditor dossierId={id} initialActionType={actionType} initialTraineeCategory={traineeCategory} />
      <TagsEditor dossierId={id} initialTags={tags} />

      <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
        Utilisez les onglets ci-dessus pour gérer sessions, émargements, heures, Qualiopi, financeurs et documents.
      </p>
    </div>
  );
}
