'use client';

import { useMemo, useState } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { Loader2, Sparkles, Send, User, UserCog, Building2, AtSign, Mail, CheckCircle2 } from 'lucide-react';
import { FormField, inputClass } from '@/shared/ui/form-field';
import { Button } from '@/shared/ui/button';
import { generateEmailDraftAction, sendComposedEmailAction } from './actions';

export type RecipientOption = { id: string; name: string; email: string; sub: string | null };
type RecipientType = 'apprenant' | 'formateur' | 'entreprise' | 'libre';
type CrmType = Exclude<RecipientType, 'libre'>;

const TYPES: { key: RecipientType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'apprenant', label: 'Apprenant', icon: User },
  { key: 'formateur', label: 'Formateur', icon: UserCog },
  { key: 'entreprise', label: 'Entreprise', icon: Building2 },
  { key: 'libre', label: 'Adresse libre', icon: AtSign },
];

// Objets fréquents proposés par type — l'utilisateur sélectionne ou saisit le sien.
const SUBJECT_SUGGESTIONS: Record<RecipientType, string[]> = {
  apprenant: [
    'Convocation à votre formation',
    'Confirmation de votre inscription',
    'Documents à compléter avant la formation',
    'Rappel avant votre session',
    'Bilan de fin de formation',
  ],
  formateur: [
    "Proposition d'intervention",
    'Confirmation de votre session',
    'Documents pédagogiques à transmettre',
    'Bilan de la session',
  ],
  entreprise: [
    'Proposition de formation',
    'Envoi de votre devis / convention',
    'Suivi de vos salariés en formation',
    'Bilan de formation',
  ],
  libre: [
    'Prise de contact',
    'Demande d\'information',
    'Proposition de formation',
    'Envoi de documents',
  ],
};

const ERROR_LABELS: Record<string, string> = {
  recipient_not_found: 'Destinataire introuvable ou sans adresse email.',
  no_org: 'Organisation introuvable.',
  no_api_key: "Génération IA indisponible (clé non configurée). Vous pouvez rédiger l'email manuellement ci-dessous.",
  generation_failed: 'La génération a échoué. Réessayez ou rédigez manuellement.',
  no_mailbox: 'Aucune boîte mail connectée (SMTP/Resend non configuré dans les paramètres).',
  send_failed: "L'envoi a échoué. Vérifiez la configuration de votre boîte mail.",
};

const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

export function ComposeForm({
  apprenants,
  formateurs,
  entreprises,
}: {
  apprenants: RecipientOption[];
  formateurs: RecipientOption[];
  entreprises: RecipientOption[];
}) {
  const [type, setType] = useState<RecipientType>('apprenant');
  const [recipientId, setRecipientId] = useState('');
  const [freeEmail, setFreeEmail] = useState('');
  const [freeName, setFreeName] = useState('');
  const [subject, setSubject] = useState('');
  const [instructions, setInstructions] = useState('');
  const [body, setBody] = useState('');
  const [sent, setSent] = useState<string | null>(null);

  const generate = useAction(generateEmailDraftAction);
  const send = useAction(sendComposedEmailAction);

  const options = useMemo<Record<CrmType, RecipientOption[]>>(
    () => ({ apprenant: apprenants, formateur: formateurs, entreprise: entreprises }),
    [apprenants, formateurs, entreprises],
  );
  const isFree = type === 'libre';
  const list = isFree ? [] : options[type];
  const selected = list.find((o) => o.id === recipientId) ?? null;

  const pickType = (t: RecipientType) => {
    setType(t);
    setRecipientId('');
    setSent(null);
  };

  // Charge utile commune : fiche CRM (recipientId) OU adresse libre (freeEmail/freeName).
  const recipientPayload = () => ({
    recipientType: type,
    recipientId: recipientId || undefined,
    freeEmail: freeEmail.trim() || undefined,
    freeName: freeName.trim() || undefined,
  });

  const handleGenerate = async () => {
    setSent(null);
    const res = await generate.executeAsync({
      ...recipientPayload(),
      subject,
      instructions: instructions || undefined,
    });
    const d = res?.data;
    if (d?.ok) {
      setSubject(d.subject);
      setBody(d.body);
    }
  };

  const handleSend = async () => {
    setSent(null);
    const res = await send.executeAsync({ ...recipientPayload(), subject, body });
    if (res?.data?.ok) {
      setSent(res.data.to);
      setBody('');
      setSubject('');
      setRecipientId('');
      setFreeEmail('');
      setFreeName('');
    }
  };

  const genError =
    generate.result?.data && !generate.result.data.ok
      ? ERROR_LABELS[generate.result.data.error] ?? generate.result.data.error
      : generate.result?.serverError
        ? 'Erreur serveur pendant la génération.'
        : null;
  const sendError =
    send.result?.data && !send.result.data.ok
      ? ERROR_LABELS[send.result.data.error] ?? send.result.data.error
      : send.result?.serverError
        ? "Erreur serveur pendant l'envoi."
        : null;

  const hasRecipient = isFree ? isEmail(freeEmail) : !!recipientId;
  const canGenerate = hasRecipient && subject.trim().length > 0 && !generate.isExecuting;
  const canSend = hasRecipient && subject.trim().length > 0 && body.trim().length > 0 && !send.isExecuting;

  return (
    <div className="space-y-6">
      {/* 1. Type de destinataire */}
      <FormField label="Type de destinataire">
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => {
            const Icon = t.icon;
            const active = type === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => pickType(t.key)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[13px] font-semibold border transition ${
                  active
                    ? 'bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800 text-orange-700 dark:text-orange-300'
                    : 'bg-white dark:bg-zinc-900 border-zinc-200/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </FormField>

      {/* 2a. Destinataire — fiche CRM enregistrée */}
      {!isFree && (
        <FormField
          label="Destinataire"
          hint={list.length === 0 ? 'Aucune fiche avec adresse email pour ce type.' : undefined}
        >
          <select className={inputClass} value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
            <option value="">— Sélectionner —</option>
            {list.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.sub ? ` · ${o.sub}` : ''} ({o.email})
              </option>
            ))}
          </select>
        </FormField>
      )}

      {/* 2b. Destinataire — adresse libre (hors CRM) */}
      {isFree && (
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Adresse email" hint="Destinataire hors CRM.">
            <input
              className={inputClass}
              type="email"
              value={freeEmail}
              onChange={(e) => setFreeEmail(e.target.value)}
              placeholder="contact@exemple.fr"
            />
          </FormField>
          <FormField label="Nom (facultatif)">
            <input
              className={inputClass}
              value={freeName}
              onChange={(e) => setFreeName(e.target.value)}
              placeholder="Ex. Marie Durand"
            />
          </FormField>
        </div>
      )}

      {/* Récapitulatif du destinataire */}
      {(selected || (isFree && isEmail(freeEmail))) && (
        <div className="flex items-center gap-2 -mt-3 text-[12px] text-zinc-500 dark:text-zinc-400">
          <Mail className="w-3.5 h-3.5" />
          <span>
            L'email partira à{' '}
            <span className="text-zinc-900 dark:text-zinc-100 font-bold">
              {isFree ? freeName.trim() || freeEmail.trim() : selected?.name}
            </span>{' '}
            — {isFree ? freeEmail.trim() : selected?.email}
          </span>
        </div>
      )}

      {/* 3. Objet (saisie ou sélection) */}
      <FormField label="Objet" hint="Saisissez librement ou choisissez une suggestion.">
        <input
          className={inputClass}
          list="subject-suggestions"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Ex. Convocation à votre formation"
        />
        <datalist id="subject-suggestions">
          {SUBJECT_SUGGESTIONS[type].map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </FormField>

      {/* 4. Consignes optionnelles + génération */}
      <FormField label="Consignes pour l'IA (facultatif)">
        <input
          className={inputClass}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Ex. ton chaleureux, rappeler la date du 12 mars"
        />
      </FormField>

      <div>
        <Button type="button" variant="secondary" onClick={handleGenerate} disabled={!canGenerate}>
          {generate.isExecuting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {generate.isExecuting ? 'Génération…' : 'Générer une proposition'}
        </Button>
        {genError && <p className="mt-2 text-[12px] text-amber-600 dark:text-amber-400">{genError}</p>}
      </div>

      {/* 5. Proposition éditable + envoi */}
      <FormField label="Corps de l'email" hint="Relisez et ajustez avant l'envoi.">
        <textarea
          className={`${inputClass} min-h-[240px] font-normal leading-relaxed`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="La proposition générée apparaîtra ici. Vous pouvez aussi rédiger directement."
        />
      </FormField>

      <div className="flex items-center gap-3 pt-1">
        <Button type="button" variant="brand" onClick={handleSend} disabled={!canSend}>
          {send.isExecuting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {send.isExecuting ? 'Envoi…' : "Envoyer l'email"}
        </Button>
        {sent && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" /> Email envoyé à {sent}.
          </span>
        )}
        {sendError && <span className="text-[13px] text-rose-600 dark:text-rose-400">{sendError}</span>}
      </div>
    </div>
  );
}
