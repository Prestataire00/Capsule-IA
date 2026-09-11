import Image from 'next/image';

type Size = 'icon' | 'sm' | 'md' | 'lg' | 'xl';

// Logo Capsule IA : icône capsule (image détourée, sans le wordmark gravé —
// croppée depuis le logo complet) + wordmark « Capsule IA » rendu en HTML.
// Icône carrée → ratio 1.
const NATIVE_W = 600;
const NATIVE_H = 600;
const RATIO = NATIVE_W / NATIVE_H;

// Hauteur de l'icône capsule en px par taille — la largeur suit le ratio (carré).
// `sm` est utilisé par la sidebar (rail 64px).
const heights: Record<Size, number> = { icon: 24, sm: 34, md: 38, lg: 46, xl: 64 };
const titleCls: Record<Size, string> = {
  icon: 'text-[13px]',
  sm: 'text-[15px]',
  md: 'text-[17px]',
  lg: 'text-[20px]',
  xl: 'text-[24px]',
};

export function Logo({
  size = 'sm',
  className = '',
  showWordmark,
}: {
  size?: Size;
  className?: string;
  /** Force l'affichage du wordmark ; par défaut masqué en taille `icon` (rail étroit). */
  showWordmark?: boolean;
}) {
  const h = heights[size];
  const w = Math.round(h * RATIO);
  const wordmark = showWordmark ?? size !== 'icon';

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label="Capsule IA">
      <Image
        src="/logo-capsule.png"
        alt="Capsule IA"
        width={w}
        height={h}
        priority
        style={{ width: w, height: h }}
        className="flex-shrink-0 object-contain"
      />
      {wordmark && (
        <span className={`font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 ${titleCls[size]}`}>
          Capsule IA
        </span>
      )}
    </span>
  );
}
