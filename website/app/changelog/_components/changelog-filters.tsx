"use client";

import { useId } from "react";
import { Search, X } from "lucide-react";
import { TOPICS } from "@/lib/changelog-days";

type Props = {
  query: string;
  topicId: string | null;
  onQuery: (query: string) => void;
  onTopic: (topicId: string | null) => void;
  total: number;
};

const CHIP =
  "inline-flex min-h-8 items-center rounded-full border px-3 text-[12.5px] font-medium transition-colors";
const CHIP_ON =
  "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900";
const CHIP_OFF =
  "border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-900 dark:border-gray-800 dark:text-gray-300 dark:hover:border-gray-600 dark:hover:text-white";

export function ChangelogFilters({ query, topicId, onQuery, onTopic, total }: Props) {
  const inputId = useId();
  return (
    <div>
      <label htmlFor={inputId} className="sr-only">
        Search releases
      </label>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
        />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={`Search ${total} releases`}
          className="h-10 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-500 focus:border-gray-400 focus:outline-none dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-100 dark:placeholder:text-gray-400 dark:focus:border-gray-600 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/[0.06] dark:hover:text-white"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        )}
      </div>
      <div role="group" aria-label="Filter by topic" className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={topicId === null}
          onClick={() => onTopic(null)}
          className={`${CHIP} ${topicId === null ? CHIP_ON : CHIP_OFF}`}
        >
          All
        </button>
        {TOPICS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={topicId === id}
            onClick={() => onTopic(topicId === id ? null : id)}
            className={`${CHIP} ${topicId === id ? CHIP_ON : CHIP_OFF}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
