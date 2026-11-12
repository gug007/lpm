import { ChevronDown } from "lucide-react";
import { findDocsPage } from "@/lib/docs-pages";
import { DocsNavList } from "./docs-nav-list";
import { DocsOutline } from "./docs-outline";

// Keyed by page so the menu starts closed again after following one of its
// links: client navigation would otherwise keep the same open <details>.
export function DocsMobileNav({ current }: { current: string }) {
  const title = findDocsPage(current)?.title ?? "Overview";
  return (
    <details
      key={current}
      className="group mb-8 rounded-2xl border border-gray-200 transition-colors open:border-gray-300 open:bg-gray-50/50 lg:hidden dark:border-gray-800 dark:open:border-gray-700 dark:open:bg-white/[0.02]"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-sm [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate">
          <span className="text-gray-500 dark:text-gray-400">Docs</span>
          <span aria-hidden className="mx-2 text-gray-300 dark:text-gray-700">
            /
          </span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </span>
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 group-open:rotate-180 dark:text-gray-400"
          aria-hidden
        />
      </summary>
      <div className="px-5 pb-5">
        <DocsOutline inMenu />
        <nav aria-label="Docs">
          <DocsNavList
            current={current}
            className="grid gap-x-6 gap-y-5 sm:grid-cols-2"
          />
        </nav>
      </div>
    </details>
  );
}
