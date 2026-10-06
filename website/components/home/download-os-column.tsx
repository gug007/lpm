"use client";

import { Package } from "lucide-react";
import { trackDownload } from "@/lib/analytics";
import {
  DOWNLOADS_BY_OS,
  GIT_FOR_WINDOWS_URL,
  isBetaOs,
  OS_NAMES,
  type DesktopOs,
  type DownloadPlatform,
} from "@/lib/downloads";
import { BetaTag } from "./beta-tag";
import { DownloadNote } from "./download-note";
import { OsIcon } from "./os-icon";

const REQUIREMENT: Record<DesktopOs, string> = {
  macos: "macOS 12 or later",
  windows: "Windows 11, x64",
  linux: "x86-64, Ubuntu 22.04 or newer",
};

const FOOTNOTE =
  "inline-flex items-start gap-1.5 text-left text-[11px] text-gray-500 dark:text-gray-400";

type Props = {
  os: DesktopOs;
  recommended: DownloadPlatform | null;
};

export function DownloadOsColumn({ os, recommended }: Props) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-col items-center gap-1">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <OsIcon
            os={os}
            className="-mt-0.5 h-4 w-4 text-gray-700 dark:text-gray-300"
          />
          {OS_NAMES[os]}
          {isBetaOs(os) && (
            <BetaTag className="border-gray-300 text-gray-500 dark:border-gray-700 dark:text-gray-400" />
          )}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {REQUIREMENT[os]}
        </span>
      </div>
      <div className="flex w-full flex-col gap-3">
        {DOWNLOADS_BY_OS[os].map((entry) => {
          const isRecommended = recommended === entry.platform;
          return (
            <a
              key={entry.platform}
              href={entry.href}
              aria-label={entry.ariaLabel}
              onClick={() =>
                trackDownload({
                  source: "downloads",
                  platform: entry.platform,
                  href: entry.href,
                })
              }
              className={`dl-card group relative flex flex-col items-center gap-0.5 rounded-2xl border border-gray-200 bg-white px-4 py-4 hover:border-gray-300 hover:shadow-lg dark:border-gray-800 dark:bg-[#111] dark:hover:border-gray-600${
                isRecommended ? " recommended" : ""
              }`}
            >
              {isRecommended && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-br from-emerald-700 to-emerald-800 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
                  Recommended
                </span>
              )}
              <span className="text-sm font-semibold">{entry.choiceLabel}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {entry.choiceDescription}
              </span>
            </a>
          );
        })}
      </div>
      <div className="flex max-w-[15rem] flex-col items-center gap-2">
        {os === "linux" ? (
          <span className={FOOTNOTE}>
            <Package className="mt-[3px] h-3 w-3 shrink-0" aria-hidden />
            Other distributions need glibc 2.35 or newer; there is no ARM
            build. The .deb and .rpm bring Git, SSH and a clipboard tool along;
            for the AppImage, install them first.
          </span>
        ) : (
          <DownloadNote os={os} />
        )}
        {os === "windows" && (
          <a
            href={GIT_FOR_WINDOWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-medium text-gray-700 underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-900 dark:text-gray-300 dark:decoration-gray-600 dark:hover:text-white"
          >
            Install Git for Windows first
          </a>
        )}
      </div>
    </div>
  );
}
