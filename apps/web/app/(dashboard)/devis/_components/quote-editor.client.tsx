'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Send, Trash2 } from 'lucide-react';
import { inputClass } from '@/shared/ui/form-field';
import { computeQuoteTotals, parseEurosToCents } from '@/features/billing/domain/quote';
import { saveQuote, sendQuote } from '../actions';
import { actionError, formatEuros } from './labels';

export type EditorLine = {
  description: string;
  details: string;
  quantity: string;
  unitEuros: string;
  /** '' = taux du devis. */
  vatRate: string;
};

export type EditorInitial = {
  object: string;
  notes: string;
  validUntil: string;
  vatRate: string;
  recipientName: string;
  recipientEmail: string;
  lines: EditorLine[];
};

const emptyLine: EditorLine = { description: '', details: '', quantity: '1', unitEuros: '', vatRate: '' };

const num = (s: string): number => Number.parseFloat(s.replace(/\s/g, '').replace(',', '.'));

export function QuoteEditor({
  quoteId,
  reference,
  initial,
  vatExempt,
}: {
  quoteId: string;
  reference: string;
  initial: EditorInitial;
  vatExempt: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const set = <K extends keyof EditorInitial>(k: K, v: EditorInitial[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setLine = (i: number, patch: Partial<EditorLine>) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const moveLine = (i: number, delta: number) =>
    setForm((f) => {
      const lines = [...f.lines];
      const j = i + delta;
      if (j < 0 || j >= lines.length) return f;
      [lines[i], lines[j]] = [lines[j] as EditorLine, lines[i] as EditorLine];
      return { ...f, lines };
    });

  const quoteVat = num(form.vatRate);
  const totals = useMemo(
    () =>
      computeQuoteTotals(
        form.lines.map((l) => ({
          description: l.description,
          quantity: Number.isFinite(num(l.quantity)) ? num(l.quantity) : 0,
          unitAmountCents: parseEurosToCents(l.unitEuros) ?? 0,
          vatRate: l.vatRate.trim() === '' ? null : num(l.vatRate),
        })),
        Number.isFinite(quoteVat) ? quoteVat : 0,
      ),
    [form.lines, quoteVat],
  );

  function toPayload(): { ok: true; value: Parameters<typeof saveQuote>[0] } | { ok: false; error: string } {
    const lines = [];
    for (const [i, l] of form.lines.entries()) {
      const quantity = num(l.quantity);
      const unit = parseEurosToCents(l.unitEuros);
      const vat = l.vatRate.trim() === '' ? null : num(l.vatRate);
      if (!l.description.trim()) return { ok: false, error: `Ligne ${i + 1} : désignation manquante.` };
      if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, error: `Ligne ${i + 1} : quantité invalide.` };
      if (unit == null) return { ok: false, error: `Ligne ${i + 1} : prix unitaire invalide (ex. 850 ou 850,50).` };
      if (vat != null && (!Number.isFinite(vat) || vat < 0 || vat > 100)) {
        return { ok: false, error: `Ligne ${i + 1} : taux de TVA invalide.` };
      }
      lines.push({
        description: l.description.trim(),
        details: l.details.trim() || null,
        quantity,
        unitAmountCents: unit,
        vatRate: vat,
      });
    }
    if (lines.length === 0) return { ok: false, error: 'Ajoutez au moins une ligne.' };
    if (!Number.isFinite(quoteVat) || quoteVat < 0 || quoteVat > 100) return { ok: false, error: 'Taux de TVA invalide.' };
    return {
      ok: true,
      value: {
        quoteId,
        object: form.object.trim(),
        notes: form.notes.trim() || null,
        validUntil: form.validUntil,
        vatRate: quoteVat,
        recipientName: form.recipientName.trim() || null,
        recipientEmail: form.recipientEmail.trim() || null,
        lines,
      },
    };
  }

  const submit = (andSend: boolean) => {
    setMessage(null);
    const payload = toPayload();
    if (!payload.ok) {
      setMessage({ tone: 'err', text: payload.error });
      return;
    }
    if (andSend) {
      if (!payload.value.recipientEmail) {
        setMessage({ tone: 'err', text: 'Renseignez l’e-mail du destinataire avant l’envoi.' });
        return;
      }
      if (
        !window.confirm(
          `Le devis ${reference} (${formatEuros(totals.totalCents)}) sera envoyé pour signature à ${payload.value.recipientEmail}. Continuer ?`,
        )
      ) {
        return;
      }
    }
    start(async () => {
      const saved = await saveQuote(payload.value);
      const saveError = actionError(saved);
      if (saveError) {
        setMessage({ tone: 'err', text: saveError });
        return;
      }
      if (andSend) {
        const sent = await sendQuote({ quoteId });
        const sendError = actionError(sent);
        if (sendError) {
          setMessage({ tone: 'err', text: `Devis enregistré, mais non envoyé : ${sendError}` });
          router.refresh();
          return;
        }
        setMessage({ tone: 'ok', text: `Devis envoyé à ${payload.value.recipientEmail}.` });
      } else {
        setMessage({ tone: 'ok', text: 'Devis enregistré.' });
      }
      router.refresh();
    });
  };

  const labelCls = 'block text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-xl shadow-sm divide-y divide-zinc-200/60 dark:divide-zinc-800">
      <section className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className={labelCls}>Objet</label>
          <input value={form.object} onChange={(e) => set('object', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelCls}>Destinataire (nom)</label>
          <input
            value={form.recipientName}
            onChange={(e) => set('recipientName', e.target.value)}
            placeholder="Responsable formation / stagiaire"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelCls}>E-mail du destinataire</label>
          <input
            type="email"
            value={form.recipientEmail}
            onChange={(e) => set('recipientEmail', e.target.value)}
            placeholder="rh@entreprise.fr"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelCls}>Valable jusqu’au</label>
          <input type="date" value={form.validUntil} onChange={(e) => set('validUntil', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelCls}>TVA du devis (%)</label>
          <input
            value={form.vatRate}
            onChange={(e) => set('vatRate', e.target.value)}
            inputMode="decimal"
            className={inputClass}
          />
          {vatExempt && (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
              Organisme exonéré (art. 261-4-4°a CGI) : laissez 0 %.
            </p>
          )}
        </div>
      </section>

      <section className="p-5">
        <p className={labelCls}>Lignes du devis</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[720px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                <th className="pb-2 font-normal">Désignation</th>
                <th className="pb-2 font-normal w-20">Qté</th>
                <th className="pb-2 font-normal w-32">PU HT (€)</th>
                <th className="pb-2 font-normal w-20">TVA %</th>
                <th className="pb-2 font-normal w-28 text-right">Total HT</th>
                <th className="pb-2 w-20" />
              </tr>
            </thead>
            <tbody className="align-top">
              {form.lines.map((l, i) => {
                const unit = parseEurosToCents(l.unitEuros) ?? 0;
                const qty = num(l.quantity);
                return (
                  <tr key={i} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-2 pr-2 space-y-1">
                      <input
                        value={l.description}
                        onChange={(e) => setLine(i, { description: e.target.value })}
                        placeholder="Formation…"
                        className={inputClass}
                      />
                      <input
                        value={l.details}
                        onChange={(e) => setLine(i, { details: e.target.value })}
                        placeholder="Détails (durée, modalité, dates…)"
                        className={`${inputClass} text-[12px]`}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={l.quantity}
                        onChange={(e) => setLine(i, { quantity: e.target.value })}
                        inputMode="decimal"
                        className={inputClass}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={l.unitEuros}
                        onChange={(e) => setLine(i, { unitEuros: e.target.value })}
                        inputMode="decimal"
                        className={inputClass}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={l.vatRate}
                        onChange={(e) => setLine(i, { vatRate: e.target.value })}
                        inputMode="decimal"
                        placeholder={form.vatRate || '0'}
                        className={inputClass}
                      />
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums pt-3.5">
                      {formatEuros(Number.isFinite(qty) ? Math.round(qty * unit) : 0)}
                    </td>
                    <td className="py-2 pt-3 whitespace-nowrap text-right">
                      <button type="button" onClick={() => moveLine(i, -1)} className="p-1 text-zinc-400 hover:text-zinc-700" title="Monter">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => moveLine(i, 1)} className="p-1 text-zinc-400 hover:text-zinc-700" title="Descendre">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}
                        className="p-1 text-zinc-400 hover:text-red-600"
                        title="Supprimer la ligne"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine] }))}
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          <Plus className="w-3.5 h-3.5" /> Ajouter une ligne
        </button>

        <table className="ml-auto mt-4 text-[13px] tabular-nums">
          <tbody>
            <tr>
              <td className="pr-8 text-zinc-500">Total HT</td>
              <td className="text-right">{formatEuros(totals.subtotalCents)}</td>
            </tr>
            {totals.byRate.map((r) => (
              <tr key={r.rate}>
                <td className="pr-8 text-zinc-500">{r.rate === 0 ? 'TVA (exonérée)' : `TVA ${r.rate} %`}</td>
                <td className="text-right">{formatEuros(r.vatCents)}</td>
              </tr>
            ))}
            <tr className="font-medium text-zinc-900 dark:text-zinc-100">
              <td className="pr-8 pt-1">{totals.vatCents === 0 ? 'Total net' : 'Total TTC'}</td>
              <td className="text-right pt-1">{formatEuros(totals.totalCents)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="p-5">
        <label className={labelCls}>Informations complémentaires (visibles sur le devis)</label>
        <textarea
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={3}
          placeholder="Conditions particulières, lieu précis, matériel à prévoir…"
          className={inputClass}
        />
      </section>

      <div className="px-5 py-4 bg-zinc-50/50 dark:bg-zinc-950/40 flex flex-wrap items-center gap-3">
        {message && (
          <p className={`text-[12px] ${message.tone === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>{message.text}</p>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200/70 dark:border-zinc-700 px-3.5 py-2 text-[13px] text-zinc-700 dark:text-zinc-300 hover:bg-white dark:hover:bg-zinc-800 disabled:opacity-50 transition"
          >
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Enregistrer
          </button>
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[13px] font-medium px-3.5 py-2 shadow-sm transition"
          >
            <Send className="w-3.5 h-3.5" />
            Valider et envoyer au client
          </button>
        </div>
      </div>
    </div>
  );
}
