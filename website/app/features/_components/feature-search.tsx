"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search, X } from "lucide-react";
import { OPEN_SEARCH_EVENT, jumpToFeature } from "./feature-id";
import { FEATURE_COUNT } from "./feature-areas";
import SearchHighlight from "./search-highlight";
import { SEARCH_ENTRIES, queryWords, searchFeatures, type SearchEntry } from "./search-index";

const SUGGESTIONS = [
  "worktree",
  "notification",
  "SSH",
  "iPhone",
  "shortcuts",
  "Windows",
  "resume",
  "voice",
];

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

export default function FeatureSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const listId = useId();
  const words = useMemo(() => queryWords(query), [query]);
  const results = useMemo(() => searchFeatures(query), [query]);

  const show = useCallback((initial: string) => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery(initial);
    setActive(0);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    returnFocus.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onOpen = (event: Event) => show((event as CustomEvent<string>).detail ?? "");
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey) return;
      const palette = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !isTyping(event.target);
      if (!palette && !slash) return;
      event.preventDefault();
      show("");
    };
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, [show]);

  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    const entry = SEARCH_ENTRIES.find(({ id }) => id === hash);
    if (!entry) return;
    const frame = requestAnimationFrame(() => jumpToFeature(entry.id, entry.areaId, false));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    inputRef.current?.focus();
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (entry: SearchEntry) => {
    setOpen(false);
    history.replaceState(null, "", `#${entry.id}`);
    jumpToFeature(entry.id, entry.areaId, true);
  };

  const onInputKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (index + step + results.length) % results.length);
    } else if (event.key === "Enter" && results[active]) {
      event.preventDefault();
      go(results[active]);
    } else if (event.key === "Tab") {
      event.preventDefault();
    }
  };

  if (!open) return null;

  const activeEntry = results[active];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-gray-950/40 px-3 pt-3 backdrop-blur-sm sm:px-6 sm:pt-[12vh] dark:bg-black/60"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search features"
        className="switcher-in flex max-h-[min(36rem,calc(100dvh-1.5rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-gray-900/20 sm:max-h-[70vh] dark:border-gray-800 dark:bg-[#171717] dark:shadow-black/60"
      >
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 dark:border-gray-800">
          <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeEntry ? `${listId}-${activeEntry.id}` : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            placeholder={`Search ${FEATURE_COUNT} features`}
            autoComplete="off"
            spellCheck={false}
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 [&::-webkit-search-cancel-button]:hidden"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={close}
            aria-label="Close search"
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors duration-200 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <p className="sr-only" aria-live="polite">
          {words.length > 0 ? `${results.length} features found` : ""}
        </p>

        {words.length === 0 ? (
          <div className="px-4 py-5">
            <p className="text-[13px] text-gray-500 dark:text-gray-400">Try one of these</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((word) => (
                <button
                  key={word}
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    setQuery(word);
                    setActive(0);
                    inputRef.current?.focus();
                  }}
                  className="min-h-9 rounded-full border border-gray-200 px-3 text-[13px] text-gray-700 transition-colors duration-200 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-800 dark:text-gray-300 dark:hover:border-gray-700 dark:hover:bg-white/[0.04] dark:hover:text-white"
                >
                  {word}
                </button>
              ))}
            </div>
          </div>
        ) : results.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              No features match “{query.trim()}”
            </p>
            <p className="mt-1 text-[13px] text-gray-500 dark:text-gray-400">
              Try a shorter or different word.
            </p>
          </div>
        ) : (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Matching features"
            className="flex-1 overflow-y-auto overscroll-contain p-2"
          >
            {results.map((entry, index) => {
              const selected = index === active;
              return (
                <li
                  key={entry.id}
                  id={`${listId}-${entry.id}`}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => setActive(index)}
                  onClick={() => go(entry)}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ${
                    selected ? "bg-gray-100 dark:bg-white/[0.06]" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                        <SearchHighlight text={entry.title} words={words} />
                      </span>
                      <span className="hidden shrink-0 text-[11px] text-gray-500 sm:inline dark:text-gray-400">
                        {entry.areaLabel}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-gray-500 dark:text-gray-400">
                      <SearchHighlight text={entry.body} words={words} />
                    </span>
                  </span>
                  <CornerDownLeft
                    className={`mt-1 h-3.5 w-3.5 shrink-0 text-gray-400 ${selected ? "" : "invisible"}`}
                    aria-hidden
                  />
                </li>
              );
            })}
          </ul>
        )}

        <div className="hidden items-center gap-4 border-t border-gray-200 px-4 py-2.5 text-[11px] text-gray-500 sm:flex dark:border-gray-800 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-gray-200 px-1 font-sans dark:border-gray-700">↑</kbd>
            <kbd className="rounded border border-gray-200 px-1 font-sans dark:border-gray-700">↓</kbd>
            to move
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-gray-200 px-1 font-sans dark:border-gray-700">↵</kbd>
            to jump there
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <kbd className="rounded border border-gray-200 px-1 font-sans dark:border-gray-700">esc</kbd>
            to close
          </span>
        </div>
      </div>
    </div>
  );
}
