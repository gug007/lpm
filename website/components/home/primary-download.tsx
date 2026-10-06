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
};

export function PrimaryDownload({ entry, source, className }: Props) {
  const beta = isBetaOs(entry.os);
  return (
    <a
      href={entry.href}
      aria-label={entry.ariaLabel}
      onClick={() =>
        trackDownload({ source, platform: entry.platform, href: entry.href })
      }
      className={`group inline-flex items-center justify-center gap-3 whitespace-nowrap rounded-full bg-gray-900 font-medium tracking-tight text-white shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-[1px] hover:bg-gray-800 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:translate-y-0 active:shadow-sm dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 dark:focus-visible:ring-white dark:focus-visible:ring-offset-gray-950 ${className}`}
    >
      <OsIcon os={entry.os} className="-mt-0.5 h-5 w-5 flex-shrink-0" />
      <span className="flex flex-col items-start text-left leading-tight sm:hidden">
        <span>Download for {OS_NAMES[entry.os]}</span>
        <span className="text-[12px] font-normal opacity-70">
          {entry.choiceLabel}
        </span>
      </span>
      <span className="hidden sm:inline">{entry.label}</span>
      {beta && (
        <BetaTag className="border-white/35 text-white/80 dark:border-gray-900/30 dark:text-gray-700" />
      )}
      <ArrowDown
        className="h-4 w-4 opacity-70 transition-transform duration-300 ease-out group-hover:translate-y-0.5"
        aria-hidden
      />
    </a>
  );
}
