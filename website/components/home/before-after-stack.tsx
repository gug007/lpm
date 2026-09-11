import { IN_THE_DOCK, STAGE_H, WINDOWS } from "./before-after-data";
import { AfterDescription, BeforeDescription } from "./before-after-descriptions";
import { AGENT_ROW_COUNT, LpmReplica, PROJECT_COUNT } from "./before-after-replica";
import { PileWindowCard } from "./before-after-window";

// The narrow-screen layout: the two pictures one under the other, at a width a
// phone can hold. The wide screens get the draggable line instead.
const LABEL =
  "flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] sm:text-xs";
const FOOTNOTE = "mt-4 font-mono text-[11px] tracking-tight";
// The stage and the replica share one footprint: same width, same height, same
// area. Seeing one window occupy what the whole pile fought over is the argument.
const FRAME = "mx-auto w-full max-w-[27.5rem]";
// 1em = one design pixel / 10, capped so the composition never grows past its
// drawn size. Below the cap it tracks the column, so the scatter scales instead
// of overflowing. The cap is in rem because the frame it has to match is in
// rem — a px cap drifts away from the stage at any root font size other than
// 16px. 27.5rem / 44 = 0.625rem.
const SCALE = "text-[0.625rem] sm:text-[min(2.2727cqw,0.625rem)]";
// The replica is a flex layout, so it fits any width — but its type must not
// shrink with the column the way the fixed-geometry pile does.
const REPLICA_SCALE = "text-[clamp(0.5625rem,2.2727cqw,0.625rem)]";

export function BeforeAfterStack() {
  return (
    <div className="flex flex-col gap-12">
      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-10 -inset-y-12 bg-grid"
        />
        <div className={`relative ${FRAME}`}>
          <h3 className={`${LABEL} text-red-600 dark:text-red-400`}>
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-[2px] bg-red-500/80 dark:bg-red-400/80"
            />
            Before
          </h3>
          <BeforeDescription />
          <div aria-hidden="true" className="@container mt-6">
            <div
              className={`relative flex flex-col sm:block sm:h-[var(--stage-h)] ${SCALE}`}
              style={{ "--stage-h": `${STAGE_H / 10}em` } as React.CSSProperties}
            >
              {WINDOWS.map((win, i) => (
                <PileWindowCard key={win.key} win={win} z={i + 1} />
              ))}
            </div>
          </div>
          <p
            aria-hidden="true"
            className={`${FOOTNOTE} text-red-600 dark:text-red-400`}
          >
            {WINDOWS.length} windows · {IN_THE_DOCK} more in the dock
          </p>
        </div>
      </div>

      <div aria-hidden="true" className="flex items-center justify-center">
        <span className="h-px flex-1 bg-[linear-gradient(to_right,transparent,var(--hairline)_35%,var(--hairline))]" />
        <span className="rounded-full border border-gray-200 bg-background px-3 py-1 font-mono text-[10px] font-semibold tracking-[0.25em] text-gray-500 shadow-sm dark:border-white/10 dark:text-gray-400 dark:shadow-none">
          lpm
        </span>
        <span className="h-px flex-1 bg-[linear-gradient(to_left,transparent,var(--hairline)_35%,var(--hairline))]" />
      </div>

      <div className={FRAME}>
        <h3 className={`${LABEL} text-gray-900 dark:text-white`}>
          <span aria-hidden="true" className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          After
        </h3>
        <AfterDescription />
        <div className="@container mt-6">
          <div
            className={`h-[var(--stage-h)] ${REPLICA_SCALE}`}
            style={{ "--stage-h": `${STAGE_H / 10}em` } as React.CSSProperties}
          >
            <LpmReplica />
          </div>
        </div>
        <p
          aria-hidden="true"
          className={`${FOOTNOTE} text-gray-500 dark:text-gray-400`}
        >
          1 window · {PROJECT_COUNT} projects · {AGENT_ROW_COUNT} agents
        </p>
      </div>
    </div>
  );
}
