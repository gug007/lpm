import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type Props = {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
};

export function SafetyDisclosure({ title, meta, children }: Props) {
  return (
    <details className="group border-t border-gray-200 dark:border-gray-800">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-6 py-3 text-xs font-semibold text-gray-900 hover:bg-gray-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gray-900 sm:px-8 dark:text-gray-100 dark:hover:bg-white/[0.03] dark:focus-visible:ring-white [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="flex items-center gap-3 font-normal text-gray-500 dark:text-gray-400">
          {meta}
          <ChevronDown
            className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
            aria-hidden
          />
        </span>
      </summary>
      <div className="px-6 pb-5 text-xs leading-relaxed text-gray-500 sm:px-8 dark:text-gray-400">
        {children}
      </div>
    </details>
  );
}
