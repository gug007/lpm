"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Laptop,
  Monitor,
  Package,
  type LucideIcon,
} from "lucide-react";
import { trackDownload } from "@/lib/analytics";
import { MOBILE_PATH, RELEASES_URL } from "@/lib/links";
import {
  usePlatform,
  type MacDownloadPlatform,
} from "@/lib/use-platform";
import { DOWNLOAD_ENTRIES } from "./hero-download";
import { SignatureBadge } from "./signature-badge";

const ICONS: Record<MacDownloadPlatform, LucideIcon> = {
  "mac-arm": Laptop,
  "mac-intel": Monitor,
};

export function Downloads({ children }: { children?: ReactNode }) {
  const platform = usePlatform();
  const isUnavailable = platform === "ipad" || platform === "unsupported";

  return (
    <section
      id="download"
      className="scroll-mt-20 py-20 sm:py-24 border-t border-gray-200 dark:border-gray-800 text-center"
    >
      <div className="max-w-3xl mx-auto px-6">
        <div className="flex flex-col items-center gap-3 mb-12">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 tracking-wide uppercase">
            <Package className="w-3 h-3" />
            Latest Release
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Get lpm
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Free and open source. Available for macOS (Apple Silicon &amp;
            Intel).
          </p>
          <SignatureBadge />
        </div>
        {isUnavailable ? (
          <div
            className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-gray-50 px-6 py-6 dark:border-gray-800 dark:bg-white/[0.025]"
          >
            <Monitor className="mx-auto h-8 w-8 text-gray-500 dark:text-gray-400" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
              The lpm desktop app requires macOS
            </p>
            <div className="mt-3">
              <Link
                href={MOBILE_PATH}
                prefetch={false}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-900 dark:text-gray-200 dark:decoration-gray-600 dark:hover:text-white"
              >
                Meanwhile — get the iPhone companion
                <ArrowRight className="w-3.5 h-3.5" aria-hidden />
              </Link>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Open lpm.cx on your Mac to choose the correct installer.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
            {Object.values(DOWNLOAD_ENTRIES).map((entry) => {
              const Icon = ICONS[entry.platform];
              const recommended = platform === entry.platform;
              return (
                <a
                  key={entry.href}
                  href={entry.href}
                  onClick={() =>
                    trackDownload({
                      source: "downloads",
                      platform: entry.platform,
                      href: entry.href,
                    })
                  }
                  className={`dl-card group relative flex flex-col items-center gap-2 px-6 py-6 rounded-2xl border border-gray-200 dark:border-gray-800 hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-[#111]${
                    recommended ? " recommended" : ""
                  }`}
                >
                  {recommended && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-br from-emerald-600 to-emerald-700 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
                      Recommended
                    </span>
                  )}
                  <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800/60 flex items-center justify-center mb-1 group-hover:bg-gray-100 dark:group-hover:bg-gray-800 transition-colors">
                    <Icon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  </div>
                  <span className="text-sm font-semibold">
                    {entry.choiceLabel}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {entry.choiceDescription}
                  </span>
                </a>
              );
            })}
          </div>
        )}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-x-6 gap-y-2 text-sm">
          <a
            href={RELEASES_URL}
            className="inline-flex items-center gap-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            View all downloads
            <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
        {children}
      </div>
    </section>
  );
}
