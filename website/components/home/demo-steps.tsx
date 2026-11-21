"use client";

import { Check, RotateCcw } from "lucide-react";
import { DownloadLink } from "@/components/download-link";
import { PrimaryDownload } from "@/components/home/primary-download";
import type { TourState, TourStep } from "@/components/home/tour";
import { trackDemo } from "@/lib/analytics";
import {
  isDownloadPlatform,
  primaryDownload,
  usePlatform,
} from "@/lib/use-platform";

type Props = {
  steps: TourStep[];
  tour: TourState;
  // Replaces the steps once all of them have happened.
  done: string;
  onRun: (index: number) => void;
  onRestart: () => void;
};

// How long the active step's bar takes to fill: the gap between its beat and
// the one before it on the tour's clock, so it reaches the end as the click
// lands.
function fillDuration(steps: TourStep[], index: number): number {
  const before = index > 0 ? steps[index - 1].beatMs : 0;
  return steps[index].beatMs - before;
}

const COUNT_WORDS = [
  "none",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
];

function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

function Marker({
  index,
  done,
  active,
}: {
  index: number;
  done: boolean;
  active: boolean;
}) {
  if (done) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
        active
          ? "bg-white text-gray-900 dark:bg-gray-900 dark:text-white"
          : "bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400"
      }`}
    >
      {index + 1}
    </span>
  );
}

// The end of the tour is where a visitor has just seen the whole thing work,
// so the row turns into the download for their system. It stays one line at
// every width, so the window under it doesn't move.
function DoneRow({ done, onRestart }: { done: string; onRestart: () => void }) {
  const platform = usePlatform();
  const macDefault = platform === null || platform === "mac-unknown";
  return (
    <div className="flex min-w-0 items-center justify-center gap-3">
      <span className="inline-flex min-w-0 items-center gap-2 text-[14px] text-gray-700 dark:text-gray-300">
        <Marker index={0} done active={false} />
        <span className="hidden lg:inline">{done}</span>
      </span>
      {isDownloadPlatform(platform) || macDefault ? (
        <PrimaryDownload
          entry={primaryDownload(platform)}
          source="demo-done"
          className="h-8 px-4 text-[13px]"
        />
      ) : (
        <DownloadLink className="inline-flex h-8 items-center rounded-full bg-gray-900 px-4 text-[13px] font-medium text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
          Get lpm
        </DownloadLink>
      )}
      <button
        type="button"
        onClick={() => {
          trackDemo("replay");
          onRestart();
        }}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-[13px] text-gray-600 transition-colors hover:border-gray-900 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-white dark:hover:text-white"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        Replay
      </button>
    </div>
  );
}

export function DemoSteps({ steps, tour, done, onRun, onRestart }: Props) {
  const allDone = tour.stage >= steps.length;
  const activeIndex = allDone ? -1 : tour.stage;
  const status = allDone
    ? `All ${countWord(steps.length)} done. Click around the window yourself, or replay the demo.`
    : tour.playing
      ? "The tour is running. Click any step to take over."
      : "Click a step to run it in the window.";

  return (
    <div className="mb-4 flex justify-center">
      {allDone ? (
        <DoneRow done={done} onRestart={onRestart} />
      ) : (
        <div className="flex min-w-0 max-w-full items-center gap-2">
          <ol
            aria-label="What the demo is doing"
            className="scrollbar-none flex min-w-0 items-center gap-1 overflow-x-auto"
          >
            {steps.map((step, i) => {
              const stepDone = i < tour.stage;
              const active = i === activeIndex;
              const fillMs =
                active && tour.playing ? fillDuration(steps, i) : null;
              return (
                <li
                  key={`${step.id}-${i}`}
                  className="flex shrink-0 items-center gap-1"
                >
                  {i > 0 && (
                    <span
                      aria-hidden="true"
                      className="h-px w-2.5 bg-gray-200 dark:bg-white/10"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      trackDemo("step");
                      onRun(i);
                    }}
                    aria-current={active ? "step" : undefined}
                    title={step.body}
                    className={`relative flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-full border py-1 pl-1 pr-3 text-[13px] font-medium transition-colors ${
                      active
                        ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                        : stepDone
                          ? "border-transparent text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.06]"
                          : "border-gray-200 text-gray-700 hover:border-gray-300 hover:text-gray-900 dark:border-white/10 dark:text-gray-300 dark:hover:border-white/20 dark:hover:text-white"
                    }`}
                  >
                    <Marker index={i} done={stepDone} active={active} />
                    {step.title}
                    {active && !tour.playing && (
                      <span className="rounded-full bg-white/15 px-2 text-[11px] leading-[18px] dark:bg-gray-900/10">
                        Run
                      </span>
                    )}
                    {fillMs !== null && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-3 bottom-[3px] h-0.5 overflow-hidden rounded-full bg-white/20 dark:bg-gray-900/15"
                      >
                        <span
                          key={`${step.id}-${i}-${fillMs}`}
                          className="block h-full origin-left bg-white dark:bg-gray-900"
                          style={{
                            animation: `demo-step-fill ${fillMs}ms linear forwards`,
                          }}
                        />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  );
}
