import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { IndexItem } from "./feature-index-data";

export function FeatureIndexItem({ item }: { item: IndexItem }) {
  const { icon: Icon, title, body, href, keys } = item;
  return (
    <li>
      <Link
        href={href}
        className="group/item flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2 transition-colors duration-200 hover:bg-white sm:items-start sm:py-2.5 dark:hover:bg-white/[0.04]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 transition-colors duration-200 group-hover/item:text-gray-900 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-white/[0.06] dark:group-hover/item:text-white sm:mt-0.5">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-2">
            <span className="text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">
              {title}
            </span>
            {keys && (
              <kbd className="mt-px hidden shrink-0 rounded-md border border-gray-200 bg-white px-1.5 font-mono text-[10.5px] leading-[18px] text-gray-500 dark:border-gray-700 dark:bg-white/[0.04] dark:text-gray-400 sm:inline-block">
                {keys}
              </kbd>
            )}
            <ArrowRight
              className="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400 transition-[opacity,transform] duration-200 sm:opacity-0 sm:group-hover/item:opacity-100 sm:group-focus-visible/item:opacity-100 motion-safe:sm:-translate-x-1 motion-safe:sm:group-hover/item:translate-x-0 dark:text-gray-500"
              aria-hidden
            />
          </span>
          <span className="mt-1 hidden text-[13px] leading-snug text-gray-500 sm:block dark:text-gray-400">
            {body}
          </span>
        </span>
      </Link>
    </li>
  );
}
