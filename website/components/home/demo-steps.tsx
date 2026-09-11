"use client";

import { Check, RotateCcw } from "lucide-react";
import {
  TOUR_STEPS,
  type TourState,
  type TourStepId,
} from "@/components/demo/tour";

type Props = {
  tour: TourState;
  onRun: (id: TourStepId) => void;
  onRestart: () => void;
};

// How long the active step's bar takes to fill: the gap between its beat and
// the one before it on the tour's clock, so it reaches the end as the click
// lands.
function fillDuration(index: number): number {
  const before = index > 0 ? TOUR_STEPS[index - 1].beatMs : 0;
  return TOUR_STEPS[index].beatMs - before;
}

function Marker({ done, active }: { done: boolean; active: boolean }) {
  if (done) {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
      <span
        className={`h-2 w-2 rounded-full ${
          active
            ? "bg-gray-900 dark:bg-white"
            : "bg-gray-300 dark:bg-gray-600"
        }`}
      />
    </span>
  );
}

export function DemoSteps({ tour, onRun, onRestart }: Props) {
  const allDone = tour.stage >= TOUR_STEPS.length;
  const activeIndex = allDone ? -1 : tour.stage;

  return (
    <div className="mb-4 lg:mb-0">
      <ol
        aria-label="What the demo is doing"
        className="scrollbar-none flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible"
      >
        {TOUR_STEPS.map((step, i) => {
          const done = i < tour.stage;
          const active = i === activeIndex;
          const fillMs = active && tour.playing ? fillDuration(i) : null;
          return (
            <li key={step.id} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => onRun(step.id)}
                aria-current={active ? "step" : undefined}
                className={`group w-full rounded-xl px-4 py-3 text-left transition-colors ${
                  active
                    ? "bg-gray-100 dark:bg-white/[0.06]"
                    : "hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Marker done={done} active={active} />
                  <span
                    className={`text-[15px] font-semibold tracking-tight ${
                      done
                        ? "text-gray-500 dark:text-gray-400"
                        : "text-gray-900 dark:text-gray-100"
                    }`}
                  >
                    {step.title}
                  </span>
                  {!tour.playing && !done && (
                    <span className="ml-auto hidden pl-3 text-[11px] font-medium text-gray-400 transition-colors group-hover:text-gray-900 lg:inline dark:text-gray-500 dark:group-hover:text-white">
                      Run
                    </span>
                  )}
                </span>
                <span
                  className={`hidden overflow-hidden pl-7 text-[13px] leading-relaxed text-gray-500 transition-all duration-300 lg:block dark:text-gray-400 ${
                    active ? "mt-1.5 max-h-24 opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  {step.body}
                </span>
                {fillMs !== null && (
                  <span
                    aria-hidden="true"
                    className="mt-3 ml-7 hidden h-0.5 overflow-hidden rounded-full bg-gray-200 lg:block dark:bg-white/10"
                  >
                    <span
                      key={`${step.id}-${fillMs}`}
                      className="block h-full origin-left bg-gray-900 dark:bg-white"
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
      <div className="mt-3 flex flex-wrap items-center gap-3 px-4 lg:flex-col lg:items-start">
        <p
          aria-live="polite"
          className="hidden text-[12px] text-gray-500 lg:block dark:text-gray-400"
        >
          {allDone
            ? "All three done. Click around the window yourself, or restart the demo."
            : tour.playing
              ? "The tour is running. Click any step to take over."
              : "Click a step to run it in the window."}
        </p>
        {allDone && (
          <button
            type="button"
            onClick={onRestart}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-700 transition-colors hover:border-gray-900 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-white dark:hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Restart the demo
          </button>
        )}
      </div>
    </div>
  );
}
