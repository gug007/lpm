import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

// Cycled rather than shrunk per row, so row ten isn't a dot.
const TITLE_WIDTHS = ["58%", "42%", "66%", "36%"];
const META_WIDTHS = ["34%", "48%", "28%", "40%"];

// The shape of a loaded row — one day header, then two-line rows with the age
// column on the right — so nothing jumps when the real list arrives.
export function ResumeSessionSkeleton() {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div aria-hidden className={reducedMotion ? undefined : "animate-pulse"}>
      <div className="flex h-8 items-end px-2.5 pb-1">
        <div className="h-2 w-14 rounded bg-[var(--bg-hover)]" />
      </div>
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg px-2.5 py-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div
              className="h-2.5 rounded bg-[var(--bg-hover)]"
              style={{ width: TITLE_WIDTHS[i % TITLE_WIDTHS.length] }}
            />
            <div
              className="h-2 rounded bg-[var(--bg-hover)]"
              style={{ width: META_WIDTHS[i % META_WIDTHS.length] }}
            />
          </div>
          <div className="flex w-9 shrink-0 justify-end">
            <div className="h-2 w-6 rounded bg-[var(--bg-hover)]" />
          </div>
        </div>
      ))}
    </div>
  );
}
