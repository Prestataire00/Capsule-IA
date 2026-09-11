// ARCHETYPE: shared
// SVG donut chart — pas de dépendance externe.

type Slice = { label: string; value: number; color: string };

export function DonutChart({
  data,
  size = 180,
  strokeWidth = 24,
  centerTitle,
  centerSubtitle,
}: {
  data: Slice[];
  size?: number;
  strokeWidth?: number;
  centerTitle?: React.ReactNode;
  centerSubtitle?: React.ReactNode;
}) {
  const total = data.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-zinc-100 dark:text-zinc-800"
        />
        {data.map((s, i) => {
          const length = (s.value / total) * circumference;
          const dasharray = `${length} ${circumference - length}`;
          const dashoffset = -offset;
          offset += length;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={strokeWidth}
              strokeDasharray={dasharray}
              strokeDashoffset={dashoffset}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      {(centerTitle || centerSubtitle) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerTitle && <div className="text-[26px] leading-none font-extrabold tabular-nums text-zinc-900 dark:text-zinc-100">{centerTitle}</div>}
          {centerSubtitle && <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">{centerSubtitle}</div>}
        </div>
      )}
    </div>
  );
}

export function DonutLegend({ data }: { data: Slice[] }) {
  const total = data.reduce((sum, s) => sum + s.value, 0) || 1;
  return (
    <ul className="space-y-2">
      {data.map((s) => (
        <li key={s.label} className="flex items-center gap-2.5 text-[13px]">
          <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ backgroundColor: s.color }} />
          <span className="text-zinc-700 dark:text-zinc-300 flex-1 truncate">{s.label}</span>
          <span className="text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums">
            {Math.round((s.value / total) * 100)}%
          </span>
        </li>
      ))}
    </ul>
  );
}
