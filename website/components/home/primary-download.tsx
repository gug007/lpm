"use client";

import { ArrowDown } from "lucide-react";
import { trackDownload, type DownloadSource } from "@/lib/analytics";
import { isBetaOs, OS_NAMES, type DownloadEntry } from "@/lib/downloads";
import { BetaTag } from "./beta-tag";
import { OsIcon } from "./os-icon";

type Props = {
  entry: DownloadEntry;
  source: DownloadSource;
  className: string;
  // The left half of a split button: square right edge, and no lift of its
  // own, since the two halves have to move as one.
  joined?: boolean;
  // Build, size and version, under a short label at every width.
  details?: string;
};

const SHAPE = {
  alone:
    "rounded-full shadow-sm hover:-translate-y-[1px] hover:shadow-lg active:translate-y-0 active:shadow-sm",
  joined: "rounded-l-full",
};

export function PrimaryDownload({
  entry,
  source,
  className,
  joined = false,
  details,
}: Props) {
  const beta = isBetaOs(entry.os);
  return (
    <a
      href={entry.href}
      onClick={() =>
        trackDownload({ source, platform: entry.platform, href: entry.href })
      }
      className={`group inline-flex items-center justify-center gap-3 whitespace-nowrap bg-gray-900 font-medium tracking-tight text-white transition-[background-color,box-shadow,transform] duration-200 ease-out hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 dark:focus-visible:ring-white dark:focus-visible:ring-offset-gray-950 ${SHAPE[joined ? "joined" : "alone"]} ${className}`}
    >
      <OsIcon os={entry.os} className="-mt-0.5 h-5 w-5 flex-shrink-0" />
      <span
        className={`flex flex-col items-start text-left leading-tight ${details ? "" : "sm:hidden"}`}
      >
        <span>Download for {OS_NAMES[entry.os]}</span>
        <span className="text-[12px] font-normal opacity-70">
          {details ?? entry.choiceLabel}
        </span>
      </span>
      {!details && <span className="hidden sm:inline">{entry.label}</span>}
      {beta && (
        <BetaTag className="border-white/35 text-white/80 dark:border-gray-900/30 dark:text-gray-700" />
      )}
      {!joined && (
        <ArrowDown
          className="h-4 w-4 opacity-70 transition-transform duration-300 ease-out group-hover:translate-y-0.5"
          aria-hidden
        />
      )}
    </a>
  );
}
