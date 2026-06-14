'use client';

import { Star } from 'lucide-react';
import type { Question } from './schema';

export function QuestionRenderer({ questions }: { questions: Question[] }) {
  return (
    <div className="divide-y divide-zinc-200/60 dark:divide-zinc-800">
      {questions.map((q) => (
        <section key={q.id} className="p-6">
          {q.type === 'nps' && (
            <label className="block">
              <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 block mb-1">
                {q.label} {q.required && <span className="text-rose-500">*</span>}
              </span>
              <p className="text-[12px] text-zinc-500 dark:text-zinc-400 mb-3">0 = pas du tout · 10 = tout à fait</p>
              <div className="grid grid-cols-11 gap-1">
                {Array.from({ length: 11 }, (_, i) => (
                  <label
                    key={i}
                    className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg py-2 cursor-pointer text-center hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-orange-500 has-[:checked]:border-orange-500 has-[:checked]:text-white transition"
                  >
                    <input type="radio" name={q.id} value={i} required={q.required} className="sr-only" />
                    <p className="text-[13px] font-medium">{i}</p>
                  </label>
                ))}
              </div>
            </label>
          )}

          {q.type === 'rating' && (
            <label className="block">
              <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 block mb-3">
                {q.label} {q.required && <span className="text-rose-500">*</span>}
              </span>
              <div
                className="grid gap-2 max-w-md"
                style={{ gridTemplateColumns: `repeat(${q.max}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: q.max }, (_, i) => i + 1).map((v) => (
                  <label
                    key={v}
                    className="border border-zinc-200/60 dark:border-zinc-800 rounded-lg py-3 cursor-pointer text-center hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-amber-50 dark:has-[:checked]:bg-amber-950/40 has-[:checked]:border-amber-300 dark:has-[:checked]:border-amber-800 transition"
                  >
                    <input type="radio" name={q.id} value={v} required={q.required} className="sr-only" />
                    <div className="flex items-center justify-center gap-0.5">
                      {Array.from({ length: v }, (_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <p className="text-[10px] text-zinc-400 mt-1">
                      {v}/{q.max}
                    </p>
                  </label>
                ))}
              </div>
            </label>
          )}

          {q.type === 'choice' && (
            <fieldset className="block">
              <legend className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 block mb-3">
                {q.label} {q.required && <span className="text-rose-500">*</span>}
              </legend>
              <div className="space-y-2 max-w-md">
                {q.options.map((opt) => (
                  <label
                    key={opt}
                    className="flex items-center gap-3 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-950 has-[:checked]:bg-orange-50 dark:has-[:checked]:bg-orange-950/40 has-[:checked]:border-orange-300 dark:has-[:checked]:border-orange-800 transition"
                  >
                    <input type="radio" name={q.id} value={opt} required={q.required} className="accent-orange-500" />
                    <span className="text-[13px] text-zinc-700 dark:text-zinc-300">{opt}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {q.type === 'text' && (
            <label className="block">
              <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 block mb-1.5">
                {q.label} {q.required && <span className="text-rose-500">*</span>}
              </span>
              <textarea
                name={q.id}
                rows={3}
                required={q.required}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-orange-300 dark:focus:border-orange-700 focus:ring-2 focus:ring-orange-500/10 placeholder:text-zinc-400 transition"
              />
            </label>
          )}
        </section>
      ))}
    </div>
  );
}
