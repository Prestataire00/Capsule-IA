'use client';

import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { GroupSessionForm } from '../../formations/[id]/group-session-form.client';

/**
 * Planifier une session sans passer par un dossier : on choisit d'abord la
 * formation, puis on réutilise le formulaire de session de groupe existant.
 * Tous les apprenants (dossiers) de la formation y sont rattachés automatiquement.
 */
export function NewSessionPicker({ formations }: { formations: { id: string; title: string }[] }) {
  const [formationId, setFormationId] = useState('');

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm p-6 space-y-5">
      <FormField label="Formation" required>
        <select
          value={formationId}
          onChange={(e) => setFormationId(e.target.value)}
          className={inputClass}
        >
          <option value="">Choisir une formation…</option>
          {formations.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>
      </FormField>

      {formationId ? (
        <div className="border-t border-zinc-200/60 dark:border-zinc-800 pt-5">
          {/* key = remonte le formulaire à chaque changement de formation */}
          <GroupSessionForm key={formationId} formationId={formationId} defaultOpen redirectTo="/sessions" />
        </div>
      ) : (
        <p className="text-[12px] text-zinc-400 dark:text-zinc-500 inline-flex items-center gap-1.5">
          <GraduationCap className="w-3.5 h-3.5" />
          Sélectionnez une formation pour planifier sa session.
        </p>
      )}
    </div>
  );
}
