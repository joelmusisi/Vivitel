type ChartPoint = { x: number; y: number };

const buildSmoothPath = (pts: ChartPoint[]): string => {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
};

type ReportTrendSparklineProps = {
  values: number[];
  color?: string;
  className?: string;
};

export default function ReportTrendSparkline({
  values,
  color = "#22c55e",
  className = ""
}: ReportTrendSparklineProps) {
  const count = values.length;
  const max = Math.max(...values, 1);
  const padX = 4;
  const padTop = 14;
  const padBottom = 12;
  const hasData = values.some((value) => value > 0);

  const coords = values.map((value, index) => {
    const x = count > 1 ? padX + (index / (count - 1)) * (100 - padX * 2) : 50;
    const y = padTop + (1 - value / max) * (100 - padTop - padBottom);
    return { x, y, value };
  });

  const path = buildSmoothPath(coords.map((c) => ({ x: c.x, y: c.y })));
  const baseline = 100 - padBottom;
  const areaPath =
    path && coords.length > 0
      ? `${path} L${coords[coords.length - 1].x.toFixed(2)},${baseline} L${coords[0].x.toFixed(2)},${baseline} Z`
      : "";
  const gradId = `report-trend-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <div className={`report-trend-spark-wrap ${className}`.trim()}>
      <svg className="report-trend-spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`${color}44`} />
            <stop offset="100%" stopColor={`${color}06`} />
          </linearGradient>
        </defs>
        {!hasData && (
          <line
            x1={padX}
            y1={baseline}
            x2={100 - padX}
            y2={baseline}
            stroke="#334155"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {areaPath && <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />}
        {path && <path d={path} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      </svg>
      {hasData &&
        coords.map((coord, index) => (
          <span
            key={`trend-dot-${index}`}
            className="report-trend-dot"
            style={{ left: `${coord.x}%`, top: `${coord.y}%`, borderColor: color }}
          />
        ))}
    </div>
  );
}
