import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CancelFileSearch, SearchFiles } from "../../../bridge/commands";
import { useGitChanged } from "../../hooks/useGitChanged";
import { toSlash, windowsRules } from "../../path";
import {
  globList,
  type SearchField,
  type SearchFilters,
  type SearchOptions,
  type SearchResult,
} from "./fileSearch";
import { useSearchHistory, type SearchEntry } from "./useSearchHistory";

const OPTIONS_KEY = "lpm:filesSearchOptions";
const DEBOUNCE_MS = 200;
// How soon the results follow a change on disk, and so at most how often.
const REFRESH_MS = 500;
const UPDATED_MS = 4000;

export type SearchProblem =
  | { kind: "invalid"; field: SearchField; message: string }
  | { kind: "error"; message: string };

export interface SearchState {
  searching: boolean;
  result: SearchResult | null;
  problem: SearchProblem | null;
  // A refresh after a change on disk just changed the results.
  updated: boolean;
}

interface SearchSpec {
  query: string;
  options: SearchOptions;
  filters: SearchFilters;
  replacement: string | null;
}

interface SearchReply extends SearchResult {
  invalid?: { field: SearchField; message: string } | null;
}

const IDLE: SearchState = { searching: false, result: null, problem: null, updated: false };
const NO_OPTIONS: SearchOptions = { matchCase: false, wholeWord: false, regex: false };

function readOptions(): SearchOptions {
  try {
    return { ...NO_OPTIONS, ...JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? "{}") };
  } catch {
    return NO_OPTIONS;
  }
}

function saveOptions(options: SearchOptions) {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // The toggles still apply; they just aren't remembered.
  }
}

// What is searched, leaving out the replacement, which only changes previews.
const searchedFor = ({ query, options, filters }: SearchSpec) => JSON.stringify([query, options, filters]);

// Where each match is, to tell whether a refresh changed anything.
const placesOf = (result: SearchResult | null) =>
  result?.files.map((f) => `${f.path}:${f.matches.map((m) => `${m.line}.${m.col}`).join(",")}`).join("|") ?? "";

// The Files tab's Search view: the query, its toggles, file filters and
// replacement, and the search they run as the user types. A newer search
// stops the one still running, so only the last answer ever lands. While the
// view shows, a change on disk (an agent at work) runs it again quietly.
export function useFilesSearch(root: string, active: boolean) {
  const [token] = useState(() => crypto.randomUUID());
  const [open, setOpen] = useState(false);
  const [query, setQueryText] = useState("");
  const [options, setOptions] = useState(readOptions);
  const [include, setIncludeText] = useState("");
  const [exclude, setExcludeText] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [replace, setReplace] = useState("");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [state, setState] = useState<SearchState>(IDLE);
  const [focusRequest, setFocusRequest] = useState(0);
  const seq = useRef(0);
  const running = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const refreshTimer = useRef<number | undefined>(undefined);
  const updatedTimer = useRef<number | undefined>(undefined);
  const shown = useRef<SearchResult | null>(null);
  const searched = useRef<string | null>(null);

  const spec = useMemo<SearchSpec>(
    () => ({
      query,
      options,
      filters: { include: globList(include), exclude: globList(exclude) },
      replacement: replaceOpen ? replace : null,
    }),
    [query, options, include, exclude, replace, replaceOpen],
  );
  const specRef = useRef(spec);
  specRef.current = spec;

  const run = useCallback(
    async (s: SearchSpec, quiet = false) => {
      window.clearTimeout(timer.current);
      const mine = ++seq.current;
      running.current = true;
      if (!quiet) setState((st) => ({ ...st, searching: true }));
      try {
        const reply = (await SearchFiles(root, s.query, s.options, s.filters, s.replacement, token)) as SearchReply;
        if (mine !== seq.current) return;
        if (reply.invalid) {
          shown.current = null;
          setState({ ...IDLE, problem: { kind: "invalid", ...reply.invalid } });
          return;
        }
        const slash = windowsRules(root);
        const files = (reply.files ?? []).map((f) => (slash ? { ...f, path: toSlash(f.path, true) } : f));
        const result = { files, truncated: !!reply.truncated };
        const updated = quiet && shown.current !== null && placesOf(shown.current) !== placesOf(result);
        shown.current = result;
        setState({ searching: false, result, problem: null, updated });
        if (updated) {
          window.clearTimeout(updatedTimer.current);
          updatedTimer.current = window.setTimeout(() => setState((st) => ({ ...st, updated: false })), UPDATED_MS);
        }
      } catch (err) {
        if (mine !== seq.current) return;
        // A refresh that fails leaves the results it would have replaced.
        if (quiet) return setState((st) => ({ ...st, searching: false }));
        shown.current = null;
        setState({ ...IDLE, problem: { kind: "error", message: String(err) } });
      } finally {
        if (mine === seq.current) running.current = false;
      }
    },
    [root, token],
  );

  const stop = useCallback(() => {
    seq.current++;
    if (!running.current) return;
    running.current = false;
    CancelFileSearch(root, token).catch(() => {});
  }, [root, token]);

  useEffect(() => {
    stop();
    if (!spec.query) {
      shown.current = null;
      searched.current = null;
      setState(IDLE);
      return;
    }
    // Typing a replacement keeps the results on screen while their previews
    // catch up.
    const quiet = searched.current === searchedFor(spec);
    searched.current = searchedFor(spec);
    if (!quiet) setState((s) => ({ ...s, searching: true }));
    timer.current = window.setTimeout(() => void run(spec, quiet), DEBOUNCE_MS);
    return () => window.clearTimeout(timer.current);
  }, [spec, run, stop]);

  useEffect(
    () => () => {
      stop();
      window.clearTimeout(refreshTimer.current);
      window.clearTimeout(updatedTimer.current);
    },
    [stop],
  );

  const refresh = useCallback(() => {
    if (specRef.current.query) void run(specRef.current, true);
  }, [run]);

  const onDiskChange = useCallback(() => {
    if (refreshTimer.current !== undefined) return;
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = undefined;
      refresh();
    }, REFRESH_MS);
  }, [refresh]);
  useGitChanged(root, onDiskChange, active && open && query !== "");

  const apply = useCallback((entry: SearchEntry) => {
    setQueryText(entry.query);
    setOptions(entry.options);
    saveOptions(entry.options);
    setIncludeText(entry.include);
    setExcludeText(entry.exclude);
    if (entry.include || entry.exclude) setFiltersOpen(true);
  }, []);
  const history = useSearchHistory(root, { query, options, include, exclude }, apply);
  const { stopBrowsing, remember: rememberEntry } = history;

  const typed = useCallback(
    (set: (text: string) => void) => (text: string) => {
      stopBrowsing();
      set(text);
    },
    [stopBrowsing],
  );
  const setQuery = useMemo(() => typed(setQueryText), [typed]);
  const setInclude = useMemo(() => typed(setIncludeText), [typed]);
  const setExclude = useMemo(() => typed(setExcludeText), [typed]);

  const remember = useCallback(
    () => rememberEntry({ query, options, include, exclude }),
    [rememberEntry, query, options, include, exclude],
  );

  const show = useCallback((seed?: string) => {
    setOpen(true);
    if (seed) setQueryText(seed);
    setFocusRequest((n) => n + 1);
  }, []);

  const hide = useCallback(() => setOpen(false), []);

  const toggle = useCallback((key: keyof SearchOptions) => {
    setOptions((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveOptions(next);
      return next;
    });
  }, []);

  const searchNow = useCallback(() => {
    if (specRef.current.query) void run(specRef.current);
  }, [run]);

  return {
    root,
    token,
    open,
    show,
    hide,
    query,
    setQuery,
    options,
    toggle,
    include,
    setInclude,
    exclude,
    setExclude,
    filtersOpen,
    toggleFilters: () => setFiltersOpen((v) => !v),
    replace,
    setReplace,
    replaceOpen,
    toggleReplace: () => setReplaceOpen((v) => !v),
    state,
    focusRequest,
    searchNow,
    refresh,
    history: { older: history.older, newer: history.newer, remember },
  };
}

export type FilesSearchModel = ReturnType<typeof useFilesSearch>;
