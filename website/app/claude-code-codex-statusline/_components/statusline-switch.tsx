import type { ReactNode } from "react";

export function StatuslineSwitch({
  checked,
  onToggle,
  disabled,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      disabled={disabled}
      className="flex min-h-11 items-center justify-between rounded-xl border border-gray-200 px-3 text-left disabled:opacity-40 dark:border-gray-800"
    >
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300">
        {children}
      </span>
      <span
        className={`relative h-5 w-9 rounded-full transition-colors ${
          checked ? "bg-[#D97757]" : "bg-gray-300 dark:bg-gray-700"
        }`}
      >
        <span
          className={`absolute top-1 h-3 w-3 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </span>
    </button>
  );
}
