interface SparklineProps {
  data: number[];
  height?: number;
}

export function Sparkline({ data, height = 24 }: SparklineProps) {
  if (data.length === 0) return null;
  const max = Math.max(1, ...data);
  const count = data.length;
  const slot = 1;
  const barWidth = 0.62;

  return (
    <svg
      className="w-full text-[var(--text-muted)]"
      style={{ height }}
      viewBox={`0 0 ${count * slot} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {data.map((value, index) => {
        const barHeight = value <= 0 ? 0 : Math.max(1, (value / max) * height);
        return (
          <rect
            key={index}
            x={index * slot + (slot - barWidth) / 2}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={0.3}
            fill="currentColor"
            opacity={0.45}
          />
        );
      })}
    </svg>
  );
}
