import Image from 'next/image';

type Size = 'icon' | 'sm' | 'md' | 'lg';

const sizes: Record<Size, { px: number; className: string }> = {
  icon: { px: 28, className: 'w-7 h-7' },
  sm: { px: 32, className: 'w-8 h-8' },
  md: { px: 40, className: 'w-10 h-10' },
  lg: { px: 64, className: 'w-16 h-16' },
};

export function Logo({
  size = 'sm',
  className = '',
  withWordmark = false,
}: {
  size?: Size;
  className?: string;
  withWordmark?: boolean;
}) {
  const cfg = sizes[size];

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Image
        src="/logo-icon.png"
        alt="IA Infinity"
        width={cfg.px}
        height={cfg.px}
        priority
        className={`${cfg.className} flex-shrink-0 object-contain`}
      />
      {withWordmark && (
        <span className="text-[14px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          IA Infinity
        </span>
      )}
    </span>
  );
}
