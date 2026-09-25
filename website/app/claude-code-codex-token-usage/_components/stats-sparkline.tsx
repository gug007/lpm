const HEIGHT = 24;
const BAR_WIDTH = 0.62;

export default function StatsSparkline({ data }: { data: number[] }) {
  if (data.length === 0) return null;
  const max = Math.max(1, ...data);

  return (
    <svg
      aria-hidden
      className="mt-2 w-full text-[var(--text-muted)]"
      style={{ height: HEIGHT }}
      viewBox={`0 0 ${data.length} ${HEIGHT}`}
      preserveAspectRatio="none"
    >
      {data.map((value, index) => {
        const height = value <= 0 ? 0 : Math.max(1, (value / max) * HEIGHT);
        return (
          <rect
            key={index}
            x={index + (1 - BAR_WIDTH) / 2}
            y={HEIGHT - height}
            width={BAR_WIDTH}
            height={height}
            rx={0.3}
            fill="currentColor"
            opacity={0.45}
          />
        );
      })}
    </svg>
  );
}
