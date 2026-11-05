import { ArrowUpRight } from "lucide-react";
import type { DownloadSource } from "@/lib/analytics";
import { HeroDownload } from "./home/hero-download";

// The anchor lets the nav's Download stay on the page; a page that already
// shows a download near the top keeps the anchor there instead.
export function DownloadFooter({
  href,
  label,
  source,
  anchor = true,
}: {
  href: string;
  label: string;
  source: DownloadSource;
  anchor?: boolean;
}) {
  return (
    <div
      id={anchor ? "download" : undefined}
      className="mt-12 flex scroll-mt-20 flex-wrap items-center gap-3"
    >
      <HeroDownload source={source} compact />
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
