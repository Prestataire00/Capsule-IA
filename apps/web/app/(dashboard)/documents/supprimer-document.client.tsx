'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { supprimerDocument } from './suppression-actions';

/** Corbeille d'un document : retiré pour tout le monde, après confirmation. */
export function SupprimerDocumentButton({ documentId, titre, className }: { documentId: string; titre: string; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = () => {
    if (
      !window.confirm(
        `Supprimer « ${titre} » ?\n\nIl disparaît pour tout le monde : équipe, espace entreprise et espace apprenant. Une demande de signature en attente est annulée.`,
      )
    )
      return;
    start(async () => {
      const r = await supprimerDocument(documentId);
      if (!r.ok) window.alert(r.error);
      else router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      aria-label={`Supprimer — ${titre}`}
      title="Supprimer le document"
      className={className ?? 'inline-flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition disabled:opacity-40'}
    >
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
    </button>
  );
}
