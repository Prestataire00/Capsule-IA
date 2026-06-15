import Image from 'next/image';

type Size = 'icon' | 'sm' | 'md' | 'lg' | 'xl';

// Logo Capsule IA : icône planète (image, sans texte gravé — croppée depuis
// l'ancien /logo-icon.png) + wordmark « Capsule IA » rendu en HTML.
// Ratio planète natif 285 / 152 ≈ 1.875.
const NATIVE_W = 285;
const NATIVE_H = 152;
const RATIO = NATIVE_W / NATIVE_H;

// Hauteur de la planète en px par taille — la largeur suit le ratio.
const heights: Record<Size, number> = { icon: 22, sm: 28, md: 36, lg: 44, xl: 60 };
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
        src="/logo-planet.png"
        alt="Capsule IA"
        width={w}
        height={h}
        priority
        style={{ width: w, height: h }}
        className="flex-shrink-0 object-contain"
      />
      {wordmark && (
        <span className={`font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 ${titleCls[size]}`}>
          Capsule IA
        </span>
      )}
    </span>
  );
}
