import Image from 'next/image';

type Size = 'icon' | 'sm' | 'md' | 'lg' | 'xl';

// Ratio natif du logo "IA INFINITY" landscape = 541 / 244 ≈ 2.218
const NATIVE_W = 541;
const NATIVE_H = 244;
const RATIO = NATIVE_W / NATIVE_H;

// Hauteur en px par taille — la largeur suit le ratio.
const heights: Record<Size, number> = {
  icon: 22,
  sm: 28,
  md: 36,
  lg: 48,
  xl: 72,
};

export function Logo({
  size = 'sm',
  className = '',
}: {
  size?: Size;
  className?: string;
}) {
  const h = heights[size];
  const w = Math.round(h * RATIO);

  return (
    <Image
      src="/logo-icon.png"
      alt="IA Infinity"
      width={w}
      height={h}
      priority
      style={{ width: w, height: h }}
      className={`flex-shrink-0 object-contain ${className}`}
    />
  );
}
