import { ChevronDown } from "lucide-react";
import { CONFIG_SECTIONS } from "@/lib/config-sections";

export function MobileTableOfContents() {
  return (
    <details className="group lg:hidden mb-10 rounded-2xl border border-gray-200 transition-colors duration-200 open:border-gray-300 open:bg-gray-50/50 dark:border-gray-800 dark:open:border-gray-700 dark:open:bg-white/[0.02]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3.5 text-sm font-semibold text-gray-900 [&::-webkit-details-marker]:hidden dark:text-gray-100">
        <span>On this page</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 group-open:rotate-180 dark:text-gray-400"
          aria-hidden
        />
      </summary>
      <nav aria-label="Table of contents" className="px-5 pb-4">
        <ul className="space-y-1 border-l border-gray-200 dark:border-gray-800">
          {CONFIG_SECTIONS.map(({ id, title }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="block -ml-px border-l border-transparent pl-4 py-1.5 text-sm text-gray-500 transition-colors hover:border-gray-900 hover:text-gray-900 dark:text-gray-400 dark:hover:border-white dark:hover:text-white"
              >
                {title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}
