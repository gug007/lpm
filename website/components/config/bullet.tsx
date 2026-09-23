import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <ChevronRight
        aria-hidden
        className="w-3.5 h-3.5 mt-1 text-gray-300 dark:text-gray-700 flex-shrink-0"
      />
      <span>{children}</span>
    </li>
  );
}
