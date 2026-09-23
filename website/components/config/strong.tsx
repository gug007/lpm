import type { ReactNode } from "react";

export function Strong({ children }: { children: ReactNode }) {
  return (
    <strong className="font-medium text-gray-700 dark:text-gray-200">
      {children}
    </strong>
  );
}
