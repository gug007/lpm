"use client";

import { DESKTOP_SYSTEMS, formatReleaseDate } from "@/lib/downloads";
import { DownloadLink } from "./download-link";
import { useRelease } from "./release-context";

// Every page ends on the latest version, which also shows the project is
// alive.
export function FooterRelease() {
  const { release } = useRelease();
  if (!release) return null;
  const released = formatReleaseDate(release.publishedAt);

  return (
    <div className="mb-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-200 pb-6 dark:border-gray-800">
      <span
        aria-hidden="true"
        className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 dark:bg-emerald-400"
      />
      <p className="font-mono text-[13px] font-semibold text-gray-900 dark:text-gray-100">
        lpm v{release.version}
      </p>
      <p className="text-[13px] text-gray-500 dark:text-gray-400">
        {released && `Released ${released} · `}
        {DESKTOP_SYSTEMS}
      </p>
      <DownloadLink className="ml-auto inline-flex h-8 items-center rounded-full bg-gray-900 px-4 text-[13px] font-medium text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100">
        Download
      </DownloadLink>
    </div>
  );
}
