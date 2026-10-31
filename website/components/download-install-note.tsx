"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDownToLine, Star, X } from "lucide-react";
import { trackGithubVisit } from "@/lib/analytics";
import { docsPath } from "@/lib/docs-pages";
import { entryForFilename, type DownloadEntry } from "@/lib/downloads";
import { installSteps } from "@/lib/install-steps";
import { REPO_URL } from "@/lib/links";
import { InstallStepsList } from "./install-steps-list";

const RELEASES_PREFIX = `${REPO_URL}/releases/`;

// Download buttons point at /releases/latest/download/<file> and the checksum
// list at /releases/download/<tag>/<file>; both end in the build's file name.
function downloadedEntry(target: EventTarget | null): DownloadEntry | undefined {
  const link = target instanceof Element ? target.closest("a[href]") : null;
  if (!(link instanceof HTMLAnchorElement)) return undefined;
  if (!link.href.startsWith(RELEASES_PREFIX)) return undefined;
  return entryForFilename(new URL(link.href).pathname.split("/").pop() ?? "");
}

// Listens on the document so every download button on every page, present
// and future, brings it up without each one having to. It shows how to finish
// installing the file that was just picked, while the installer is in hand.
export function DownloadInstallNote() {
  const [entry, setEntry] = useState<DownloadEntry | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const picked = downloadedEntry(e.target);
      if (picked) setEntry(picked);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (!entry) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEntry(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [entry]);

  if (!entry) return null;

  const close = () => setEntry(null);
  const steps = installSteps(entry);

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-xl transition-[opacity,translate] duration-300 ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none sm:left-auto sm:right-6 sm:bottom-6 sm:w-[360px] dark:border-gray-800 dark:bg-[#161616]"
    >
      <p className="flex min-w-0 items-center gap-1.5 pr-8 font-mono text-[12px] text-gray-500 dark:text-gray-400">
        <ArrowDownToLine
          className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
          aria-hidden
        />
        <span className="truncate">{entry.filename}</span>
      </p>
      <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
        Install lpm in {steps.length} steps
      </p>
      <div className="mt-3">
        <InstallStepsList steps={steps} compact />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
        <Link
          href={`${docsPath("install")}#troubleshooting`}
          onClick={close}
          className="inline-flex min-h-8 items-center text-[13px] text-gray-500 underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-900 dark:text-gray-400 dark:decoration-gray-600 dark:hover:text-white"
        >
          Stuck? Install help
        </Link>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            trackGithubVisit({ source: "download-star", href: REPO_URL });
            // A link removed before its click finishes never opens.
            window.setTimeout(close);
          }}
          className="group inline-flex min-h-8 items-center gap-1.5 rounded-full border border-gray-300 px-3 text-[13px] font-medium text-gray-700 transition-colors hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-white"
        >
          <Star
            className="h-3.5 w-3.5 transition-colors group-hover:fill-amber-400 group-hover:text-amber-400"
            aria-hidden
          />
          Star on GitHub
        </a>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/5 dark:hover:text-gray-200"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
