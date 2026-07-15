import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const BAR_HEIGHTS = [
  40, 62, 30, 78, 54, 88, 46, 70, 34, 60, 82, 50, 66, 44, 72, 38, 84, 48, 58, 90, 42, 68, 32, 76,
  52, 64, 44, 80,
];

function barCount(days: number): number {
  if (days === 1) return 1;
  if (days === 0) return 28;
  return days;
}

interface StatsSkeletonProps {
  days: number;
}

export function StatsSkeleton({ days }: StatsSkeletonProps) {
  const reducedMotion = usePrefersReducedMotion();
  const pulse = reducedMotion ? "" : "animate-pulse";
  const block = "rounded bg-[var(--bg-hover)]";
  const count = barCount(days);
  const barWidth = count === 1 ? 48 : count <= 7 ? 32 : count <= 14 ? 22 : 14;

  return (
    <div className={`flex min-h-full flex-col space-y-4 pb-2 ${pulse}`}>
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3.5"
          >
            <div className={`h-3 w-16 ${block}`} />
            <div className={`mt-2 h-7 w-20 ${block}`} />
            <div className={`mt-3 h-3 w-24 ${block}`} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(280px,0.9fr)] items-start gap-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
          <div className={`h-4 w-32 ${block}`} />
          <div className="mt-4 flex gap-2">
            <div className="w-11 shrink-0" />
            <div className="relative h-[150px] flex-1">
              {[0, 0.5, 1].map((frac) => (
                <div
                  key={frac}
                  className="absolute inset-x-0 border-t border-[var(--border)]/50"
                  style={{ top: `${(1 - frac) * 100}%` }}
                />
              ))}
              <div className="absolute inset-0 flex items-end">
                {Array.from({ length: count }).map((_, index) => (
                  <div
                    key={index}
                    className="flex h-full min-w-0 flex-1 flex-col justify-end px-[2px]"
                  >
                    <div
                      className={`mx-auto w-full ${block}`}
                      style={{
                        maxWidth: barWidth,
                        height: `${BAR_HEIGHTS[index % BAR_HEIGHTS.length]}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
          <div className={`h-4 w-24 self-start ${block}`} />
          <div className={`mt-4 h-[140px] w-[140px] rounded-full ${block}`} />
          <div className={`mt-4 h-3 w-full ${block}`} />
          <div className={`mt-2 h-3 w-full ${block}`} />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, panel) => (
          <div
            key={panel}
            className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]"
          >
            <div className="border-b border-[var(--border)] px-4 py-3">
              <div className={`h-4 w-28 ${block}`} />
            </div>
            <div className="flex-1 divide-y divide-[var(--border)] overflow-hidden">
              {Array.from({ length: 14 }).map((_, row) => (
                <div key={row} className="flex items-center gap-3 px-4 py-2.5">
                  <div className={`h-3 flex-1 ${block}`} />
                  <div className={`h-3 w-16 ${block}`} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
