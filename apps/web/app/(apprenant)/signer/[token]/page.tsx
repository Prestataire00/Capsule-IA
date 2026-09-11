import { AlertCircle, Check, Clock, Lock } from 'lucide-react';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { verifySignatureToken } from '@/shared/lib/signature-token';
import { JustificationUpload } from '@/features/attendance/justification-upload';
import { SignerForm, type SignerContext } from './signer-form';

export const dynamic = 'force-dynamic';

type SignatureContextRow = {
  signer_full_name: string | null;
  signer_kind: 'learner' | 'trainer';
  dossier_reference: string | null;
  formation_title: string | null;
  session_title: string | null;
  session_modality: string;
  half_day: string | null;
  window_start: string;
  window_end: string;
  organization_name: string;
  sheet_finalized: boolean;
  expected: boolean;
  entry_signed_at: string | null;
  exit_signed_at: string | null;
  attendance_status: string | null;
};

const HALF_DAY: Record<string, string> = { morning: 'Matin', afternoon: 'Après-midi', full: 'Journée', evening: 'Soirée' };
const PARIS = 'Europe/Paris';
const date = (iso: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: PARIS }).format(new Date(iso));
const heure = (iso: string) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: PARIS }).format(new Date(iso));

function FullScreenMessage({
  icon,
  tone,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  tone: 'error' | 'warning' | 'success';
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
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
        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}

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
  // Route publique : la fonction est réservée au service role.
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
      <FullScreenMessage tone="error" icon={<AlertCircle className="w-8 h-8" />} title="Émargement introuvable" description="Cette feuille de présence n’existe plus." />
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

  // Terminé : pas d'accès à l'espace depuis cette page, qui s'ouvre avec le seul lien.
  if (row.entry_signed_at && (signerKind === 'trainer' || row.exit_signed_at)) {
    return (
      <FullScreenMessage
        tone="success"
        icon={<Check className="w-8 h-8" />}
        title="Émargement complet"
        description={
          <>
            Entrée signée le {date(row.entry_signed_at)}
            {row.exit_signed_at && (
              <>
                <br />
                Sortie enregistrée le {date(row.exit_signed_at)}
              </>
            )}
          </>
        }
      />
    );
  }

  // Absent : dépôt d'un justificatif (apprenant seulement).
  const justificatif =
    signerKind === 'learner' ? <JustificationUpload endpoint={`/api/signer/${params.token}/justificatif`} fields={{}} /> : null;

  if (row.sheet_finalized) {
    return (
      <FullScreenMessage
        tone="warning"
        icon={<Lock className="w-8 h-8" />}
        title="Feuille clôturée"
        description="Cette feuille de présence a été clôturée par l’organisme : elle ne peut plus être signée. Absent(e) ? Vous pouvez encore envoyer un justificatif."
      >
        {!row.entry_signed_at && justificatif}
      </FullScreenMessage>
    );
  }

  if (!row.entry_signed_at && (row.attendance_status === 'absent' || row.attendance_status === 'absent_justified')) {
    return (
      <FullScreenMessage
        tone="warning"
        icon={<AlertCircle className="w-8 h-8" />}
        title="Vous êtes noté(e) absent(e)"
        description="Si vous êtes présent(e), signalez-le à votre formateur. Sinon, vous pouvez envoyer un justificatif à l’organisme."
      >
        {justificatif}
      </FullScreenMessage>
    );
  }

  // Fenêtre de signature, vérifiée avant de faire dessiner quoi que ce soit.
  const maintenant = Date.now();
  const ouverture = new Date(row.window_start).getTime() - 60 * 60_000;
  const fermetureEntree = new Date(row.window_end).getTime();
  const fermetureSortie = fermetureEntree + 120 * 60_000;
  const etape = row.entry_signed_at ? 'exit' : 'entry';
  if (maintenant < ouverture) {
    return (
      <FullScreenMessage
        tone="warning"
        icon={<Clock className="w-8 h-8" />}
        title="L’émargement n’est pas encore ouvert"
        description={`Revenez à partir de ${heure(new Date(ouverture).toISOString())} (${HALF_DAY[row.half_day ?? 'full'] ?? 'journée'} du ${date(row.window_start).split(' à ')[0]}).`}
      />
    );
  }
  if ((etape === 'entry' && maintenant > fermetureEntree) || (etape === 'exit' && maintenant > fermetureSortie)) {
    return (
      <FullScreenMessage
        tone="warning"
        icon={<Lock className="w-8 h-8" />}
        title="L’émargement de cette demi-journée est fermé"
        description="Contactez votre formateur ou l’organisme : ils peuvent corriger la feuille de présence. Absent(e) ? Envoyez votre justificatif."
      >
        {etape === 'entry' && justificatif}
      </FullScreenMessage>
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

  return <SignerForm token={params.token} context={context} initialStep={etape} entrySignedAt={row.entry_signed_at} />;
}
