import type { ReactNode } from "react";

export function SecondaryButton({
  children,
  onClick,
  active = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const stateClasses = active
    ? "bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white"
    : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 dark:border-gray-800 px-3.5 py-1.5 text-xs font-medium transition-all disabled:opacity-40 ${stateClasses}`}
    >
      {children}
    </button>
  );
}
