import { ChevronDown, SquareTerminal } from "lucide-react";

export default function TerminalToggle({
  expanded,
  controls,
  onToggle,
  className = "",
}: {
  expanded: boolean;
  controls: string;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
      className={`group inline-flex cursor-pointer items-center gap-2 rounded-full border border-gray-200 bg-white py-2 pl-3.5 pr-3 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:text-gray-900 motion-reduce:transition-none dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:border-gray-700 dark:hover:text-white ${className}`}
    >
      <SquareTerminal
        className="h-4 w-4 text-gray-500 transition-colors group-hover:text-gray-900 motion-reduce:transition-none dark:text-gray-400 dark:group-hover:text-white"
        aria-hidden
      />
      {expanded ? "Hide the terminal" : "See it in a terminal"}
      <ChevronDown
        className={`h-3.5 w-3.5 text-gray-400 motion-safe:transition-transform motion-safe:duration-300 dark:text-gray-500 ${
          expanded ? "rotate-180" : ""
        }`}
        aria-hidden
      />
    </button>
  );
}
