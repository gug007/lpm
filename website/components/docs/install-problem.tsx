import type { ReactNode } from "react";

export function InstallProblem({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-800">
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        {children}
      </p>
    </li>
  );
}
