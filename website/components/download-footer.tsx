import { ArrowUpRight } from "lucide-react";
import { DownloadLink } from "./download-link";

export function DownloadFooter({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-12 flex flex-wrap items-center gap-3">
      <DownloadLink className="inline-flex min-h-11 items-center rounded-full bg-gray-900 px-5 text-sm font-medium text-white transition-opacity hover:opacity-85 dark:bg-white dark:text-gray-900">
        Download lpm
      </DownloadLink>
      <a
        href={href}
        className="inline-flex min-h-11 items-center gap-1 rounded-full border border-gray-200 px-5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-900 dark:border-gray-800 dark:text-gray-300 dark:hover:border-gray-700 dark:hover:text-white"
      >
        {label}
        <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
