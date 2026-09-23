import type { ReactNode } from "react";

export function Callout({
  title,
  children,
  className = "mt-6 mb-4",
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`${className} rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 px-4 py-3 text-xs text-gray-600 dark:text-gray-400 leading-relaxed`}
    >
      <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
