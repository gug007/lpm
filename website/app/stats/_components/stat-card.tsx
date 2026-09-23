import { numberFmt } from "./format";

export function StatCard({
  label,
  value,
  note,
  emphasis = false,
  className = "",
}: {
  label: string;
  value: number;
  note?: string;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-gray-200 dark:border-gray-800 px-5 py-5 bg-background ${className}`}
    >
      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div
        className={`mt-2 tabular-nums font-bold tracking-tight ${
          emphasis
            ? "text-3xl sm:text-4xl text-gray-900 dark:text-white"
            : "text-2xl text-gray-800 dark:text-gray-100"
        }`}
      >
        {numberFmt.format(value)}
      </div>
      {note && (
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {note}
        </div>
      )}
    </div>
  );
}
