"use client";

import type { DownloadSource } from "@/lib/analytics";
import { DESKTOP_SYSTEMS, formatReleaseDate } from "@/lib/downloads";
import { HeroDownload } from "./home/hero-download";
import { useRelease } from "./release-context";

// Near the top of pages that end without a download section of their own. It
// carries the anchor the nav's Download scrolls to, so that button keeps the
// reader on the page.
export function LatestRelease({
  source,
  className = "",
}: {
  source: DownloadSource;
  className?: string;
}) {
  const { release } = useRelease();
  const released = release && formatReleaseDate(release.publishedAt);

  return (
    <div
      id="download"
      className={`flex scroll-mt-20 flex-col items-center gap-4 rounded-2xl border border-gray-200 px-5 py-4 text-center sm:flex-row sm:justify-between sm:text-left dark:border-gray-800 ${className}`}
    >
      <div className="min-w-0">
        <p className="flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-emerald-700 sm:justify-start dark:text-emerald-400">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400"
          />
          {release ? "Latest release" : "Free desktop app"}
        </p>
        <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-400">
          {release ? (
            <>
              <span className="font-mono font-semibold text-gray-900 dark:text-gray-100">
                lpm v{release.version}
              </span>
              {released && ` · ${released}`} · {DESKTOP_SYSTEMS}
            </>
          ) : (
            `For ${DESKTOP_SYSTEMS}`
          )}
        </p>
      </div>
      <HeroDownload source={source} compact />
    </div>
  );
}
