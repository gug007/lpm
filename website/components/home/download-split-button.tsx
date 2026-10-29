"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { trackDownload, type DownloadSource } from "@/lib/analytics";
import {
  DOWNLOAD_OS_ORDER,
  DOWNLOADS_BY_OS,
  downloadDetails,
  formatReleaseDate,
  formatSize,
  isBetaOs,
  OS_NAMES,
  type DownloadEntry,
  type DownloadPlatform,
  type ReleaseSummary,
} from "@/lib/downloads";
import { BetaTag } from "./beta-tag";
import { OsIcon } from "./os-icon";
import { PrimaryDownload } from "./primary-download";

type Props = {
  primary: DownloadEntry;
  detected: DownloadPlatform | null;
  release: ReleaseSummary | null;
  source: DownloadSource;
  className: string;
};

export function DownloadSplitButton({
  primary,
  detected,
  release,
  source,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const released = release && formatReleaseDate(release.publishedAt);

  return (
    <div
      ref={rootRef}
      className="relative inline-flex rounded-full shadow-sm"
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <PrimaryDownload
        entry={primary}
        source={source}
        className={className}
        joined
        details={downloadDetails(primary, release)}
      />
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Other downloads"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex cursor-pointer items-center justify-center rounded-r-full border-l border-white/20 bg-gray-900 pl-3.5 pr-4 text-white transition-colors duration-200 hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:pl-4 sm:pr-5 dark:border-gray-900/15 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 dark:focus-visible:ring-white dark:focus-visible:ring-offset-gray-950"
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      <div
        id={menuId}
        hidden={!open}
        className="absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-gray-200 bg-white p-1.5 text-left shadow-xl shadow-gray-900/10 dark:border-gray-800 dark:bg-[#161616] dark:shadow-black/40"
      >
        {release && (
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            lpm {release.version}
            {released && ` · ${released}`}
          </p>
        )}
        {DOWNLOAD_OS_ORDER.map((os) => (
          <div
            key={os}
            className="border-t border-gray-100 py-1 first-of-type:border-t-0 dark:border-white/[0.06]"
          >
            <p className="flex items-center gap-2 px-2.5 pb-0.5 pt-1.5 text-[12px] font-semibold text-gray-900 dark:text-gray-100">
              <OsIcon os={os} className="-mt-0.5 h-3.5 w-3.5" />
              {OS_NAMES[os]}
              {isBetaOs(os) && (
                <BetaTag className="border-gray-300 text-gray-500 dark:border-gray-700 dark:text-gray-400" />
              )}
            </p>
            {DOWNLOADS_BY_OS[os].map((entry) => {
              const size = release?.sizes[entry.platform];
              return (
                <a
                  key={entry.platform}
                  href={entry.href}
                  onClick={() =>
                    trackDownload({
                      source,
                      platform: entry.platform,
                      href: entry.href,
                    })
                  }
                  className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-gray-100 focus-visible:bg-gray-100 focus-visible:outline-none dark:hover:bg-white/[0.06] dark:focus-visible:bg-white/[0.06]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[13px] font-medium text-gray-900 dark:text-gray-100">
                      {entry.choiceLabel}
                      {entry.platform === detected && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                          />
                          Detected
                        </span>
                      )}
                    </span>
                    <span className="block text-[12px] text-gray-500 dark:text-gray-400">
                      {entry.choiceDescription}
                    </span>
                  </span>
                  {size !== undefined && (
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                      {formatSize(size)}
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        ))}
        <a
          href="#download"
          onClick={() => setOpen(false)}
          className="flex items-center justify-between rounded-lg border-t border-gray-100 px-2.5 py-2 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
        >
          All downloads and checksums
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}
