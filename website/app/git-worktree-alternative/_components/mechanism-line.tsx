import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import type { Mechanism } from "./alternatives-data";

export default function MechanismLine({ mechanism }: { mechanism: Mechanism }) {
  if (mechanism.kind === "menu") {
    return (
      <p className="flex flex-wrap items-center gap-1 text-[12px] font-medium text-gray-700 dark:text-gray-300">
        {mechanism.steps.map((step, index) => (
          <span key={step} className="inline-flex items-center gap-1">
            {index > 0 && (
              <ChevronRight
                aria-hidden
                className="h-3 w-3 text-gray-400 dark:text-gray-500"
              />
            )}
            <span className="rounded-md border border-gray-200 bg-white px-1.5 py-0.5 dark:border-gray-700 dark:bg-white/[0.04]">
              {step}
            </span>
          </span>
        ))}
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg bg-gray-100/80 px-2.5 py-1.5 dark:bg-white/[0.05]">
      <code className="break-words font-mono text-[12px] text-gray-800 dark:text-gray-200">
        {mechanism.text.split(" ").map((token, index) => (
          <Fragment key={index}>
            {index > 0 && " "}
            <span className="whitespace-nowrap">{token}</span>
          </Fragment>
        ))}
      </code>
      {mechanism.context && (
        <span className="text-[11px] text-gray-600 dark:text-gray-400">
          {mechanism.context}
        </span>
      )}
    </p>
  );
}
