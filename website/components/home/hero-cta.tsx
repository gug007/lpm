"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, Play } from "lucide-react";
import Link from "next/link";
import {
  trackDownload,
  trackGithubVisit,
  type DownloadSource,
} from "@/lib/analytics";
import { DEMO_ANCHOR, RELEASES_URL } from "@/lib/links";
import { usePlatform } from "@/lib/use-platform";
import { DOWNLOAD_ENTRIES } from "./hero-download";
import { SignatureBadge } from "./signature-badge";

// The homepage keeps the demo frame in the first viewport, so this row reserves
// its height: platform detection only runs after hydration and must not shove
// the frame down mid-load.
const SHELL =
  "flex w-full flex-col items-center gap-3 min-h-[164px] sm:min-h-[92px]";

function DemoLink() {
  return (
    <a
      href={DEMO_ANCHOR}
      className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-300 px-6 py-[13px] text-[15px] font-medium text-gray-700 transition-colors duration-200 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-white"
    >
      <Play className="h-3.5 w-3.5" aria-hidden />
      <span className="md:hidden">Watch the demo</span>
      <span className="hidden md:inline">Try the interactive demo</span>
    </a>
  );
}

export function HeroCta({
  source = "hero",
  secondary,
}: {
  source?: DownloadSource;
  secondary?: ReactNode;
}) {
  const platform = usePlatform();

  if (platform === "ipad" || platform === "unsupported") {
    return (
      <div className={SHELL}>
        <div className="mx-auto max-w-sm rounded-2xl border border-gray-200 bg-white/80 px-5 py-3 text-center shadow-sm dark:border-gray-800 dark:bg-white/[0.035]">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
            lpm desktop requires a Mac
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Open lpm.cx on your Mac to choose the correct installer.
          </p>
          <a
            href={RELEASES_URL}
            onClick={() =>
              trackGithubVisit({
                source: "download-releases",
                href: RELEASES_URL,
              })
            }
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            View all downloads
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>
    );
  }

  // `null` is the server snapshot, before detection has run. The Apple Silicon
  // build is the default, so the delivered HTML carries a real .dmg link and
  // detection usually only confirms it.
  const primary =
    platform === "mac-intel"
      ? DOWNLOAD_ENTRIES["mac-intel"]
      : DOWNLOAD_ENTRIES["mac-arm"];
  const alternate =
    primary.platform === "mac-arm"
      ? DOWNLOAD_ENTRIES["mac-intel"]
      : DOWNLOAD_ENTRIES["mac-arm"];

  return (
    <div className={SHELL}>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <a
          href={primary.href}
          aria-label={primary.ariaLabel}
          onClick={() =>
            trackDownload({
              source,
              platform: primary.platform,
              href: primary.href,
            })
          }
          className="group inline-flex items-center justify-center gap-3 whitespace-nowrap rounded-full bg-gray-900 px-6 py-3.5 text-[15px] font-medium tracking-tight text-white sm:px-7 sm:text-[16px] shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-[1px] hover:bg-gray-800 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:translate-y-0 active:shadow-sm dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 dark:focus-visible:ring-white dark:focus-visible:ring-offset-gray-950"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="-mt-0.5 h-5 w-5 flex-shrink-0"
            aria-hidden="true"
          >
            <path d="M17.05 12.536c-.028-2.844 2.325-4.21 2.432-4.275-1.325-1.937-3.385-2.2-4.116-2.229-1.75-.176-3.418 1.03-4.31 1.03-.886 0-2.25-1.005-3.703-.975-1.905.028-3.66 1.108-4.64 2.81-1.977 3.426-.506 8.503 1.42 11.294.94 1.367 2.062 2.902 3.534 2.848 1.42-.057 1.957-.918 3.676-.918 1.72 0 2.202.918 3.702.888 1.53-.028 2.499-1.393 3.432-2.77 1.081-1.587 1.527-3.126 1.554-3.205-.034-.015-2.98-1.142-3.013-4.527l.032-.005zM14.28 4.165c.784-.952 1.31-2.272 1.167-3.589-1.128.047-2.494.75-3.304 1.7-.728.842-1.362 2.186-1.192 3.476 1.26.098 2.544-.64 3.33-1.587z" />
          </svg>
          <span>{primary.label}</span>
          <ArrowDown
            className="h-4 w-4 opacity-70 transition-transform duration-300 ease-out group-hover:translate-y-0.5"
            aria-hidden
          />
        </a>
        {secondary ?? <DemoLink />}
      </div>
      <div className="flex flex-col flex-wrap items-center justify-center gap-y-1 sm:flex-row sm:gap-x-2">
        <a
          href={alternate.href}
          aria-label={alternate.ariaLabel}
          onClick={() =>
            trackDownload({
              source,
              platform: alternate.platform,
              href: alternate.href,
            })
          }
          className="text-[11px] font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          {alternate.platform === "mac-intel"
            ? "Intel Mac? Get the x86-64 build"
            : "Apple Silicon Mac? Get the arm64 build"}
        </a>
        <span
          className="hidden text-gray-300 sm:inline dark:text-gray-700"
          aria-hidden
        >
          ·
        </span>
        <SignatureBadge />
        <span
          className="hidden text-gray-300 sm:inline dark:text-gray-700"
          aria-hidden
        >
          ·
        </span>
        <Link
          href="/#download-safety"
          prefetch={false}
          className="text-[11px] text-gray-500 underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-900 dark:text-gray-400 dark:decoration-gray-600 dark:hover:text-white"
        >
          Safety, checksums &amp; removal
        </Link>
      </div>
    </div>
  );
}
