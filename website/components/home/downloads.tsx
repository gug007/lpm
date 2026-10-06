"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Monitor,
  Package,
  Server,
  Smartphone,
} from "lucide-react";
import { trackGithubVisit } from "@/lib/analytics";
import type { DesktopOs } from "@/lib/downloads";
import { LINUX_HOST_PATH, MOBILE_PATH, RELEASES_URL } from "@/lib/links";
import { isDownloadPlatform, usePlatform } from "@/lib/use-platform";
import { DownloadOsColumn } from "./download-os-column";

const OS_ORDER: DesktopOs[] = ["macos", "windows", "linux"];

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
            Free and open source, for macOS, Windows and Linux (x86-64).
          </p>
        </div>
        {isUnavailable ? (
          <div
            className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-gray-50 px-6 py-6 dark:border-gray-800 dark:bg-white/[0.025]"
          >
            <Monitor className="mx-auto h-8 w-8 text-gray-500 dark:text-gray-400" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
              Get the lpm desktop app on your computer
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
              Open lpm.cx on your Mac or PC to choose the correct installer.
            </p>
          </div>
        ) : (
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-x-5 gap-y-10 sm:grid-cols-3">
            {OS_ORDER.map((os) => (
              <DownloadOsColumn
                key={os}
                os={os}
                recommended={isDownloadPlatform(platform) ? platform : null}
              />
            ))}
          </div>
        )}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-x-6 text-sm">
          <a
            href={RELEASES_URL}
            onClick={() =>
              trackGithubVisit({
                source: "downloads-releases",
                href: RELEASES_URL,
              })
            }
            className="inline-flex min-h-11 items-center gap-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            View all downloads
            <ArrowRight className="w-3.5 h-3.5" aria-hidden />
          </a>
          <Link
            href={LINUX_HOST_PATH}
            prefetch={false}
            className="inline-flex min-h-11 items-center gap-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            <Server className="w-3.5 h-3.5" aria-hidden />
            Linux server host
          </Link>
          {!isUnavailable && (
            <Link
              href={MOBILE_PATH}
              prefetch={false}
              className="inline-flex min-h-11 items-center gap-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5" aria-hidden />
              iPhone companion
            </Link>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}
