import { AlertCircle, Check, Clock, Lock } from 'lucide-react';
import { env } from '@/env.mjs';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { verifySignatureToken } from '@/shared/lib/signature-token';
import { generateApprenantUrl } from '@/shared/lib/apprenant-token';
import { SignerForm, type SignerContext } from './signer-form';

export const dynamic = 'force-dynamic';

type SignatureContextRow = {
  signer_full_name: string | null;
  signer_kind: 'learner' | 'trainer';
  learner_dossier_id: string | null;
  dossier_reference: string | null;
  formation_title: string | null;
  session_title: string | null;
  session_starts_at: string;
  session_ends_at: string;
  session_modality: string;
  half_day: string | null;
  window_start: string;
  window_end: string;
  organization_id: string;
  organization_name: string;
  sheet_finalized: boolean;
  expected: boolean;
  entry_signed_at: string | null;
  exit_signed_at: string | null;
};

const HALF_DAY: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soirée' };

function FullScreenMessage({
  icon,
  tone,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  tone: 'error' | 'warning' | 'success';
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
}) {
  const toneClasses = {
    error: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
    warning: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
    success: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
  }[tone];

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="max-w-[400px] text-center">
        <div className={`w-16 h-16 rounded-full ${toneClasses} flex items-center justify-center mx-auto mb-4`}>{icon}</div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">{title}</h1>
        <div className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">{description}</div>
        {action && <div className="mt-6">{action}</div>}
      </div>
    </div>
  );
}

const date = (iso: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(iso));

export default async function SignerPage({ params }: { params: { token: string } }) {
  const verified = await verifySignatureToken(params.token);
  if (!verified.ok) {
    return verified.error === 'expired_token' ? (
      <FullScreenMessage
        tone="warning"
        icon={<Clock className="w-8 h-8" />}
        title="Lien expiré"
        description="Ce lien d’émargement n’est plus valable. Demandez-en un nouveau à votre formateur ou à l’organisme."
      />
    ) : (
      <FullScreenMessage
        tone="error"
        icon={<AlertCircle className="w-8 h-8" />}
        title="Lien invalide"
        description="Ce lien n’est pas valide. Vérifiez l’adresse ou contactez votre formateur."
      />
    );
  }

  const { attendanceSheetId, signerId, signerKind } = verified.value;
  // Route publique : la fonction est réservée au service role (0130, 0145).
  const { data, error } = await supabaseAdmin()
    .schema('app')
    .rpc('get_signature_context' as never, {
      p_attendance_sheet_id: attendanceSheetId,
      p_signer_id: signerId,
      p_signer_kind: signerKind,
    } as never)
    .maybeSingle();

  if (error || !data) {
    return (
      <FullScreenMessage
        tone="error"
        icon={<AlertCircle className="w-8 h-8" />}
        title="Émargement introuvable"
        description="Cette feuille de présence n’existe plus."
      />
    );
  }
  const row = data as unknown as SignatureContextRow;

  if (!row.expected) {
    return (
      <FullScreenMessage
        tone="warning"
        icon={<AlertCircle className="w-8 h-8" />}
        title="Vous n’êtes pas attendu(e) sur cette séance"
        description="Si c’est une erreur, signalez-le à l’organisme de formation."
      />
    );
  }

  const termine = row.entry_signed_at && (signerKind === 'trainer' || row.exit_signed_at);
  if (termine) {
    let espace: string | null = null;
    if (signerKind === 'learner' && row.learner_dossier_id && env.PUBLIC_APP_URL) {
      espace = (
        await generateApprenantUrl(
          { learnerId: signerId, organizationId: row.organization_id, dossierId: row.learner_dossier_id },
          env.PUBLIC_APP_URL,
        )
      ).url;
    }
    return (
      <FullScreenMessage
        tone="success"
        icon={<Check className="w-8 h-8" />}
        title="Émargement complet"
        description={
          <>
            Entrée signée le {date(row.entry_signed_at!)}
            {row.exit_signed_at && (
              <>
                <br />
                Sortie signée le {date(row.exit_signed_at)}
              </>
            )}
          </>
        }
        action={
          espace ? (
            <a href={espace} className="inline-flex bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[13px] font-medium px-4 py-2.5 rounded-md">
              Accéder à mon espace de formation
            </a>
          ) : undefined
        }
      />
    );
  }

  if (row.sheet_finalized) {
    return (
      <FullScreenMessage
        tone="warning"
        icon={<Lock className="w-8 h-8" />}
        title="Feuille clôturée"
        description="Cette feuille de présence a été clôturée par l’organisme : elle ne peut plus être signée."
      />
    );
  }

  const context: SignerContext = {
    signerFullName: row.signer_full_name ?? 'Signataire',
    signerKind,
    formationTitle: row.formation_title ?? row.session_title ?? 'Formation',
    reference: row.dossier_reference,
    halfDayLabel: HALF_DAY[row.half_day ?? 'full'] ?? 'Journée',
    windowStart: row.window_start,
    windowEnd: row.window_end,
    modality: row.session_modality,
    organizationName: row.organization_name,
  };

  return <SignerForm token={params.token} context={context} initialStep={row.entry_signed_at ? 'exit' : 'entry'} entrySignedAt={row.entry_signed_at} />;
}
