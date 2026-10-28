"use client";

import { Search } from "lucide-react";
import { openFeatureSearch } from "./feature-id";

type Props = { className?: string; label?: string };

export default function SearchTrigger({ className = "", label = "Search" }: Props) {
  return (
    <button
      type="button"
      onClick={() => openFeatureSearch()}
      aria-haspopup="dialog"
      aria-label="Search features"
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-gray-200 bg-white px-3.5 text-[13px] font-medium text-gray-600 transition-colors duration-200 hover:border-gray-300 hover:text-gray-900 dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:border-gray-700 dark:hover:text-white ${className}`}
    >
      <Search className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
      <kbd className="hidden rounded border border-gray-200 px-1.5 font-sans text-[11px] leading-5 text-gray-500 lg:inline dark:border-gray-700 dark:text-gray-400">
        /
      </kbd>
    </button>
  );
}
