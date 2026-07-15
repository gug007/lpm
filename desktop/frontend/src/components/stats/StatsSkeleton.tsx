import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const BAR_HEIGHTS = [40, 62, 30, 78, 54, 88, 46, 70, 34, 60, 82, 50, 66, 44];

export function StatsSkeleton() {
  const reducedMotion = usePrefersReducedMotion();
  const pulse = reducedMotion ? "" : "animate-pulse";
  const block = "rounded bg-[var(--bg-hover)]";

  return (
    <div className={`space-y-4 pb-2 ${pulse}`}>
      <div className="grid grid-cols-4 gap-3">
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

      <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(280px,0.9fr)] gap-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
          <div className={`h-4 w-32 ${block}`} />
          <div className="relative mt-6 h-[150px]">
            {[0, 0.5, 1].map((frac) => (
              <div
                key={frac}
                className="absolute inset-x-0 border-t border-[var(--border)]/50"
                style={{ top: `${(1 - frac) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-[3px]">
              {BAR_HEIGHTS.map((height, index) => (
                <div
                  key={index}
                  className={`mx-auto w-full max-w-[14px] ${block}`}
                  style={{ height: `${height}%` }}
                />
              ))}
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

      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, panel) => (
          <div
            key={panel}
            className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]"
          >
            <div className="border-b border-[var(--border)] px-4 py-3">
              <div className={`h-4 w-28 ${block}`} />
            </div>
            <div className="divide-y divide-[var(--border)]">
              {Array.from({ length: 6 }).map((_, row) => (
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
