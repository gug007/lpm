import { SectionHeader } from "@/components/section-header";
import { AGENT_COUNT, SERVICE_COUNT, STAGE_H, WINDOWS } from "./before-after-data";
import { PileWindowCard } from "./before-after-window";
import {
  AGENT_ROW_COUNT,
  LpmReplica,
  PROJECT_COUNT,
} from "./before-after-replica";

// Windows minimised out of sight. It is the one number the picture cannot show,
// so it is the one number stated as scenery rather than as a count.
const IN_THE_DOCK = 6;

const LABEL =
  "flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] sm:text-xs";
const FOOTNOTE = "mt-4 font-mono text-[11px] tracking-tight";
// The stage and the replica share one footprint: same width, same height, same
// area. Seeing one window occupy what the whole pile fought over is the argument.
const FRAME = "mx-auto w-full max-w-[27.5rem]";
// 1em = one design pixel / 10, capped so the composition never grows past its
// drawn size. Below the cap it tracks the column, so the scatter scales instead
// of overflowing when the two columns split the page. The cap is in rem because
// the frame it has to match is in rem — a px cap drifts away from the stage at
// any root font size other than 16px. 27.5rem / 44 = 0.625rem.
const SCALE = "text-[0.625rem] sm:text-[min(2.2727cqw,0.625rem)]";
// The replica is a flex layout, so it fits any width — but its type must not
// shrink with the column the way the fixed-geometry pile does.
const REPLICA_SCALE = "text-[clamp(0.5625rem,2.2727cqw,0.625rem)]";

function Chip({ vertical = false }: { vertical?: boolean }) {
  return (
    <span
      className={`rounded-full border border-gray-200 bg-background font-mono text-[10px] font-semibold tracking-[0.25em] text-gray-500 shadow-sm dark:border-white/10 dark:text-gray-400 dark:shadow-none ${
        vertical
          ? "px-2 py-3.5 [text-orientation:upright] [writing-mode:vertical-rl]"
          : "px-3 py-1"
      }`}
    >
      lpm
    </span>
  );
}

export function BeforeAfter() {
  return (
    <section className="relative overflow-x-clip py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader
          className="mb-12"
          eyebrow="Before / after"
          title="Every service and every agent, in one window"
          description="A window for every service, another for every agent, and no way to tell which one is waiting on you. lpm puts them all in one place."
        />

        <div className="relative grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-0">
          <div className="relative lg:pr-14">
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
              <p className="sr-only">
                {WINDOWS.length} separate terminal windows overlap and hide each
                other. {SERVICE_COUNT} are services, on ports 3000, 3001, 8080,
                6379 and 8888. {AGENT_COUNT} are AI agent sessions: a Claude
                Code run that stopped to ask permission before a database
                migration, with the answer buried under the window in front of
                it; a Codex run still working; and a second Claude Code run that
                finished and asked a question nobody saw.
              </p>
              <div aria-hidden="true" className="@container mt-6">
                <div
                  className={`relative flex flex-col sm:block sm:h-[var(--stage-h)] ${SCALE}`}
                  style={
                    { "--stage-h": `${STAGE_H / 10}em` } as React.CSSProperties
                  }
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

          <div
            aria-hidden="true"
            className="flex items-center justify-center lg:hidden"
          >
            <span className="h-px flex-1 bg-[linear-gradient(to_right,transparent,var(--hairline)_35%,var(--hairline))]" />
            <Chip />
            <span className="h-px flex-1 bg-[linear-gradient(to_left,transparent,var(--hairline)_35%,var(--hairline))]" />
          </div>

          <div className="relative lg:pl-14">
            <div className={FRAME}>
              <h3 className={`${LABEL} text-gray-900 dark:text-white`}>
                <span
                  aria-hidden="true"
                  className="relative inline-flex h-1.5 w-1.5"
                >
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                After
              </h3>
              <p className="sr-only">
                One lpm window holds the same work. A sidebar lists{" "}
                {PROJECT_COUNT} projects, with a green dot on the ones that are
                running and, under each, the agent it is running — amber for the
                one that needs you, a shimmer for the one still working, blue
                for the one that has finished. A row of tabs holds the selected
                project&apos;s services and the waiting Claude Code session,
                which is in front with its permission prompt in plain sight.
              </p>
              <div className="@container mt-6">
                <div
                  className={`h-[var(--stage-h)] ${REPLICA_SCALE}`}
                  style={
                    { "--stage-h": `${STAGE_H / 10}em` } as React.CSSProperties
                  }
                >
                  <LpmReplica />
                </div>
              </div>
              <p
                aria-hidden="true"
                className={`${FOOTNOTE} text-gray-500 dark:text-gray-400`}
              >
                1 window · {PROJECT_COUNT} projects ·{" "}
                {AGENT_ROW_COUNT} agents
              </p>
            </div>
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 items-center justify-center bg-[linear-gradient(to_bottom,transparent,var(--hairline)_14%,var(--hairline)_86%,transparent)] lg:flex"
          >
            <Chip vertical />
          </div>
        </div>
      </div>
    </section>
  );
}
