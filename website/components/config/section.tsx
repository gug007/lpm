import type { ReactNode } from "react";

export function Section({
  title,
  description,
  children,
  last = false,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={last ? "" : "mb-12"}>
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
          {description}
        </p>
      )}
      {children}
    </div>
  );
}
