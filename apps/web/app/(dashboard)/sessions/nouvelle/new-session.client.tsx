'use client';

import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { GroupSessionForm } from '../../formations/[id]/group-session-form.client';
import { ACCENTS } from '@/shared/ui/kpi-card';

/**
 * Planifier une session sans passer par un dossier : on choisit d'abord la
 * formation, puis on réutilise le formulaire de session de groupe existant.
 * Tous les apprenants (dossiers) de la formation y sont rattachés automatiquement.
 */
export function NewSessionPicker({ formations }: { formations: { id: string; title: string }[] }) {
  const [formationId, setFormationId] = useState('');

  return (
    <div className="border border-blue-100 bg-gradient-to-br from-blue-50 to-white dark:border-blue-900/40 dark:from-blue-950/40 dark:to-zinc-900 rounded-xl shadow-sm p-6 space-y-5">
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
        <div className="border-t border-blue-100 dark:border-blue-900/40 pt-5">
          {/* key = remonte le formulaire à chaque changement de formation */}
          <GroupSessionForm key={formationId} formationId={formationId} defaultOpen redirectTo="/sessions" />
        </div>
      ) : (
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400 inline-flex items-center gap-2">
          <span className={`w-7 h-7 rounded-lg grid place-items-center ${ACCENTS.blue.soft}`}>
            <GraduationCap className="w-3.5 h-3.5" />
          </span>
          Sélectionnez une formation pour planifier sa session.
        </p>
      )}
    </div>
  );
}
