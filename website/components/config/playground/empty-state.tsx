import { Terminal } from "lucide-react";

export function EmptyState({
  projectName,
  hasAnyService,
  terminalLabel,
  onOpenTerminal,
}: {
  projectName: string;
  hasAnyService: boolean;
  terminalLabel?: string;
  onOpenTerminal?: () => void;
}) {
  const canOpenTerminal = !!onOpenTerminal && !!terminalLabel;
  const description = hasAnyService
    ? `Click Start to run ${projectName}${
        canOpenTerminal ? ", or open a terminal" : ""
      }.`
    : canOpenTerminal
      ? "Open a terminal to get started."
      : "Add a service in the config to get started.";
  return (
    <div className="mt-4 flex flex-1 min-h-0 flex-col items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-5 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-gray-400 dark:text-gray-600">
          <Terminal className="w-[26px] h-[26px]" strokeWidth={1.5} />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            No active terminals
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            {description}
          </p>
        </div>
        {canOpenTerminal && (
          <button
            type="button"
            onClick={onOpenTerminal}
            className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white"
          >
            <Terminal className="w-3.5 h-3.5" />
            {terminalLabel}
          </button>
        )}
      </div>
    </div>
  );
}
