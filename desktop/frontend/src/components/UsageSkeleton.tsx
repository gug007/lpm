import { usePrefersReducedMotion } from "./stats/usePrefersReducedMotion";

export function UsageSkeleton() {
  const reducedMotion = usePrefersReducedMotion();
  const pulse = reducedMotion ? "" : "animate-pulse";
  const block = "rounded bg-[var(--bg-hover)]";

  return (
    <div className={`grid gap-3 pb-2 grid-cols-[repeat(auto-fit,minmax(360px,1fr))] ${pulse}`}>
      {[0, 1].map((card) => (
        <div
          key={card}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
        >
          <div className="flex items-center gap-2 border-b border-[var(--border)]/50 pb-3">
            <div className="h-2 w-2 rounded-full bg-[var(--bg-hover)]" />
            <div className={`h-3.5 w-24 ${block}`} />
            <div className={`ml-auto h-3 w-20 ${block}`} />
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 pt-4">
            {[0, 1].map((meter) => (
              <div key={meter} className="flex flex-col gap-2">
                <div className={`h-2.5 w-14 ${block}`} />
                <div className={`h-6 w-20 ${block}`} />
                <div className="h-1.5 w-full rounded-full bg-[var(--bg-hover)]" />
                <div className={`h-2.5 w-32 ${block}`} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
