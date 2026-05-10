// ARCHETYPE: shared
// Mini line chart SVG monochrome violet — pour activité récente.

export function LineChart({
  points,
  labels,
  height = 200,
  color = '#7c3aed',
  fillColor = 'rgba(124, 58, 237, 0.08)',
}: {
  points: number[];
  labels?: string[];
  height?: number;
  color?: string;
  fillColor?: string;
}) {
  if (points.length === 0) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const w = 100;
  const h = 100;
  const stepX = points.length > 1 ? w / (points.length - 1) : 0;

  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = h - ((p - min) / range) * (h - 10) - 5;
    return [x, y] as const;
  });

  const linePath = coords
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(' ');
  const fillPath = `${linePath} L ${w} ${h} L 0 ${h} Z`;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
      >
        <path d={fillPath} fill={fillColor} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        {coords.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.5} fill={color} />
        ))}
      </svg>
      {labels && (
        <div className="flex justify-between mt-2 px-1">
          {labels.map((l, i) => (
            <span key={i} className="text-[10px] text-zinc-400 font-mono">{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}
