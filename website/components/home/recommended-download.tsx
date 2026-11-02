"use client";

import type { ReactNode } from "react";
import { ArrowDown, ShieldCheck } from "lucide-react";
import {
  DOWNLOAD_ENTRIES,
  fileType,
  formatSize,
  GIT_FOR_WINDOWS_URL,
  OS_NAMES,
  OS_REQUIREMENTS,
  type DownloadEntry,
  type DownloadPlatform,
  type ReleaseSummary,
} from "@/lib/downloads";
import { useMacChip, type Platform } from "@/lib/use-platform";
import { BetaTag } from "./beta-tag";
import { DownloadLink } from "./download-link";
import { OsIcon } from "./os-icon";
import { OtherDownloads } from "./other-downloads";

const LINK =
  "font-medium text-gray-700 underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-900 hover:decoration-current dark:text-gray-300 dark:decoration-gray-600 dark:hover:text-white";

function BuildLink({
  platform,
  children,
}: {
  platform: DownloadPlatform;
  children: ReactNode;
}) {
  return (
    <DownloadLink entry={DOWNLOAD_ENTRIES[platform]} className={LINK}>
      {children}
    </DownloadLink>
  );
}

// A Mac build is only ever picked from the chip the browser named, so the
// label says what was found; Safari names none, and that case falls through
// to the generic label.
function eyebrow(platform: Platform, chip: string | null, onMac: boolean) {
  if (platform === "mac-arm") return `Detected: ${chip ?? "Apple Silicon"}`;
  if (platform === "mac-intel") return "Detected: Intel Mac";
  return `Recommended for this ${onMac ? "Mac" : "PC"}`;
}

// Why this build, and the way out when the guess is wrong. Safari doesn't
// say which chip a Mac has, so that case (and the server render) says so
// instead of claiming a detection.
function note(platform: Platform): ReactNode {
  switch (platform) {
    case "mac-arm":
      return (
        <>
          Downloading for a Mac with an Intel chip?{" "}
          <BuildLink platform="mac-intel">Get the Intel build</BuildLink>.
        </>
      );
    case "mac-intel":
      return (
        <>
          Downloading for a Mac with an Apple M-series chip?{" "}
          <BuildLink platform="mac-arm">Get the Apple Silicon build</BuildLink>.
        </>
      );
    case "windows-x64":
      return (
        <>
          Not code-signed yet: if SmartScreen warns, choose More info, then Run
          anyway. Needs{" "}
          <a
            href={GIT_FOR_WINDOWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK}
          >
            Git for Windows
          </a>
          .
        </>
      );
    case "linux-deb":
      return "Picked from your browser, for Debian and Ubuntu. Not code-signed yet.";
    case "linux-rpm":
      return "Picked from your browser, for Fedora. Needs glibc 2.35 or newer; not code-signed yet.";
    default:
      return (
        <>
          Your browser doesn&apos;t say which chip this Mac has, and most have
          Apple Silicon. Intel chip?{" "}
          <BuildLink platform="mac-intel">Get the Intel build</BuildLink>. Apple
          menu → About This Mac shows which one yours has.
        </>
      );
  }
}

type Props = {
  entry: DownloadEntry;
  platform: Platform;
  release: ReleaseSummary | null;
};

export function RecommendedDownload({ entry, platform, release }: Props) {
  const chip = useMacChip();
  const size = release?.sizes[entry.platform];
  const onMac = entry.os === "macos";
  const details = [
    `${OS_NAMES[entry.os]} ${OS_REQUIREMENTS[entry.os]}`,
    size !== undefined && formatSize(size),
    release && `v${release.version}`,
  ].filter(Boolean);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white text-left shadow-sm dark:border-gray-800 dark:bg-[#111] dark:shadow-none">
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:gap-5 sm:px-6">
        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-900 sm:flex dark:bg-white/[0.06] dark:text-white">
          <OsIcon os={entry.os} className="-mt-0.5 h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-emerald-500"
            />
            {eyebrow(platform, chip, onMac)}
          </p>
          <h3 className="mt-1 flex flex-wrap items-center gap-x-2 text-lg font-bold tracking-tight text-gray-900 dark:text-white">
            {OS_NAMES[entry.os]} · {entry.choiceLabel}
            {!onMac && (
              <BetaTag className="border-gray-300 text-gray-500 dark:border-gray-700 dark:text-gray-400" />
            )}
          </h3>
          <p className="mt-0.5 text-[13px] tabular-nums text-gray-500 dark:text-gray-400">
            {details.join(" · ")}
          </p>
          {onMac && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-[13px] text-gray-500 dark:text-gray-400">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Signed and notarized by Apple
            </p>
          )}
        </div>
        <DownloadLink
          entry={entry}
          className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 dark:focus-visible:ring-white dark:focus-visible:ring-offset-gray-950"
        >
          <ArrowDown
            className="h-4 w-4 transition-transform duration-300 ease-out group-hover:translate-y-0.5"
            aria-hidden
          />
          Download {fileType(entry)}
        </DownloadLink>
      </div>
      <p className="border-t border-gray-100 px-5 py-3 text-[13px] leading-relaxed text-gray-500 sm:px-6 dark:border-white/[0.06] dark:text-gray-400">
        {note(platform)}
      </p>
      <OtherDownloads except={entry.platform} />
    </div>
  );
}
