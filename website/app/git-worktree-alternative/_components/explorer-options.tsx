import { useId, useRef } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import OptionSwitch from "./explorer-option-switch";
import {
  DUPLICATE_OPTIONS,
  isDefault,
  type DuplicateOptions,
  type OptionKey,
} from "./explorer-data";

const HINT = "Flip a switch: the lpm Duplicate folder updates to match.";

export default function ExplorerOptions({
  options,
  announcement,
  onToggle,
  onReset,
  className = "",
}: {
  options: DuplicateOptions;
  announcement: string;
  onToggle: (key: OptionKey) => void;
  onReset: () => void;
  className?: string;
}) {
  const titleId = useId();
  const group = useRef<HTMLDivElement>(null);
  const atDefaults = isDefault(options);
  const reset = () => {
    onReset();
    group.current?.querySelector<HTMLButtonElement>('[role="switch"]')?.focus();
  };
  return (
    <div
      ref={group}
      role="group"
      aria-labelledby={titleId}
      className={`rounded-2xl border border-emerald-200/80 bg-white shadow-sm dark:border-emerald-900/50 dark:bg-[#141414] ${className}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5 dark:border-white/[0.06]">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <span
            id={titleId}
            className="inline-flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100"
          >
            <SlidersHorizontal
              className="h-3.5 w-3.5 translate-y-px text-emerald-600 dark:text-emerald-400"
              aria-hidden
            />
            Duplicate options
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            The same switches as the Duplicate dialog
          </span>
        </p>
        <button
          type="button"
          onClick={reset}
          className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 motion-reduce:transition-none dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white ${
            atDefaults ? "invisible" : ""
          }`}
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          Reset
        </button>
      </div>
      <div className="grid divide-y divide-gray-100 p-1.5 dark:divide-white/[0.06] md:grid-cols-3 md:divide-x md:divide-y-0">
        {DUPLICATE_OPTIONS.map((option) => (
          <div key={option.key} className="py-0.5 md:px-0.5 md:py-0">
            <OptionSwitch
              option={option}
              checked={options[option.key]}
              onToggle={() => onToggle(option.key)}
            />
          </div>
        ))}
      </div>
      <p
        key={announcement}
        aria-hidden
        className="min-h-9 border-t border-gray-100 px-4 py-2 text-xs leading-relaxed text-emerald-800 motion-safe:transition-opacity motion-safe:duration-300 motion-safe:starting:opacity-0 dark:border-white/[0.06] dark:text-emerald-200"
      >
        {announcement || HINT}
      </p>
    </div>
  );
}
