"use client";

import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import { trackGithubVisit } from "@/lib/analytics";
import { releaseAsset, REPO_URL } from "@/lib/links";

const ANSWERED_KEY = "lpm-download-star-note";

function isDownloadClick(target: EventTarget | null): boolean {
  const link = target instanceof Element ? target.closest("a[href]") : null;
  return link instanceof HTMLAnchorElement && link.href.startsWith(releaseAsset(""));
}

function answered(): boolean {
  try {
    return localStorage.getItem(ANSWERED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberAnswer(): void {
  try {
    localStorage.setItem(ANSWERED_KEY, "1");
  } catch {}
}

// Listens on the document so every download button on every page, present
// and future, brings it up without each one having to.
export function DownloadStarNote() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (isDownloadClick(e.target) && !answered()) setOpen(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  if (!open) return null;

  const close = () => {
    rememberAnswer();
    setOpen(false);
  };

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 rounded-2xl border border-gray-200 bg-white p-4 pr-11 shadow-xl transition-[opacity,translate] duration-300 ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none sm:left-auto sm:right-6 sm:bottom-6 sm:w-[340px] dark:border-gray-800 dark:bg-[#161616]"
    >
      <p className="text-sm font-medium text-gray-900 dark:text-white">
        Thanks for downloading lpm
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">
        It&apos;s free and open source. A star on GitHub helps other developers
        find it.
      </p>
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          trackGithubVisit({ source: "download-star", href: REPO_URL });
          // A link removed before its click finishes never opens.
          window.setTimeout(close);
        }}
        className="group mt-3 inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors duration-200 hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 dark:focus-visible:ring-white dark:focus-visible:ring-offset-[#161616]"
      >
        <Star
          className="h-3.5 w-3.5 transition-colors duration-200 group-hover:fill-amber-400 group-hover:text-amber-400"
          aria-hidden
        />
        Star on GitHub
      </a>
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
