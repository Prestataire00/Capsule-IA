// ARCHETYPE: shared
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/cn';
import * as React from 'react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 text-[13px] font-medium rounded-md transition disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950',
  {
    variants: {
      variant: {
        brand:
          'bg-orange-500 text-white hover:bg-orange-600 active:bg-orange-700 shadow-sm focus-visible:ring-orange-500/30',
        primary:
          'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 focus-visible:ring-zinc-900/20 dark:focus-visible:ring-zinc-100/20',
        secondary:
          'border border-zinc-200/60 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900 focus-visible:ring-zinc-300',
        ghost:
          'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 focus-visible:ring-zinc-300',
        danger:
          'border border-red-200/60 dark:border-red-900/60 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 focus-visible:ring-red-300',
      },
      size: {
        sm: 'text-xs px-2.5 py-1',
        md: 'text-[13px] px-4 py-2',
        lg: 'text-[15px] px-5 py-2.5',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
