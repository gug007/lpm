import { PROVIDER_META } from "./stats-sample-data";

const SEGMENT = "w-full shrink-0 motion-safe:transition-[height] motion-safe:duration-[240ms] motion-safe:ease-out";

export default function StatsChartBar({
  claude,
  codex,
  index,
  maxWidth,
  collapsed,
  dimmed,
}: {
  claude: number;
  codex: number;
  index: number;
  maxWidth: number;
  collapsed: boolean;
  dimmed: boolean;
}) {
  const empty = claude <= 0 && codex <= 0;
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col justify-end px-[2px]">
      <div
        className={`mx-auto flex h-full w-full origin-bottom flex-col justify-end ${
          collapsed
            ? "motion-safe:scale-y-0"
            : "motion-safe:transition-[scale,opacity] motion-safe:duration-[240ms] motion-safe:ease-out"
        }`}
        style={{ maxWidth, opacity: dimmed ? 0.55 : 1, transitionDelay: `${index * 8}ms, 0ms` }}
      >
        {empty ? (
          <div className="h-px w-full bg-[var(--border)]" />
        ) : (
          <>
            {codex > 0 && (
              <div
                className={`${SEGMENT} rounded-t-[2px]`}
                style={{ height: `${codex * 100}%`, minHeight: 2, backgroundColor: PROVIDER_META.codex.color }}
              />
            )}
            {codex > 0 && claude > 0 && <div className="h-0.5 shrink-0" />}
            {claude > 0 && (
              <div
                className={`${SEGMENT} ${codex > 0 ? "" : "rounded-t-[2px]"}`}
                style={{ height: `${claude * 100}%`, minHeight: 2, backgroundColor: PROVIDER_META.claude.color }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
