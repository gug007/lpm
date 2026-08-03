"use client";

import { ArrowDown, ArrowRight } from "lucide-react";
import Link from "next/link";
import { trackDownload } from "@/lib/analytics";
import { releaseAsset, RELEASES_URL } from "@/lib/links";
import {
  isMacDownloadPlatform,
  usePlatform,
  type MacDownloadPlatform,
} from "@/lib/use-platform";
import { SignatureBadge } from "./signature-badge";

type Entry = {
  href: string;
  label: string;
  choiceLabel: string;
  choiceDescription: string;
  ariaLabel: string;
};

const ENTRIES: Record<MacDownloadPlatform, Entry> = {
  "mac-arm": {
    href: releaseAsset("lpm-desktop-macos-arm64.dmg"),
    label: "Download for macOS (Apple Silicon)",
    choiceLabel: "Apple Silicon",
    choiceDescription: "For M-series Macs",
    ariaLabel: "Download lpm for Apple Silicon M-series Macs",
  },
  "mac-intel": {
    href: releaseAsset("lpm-desktop-macos-amd64.dmg"),
    label: "Download for macOS (Intel)",
    choiceLabel: "Intel",
    choiceDescription: "For x86-64 Macs",
    ariaLabel: "Download lpm for Intel x86-64 Macs",
  },
};

const FALLBACK = {
  href: "/#download",
  label: "Choose your Mac download",
};

export function HeroDownload() {
  const platform = usePlatform();

  const downloadDetails = (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
      <SignatureBadge />
      <span className="text-gray-300 dark:text-gray-700" aria-hidden>
        ·
      </span>
      <Link
        href="/#download-safety"
        prefetch={false}
        className="text-[11px] text-gray-500 underline decoration-gray-300 underline-offset-4 hover:text-gray-900 dark:text-gray-400 dark:decoration-gray-600 dark:hover:text-white transition-colors"
      >
        Safety, checksums &amp; removal
      </Link>
    </div>
  );
  const releasesLink = (
    <a
      href={RELEASES_URL}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
    >
      View all downloads
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </a>
  );

  if (platform === "ipad" || platform === "unsupported") {
    return (
      <div className="mx-auto max-w-sm rounded-2xl border border-gray-200 bg-white/80 px-5 py-3 text-center shadow-sm dark:border-gray-800 dark:bg-white/[0.035]">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
          lpm desktop requires a Mac
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Open lpm.cx on your Mac to choose the correct installer.
        </p>
        <div className="mt-3">{releasesLink}</div>
      </div>
    );
  }

  if (platform === "mac-unknown") {
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
          Choose the installer that matches your Mac:
        </p>
        <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
          {(Object.entries(ENTRIES) as [MacDownloadPlatform, Entry][]).map(
            ([downloadPlatform, entry]) => (
              <a
                key={downloadPlatform}
                href={entry.href}
                aria-label={entry.ariaLabel}
                onClick={() =>
                  trackDownload({
                    source: "hero",
                    platform: downloadPlatform,
                    href: entry.href,
                  })
                }
                className="group flex items-center justify-between gap-4 rounded-2xl bg-gray-900 px-5 py-4 text-left text-white shadow-sm transition-[background-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:bg-gray-800 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 dark:focus-visible:ring-white dark:focus-visible:ring-offset-gray-950"
              >
                <span>
                  <span className="block text-sm font-semibold">
                    {entry.choiceLabel}
                  </span>
                  <span className="mt-0.5 block text-xs text-white/70 dark:text-gray-500">
                    {entry.choiceDescription}
                  </span>
                </span>
                <ArrowDown
                  className="h-4 w-4 shrink-0 opacity-70 transition-transform group-hover:translate-y-0.5"
                  aria-hidden
                />
              </a>
            ),
          )}
        </div>
        {releasesLink}
        {downloadDetails}
      </div>
    );
  }

  const { href, label } = isMacDownloadPlatform(platform)
    ? ENTRIES[platform]
    : FALLBACK;

  const handleClick = () => {
    if (!isMacDownloadPlatform(platform)) return;
    trackDownload({ source: "hero", platform, href });
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <a
        href={href}
        onClick={handleClick}
        className="group inline-flex items-center justify-center gap-3 px-8 py-4 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[17px] font-medium tracking-tight hover:bg-gray-800 dark:hover:bg-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-[1px] active:translate-y-0 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 transition-[background-color,box-shadow,transform] duration-200 ease-out"
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-5 h-5 flex-shrink-0 -mt-0.5"
          aria-hidden="true"
        >
          <path d="M17.05 12.536c-.028-2.844 2.325-4.21 2.432-4.275-1.325-1.937-3.385-2.2-4.116-2.229-1.75-.176-3.418 1.03-4.31 1.03-.886 0-2.25-1.005-3.703-.975-1.905.028-3.66 1.108-4.64 2.81-1.977 3.426-.506 8.503 1.42 11.294.94 1.367 2.062 2.902 3.534 2.848 1.42-.057 1.957-.918 3.676-.918 1.72 0 2.202.918 3.702.888 1.53-.028 2.499-1.393 3.432-2.77 1.081-1.587 1.527-3.126 1.554-3.205-.034-.015-2.98-1.142-3.013-4.527l.032-.005zM14.28 4.165c.784-.952 1.31-2.272 1.167-3.589-1.128.047-2.494.75-3.304 1.7-.728.842-1.362 2.186-1.192 3.476 1.26.098 2.544-.64 3.33-1.587z" />
        </svg>
        <span>{label}</span>
        <ArrowDown
          className="w-4 h-4 opacity-70 transition-transform duration-300 ease-out group-hover:translate-y-0.5"
          aria-hidden
        />
      </a>
      {downloadDetails}
    </div>
  );
}
