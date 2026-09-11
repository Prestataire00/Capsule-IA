// ARCHETYPE: command
// Justification: composeur d'email assisté par IA — sélection d'une fiche
// (apprenant/formateur/entreprise), auto-remplissage, génération et envoi.

import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { SectionLabel } from '@/shared/ui/section-label';
import { ACCENTS } from '@/shared/ui/kpi-card';
import { ComposeForm, type RecipientOption } from './compose-form';

export const dynamic = 'force-dynamic';

const fullName = (a?: string | null, b?: string | null) => `${a ?? ''} ${b ?? ''}`.trim();

export default async function ComposeEmailPage() {
  const sb = supabaseServer();

  const [{ data: learners }, { data: trainers }, { data: companies }] = await Promise.all([
    sb
      .schema('app')
      .from('learners')
      .select('id, first_name, last_name, email')
      .is('deleted_at', null)
      .not('email', 'is', null)
      .order('last_name', { ascending: true }),
    sb
      .schema('app')
      .from('trainers')
      .select('id, first_name, last_name, email')
      .is('deleted_at', null)
      .not('email', 'is', null)
      .order('last_name', { ascending: true }),
    sb
      .schema('app')
      .from('companies')
      .select('id, name, contact_email')
      .is('deleted_at', null)
      .not('contact_email', 'is', null)
      .order('name', { ascending: true }),
  ]);

  const apprenants: RecipientOption[] = ((learners as { id: string; first_name: string | null; last_name: string | null; email: string }[] | null) ?? []).map(
    (l) => ({ id: l.id, name: fullName(l.first_name, l.last_name) || l.email, email: l.email, sub: null }),
  );
  const formateurs: RecipientOption[] = ((trainers as { id: string; first_name: string | null; last_name: string | null; email: string }[] | null) ?? []).map(
    (t) => ({ id: t.id, name: fullName(t.first_name, t.last_name) || t.email, email: t.email, sub: null }),
  );
  const entreprises: RecipientOption[] = ((companies as { id: string; name: string; contact_email: string }[] | null) ?? []).map(
    (c) => ({ id: c.id, name: c.name, email: c.contact_email, sub: null }),
  );

  return (
    <div className="max-w-3xl w-full mx-auto px-8 py-9">
      <Link
        href="/emails"
        className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition mb-6"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Historique des envois
      </Link>

      <header className="mb-7 flex items-start gap-4">
        <span className={`w-12 h-12 rounded-xl grid place-items-center text-white shadow-md shrink-0 ${ACCENTS.sky.chip}`}>
          <Mail className="w-6 h-6" />
        </span>
        <div>
        <SectionLabel className="mb-2">Communication</SectionLabel>
        <h1 className="text-[30px] leading-none font-extrabold text-zinc-900 dark:text-zinc-100">Rédiger un email</h1>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400 mt-3">
          Choisissez un destinataire, saisissez un objet : l'IA propose un email pré-rempli avec les
          informations de sa fiche. L'envoi part de votre boîte connectée.
        </p>
        </div>
      </header>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 rounded-xl shadow-sm p-6">
        <ComposeForm apprenants={apprenants} formateurs={formateurs} entreprises={entreprises} />
      </div>
    </div>
  );
}
