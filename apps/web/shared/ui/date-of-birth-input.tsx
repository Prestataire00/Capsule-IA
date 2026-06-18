'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';

const MONTHS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
] as const;

type Props = {
  value: string;
  onChange: (iso: string) => void;
  minAge?: number;
  maxAge?: number;
  className?: string;
};

type Parts = { y: string; mo: string; d: string };

const parseIso = (iso: string): Parts => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return { y: '', mo: '', d: '' };
  return { y: m[1]!, mo: m[2]!, d: m[3]! };
};

const composeIso = (d: string, mo: string, y: string): string => {
  if (!d || !mo || !y) return '';
  const dd = d.padStart(2, '0');
  const mm = mo.padStart(2, '0');
  const yyyy = y.padStart(4, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const daysInMonth = (year: number, monthIndex: number): number => {
  if (!year || isNaN(year)) return 31;
  return new Date(year, monthIndex + 1, 0).getDate();
};

export function DateOfBirthInput({
  value,
  onChange,
  minAge = 14,
  maxAge = 100,
  className,
}: Props) {
  const baseId = useId();

  // État local des 3 sélecteurs : indispensable pour conserver une saisie
  // PARTIELLE (jour seul, ou jour+mois) que l'ISO composé ne peut pas
  // représenter — sinon chaque select reviendrait sur son placeholder.
  const [parts, setParts] = useState<Parts>(() => parseIso(value));

  // Prefill / contrôle externe : si le parent pousse une date complète
  // différente, on l'adopte. On n'écrase JAMAIS l'état partiel sur value=''
  // (value='' est aussi ce qu'on remonte pendant la saisie en cours).
  useEffect(() => {
    if (!value) return;
    const p = parseIso(value);
    setParts((prev) => (p.y === prev.y && p.mo === prev.mo && p.d === prev.d ? prev : p));
  }, [value]);

  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const start = currentYear - minAge;
    const end = currentYear - maxAge;
    const arr: number[] = [];
    for (let y = start; y >= end; y--) arr.push(y);
    return arr;
  }, [currentYear, minAge, maxAge]);

  const yearNum = parseInt(parts.y, 10);
  const monthNum = parseInt(parts.mo, 10);
  const maxDay = !isNaN(yearNum) && !isNaN(monthNum) ? daysInMonth(yearNum, monthNum - 1) : 31;

  const commit = (next: Parts) => {
    setParts(next);
    onChange(composeIso(next.d, next.mo, next.y));
  };

  const handleDayChange = (d: string) => commit({ ...parts, d });
  const handleMonthChange = (mo: string) => {
    let d = parts.d;
    if (d && parseInt(d, 10) > daysInMonth(parseInt(parts.y || '2000', 10), parseInt(mo || '1', 10) - 1)) {
      d = '';
    }
    commit({ ...parts, mo, d });
  };
  const handleYearChange = (y: string) => {
    let d = parts.d;
    if (d && parts.mo && parseInt(d, 10) > daysInMonth(parseInt(y || '2000', 10), parseInt(parts.mo, 10) - 1)) {
      d = '';
    }
    commit({ ...parts, y, d });
  };

  const selectClass =
    'w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-lg pl-3 pr-8 py-2 text-[13px] focus:outline-none focus:border-violet-300 dark:focus:border-violet-700 focus:ring-2 focus:ring-violet-500/10 transition appearance-none cursor-pointer text-zinc-900 dark:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-700';

  const wrapClass = 'relative';
  const chevronClass = 'absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none';

  return (
    <div className={`grid grid-cols-[1fr_2fr_1.3fr] gap-2 ${className ?? ''}`}>
      <div className={wrapClass}>
        <select
          id={`${baseId}-day`}
          aria-label="Jour de naissance"
          value={parts.d}
          onChange={(e) => handleDayChange(e.target.value)}
          className={selectClass}
        >
          <option value="">Jour</option>
          {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => (
            <option key={d} value={String(d).padStart(2, '0')}>
              {d}
            </option>
          ))}
        </select>
        <ChevronDown className={chevronClass} />
      </div>

      <div className={wrapClass}>
        <select
          id={`${baseId}-month`}
          aria-label="Mois de naissance"
          value={parts.mo}
          onChange={(e) => handleMonthChange(e.target.value)}
          className={selectClass}
        >
          <option value="">Mois</option>
          {MONTHS_FR.map((label, i) => {
            const v = String(i + 1).padStart(2, '0');
            return (
              <option key={v} value={v}>
                {label}
              </option>
            );
          })}
        </select>
        <ChevronDown className={chevronClass} />
      </div>

      <div className={wrapClass}>
        <select
          id={`${baseId}-year`}
          aria-label="Année de naissance"
          value={parts.y}
          onChange={(e) => handleYearChange(e.target.value)}
          className={selectClass}
        >
          <option value="">Année</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
        <ChevronDown className={chevronClass} />
      </div>
    </div>
  );
}
