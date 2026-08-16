import { AlertCircle, Check, Clock } from 'lucide-react';
import { supabaseServer } from '@/shared/lib/supabase/server';
import { verifySignatureToken } from '@/shared/lib/signature-token';
import { SignerForm, type SignerContext } from './signer-form';

export const dynamic = 'force-dynamic';

type SignatureContextRow = {
  attendance_sheet_id: string;
  signer_id: string;
  signer_kind: 'learner' | 'trainer';
  signer_full_name: string | null;
  signer_email: string | null;
  dossier_id: string;
  dossier_reference: string;
  formation_title: string;
  session_id: string;
  session_starts_at: string;
  session_ends_at: string;
  session_modality: string;
  organization_id: string;
  organization_name: string;
  already_signed: boolean;
  signed_at: string | null;
};

function FullScreenMessage({
  icon,
  tone,
  title,
  description,
}: {
  icon: React.ReactNode;
  tone: 'error' | 'warning' | 'success';
  title: string;
  description: React.ReactNode;
}) {
  const toneClasses = {
    error: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
    warning: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
    success: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400',
  }[tone];

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-12">
      <div className="max-w-[400px] text-center">
        <div className={`w-16 h-16 rounded-full ${toneClasses} flex items-center justify-center mx-auto mb-4`}>
          {icon}
        </div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {title}
        </h1>
        <div className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-2">
          {description}
        </div>
      </div>
    </div>
  );
}

export default async function SignerPage({
  params,
}: {
  params: { token: string };
}) {
  const verified = await verifySignatureToken(params.token);

  if (!verified.ok) {
    if (verified.error === 'expired_token') {
      return (
        <FullScreenMessage
          tone="warning"
          icon={<Clock className="w-8 h-8" />}
          title="Lien expiré"
          description={
            <>
              Ce lien de signature a expiré (validité 24h).
              <br />
              Demandez à votre formateur de vous en renvoyer un nouveau.
            </>
          }
        />
      );
    }
    return (
      <FullScreenMessage
        tone="error"
        icon={<AlertCircle className="w-8 h-8" />}
        title="Lien invalide"
        description="Ce lien n'est pas valide. Vérifiez l'URL ou contactez votre formateur."
      />
    );
  }

  const { attendanceSheetId, signerId, signerKind, jti: _jti } = verified.value;

  const supabase = supabaseServer();
  const { data, error } = await supabase
    .schema('app')
    .rpc('get_signature_context' as never, {
      p_attendance_sheet_id: attendanceSheetId,
      p_signer_id: signerId,
      p_signer_kind: signerKind,
    } as never)
    .single();

  if (error || !data) {
    return (
      <FullScreenMessage
        tone="error"
        icon={<AlertCircle className="w-8 h-8" />}
        title="Émargement introuvable"
        description="Cette feuille de présence n'existe plus ou a été archivée."
      />
    );
  }

  const row = data as unknown as SignatureContextRow;

  if (row.already_signed && row.signed_at) {
    return (
      <FullScreenMessage
        tone="success"
        icon={<Check className="w-8 h-8" />}
        title="Déjà signé"
        description={
          <>
            Vous avez signé cette feuille de présence le
            <br />
            <strong>
              {new Intl.DateTimeFormat('fr-FR', {
                dateStyle: 'long',
                timeStyle: 'short',
              }).format(new Date(row.signed_at))}
            </strong>
          </>
        }
      />
    );
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const context: SignerContext = {
    signerFullName: row.signer_full_name ?? 'Signataire',
    signerKind: row.signer_kind,
    dossierReference: row.dossier_reference,
    formationTitle: row.formation_title,
    sessionStartsAt: row.session_starts_at,
    sessionEndsAt: row.session_ends_at,
    sessionModality: row.session_modality,
    organizationName: row.organization_name,
    tokenExpiresAt: expiresAt,
  };

  return <SignerForm token={params.token} context={context} />;
}
