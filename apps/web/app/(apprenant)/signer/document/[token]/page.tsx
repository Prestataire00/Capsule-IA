import { Check, AlertCircle } from 'lucide-react';
import { supabaseAdmin } from '@/shared/lib/supabase/admin';
import { verifyDocumentSignatureToken } from '@/shared/lib/document-signature-token';
import { SignForm } from './sign-form';

export const dynamic = 'force-dynamic';

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-zinc-950 py-8 px-4">
      <div className="max-w-[760px] mx-auto space-y-5">{children}</div>
    </div>
  );
}

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <Screen>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-10 text-center">
        <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">{title}</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{message}</p>
      </div>
    </Screen>
  );
}

export default async function SignDocumentPage({ params }: { params: { token: string } }) {
  const verified = await verifyDocumentSignatureToken(params.token);
  if (!verified.ok) {
    return verified.error === 'expired_token' ? (
      <ErrorScreen title="Lien expiré" message="Ce lien de signature n'est plus valide. Demandez-en un nouveau." />
    ) : (
      <ErrorScreen title="Lien invalide" message="Ce lien de signature est invalide." />
    );
  }

  const admin = supabaseAdmin();
  const { data: sigRow } = await admin
    .schema('app')
    .from('document_signatures')
    .select('id, status, signer_name, document_id, request_expires_at')
    .eq('id', verified.value.signatureId)
    .maybeSingle();
  const sig = sigRow as {
    id: string;
    status: string;
    signer_name: string | null;
    document_id: string;
    request_expires_at: string | null;
  } | null;

  if (!sig || sig.document_id !== verified.value.documentId) {
    return <ErrorScreen title="Introuvable" message="Cette demande de signature est introuvable." />;
  }

  const { data: docRow } = await admin
    .schema('app')
    .from('documents')
    .select('title, content_html')
    .eq('id', sig.document_id)
    .maybeSingle();
  const doc = docRow as { title: string; content_html: string | null } | null;
  if (!doc) return <ErrorScreen title="Introuvable" message="Le document est introuvable." />;

  if (sig.status === 'signed') {
    return (
      <Screen>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Document déjà signé</h1>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Merci, votre signature a bien été enregistrée.</p>
        </div>
      </Screen>
    );
  }

  if (sig.status !== 'pending') {
    return <ErrorScreen title="Indisponible" message="Cette demande de signature n'est plus active." />;
  }

  return (
    <Screen>
      <div className="text-center">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{doc.title}</h1>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1">
          {sig.signer_name ? `${sig.signer_name}, veuillez` : 'Veuillez'} relire puis signer ce document.
        </p>
      </div>

      <style>{`
        .doc-sheet h1 { font-size: 20px; font-weight: 600; margin: 0 0 12px; }
        .doc-sheet h2 { font-size: 15px; font-weight: 600; margin: 16px 0 6px; }
        .doc-sheet p { margin: 8px 0; line-height: 1.55; }
        .doc-sheet ul { margin: 6px 0 6px 18px; list-style: disc; }
        .doc-sheet .doc-header { font-size: 12px; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-bottom: 16px; }
      `}</style>
      <article className="doc-sheet bg-white text-zinc-900 rounded-sm shadow-sm px-10 py-10 max-h-[55vh] overflow-y-auto">
        {doc.content_html ? (
          // eslint-disable-next-line react/no-danger
          <div dangerouslySetInnerHTML={{ __html: doc.content_html }} />
        ) : (
          <p className="text-[13px] text-zinc-500">Aperçu du document indisponible.</p>
        )}
      </article>

      <SignForm token={params.token} />
    </Screen>
  );
}
