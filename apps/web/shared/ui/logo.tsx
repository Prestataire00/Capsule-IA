type Size = 'icon' | 'sm' | 'md' | 'lg' | 'xl';

// Wordmark typographique : « Capsule IA » (produit) « par IA infinity » (éditeur).
// Pas d'asset image (l'ancien /logo-icon.png représentait « IA INFINITY »).
const markPx: Record<Size, number> = { icon: 34, sm: 30, md: 38, lg: 46, xl: 64 };
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
  /** Force l'affichage du texte ; par défaut masqué en taille `icon` (rail étroit). */
  showWordmark?: boolean;
}) {
  const m = markPx[size];
  const wordmark = showWordmark ?? size !== 'icon';

  return (
    <span
      className={`inline-flex items-center gap-2.5 ${className}`}
      aria-label="Capsule IA, par IA infinity"
    >
      <span
        aria-hidden
        style={{ width: m, height: m }}
        className="flex-shrink-0 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 text-white flex items-center justify-center shadow-sm"
      >
        <span className="font-semibold leading-none" style={{ fontSize: Math.round(m * 0.5) }}>
          C
        </span>
      </span>

      {wordmark && (
        <span className="flex flex-col leading-none">
          <span className={`font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 ${titleCls[size]}`}>
            Capsule IA
          </span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">par IA infinity</span>
        </span>
      )}
    </span>
  );
}
