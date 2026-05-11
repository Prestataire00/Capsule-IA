'use client';

import { useId, useMemo } from 'react';

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

const parseIso = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return { y: '', mo: '', d: '' };
  return { y: m[1], mo: m[2], d: m[3] };
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
  const parsed = parseIso(value);

  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const start = currentYear - minAge;
    const end = currentYear - maxAge;
    const arr: number[] = [];
    for (let y = start; y >= end; y--) arr.push(y);
    return arr;
  }, [currentYear, minAge, maxAge]);

  const yearNum = parseInt(parsed.y, 10);
  const monthNum = parseInt(parsed.mo, 10);
  const maxDay = !isNaN(yearNum) && !isNaN(monthNum) ? daysInMonth(yearNum, monthNum - 1) : 31;

  const handleDayChange = (d: string) => onChange(composeIso(d, parsed.mo, parsed.y));
  const handleMonthChange = (m: string) => {
    let day = parsed.d;
    if (day && parseInt(day, 10) > daysInMonth(parseInt(parsed.y || '2000', 10), parseInt(m || '1', 10) - 1)) {
      day = '';
    }
    onChange(composeIso(day, m, parsed.y));
  };
  const handleYearChange = (y: string) => {
    let day = parsed.d;
    if (day && parsed.mo && parseInt(day, 10) > daysInMonth(parseInt(y || '2000', 10), parseInt(parsed.mo, 10) - 1)) {
      day = '';
    }
    onChange(composeIso(day, parsed.mo, y));
  };

  const selectClass =
    'bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-violet-300 dark:focus:border-violet-700 focus:ring-2 focus:ring-violet-500/10 transition appearance-none cursor-pointer text-zinc-900 dark:text-zinc-100';

  return (
    <div className={`grid grid-cols-[1fr_2fr_1.3fr] gap-2 ${className ?? ''}`}>
      <select
        id={`${baseId}-day`}
        aria-label="Jour de naissance"
        value={parsed.d}
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

      <select
        id={`${baseId}-month`}
        aria-label="Mois de naissance"
        value={parsed.mo}
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

      <select
        id={`${baseId}-year`}
        aria-label="Année de naissance"
        value={parsed.y}
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
    </div>
  );
}
