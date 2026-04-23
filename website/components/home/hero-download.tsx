"use client";

import { ArrowDown } from "lucide-react";
import { trackDownload } from "@/lib/analytics";
import { releaseAsset } from "@/lib/links";
import { usePlatform, type Platform } from "@/lib/use-platform";
import { SignatureBadge } from "./signature-badge";

type Entry = { href: string; label: string };

const ENTRIES: Record<Exclude<Platform, null>, Entry> = {
  "mac-arm": {
    href: releaseAsset("lpm-desktop-macos-arm64.dmg"),
    label: "Download for macOS (Apple Silicon)",
  },
  "mac-intel": {
    href: releaseAsset("lpm-desktop-macos-amd64.dmg"),
    label: "Download for macOS (Intel)",
  },
};

const FALLBACK: Entry = { href: "#download", label: "Download for macOS" };

export function HeroDownload() {
  const platform = usePlatform();
  const { href, label } = platform ? ENTRIES[platform] : FALLBACK;

  const handleClick = () => {
    if (!platform) return;
    trackDownload({ source: "hero", platform });
  };

  return (
    <div className="flex flex-col items-stretch gap-3">
      <a
        href={href}
        onClick={handleClick}
        className="group relative isolate flex items-center gap-3 pl-5 pr-2 py-2 overflow-hidden rounded-full text-white dark:text-gray-900 bg-gradient-to-b from-gray-800 to-gray-950 dark:from-white dark:to-gray-100 ring-1 ring-inset ring-white/10 dark:ring-gray-900/10 shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_10px_-2px_rgba(0,0,0,0.12)] hover:shadow-[0_2px_4px_rgba(0,0,0,0.1),0_12px_28px_-6px_rgba(0,0,0,0.35)] dark:hover:shadow-[0_2px_4px_rgba(0,0,0,0.08),0_12px_28px_-6px_rgba(0,0,0,0.25)] hover:-translate-y-[1px] active:translate-y-0 active:shadow-[0_1px_2px_rgba(0,0,0,0.08)] transition-[transform,box-shadow] duration-300 ease-out"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 dark:via-gray-900/20 to-transparent"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 -translate-x-full skew-x-12 bg-gradient-to-r from-transparent via-white/15 dark:via-gray-900/10 to-transparent group-hover:translate-x-full transition-transform duration-[1100ms] ease-out"
        />
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="relative w-[18px] h-[18px] flex-shrink-0 -mt-0.5"
          aria-hidden="true"
        >
          <path d="M17.05 12.536c-.028-2.844 2.325-4.21 2.432-4.275-1.325-1.937-3.385-2.2-4.116-2.229-1.75-.176-3.418 1.03-4.31 1.03-.886 0-2.25-1.005-3.703-.975-1.905.028-3.66 1.108-4.64 2.81-1.977 3.426-.506 8.503 1.42 11.294.94 1.367 2.062 2.902 3.534 2.848 1.42-.057 1.957-.918 3.676-.918 1.72 0 2.202.918 3.702.888 1.53-.028 2.499-1.393 3.432-2.77 1.081-1.587 1.527-3.126 1.554-3.205-.034-.015-2.98-1.142-3.013-4.527l.032-.005zM14.28 4.165c.784-.952 1.31-2.272 1.167-3.589-1.128.047-2.494.75-3.304 1.7-.728.842-1.362 2.186-1.192 3.476 1.26.098 2.544-.64 3.33-1.587z" />
        </svg>
        <span className="relative text-sm font-medium tracking-tight flex-1">
          {label}
        </span>
        <span className="relative flex items-center justify-center w-9 h-9 rounded-full bg-white/10 dark:bg-gray-900/[0.06] ring-1 ring-inset ring-white/10 dark:ring-gray-900/10 group-hover:bg-white/15 dark:group-hover:bg-gray-900/[0.09] transition-colors duration-200">
          <ArrowDown className="w-4 h-4 transition-transform duration-300 ease-out group-hover:translate-y-[2px] group-active:translate-y-[3px]" />
        </span>
      </a>
      <div className="flex justify-center">
        <SignatureBadge />
      </div>
    </div>
  );
}
