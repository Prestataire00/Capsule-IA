// ARCHETYPE: shared
import { cn } from '@/shared/lib/cn';

export function FormField({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300 block mb-1.5">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-zinc-500 dark:text-zinc-400 block mt-1">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:border-violet-300 dark:focus:border-violet-800 focus:ring-2 focus:ring-violet-500/10 placeholder:text-zinc-400 transition';
