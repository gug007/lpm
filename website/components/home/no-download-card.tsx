"use client";

import { ArrowRight } from "lucide-react";
import { trackGithubVisit } from "@/lib/analytics";
import { RELEASES_URL } from "@/lib/links";

export function NoDownloadCard({ linuxArm = false }: { linuxArm?: boolean }) {
  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-gray-200 bg-white/80 px-5 py-3 text-center shadow-sm dark:border-gray-800 dark:bg-white/[0.035]">
      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
        {linuxArm ? "No ARM build for Linux" : "lpm is a desktop app"}
      </p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {linuxArm
          ? "The Linux packages are for 64-bit x86 (amd64) computers only."
          : "Open lpm.cx on your Mac or PC to choose the correct installer."}
      </p>
      <a
        href={RELEASES_URL}
        onClick={() =>
          trackGithubVisit({ source: "download-releases", href: RELEASES_URL })
        }
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
      >
        View all downloads
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </a>
    </div>
  );
}
