import { Check } from "lucide-react";

export type WalkthroughStage = "tabs" | "organized" | "done";

const STEPS: { stage: WalkthroughStage; label: string }[] = [
  { stage: "tabs", label: "Flat tabs" },
  { stage: "organized", label: "Organize by project" },
  { stage: "done", label: "Come back" },
];

const ORDER: WalkthroughStage[] = ["tabs", "organized", "done"];

export function WalkthroughSteps({ stage }: { stage: WalkthroughStage }) {
  const current = ORDER.indexOf(stage);

  return (
    <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-[12px]">
      {STEPS.map((step, index) => {
        const state =
          index < current ? "done" : index === current ? "current" : "upcoming";
        return (
          <li key={step.stage} className="flex items-center gap-2">
            {index > 0 && (
              <span aria-hidden className="text-gray-300 dark:text-gray-700">
                →
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${
                state === "current"
                  ? "border-gray-900 bg-gray-900 font-medium text-white dark:border-white dark:bg-white dark:text-gray-900"
                  : state === "done"
                    ? "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
                    : "border-gray-200 text-gray-400 dark:border-gray-800 dark:text-gray-500"
              }`}
            >
              {state === "done" ? (
                <Check className="h-3 w-3" aria-hidden />
              ) : (
                <span className="tabular-nums">{index + 1}.</span>
              )}
              {step.label}
              {state === "current" && <span className="sr-only">(current step)</span>}
              {state === "done" && <span className="sr-only">(done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
