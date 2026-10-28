"use client";

import { Search } from "lucide-react";
import { openFeatureSearch } from "./feature-id";

const SUGGESTIONS = ["worktree", "SSH", "push", "shortcuts"];

export default function MapSearchCell({ total }: { total: number }) {
  return (
    <div className="flex h-full flex-col p-4 sm:p-5">
      <button
        type="button"
        onClick={() => openFeatureSearch()}
        aria-haspopup="dialog"
        className="group flex flex-1 flex-col text-left focus-visible:outline-none"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition-colors duration-200 group-hover:bg-white group-hover:text-gray-900 group-focus-visible:ring-2 group-focus-visible:ring-white dark:bg-gray-900/10 dark:text-gray-900 dark:group-hover:bg-gray-900 dark:group-hover:text-white dark:group-focus-visible:ring-gray-900">
          <Search className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <span className="mt-4 text-[15px] font-semibold tracking-tight text-white dark:text-gray-900">
          Search all {total}
        </span>
        <span className="mt-2 hidden text-[13px] leading-snug text-gray-400 sm:block dark:text-gray-600">
          Looking for one thing? Type a word and jump to it.
        </span>
      </button>
      <span className="mt-3 hidden flex-wrap gap-1.5 sm:flex">
        {SUGGESTIONS.map((word) => (
          <button
            key={word}
            type="button"
            onClick={() => openFeatureSearch(word)}
            className="min-h-8 rounded-full border border-white/15 px-2.5 text-xs text-gray-300 transition-colors duration-200 hover:border-white/40 hover:text-white dark:border-gray-900/15 dark:text-gray-600 dark:hover:border-gray-900/40 dark:hover:text-gray-900"
          >
            {word}
          </button>
        ))}
      </span>
    </div>
  );
}
