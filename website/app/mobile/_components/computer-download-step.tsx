"use client";

import { ArrowDown, ArrowRight } from "lucide-react";
import { DownloadLink } from "@/components/download-link";
import { OsIcon } from "@/components/home/os-icon";
import { SendLinkButton } from "@/components/home/send-link-button";
import { trackDownload } from "@/lib/analytics";
import { OS_NAMES } from "@/lib/downloads";
import { primaryDownload, usePlatform } from "@/lib/use-platform";

const LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-gray-700 underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-900 dark:text-gray-300 dark:decoration-gray-600 dark:hover:text-white";

// A phone or tablet can't install the desktop app, so there the step sends the
// download link to the computer; an ARM Linux machine is already a computer
// and gets the other builds.
export default function ComputerDownloadStep() {
  const platform = usePlatform();
  if (platform === "ipad" || platform === "unsupported") {
    return <SendLinkButton align="start" />;
  }
  if (platform === "linux-arm") {
    return (
      <DownloadLink className={LINK}>
        Get lpm for your computer
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </DownloadLink>
    );
  }

  const entry = primaryDownload(platform);
  return (
    <div className="flex flex-col items-start gap-1">
      <a
        href={entry.href}
        onClick={() =>
          trackDownload({
            source: "mobile-hero",
            platform: entry.platform,
            href: entry.href,
          })
        }
        className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
      >
        <OsIcon os={entry.os} className="-mt-0.5 h-4 w-4" />
        Download for {OS_NAMES[entry.os]}
        <ArrowDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
      </a>
      <DownloadLink className="inline-flex min-h-9 items-center text-[12px] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
        Other systems and builds
      </DownloadLink>
    </div>
  );
}
