import { useId } from "react";
import type { DuplicateOption } from "./explorer-data";

export default function OptionSwitch({
  option,
  checked,
  onToggle,
}: {
  option: DuplicateOption;
  checked: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  const Icon = option.icon;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
      onClick={onToggle}
      className="group flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-gray-50 motion-reduce:transition-none dark:hover:bg-white/[0.03]"
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-7 w-7 shrink-0 md:hidden lg:flex items-center justify-center rounded-lg transition-colors duration-200 motion-reduce:transition-none ${
          checked
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
            : "bg-gray-100 text-gray-500 dark:bg-white/[0.06] dark:text-gray-400"
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          id={`${id}-title`}
          className="block text-sm font-semibold text-gray-900 dark:text-gray-100"
        >
          {option.title}
        </span>
        <span
          id={`${id}-desc`}
          className="mt-0.5 block text-xs leading-relaxed text-gray-500 max-md:sr-only dark:text-gray-400"
        >
          {option.description}
        </span>
      </span>
      <span
        aria-hidden
        className={`relative mt-1 h-5 w-9 shrink-0 rounded-full transition-colors duration-200 forced-color-adjust-none forced-colors:border forced-colors:border-[CanvasText] motion-reduce:transition-none ${
          checked
            ? "bg-emerald-500 forced-colors:bg-[Highlight] dark:bg-emerald-500"
            : "bg-gray-300 group-hover:bg-gray-400/80 forced-colors:bg-[Canvas]! dark:bg-gray-600 dark:group-hover:bg-gray-500"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-200 ease-out forced-colors:left-px forced-colors:top-px motion-reduce:transition-none ${
            checked ? "translate-x-4 forced-colors:bg-[HighlightText]" : "forced-colors:bg-[CanvasText]"
          }`}
        />
      </span>
    </button>
  );
}
